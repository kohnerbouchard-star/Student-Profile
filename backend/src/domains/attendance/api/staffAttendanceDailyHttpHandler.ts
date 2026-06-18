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
import {
  readAttendanceDateQuery,
  readPlayerAttendanceWindowConfig,
} from "./attendanceHttpHelpers.ts";

export interface StaffAttendanceDailyHttpHandlerDependencies {
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

export interface StaffAttendanceDailyBody {
  readonly ok: true;
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly attendanceDate: string;
  readonly timezone: string;
  readonly generatedAt: string;
  readonly summary: {
    readonly presentCount: number;
    readonly lateCount: number;
    readonly scannedCount: number;
    readonly missingCount: number;
    readonly activePlayerCount: number;
  };
  readonly records: readonly {
    readonly id: string;
    readonly status: string;
    readonly attendanceDate: string;
    readonly clockedInAt: string;
    readonly player: {
      readonly id: string;
      readonly displayName: string;
      readonly rosterLabel: string | null;
      readonly status: string;
    };
  }[];
  readonly missingPlayers: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly status: string;
  }[];
}

interface AttendanceRecordRow {
  readonly id: string;
  readonly player_id: string;
  readonly attendance_date: string;
  readonly status: string;
  readonly clocked_in_at: string;
}

interface AttendancePlayerRow {
  readonly id: string;
  readonly display_name: string;
  readonly roster_label: string | null;
  readonly status: string;
}

export async function handleStaffAttendanceDailyRequest(
  request: Request,
  gameSessionId: string,
  dependencies: StaffAttendanceDailyHttpHandlerDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load daily attendance.",
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
      missingMessage: "A verified Supabase Auth user is required to view attendance.",
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

    const url = new URL(request.url);
    const settingsResponse = await staffResult.serviceClient
      .from("game_settings")
      .select("attendance_window")
      .eq("game_session_id", gameSessionId)
      .maybeSingle();

    if (settingsResponse.error) {
      return jsonError(500, {
        code: "attendance_daily_list_failed",
        message: "Daily attendance could not be loaded.",
        retryable: false,
      });
    }

    const attendanceConfig = readPlayerAttendanceWindowConfig(
      (settingsResponse.data as { readonly attendance_window?: unknown } | null)
        ?.attendance_window,
    );
    const attendanceDate = readAttendanceDateQuery(
      url.searchParams.get("date"),
      attendanceConfig.timezone,
    );

    const playersResponse = await staffResult.serviceClient
      .from("players")
      .select("id,display_name,roster_label,status")
      .eq("game_session_id", gameSessionId)
      .eq("status", "active")
      .order("display_name", { ascending: true });

    if (playersResponse.error) {
      return jsonError(500, {
        code: "attendance_daily_list_failed",
        message: "Daily attendance could not be loaded.",
        retryable: false,
      });
    }

    const attendanceResponse = await staffResult.serviceClient
      .from("player_attendance_records")
      .select("id,player_id,attendance_date,status,clocked_in_at")
      .eq("game_session_id", gameSessionId)
      .eq("attendance_date", attendanceDate)
      .order("clocked_in_at", { ascending: true });

    if (attendanceResponse.error) {
      return jsonError(500, {
        code: "attendance_daily_list_failed",
        message: "Daily attendance could not be loaded.",
        retryable: false,
      });
    }

    const players = (playersResponse.data ?? []) as AttendancePlayerRow[];
    const attendanceRows = (attendanceResponse.data ?? []) as AttendanceRecordRow[];
    const playerById = new Map(players.map((player) => [player.id, player]));
    const attendedPlayerIds = new Set<string>();
    const records = [];

    for (const row of attendanceRows) {
      const player = playerById.get(row.player_id);

      if (!player) {
        continue;
      }

      attendedPlayerIds.add(player.id);
      records.push({
        id: row.id,
        status: row.status,
        attendanceDate: row.attendance_date,
        clockedInAt: row.clocked_in_at,
        player: {
          id: player.id,
          displayName: player.display_name,
          rosterLabel: player.roster_label ?? null,
          status: player.status,
        },
      });
    }

    const missingPlayers = players
      .filter((player) => !attendedPlayerIds.has(player.id))
      .map((player) => ({
        id: player.id,
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        status: player.status,
      }));

    const presentCount = records.filter((record) => record.status === "present").length;
    const lateCount = records.filter((record) => record.status === "late").length;

    return jsonResponse<StaffAttendanceDailyBody>(200, {
      ok: true,
      gameSession: {
        id: ownershipResult.gameSession.id,
        name: ownershipResult.gameSession.name,
        status: ownershipResult.gameSession.status,
      },
      attendanceDate,
      timezone: attendanceConfig.timezone,
      generatedAt: new Date().toISOString(),
      summary: {
        presentCount,
        lateCount,
        scannedCount: records.length,
        missingCount: missingPlayers.length,
        activePlayerCount: players.length,
      },
      records,
      missingPlayers,
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
      code: "attendance_daily_list_failed",
      message: "Daily attendance could not be loaded.",
      retryable: false,
    });
  }
}
