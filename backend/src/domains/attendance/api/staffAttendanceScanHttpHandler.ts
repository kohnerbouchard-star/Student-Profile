import {
  EdgeActivationError,
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readOwnedGameSession,
  readSupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { readBalanceNumber } from "../../../platform/supabase/edgeParsing.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  readLocalDateForTimeZone,
  readLocalMinutesForTimeZone,
  readValidTimeZone,
} from "../../../platform/supabase/edgeTime.ts";
import { normalizeStudentCode } from "../../players/domain/playerAccessCodes.ts";
import {
  mapAttendanceClockInRpcError,
  readPlayerAttendanceClockInRpcRow,
  readPlayerAttendanceWindowConfig,
  readStaffAttendanceScanRequestBody,
} from "./attendanceHttpHelpers.ts";

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

    const staffResult = await dependencies.resolveStaffForRequest(request, envResult.value, {
      missingMessage: "A verified Supabase Auth user is required to scan attendance.",
    });

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

    const body = await readStaffAttendanceScanRequestBody(request);
    const playerIdHash = await sha256Hex(normalizeStudentCode(body.playerId));

    const credentialResponse = await staffResult.serviceClient
      .from("player_access_credentials")
      .select("player_id,status")
      .eq("game_session_id", gameSessionId)
      .eq("normalized_student_code_hash", playerIdHash)
      .eq("status", "active")
      .maybeSingle();

    if (credentialResponse.error) {
      return jsonError(500, {
        code: "attendance_scan_failed",
        message: "Attendance scan failed.",
        retryable: false,
      });
    }

    const credential = credentialResponse.data as {
      readonly player_id: string;
      readonly status: string;
    } | null;

    if (!credential?.player_id) {
      return jsonError(404, {
        code: "player_not_found",
        message: "Player ID was not found for this game.",
        retryable: false,
      });
    }

    const playerResponse = await staffResult.serviceClient
      .from("players")
      .select("id,display_name,roster_label,status")
      .eq("game_session_id", gameSessionId)
      .eq("id", credential.player_id)
      .maybeSingle();

    if (playerResponse.error) {
      return jsonError(500, {
        code: "attendance_scan_failed",
        message: "Attendance scan failed.",
        retryable: false,
      });
    }

    const player = playerResponse.data as {
      readonly id: string;
      readonly display_name: string;
      readonly roster_label: string | null;
      readonly status: string;
    } | null;

    if (!player?.id || player.status !== "active") {
      return jsonError(404, {
        code: "player_not_found",
        message: "Player ID was not found for this game.",
        retryable: false,
      });
    }

    const settingsResponse = await staffResult.serviceClient
      .from("game_settings")
      .select("attendance_window")
      .eq("game_session_id", gameSessionId)
      .maybeSingle();

    if (settingsResponse.error) {
      return jsonError(500, {
        code: "attendance_scan_failed",
        message: "Attendance scan failed.",
        retryable: false,
      });
    }

    const attendanceWindow = (settingsResponse.data as {
      readonly attendance_window?: unknown;
    } | null)?.attendance_window;

    const attendanceConfig = readPlayerAttendanceWindowConfig(attendanceWindow);
    const timezone = readValidTimeZone(
      body.deviceTimezone,
      attendanceConfig.timezone,
    );
    const attendanceDate = readLocalDateForTimeZone(timezone);
    const currentMinutes = readLocalMinutesForTimeZone(timezone);
    const attendanceStatus =
      attendanceConfig.lateCutoffMinutes !== null &&
        currentMinutes > attendanceConfig.lateCutoffMinutes
        ? "late"
        : "present";
    const rewardAmount = attendanceStatus === "late"
      ? attendanceConfig.lateRewardAmount
      : attendanceConfig.presentRewardAmount;
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    const attendanceResponse = await staffResult.serviceClient.rpc(
      "record_player_attendance_clock_in",
      {
        p_game_session_id: gameSessionId,
        p_player_id: player.id,
        p_attendance_date: attendanceDate,
        p_status: attendanceStatus,
        p_reward_amount: rewardAmount,
        p_currency_code: attendanceConfig.currencyCode,
        p_request_id: requestId,
      },
    );

    if (attendanceResponse.error) {
      const safeError = mapAttendanceClockInRpcError(attendanceResponse.error.message);

      return jsonError(safeError.status, {
        code: safeError.code,
        message: safeError.message,
        retryable: safeError.retryable,
      });
    }

    const attendanceRow = readPlayerAttendanceClockInRpcRow(attendanceResponse.data);

    if (!attendanceRow) {
      return jsonError(500, {
        code: "attendance_scan_failed",
        message: "Attendance scan failed.",
        retryable: false,
      });
    }

    return jsonResponse<StaffAttendanceScanSuccessBody>(200, {
      ok: true,
      gameSession: {
        id: ownershipResult.gameSession.id,
        name: ownershipResult.gameSession.name,
        status: ownershipResult.gameSession.status,
      },
      player: {
        id: player.id,
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        status: player.status,
      },
      attendance: {
        id: attendanceRow.attendance_id,
        status: attendanceRow.attendance_status,
        attendanceDate: attendanceRow.attendance_date,
        clockedInAt: attendanceRow.clocked_in_at,
        wasCreated: attendanceRow.was_created,
        timezone,
      },
      reward: {
        amount: readBalanceNumber(attendanceRow.reward_amount),
        currencyCode: attendanceRow.currency_code,
        ledgerEntryId: attendanceRow.ledger_entry_id,
      },
    });
  } catch (error) {
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
