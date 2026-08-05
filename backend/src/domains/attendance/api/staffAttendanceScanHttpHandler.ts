import {
  EdgeActivationError,
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readOwnedGameSession,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { readBalanceNumber } from "../../../platform/supabase/edgeParsing.ts";
import {
  AdminMutationError,
  readAdminMutationIdentity,
} from "../../../platform/supabase/adminMutation.ts";
import {
  rateLimitExceededResponse,
  rateLimitUnavailableResponse,
} from "../../../security/rateLimitHttp.ts";
import {
  enforceScopedRateLimit,
  type EnforceScopedRateLimitInput,
} from "../../../security/playerRateLimitService.ts";
import type { RateLimitDecision } from "../../../security/rateLimitContracts.ts";
import {
  parseStaffAttendanceScanRequestBody,
} from "./attendanceHttpHelpers.ts";
import {
  recordAttendanceScanForAuthorizedStaff,
} from "../application/recordAttendanceForAuthorizedStaff.ts";

export interface StaffAttendanceScanHttpHandlerDependencies {
  readonly resolveStaffForRequest: (
    request: Request,
    env: SupabaseEnv,
    options: { readonly missingMessage: string },
  ) => Promise<
    | {
      readonly ok: true;
      readonly staff: { readonly id: string };
      readonly serviceClient: EdgeSupabaseClient;
    }
    | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    }
  >;
  readonly enforceRateLimit?: (
    input: EnforceScopedRateLimitInput,
    client: EdgeSupabaseClient,
  ) => Promise<RateLimitDecision>;
}

export interface StaffAttendanceScanSuccessBody {
  readonly ok: true;
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly player: {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly playerIdentifier: string | null;
    readonly status: string;
  };
  readonly attendance: {
    readonly id: string;
    readonly status: string;
    readonly attendanceDate: string;
    readonly clockedInAt: string;
    readonly wasCreated: boolean;
    readonly timezone: string;
  };
  readonly reward: {
    readonly amount: number;
    readonly currencyCode: string;
    readonly ledgerEntryId: string | null;
    readonly configuredBaseAmount: number;
    readonly baseCurrencyCode: string;
    readonly currencyMode: "player_country" | "fixed" | "fixed_fallback";
    readonly countryCode: string | null;
    readonly incomeModifier: number;
    readonly exchangeRateIndex: number;
  };
}

export async function handleStaffAttendanceScanRequest(
  request: Request,
  gameSessionId: string,
  dependencies: StaffAttendanceScanHttpHandlerDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to scan attendance.",
      retryable: false,
    });
  }

  try {
    const envResult = readSupabaseEnv();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const staffResult = await dependencies.resolveStaffForRequest(
      request,
      envResult.value,
      {
        missingMessage:
          "A verified Supabase Auth user is required to scan attendance.",
      },
    );

    if (!staffResult.ok) {
      return jsonError(staffResult.status, staffResult.error);
    }

    const ownershipResult = await readOwnedGameSession(
      staffResult.serviceClient,
      gameSessionId,
      staffResult.staff.id,
    );

    if (!ownershipResult.ok) {
      return jsonError(ownershipResult.status, ownershipResult.error);
    }

    let rateLimitDecision: RateLimitDecision;
    try {
      rateLimitDecision = await (
        dependencies.enforceRateLimit ?? enforceScopedRateLimit
      )({
        action: "staff.attendance.scan",
        profile: "scanner",
        request,
        identityUuid: staffResult.staff.id,
        gameUuid: gameSessionId,
      }, staffResult.serviceClient);
    } catch {
      return rateLimitUnavailableResponse();
    }

    if (!rateLimitDecision.allowed) {
      return rateLimitExceededResponse(rateLimitDecision);
    }

    const rawBody = await readJsonRequestBody(request);
    const body = parseStaffAttendanceScanRequestBody(rawBody);
    const identity = readAdminMutationIdentity(request, rawBody);
    const attendanceResult = await recordAttendanceScanForAuthorizedStaff({
      gameSessionId,
      staffUserId: staffResult.staff.id,
      body,
      identity,
    }, staffResult.serviceClient);

    return jsonResponse<StaffAttendanceScanSuccessBody>(
      attendanceResult.status,
      {
        ok: true,
        gameSession: {
          id: ownershipResult.gameSession.id,
          name: ownershipResult.gameSession.name,
          status: ownershipResult.gameSession.status,
        },
        player: attendanceResult.player,
        attendance: {
          id: attendanceResult.attendance.attendance_id,
          status: attendanceResult.attendance.attendance_status,
          attendanceDate: attendanceResult.attendance.attendance_date,
          clockedInAt: attendanceResult.attendance.clocked_in_at,
          wasCreated: attendanceResult.attendance.was_created,
          timezone: attendanceResult.attendance.timezone,
        },
        reward: {
          amount: readBalanceNumber(attendanceResult.attendance.reward_amount),
          currencyCode: attendanceResult.attendance.currency_code,
          ledgerEntryId: attendanceResult.attendance.ledger_entry_id,
          configuredBaseAmount: attendanceResult.reward.configuredBaseAmount,
          baseCurrencyCode: attendanceResult.reward.baseCurrencyCode,
          currencyMode: attendanceResult.reward.currencyMode,
          countryCode: attendanceResult.reward.countryCode,
          incomeModifier: attendanceResult.reward.incomeModifier,
          exchangeRateIndex: attendanceResult.reward.exchangeRateIndex,
        },
      },
    );
  } catch (error) {
    if (error instanceof AdminMutationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "attendance_scan_failed",
      message: "Attendance scan failed.",
      retryable: false,
    });
  }
}

async function readJsonRequestBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }
}
