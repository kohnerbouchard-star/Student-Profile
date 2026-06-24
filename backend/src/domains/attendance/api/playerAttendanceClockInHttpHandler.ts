import {
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  type SupabaseEnv,
  readSupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  readBalanceNumber,
} from "../../../platform/supabase/edgeParsing.ts";
import {
  readLocalDateForTimeZone,
  readLocalMinutesForTimeZone,
} from "../../../platform/supabase/edgeTime.ts";
import {
  mapAttendanceClockInRpcError,
  readPlayerAttendanceClockInRpcRow,
  readPlayerAttendanceWindowConfig,
} from "./attendanceHttpHelpers.ts";
import {
  invalidPlayerSessionResponse,
  readPlayerSessionTokenFromRequest,
  resolveActivePlayerSession,
} from "../../players/api/playerSessionHttpHelpers.ts";

interface PlayerAttendanceClockInDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
}

interface PlayerAttendanceClockInSuccessBody {
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

export async function handlePlayerAttendanceClockInRequest(
  request: Request,
  dependencies: PlayerAttendanceClockInDependencies,
): Promise<Response> {
  const { createServiceClient } = dependencies;
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to clock in attendance.",
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

    const sessionToken = readPlayerSessionTokenFromRequest(request);

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
    }

    const sessionTokenHash = await sha256Hex(sessionToken);

    const serviceClient = createServiceClient(envResult.value);

    const sessionResolution = await resolveActivePlayerSession(
      serviceClient,
      sessionTokenHash,
    );

    if (!sessionResolution.ok) {
      return jsonError(sessionResolution.status, sessionResolution.error);
    }

    const settingsResponse = await serviceClient
      .from("game_settings")
      .select("attendance_window")
      .eq("game_session_id", sessionResolution.session.game_session_id)
      .maybeSingle();

    if (settingsResponse.error) {
      return jsonError(500, {
        code: "attendance_clock_in_failed",
        message: "Attendance clock-in failed.",
        retryable: false,
      });
    }

    const attendanceConfig = readPlayerAttendanceWindowConfig(
      (settingsResponse.data as { readonly attendance_window?: unknown } | null)
        ?.attendance_window,
    );

    const attendanceDate = readLocalDateForTimeZone(attendanceConfig.timezone);
    const currentMinutes = readLocalMinutesForTimeZone(attendanceConfig.timezone);
    const attendanceStatus =
      attendanceConfig.lateCutoffMinutes !== null &&
        currentMinutes > attendanceConfig.lateCutoffMinutes
        ? "late"
        : "present";
    const rewardAmount = attendanceStatus === "late"
      ? attendanceConfig.lateRewardAmount
      : attendanceConfig.presentRewardAmount;
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    const attendanceResponse = await serviceClient.rpc(
      "record_player_attendance_clock_in",
      {
        p_game_session_id: sessionResolution.session.game_session_id,
        p_player_id: sessionResolution.session.player_id,
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
        code: "attendance_clock_in_failed",
        message: "Attendance clock-in failed.",
        retryable: false,
      });
    }

    return jsonResponse<PlayerAttendanceClockInSuccessBody>(200, {
      ok: true,
      gameSession: {
        id: sessionResolution.gameSession.id,
        name: sessionResolution.gameSession.name,
        status: sessionResolution.gameSession.status,
      },
      player: {
        id: sessionResolution.player.id,
        displayName: sessionResolution.player.display_name,
        rosterLabel: sessionResolution.player.roster_label ?? null,
        status: sessionResolution.player.status,
      },
      attendance: {
        id: attendanceRow.attendance_id,
        status: attendanceRow.attendance_status,
        attendanceDate: attendanceRow.attendance_date,
        clockedInAt: attendanceRow.clocked_in_at,
        wasCreated: attendanceRow.was_created,
        timezone: attendanceConfig.timezone,
      },
      reward: {
        amount: readBalanceNumber(attendanceRow.reward_amount),
        currencyCode: attendanceRow.currency_code,
        ledgerEntryId: attendanceRow.ledger_entry_id,
      },
    });
  } catch {
    return jsonError(500, {
      code: "attendance_clock_in_failed",
      message: "Attendance clock-in failed.",
      retryable: false,
    });
  }
}
