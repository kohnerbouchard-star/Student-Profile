import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface EdgeErrorBody {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
}

interface EdgeHealthBody {
  readonly ok: true;
  readonly service: "classroom-api";
  readonly status: "ready";
}

interface ActivationSuccessBody {
  readonly ok: true;
  readonly activation: {
    readonly gameSessionId: string;
    readonly entitlementId: string;
    readonly purchaseCodeId: string;
    readonly purchaseCodeStatus: string;
    readonly redeemedCount: number;
    readonly maxRedemptions: number;
    readonly activatedAt: string;
  };
}

interface StaffBootstrapBody {
  readonly ok: true;
  readonly staff: {
    readonly id: string;
    readonly supabaseAuthUserId: string;
    readonly email: string;
    readonly displayName: string;
  };
  readonly activeGameSessions: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  }[];
}

interface GameSettingsBody {
  readonly ok: true;
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly settings: {
    readonly difficultyPreset: string;
    readonly attendanceWindow: Record<string, unknown>;
    readonly businessMarketWindow: Record<string, unknown>;
    readonly stockMarketWindow: Record<string, unknown>;
    readonly newsSchedule: Record<string, unknown>;
    readonly updatedAt: string;
  };
}

interface GameSettingsPatchBody {
  readonly difficultyPreset?: string | null;
  readonly attendanceWindow?: Record<string, unknown> | null;
  readonly businessMarketWindow?: Record<string, unknown> | null;
  readonly stockMarketWindow?: Record<string, unknown> | null;
  readonly newsSchedule?: Record<string, unknown> | null;
}

interface GameSettingsRoute {
  readonly gameSessionId: string;
}

interface AccountBalanceRow {
  readonly account_type: string;
  readonly balance: number | string;
  readonly currency_code: string;
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

interface StaffAttendanceDailyBody {
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

interface StaffAttendanceDailyRoute {
  readonly gameSessionId: string;
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

interface StaffAttendanceScanRequestBody {
  readonly playerId: string;
  readonly deviceTimezone: string | null;
}

interface StaffAttendanceScanSuccessBody {
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

interface StaffAttendanceScanRoute {
  readonly gameSessionId: string;
}

interface PlayerAttendanceWindowConfig {
  readonly timezone: string;
  readonly lateCutoffMinutes: number | null;
  readonly presentRewardAmount: number;
  readonly lateRewardAmount: number;
  readonly currencyCode: string;
}

interface PlayerAttendanceClockInRpcRow {
  readonly attendance_id: string;
  readonly attendance_status: string;
  readonly attendance_date: string;
  readonly clocked_in_at: string;
  readonly was_created: boolean;
  readonly ledger_entry_id: string | null;
  readonly reward_amount: number | string;
  readonly currency_code: string;
}

interface InitialBalanceSeedRequestBody {
  readonly amount: number;
  readonly reason: string;
  readonly accountType: string;
  readonly currencyCode: string;
}

interface InitialBalanceSeedSuccessBody {
  readonly ok: true;
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly seed: {
    readonly createdCount: number;
    readonly skippedCount: number;
    readonly accountType: string;
    readonly currencyCode: string;
    readonly amount: number;
    readonly createdAt: string;
  };
}

interface InitialBalanceSeedRoute {
  readonly gameSessionId: string;
}

interface InitialBalanceSeedRpcRow {
  readonly created_count: number;
  readonly skipped_count: number;
  readonly account_type: string;
  readonly currency_code: string;
  readonly seed_amount: number | string;
  readonly created_at: string;
}

interface StaffLedgerAdjustmentRequestBody {
  readonly amount: number;
  readonly reason: string;
  readonly accountType: string;
  readonly currencyCode: string;
}

interface StaffLedgerAdjustmentSuccessBody {
  readonly ok: true;
  readonly player: {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly status: string;
  };
  readonly ledgerEntry: {
    readonly id: string;
    readonly accountType: string;
    readonly amount: number;
    readonly balance: number;
    readonly currencyCode: string;
    readonly createdAt: string;
  };
}

interface StaffLedgerAdjustmentRoute {
  readonly gameSessionId: string;
  readonly playerId: string;
}

interface StaffLedgerAdjustmentRpcRow {
  readonly ledger_entry_id: string;
  readonly account_balance_id: string;
  readonly account_type: string;
  readonly balance: number | string;
  readonly currency_code: string;
  readonly created_at: string;
}

interface PlayerLedgerHistoryBody {
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
  readonly generatedAt: string;
  readonly currentBalances: readonly {
    readonly accountType: string;
    readonly balance: number;
    readonly currencyCode: string;
  }[];
  readonly ledgerEntries: readonly {
    readonly id: string;
    readonly accountType: string;
    readonly amount: number;
    readonly currencyCode: string;
    readonly entryType: string;
    readonly sourceDomain: string;
    readonly sourceAction: string;
    readonly sourceId: string | null;
    readonly createdByType: string;
    readonly createdAt: string;
  }[];
}

interface PlayerLedgerEntryRow {
  readonly id: string;
  readonly account_type: string;
  readonly amount: number | string;
  readonly currency_code: string;
  readonly entry_type: string;
  readonly source_domain: string;
  readonly source_action: string;
  readonly source_id: string | null;
  readonly created_by_type: string;
  readonly created_at: string;
}

interface PlayerSessionBootstrapBody {
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
  readonly session: {
    readonly id: string;
    readonly status: "active";
    readonly expiresAt: string;
  };
  readonly balances: readonly {
    readonly accountType: string;
    readonly balance: number;
    readonly currencyCode: string;
  }[];
  readonly attendance: {
    readonly status: "not_configured";
  };
  readonly availableActions: readonly string[];
}

interface ResetGameJoinCodeSuccessBody {
  readonly ok: true;
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly joinCode: {
    readonly gameJoinCode: string;
    readonly status: "active";
    readonly updatedAt: string;
  };
}

interface PlayerLoginRequestBody {
  readonly gameJoinCode: string;
  readonly studentCode: string;
}

interface PlayerLoginSuccessBody {
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
  readonly session: {
    readonly token: string;
    readonly status: "active";
    readonly expiresAt: string;
  };
}

interface GameJoinCodeRoute {
  readonly gameSessionId: string;
}

interface PlayerRosterBody {
  readonly ok: true;
  readonly gameSession: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  };
  readonly players: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly status: string;
    readonly hasActiveAccessCode: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;
  }[];
}

interface PlayerRosterRow {
  readonly id: string;
  readonly display_name: string;
  readonly roster_label: string | null;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

interface CreatePlayerRequestBody {
  readonly displayName: string;
  readonly rosterLabel: string | null;
}

interface CreatePlayerSuccessBody {
  readonly ok: true;
  readonly player: {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly status: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
}

interface ResetPlayerAccessCodeSuccessBody {
  readonly ok: true;
  readonly player: {
    readonly id: string;
    readonly displayName: string;
    readonly rosterLabel: string | null;
    readonly status: string;
  };
  readonly accessCode: {
    readonly studentCode: string;
    readonly status: "active";
    readonly createdAt: string;
  };
}

type PlayerRosterRoute =
  | {
      readonly kind: "players";
      readonly gameSessionId: string;
    }
  | {
      readonly kind: "resetAccessCode";
      readonly gameSessionId: string;
      readonly playerId: string;
    };

interface ActivationRequestBody {
  readonly purchaseCode: string;
  readonly gameName: string;
  readonly difficultyPreset?: string | null;
  readonly attendanceWindow?: Record<string, unknown> | null;
  readonly businessMarketWindow?: Record<string, unknown> | null;
  readonly stockMarketWindow?: Record<string, unknown> | null;
  readonly newsSchedule?: Record<string, unknown> | null;
}

interface ActivationRpcRow {
  readonly game_session_id: string;
  readonly entitlement_id: string;
  readonly purchase_code_id: string;
  readonly purchase_code_status: string;
  readonly redeemed_count: number;
  readonly max_redemptions: number;
  readonly activated_at: string;
}

interface SupabaseEnv {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly supabaseServiceRoleKey: string;
}

interface ParsedRequestBodyResult {
  readonly body: ActivationRequestBody;
}

class EdgeActivationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    status: number,
    retryable = false,
  ) {
    super(message);
    this.name = "EdgeActivationError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

Deno.serve(async (request) => {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return jsonResponse(204, null);
  }

  if (url.pathname.endsWith("/health")) {
    return jsonResponse<EdgeHealthBody>(200, {
      ok: true,
      service: "classroom-api",
      status: "ready",
    });
  }

  if (url.pathname.endsWith("/players/me/ledger")) {
    return handlePlayerLedgerHistoryRequest(request);
  }

  if (url.pathname.endsWith("/players/me")) {
    return handlePlayerSessionBootstrapRequest(request);
  }

  if (url.pathname.endsWith("/players/login")) {
    return handlePlayerLoginRequest(request);
  }

  const gameJoinCodeRoute = readGameJoinCodeRoutePath(url.pathname);

  if (gameJoinCodeRoute) {
    return handleResetGameJoinCodeRequest(request, gameJoinCodeRoute.gameSessionId);
  }

  const gameSettingsRoute = readGameSettingsRoutePath(url.pathname);

  if (gameSettingsRoute) {
    return handleGameSettingsRequest(request, gameSettingsRoute.gameSessionId);
  }

  const playerRosterRoute = readPlayerRosterRoutePath(url.pathname);

  if (playerRosterRoute?.kind === "players") {
    return handlePlayerRosterRequest(request, playerRosterRoute.gameSessionId);
  }

  if (playerRosterRoute?.kind === "resetAccessCode") {
    return handleResetPlayerAccessCodeRequest(
      request,
      playerRosterRoute.gameSessionId,
      playerRosterRoute.playerId,
    );
  }

  const staffAttendanceDailyRoute = readStaffAttendanceDailyRoutePath(url.pathname);

  if (staffAttendanceDailyRoute) {
    return handleStaffAttendanceDailyRequest(
      request,
      staffAttendanceDailyRoute.gameSessionId,
    );
  }

  const staffAttendanceScanRoute = readStaffAttendanceScanRoutePath(url.pathname);

  if (staffAttendanceScanRoute) {
    return handleStaffAttendanceScanRequest(
      request,
      staffAttendanceScanRoute.gameSessionId,
    );
  }

  const initialBalanceSeedRoute = readInitialBalanceSeedRoutePath(url.pathname);

  if (initialBalanceSeedRoute) {
    return handleInitialBalanceSeedRequest(
      request,
      initialBalanceSeedRoute.gameSessionId,
    );
  }

  const staffLedgerAdjustmentRoute = readStaffLedgerAdjustmentRoutePath(url.pathname);

  if (staffLedgerAdjustmentRoute) {
    return handleStaffLedgerAdjustmentRequest(
      request,
      staffLedgerAdjustmentRoute.gameSessionId,
      staffLedgerAdjustmentRoute.playerId,
    );
  }

  if (url.pathname.endsWith("/staff/bootstrap")) {
    return handleStaffBootstrapRequest(request);
  }

  if (url.pathname.endsWith("/licensing/activate")) {
    return handleLicensingActivationRequest(request);
  }

  return jsonError(404, {
    code: "route_not_found",
    message: "Classroom API route was not found.",
    retryable: false,
  });
});

// The Edge function does not use generated Supabase DB types yet.
// Keep the service-role client untyped in this Deno shim and validate rows manually.
type EdgeSupabaseClient = any;

interface StaffRequestResolution {
  readonly ok: true;
  readonly staff: {
    readonly id: string;
    readonly supabase_auth_user_id: string;
    readonly email: string;
    readonly display_name: string;
  };
  readonly serviceClient: EdgeSupabaseClient;
}

async function resolveStaffForRequest(
  request: Request,
  env: SupabaseEnv,
  options: { readonly missingMessage: string },
): Promise<
  | StaffRequestResolution
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    }
> {
  const authHeader = request.headers.get("authorization");
  const accessToken = extractBearerToken(authHeader);

  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      error: {
        code: "missing_staff_auth_user",
        message: options.missingMessage,
        retryable: false,
      },
    };
  }

  const authClient = createClient(env.supabaseUrl, env.supabaseAnonKey);
  const authUserResult = await authClient.auth.getUser(accessToken);
  const authUser = authUserResult.data.user;

  if (authUserResult.error || !authUser?.id) {
    return {
      ok: false,
      status: 401,
      error: {
        code: "missing_staff_auth_user",
        message: options.missingMessage,
        retryable: false,
      },
    };
  }

  const serviceClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const staffResponse = await serviceClient
    .from("staff_users")
    .select("id,supabase_auth_user_id,email,display_name")
    .eq("supabase_auth_user_id", authUser.id)
    .maybeSingle();

  if (staffResponse.error) {
    return {
      ok: false,
      status: 500,
      error: {
        code: "staff_lookup_failed",
        message: "Staff lookup failed.",
        retryable: false,
      },
    };
  }

  const staff = staffResponse.data;

  if (!staff?.id) {
    return {
      ok: false,
      status: 403,
      error: {
        code: "staff_not_found",
        message: "No staff user is linked to the Supabase Auth user.",
        retryable: false,
      },
    };
  }

  return {
    ok: true,
    staff,
    serviceClient,
  };
}

async function handleStaffAttendanceDailyRequest(
  request: Request,
  gameSessionId: string,
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

    const staffResult = await resolveStaffForRequest(request, envResult.value, {
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

async function handleStaffAttendanceScanRequest(
  request: Request,
  gameSessionId: string,
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

    const staffResult = await resolveStaffForRequest(request, envResult.value, {
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

async function handlePlayerAttendanceClockInRequest(
  request: Request,
): Promise<Response> {
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

    const sessionToken = extractBearerToken(request.headers.get("authorization"));

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
    }

    const sessionTokenHash = await sha256Hex(sessionToken);

    const serviceClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

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

async function handleInitialBalanceSeedRequest(
  request: Request,
  gameSessionId: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to seed initial player balances.",
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

    const staffResult = await resolveStaffForRequest(request, envResult.value, {
      missingMessage: "A verified Supabase Auth user is required to seed initial player balances.",
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

    const body = await readInitialBalanceSeedRequestBody(request);
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    const seedResponse = await staffResult.serviceClient.rpc(
      "seed_initial_player_balances",
      {
        p_game_session_id: gameSessionId,
        p_amount: body.amount,
        p_account_type: body.accountType,
        p_currency_code: body.currencyCode,
        p_created_by_id: staffResult.staff.id,
        p_reason: body.reason,
        p_request_id: requestId,
      },
    );

    if (seedResponse.error) {
      const safeError = mapInitialBalanceSeedRpcError(seedResponse.error.message);

      return jsonError(safeError.status, {
        code: safeError.code,
        message: safeError.message,
        retryable: safeError.retryable,
      });
    }

    const seedRow = readInitialBalanceSeedRpcRow(seedResponse.data);

    if (!seedRow) {
      return jsonError(500, {
        code: "initial_balance_seed_failed",
        message: "Initial balance seed failed.",
        retryable: false,
      });
    }

    return jsonResponse<InitialBalanceSeedSuccessBody>(200, {
      ok: true,
      gameSession: {
        id: ownershipResult.gameSession.id,
        name: ownershipResult.gameSession.name,
        status: ownershipResult.gameSession.status,
      },
      seed: {
        createdCount: seedRow.created_count,
        skippedCount: seedRow.skipped_count,
        accountType: seedRow.account_type,
        currencyCode: seedRow.currency_code,
        amount: readBalanceNumber(seedRow.seed_amount),
        createdAt: seedRow.created_at,
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
      code: "initial_balance_seed_failed",
      message: "Initial balance seed failed.",
      retryable: false,
    });
  }
}

async function handleStaffLedgerAdjustmentRequest(
  request: Request,
  gameSessionId: string,
  playerId: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to create a player ledger adjustment.",
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

    const staffResult = await resolveStaffForRequest(request, envResult.value, {
      missingMessage: "A verified Supabase Auth user is required to create ledger adjustments.",
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

    const body = await readStaffLedgerAdjustmentRequestBody(request);

    const playerResponse = await staffResult.serviceClient
      .from("players")
      .select("id,display_name,roster_label,status")
      .eq("game_session_id", gameSessionId)
      .eq("id", playerId)
      .maybeSingle();

    if (playerResponse.error) {
      return jsonError(500, {
        code: "ledger_adjustment_failed",
        message: "Ledger adjustment failed.",
        retryable: false,
      });
    }

    const player = playerResponse.data as {
      readonly id: string;
      readonly display_name: string;
      readonly roster_label: string | null;
      readonly status: string;
    } | null;

    if (!player?.id) {
      return jsonError(404, {
        code: "player_not_found",
        message: "Player was not found for this game session.",
        retryable: false,
      });
    }

    if (player.status !== "active") {
      return jsonError(409, {
        code: "player_not_active",
        message: "Only active players can receive ledger adjustments.",
        retryable: false,
      });
    }

    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    const ledgerResponse = await staffResult.serviceClient.rpc(
      "record_player_ledger_entry",
      {
        p_game_session_id: gameSessionId,
        p_player_id: playerId,
        p_account_type: body.accountType,
        p_amount: body.amount,
        p_currency_code: body.currencyCode,
        p_entry_type: "adjustment",
        p_source_domain: "ledger",
        p_source_action: "staff_player_balance_adjustment",
        p_source_id: null,
        p_created_by_type: "staff_user",
        p_created_by_id: staffResult.staff.id,
        p_audit_metadata: {
          requestId,
          reason: body.reason,
          source: "classroom_api_edge_staff_ledger_adjustment",
        },
      },
    );

    if (ledgerResponse.error) {
      const safeError = mapLedgerRpcError(ledgerResponse.error.message);

      return jsonError(safeError.status, {
        code: safeError.code,
        message: safeError.message,
        retryable: safeError.retryable,
      });
    }

    const ledgerRow = readLedgerAdjustmentRpcRow(ledgerResponse.data);

    if (!ledgerRow) {
      return jsonError(500, {
        code: "ledger_adjustment_failed",
        message: "Ledger adjustment failed.",
        retryable: false,
      });
    }

    return jsonResponse<StaffLedgerAdjustmentSuccessBody>(200, {
      ok: true,
      player: {
        id: player.id,
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        status: player.status,
      },
      ledgerEntry: {
        id: ledgerRow.ledger_entry_id,
        accountType: ledgerRow.account_type,
        amount: body.amount,
        balance: readBalanceNumber(ledgerRow.balance),
        currencyCode: ledgerRow.currency_code,
        createdAt: ledgerRow.created_at,
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
      code: "ledger_adjustment_failed",
      message: "Ledger adjustment failed.",
      retryable: false,
    });
  }
}

async function handlePlayerLedgerHistoryRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load player ledger history.",
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

    const sessionToken = extractBearerToken(request.headers.get("authorization"));

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
    }

    const sessionTokenHash = await sha256Hex(sessionToken);
    const url = new URL(request.url);
    const limit = readLedgerHistoryLimitQuery(url.searchParams.get("limit"));

    const serviceClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const sessionResponse = await serviceClient
      .from("player_sessions")
      .select("id,game_session_id,player_id,status,expires_at,revoked_at")
      .eq("session_token_hash", sessionTokenHash)
      .maybeSingle();

    if (sessionResponse.error) {
      return jsonError(500, {
        code: "player_ledger_history_failed",
        message: "Player ledger history could not be loaded.",
        retryable: false,
      });
    }

    const session = sessionResponse.data as {
      readonly id: string;
      readonly game_session_id: string;
      readonly player_id: string;
      readonly status: string;
      readonly expires_at: string;
      readonly revoked_at: string | null;
    } | null;

    if (
      !session?.id ||
      session.status !== "active" ||
      session.revoked_at !== null ||
      Date.parse(session.expires_at) <= Date.now()
    ) {
      return invalidPlayerSessionResponse();
    }

    const gameResponse = await serviceClient
      .from("game_sessions")
      .select("id,name,status")
      .eq("id", session.game_session_id)
      .eq("status", "active")
      .maybeSingle();

    if (gameResponse.error) {
      return jsonError(500, {
        code: "player_ledger_history_failed",
        message: "Player ledger history could not be loaded.",
        retryable: false,
      });
    }

    const gameSession = gameResponse.data as {
      readonly id: string;
      readonly name: string;
      readonly status: string;
    } | null;

    if (!gameSession?.id) {
      return invalidPlayerSessionResponse();
    }

    const playerResponse = await serviceClient
      .from("players")
      .select("id,display_name,roster_label,status")
      .eq("game_session_id", session.game_session_id)
      .eq("id", session.player_id)
      .maybeSingle();

    if (playerResponse.error) {
      return jsonError(500, {
        code: "player_ledger_history_failed",
        message: "Player ledger history could not be loaded.",
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
      return invalidPlayerSessionResponse();
    }

    const balancesResponse = await serviceClient
      .from("account_balances")
      .select("account_type,balance,currency_code")
      .eq("game_session_id", session.game_session_id)
      .eq("player_id", session.player_id)
      .order("account_type", { ascending: true });

    if (balancesResponse.error) {
      return jsonError(500, {
        code: "player_ledger_history_failed",
        message: "Player ledger history could not be loaded.",
        retryable: false,
      });
    }

    const ledgerResponse = await serviceClient
      .from("ledger_entries")
      .select("id,account_type,amount,currency_code,entry_type,source_domain,source_action,source_id,created_by_type,created_at")
      .eq("game_session_id", session.game_session_id)
      .eq("player_id", session.player_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (ledgerResponse.error) {
      return jsonError(500, {
        code: "player_ledger_history_failed",
        message: "Player ledger history could not be loaded.",
        retryable: false,
      });
    }

    const balances = (balancesResponse.data ?? []) as AccountBalanceRow[];
    const ledgerRows = (ledgerResponse.data ?? []) as PlayerLedgerEntryRow[];

    return jsonResponse<PlayerLedgerHistoryBody>(200, {
      ok: true,
      gameSession: {
        id: gameSession.id,
        name: gameSession.name,
        status: gameSession.status,
      },
      player: {
        id: player.id,
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        status: player.status,
      },
      generatedAt: new Date().toISOString(),
      currentBalances: balances.map((balanceRow) => ({
        accountType: balanceRow.account_type,
        balance: readBalanceNumber(balanceRow.balance),
        currencyCode: balanceRow.currency_code,
      })),
      ledgerEntries: ledgerRows.map((entry) => ({
        id: entry.id,
        accountType: entry.account_type,
        amount: readBalanceNumber(entry.amount),
        currencyCode: entry.currency_code,
        entryType: entry.entry_type,
        sourceDomain: entry.source_domain,
        sourceAction: entry.source_action,
        sourceId: entry.source_id ?? null,
        createdByType: entry.created_by_type,
        createdAt: entry.created_at,
      })),
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
      code: "player_ledger_history_failed",
      message: "Player ledger history could not be loaded.",
      retryable: false,
    });
  }
}

async function handlePlayerSessionBootstrapRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load player session data.",
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

    const sessionToken = extractBearerToken(request.headers.get("authorization"));

    if (!sessionToken) {
      return invalidPlayerSessionResponse();
    }

    const sessionTokenHash = await sha256Hex(sessionToken);

    const serviceClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const sessionResponse = await serviceClient
      .from("player_sessions")
      .select("id,game_session_id,player_id,status,expires_at,revoked_at")
      .eq("session_token_hash", sessionTokenHash)
      .maybeSingle();

    if (sessionResponse.error) {
      return jsonError(500, {
        code: "player_session_bootstrap_failed",
        message: "Player session bootstrap failed.",
        retryable: false,
      });
    }

    const session = sessionResponse.data as {
      readonly id: string;
      readonly game_session_id: string;
      readonly player_id: string;
      readonly status: string;
      readonly expires_at: string;
      readonly revoked_at: string | null;
    } | null;

    if (
      !session?.id ||
      session.status !== "active" ||
      session.revoked_at !== null ||
      Date.parse(session.expires_at) <= Date.now()
    ) {
      return invalidPlayerSessionResponse();
    }

    const gameResponse = await serviceClient
      .from("game_sessions")
      .select("id,name,status")
      .eq("id", session.game_session_id)
      .eq("status", "active")
      .maybeSingle();

    if (gameResponse.error) {
      return jsonError(500, {
        code: "player_session_bootstrap_failed",
        message: "Player session bootstrap failed.",
        retryable: false,
      });
    }

    const gameSession = gameResponse.data as {
      readonly id: string;
      readonly name: string;
      readonly status: string;
    } | null;

    if (!gameSession?.id) {
      return invalidPlayerSessionResponse();
    }

    const playerResponse = await serviceClient
      .from("players")
      .select("id,display_name,roster_label,status")
      .eq("game_session_id", session.game_session_id)
      .eq("id", session.player_id)
      .maybeSingle();

    if (playerResponse.error) {
      return jsonError(500, {
        code: "player_session_bootstrap_failed",
        message: "Player session bootstrap failed.",
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
      return invalidPlayerSessionResponse();
    }

    const balancesResponse = await serviceClient
      .from("account_balances")
      .select("account_type,balance,currency_code")
      .eq("game_session_id", session.game_session_id)
      .eq("player_id", session.player_id)
      .order("account_type", { ascending: true });

    if (balancesResponse.error) {
      return jsonError(500, {
        code: "player_session_bootstrap_failed",
        message: "Player session bootstrap failed.",
        retryable: false,
      });
    }

    const balances = (balancesResponse.data ?? []) as AccountBalanceRow[];

    return jsonResponse<PlayerSessionBootstrapBody>(200, {
      ok: true,
      gameSession: {
        id: gameSession.id,
        name: gameSession.name,
        status: gameSession.status,
      },
      player: {
        id: player.id,
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        status: player.status,
      },
      session: {
        id: session.id,
        status: "active",
        expiresAt: session.expires_at,
      },
      balances: balances.map((balanceRow) => ({
        accountType: balanceRow.account_type,
        balance: readBalanceNumber(balanceRow.balance),
        currencyCode: balanceRow.currency_code,
      })),
      attendance: {
        status: "not_configured",
      },
      availableActions: [
        "dashboard.view",
        "ledger.view",
      ],
    });
  } catch {
    return jsonError(500, {
      code: "player_session_bootstrap_failed",
      message: "Player session bootstrap failed.",
      retryable: false,
    });
  }
}

async function handleResetGameJoinCodeRequest(
  request: Request,
  gameSessionId: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to reset a game join code.",
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

    const staffResult = await resolveStaffForRequest(request, envResult.value, {
      missingMessage: "A verified Supabase Auth user is required to reset a game join code.",
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

    const joinCodeResult = await resetGameJoinCode(
      staffResult.serviceClient,
      gameSessionId,
      staffResult.staff.id,
    );

    if (!joinCodeResult.ok) {
      return jsonError(joinCodeResult.status, joinCodeResult.error);
    }

    return jsonResponse<ResetGameJoinCodeSuccessBody>(200, {
      ok: true,
      gameSession: {
        id: ownershipResult.gameSession.id,
        name: ownershipResult.gameSession.name,
        status: ownershipResult.gameSession.status,
      },
      joinCode: {
        gameJoinCode: joinCodeResult.gameJoinCode,
        status: "active",
        updatedAt: joinCodeResult.updatedAt,
      },
    });
  } catch {
    return jsonError(500, {
      code: "join_code_reset_failed",
      message: "Game join code could not be reset.",
      retryable: false,
    });
  }
}

async function handlePlayerLoginRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST for player login.",
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

    const body = await readPlayerLoginRequestBody(request);
    const gameJoinCodeHash = await sha256Hex(normalizeJoinCode(body.gameJoinCode));
    const studentCodeHash = await sha256Hex(normalizeStudentCode(body.studentCode));

    const serviceClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const gameResponse = await serviceClient
      .from("game_sessions")
      .select("id,name,status,game_join_code_status")
      .eq("game_join_code_hash", gameJoinCodeHash)
      .eq("game_join_code_status", "active")
      .eq("status", "active")
      .maybeSingle();

    if (gameResponse.error) {
      return jsonError(500, {
        code: "player_login_failed",
        message: "Player login failed.",
        retryable: false,
      });
    }

    const gameSession = gameResponse.data as {
      readonly id: string;
      readonly name: string;
      readonly status: string;
      readonly game_join_code_status: string;
    } | null;

    if (!gameSession?.id) {
      return invalidPlayerLoginResponse();
    }

    const credentialResponse = await serviceClient
      .from("player_access_credentials")
      .select("id,player_id,status")
      .eq("game_session_id", gameSession.id)
      .eq("normalized_student_code_hash", studentCodeHash)
      .eq("status", "active")
      .maybeSingle();

    if (credentialResponse.error) {
      return jsonError(500, {
        code: "player_login_failed",
        message: "Player login failed.",
        retryable: false,
      });
    }

    const credential = credentialResponse.data as {
      readonly id: string;
      readonly player_id: string;
      readonly status: string;
    } | null;

    if (!credential?.player_id) {
      return invalidPlayerLoginResponse();
    }

    const playerResponse = await serviceClient
      .from("players")
      .select("id,display_name,roster_label,status")
      .eq("game_session_id", gameSession.id)
      .eq("id", credential.player_id)
      .maybeSingle();

    if (playerResponse.error) {
      return jsonError(500, {
        code: "player_login_failed",
        message: "Player login failed.",
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
      return invalidPlayerLoginResponse();
    }

    const sessionResult = await createPlayerSession(
      serviceClient,
      gameSession.id,
      player.id,
    );

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    return jsonResponse<PlayerLoginSuccessBody>(200, {
      ok: true,
      gameSession: {
        id: gameSession.id,
        name: gameSession.name,
        status: gameSession.status,
      },
      player: {
        id: player.id,
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        status: player.status,
      },
      session: {
        token: sessionResult.sessionToken,
        status: "active",
        expiresAt: sessionResult.expiresAt,
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
      code: "player_login_failed",
      message: "Player login failed.",
      retryable: false,
    });
  }
}

async function handlePlayerRosterRequest(
  request: Request,
  gameSessionId: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET or POST for player roster.",
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

    const staffResult = await resolveStaffForRequest(request, envResult.value, {
      missingMessage: "A verified Supabase Auth user is required to manage players.",
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

    if (request.method === "POST") {
      const body = await readCreatePlayerRequestBody(request);

      const createResponse = await staffResult.serviceClient
        .from("players")
        .insert({
          game_session_id: gameSessionId,
          display_name: body.displayName,
          roster_label: body.rosterLabel,
          status: "active",
        })
        .select("id,display_name,roster_label,status,created_at,updated_at")
        .single();

      if (createResponse.error || !createResponse.data?.id) {
        return jsonError(500, {
          code: "player_create_failed",
          message: "Player could not be created.",
          retryable: false,
        });
      }

      const player = createResponse.data;

      return jsonResponse<CreatePlayerSuccessBody>(201, {
        ok: true,
        player: {
          id: player.id,
          displayName: player.display_name,
          rosterLabel: player.roster_label ?? null,
          status: player.status,
          createdAt: player.created_at,
          updatedAt: player.updated_at,
        },
      });
    }

    const playersResponse = await staffResult.serviceClient
      .from("players")
      .select("id,display_name,roster_label,status,created_at,updated_at")
      .eq("game_session_id", gameSessionId)
      .order("created_at", { ascending: true });

    if (playersResponse.error) {
      return jsonError(500, {
        code: "player_roster_failed",
        message: "Player roster could not be loaded.",
        retryable: false,
      });
    }

    const players = (playersResponse.data ?? []) as PlayerRosterRow[];
    const playerIds = players.map((player) => player.id);
    const activeCredentialPlayerIds = new Set<string>();

    if (playerIds.length > 0) {
      const credentialResponse = await staffResult.serviceClient
        .from("player_access_credentials")
        .select("player_id")
        .eq("game_session_id", gameSessionId)
        .eq("status", "active")
        .in("player_id", playerIds);

      if (credentialResponse.error) {
        return jsonError(500, {
          code: "player_roster_failed",
          message: "Player roster could not be loaded.",
          retryable: false,
        });
      }

      for (const credential of credentialResponse.data ?? []) {
        if (typeof credential.player_id === "string") {
          activeCredentialPlayerIds.add(credential.player_id);
        }
      }
    }

    return jsonResponse<PlayerRosterBody>(200, {
      ok: true,
      gameSession: {
        id: ownershipResult.gameSession.id,
        name: ownershipResult.gameSession.name,
        status: ownershipResult.gameSession.status,
      },
      players: players.map((player) => ({
        id: player.id,
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        status: player.status,
        hasActiveAccessCode: activeCredentialPlayerIds.has(player.id),
        createdAt: player.created_at,
        updatedAt: player.updated_at,
      })),
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
      code: "player_roster_failed",
      message: "Player roster request failed.",
      retryable: false,
    });
  }
}

async function handleResetPlayerAccessCodeRequest(
  request: Request,
  gameSessionId: string,
  playerId: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to reset a player access code.",
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

    const staffResult = await resolveStaffForRequest(request, envResult.value, {
      missingMessage: "A verified Supabase Auth user is required to manage player access codes.",
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

    const playerResponse = await staffResult.serviceClient
      .from("players")
      .select("id,display_name,roster_label,status")
      .eq("game_session_id", gameSessionId)
      .eq("id", playerId)
      .maybeSingle();

    if (playerResponse.error) {
      return jsonError(500, {
        code: "access_code_reset_failed",
        message: "Player access code could not be reset.",
        retryable: false,
      });
    }

    const player = playerResponse.data;

    if (!player?.id) {
      return jsonError(404, {
        code: "player_not_found",
        message: "Player was not found for this game session.",
        retryable: false,
      });
    }

    if (player.status !== "active") {
      return jsonError(409, {
        code: "player_not_active",
        message: "Only active players can receive an access code.",
        retryable: false,
      });
    }

    const revokeResponse = await staffResult.serviceClient
      .from("player_access_credentials")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
      })
      .eq("game_session_id", gameSessionId)
      .eq("player_id", playerId)
      .eq("status", "active");

    if (revokeResponse.error) {
      return jsonError(500, {
        code: "access_code_reset_failed",
        message: "Player access code could not be reset.",
        retryable: false,
      });
    }

    const credentialResult = await createPlayerAccessCredential(
      staffResult.serviceClient,
      gameSessionId,
      playerId,
    );

    if (!credentialResult.ok) {
      return jsonError(credentialResult.status, credentialResult.error);
    }

    return jsonResponse<ResetPlayerAccessCodeSuccessBody>(200, {
      ok: true,
      player: {
        id: player.id,
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        status: player.status,
      },
      accessCode: {
        studentCode: credentialResult.studentCode,
        status: "active",
        createdAt: credentialResult.createdAt,
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
      code: "access_code_reset_failed",
      message: "Player access code could not be reset.",
      retryable: false,
    });
  }
}

async function handleGameSettingsRequest(
  request: Request,
  gameSessionId: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "PATCH") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET or PATCH for game settings.",
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

    const staffResult = await resolveStaffForRequest(request, envResult.value, {
      missingMessage: "A verified Supabase Auth user is required to load game settings.",
    });

    if (!staffResult.ok) {
      return jsonError(staffResult.status, staffResult.error);
    }

    const serviceClient = staffResult.serviceClient;

    const gameResponse = await serviceClient
      .from("game_sessions")
      .select("id,name,status,owner_staff_user_id")
      .eq("id", gameSessionId)
      .eq("owner_staff_user_id", staffResult.staff.id)
      .maybeSingle();

    if (gameResponse.error) {
      return jsonError(500, {
        code: "game_settings_failed",
        message: "Game settings request failed.",
        retryable: false,
      });
    }

    const gameSession = gameResponse.data;

    if (!gameSession?.id) {
      return jsonError(404, {
        code: "game_session_not_found",
        message: "Game session was not found for this staff user.",
        retryable: false,
      });
    }

    if (request.method === "PATCH") {
      const patchBody = await readGameSettingsPatchBody(request);
      const updatePayload = buildGameSettingsUpdatePayload(patchBody);

      if (Object.keys(updatePayload).length === 0) {
        return jsonError(400, {
          code: "settings_update_empty",
          message: "At least one game setting must be provided.",
          retryable: false,
        });
      }

      const updateResponse = await serviceClient
        .from("game_settings")
        .update(updatePayload)
        .eq("game_session_id", gameSession.id);

      if (updateResponse.error) {
        return jsonError(500, {
          code: "game_settings_failed",
          message: "Game settings request failed.",
          retryable: false,
        });
      }
    }

    const settingsResponse = await serviceClient
      .from("game_settings")
      .select("difficulty_preset,attendance_window,business_market_window,stock_market_window,news_schedule,updated_at")
      .eq("game_session_id", gameSession.id)
      .maybeSingle();

    if (settingsResponse.error) {
      return jsonError(500, {
        code: "game_settings_failed",
        message: "Game settings request failed.",
        retryable: false,
      });
    }

    const settings = settingsResponse.data;

    if (!settings) {
      return jsonError(404, {
        code: "game_settings_not_found",
        message: "Game settings were not found.",
        retryable: false,
      });
    }

    return jsonResponse<GameSettingsBody>(200, {
      ok: true,
      gameSession: {
        id: gameSession.id,
        name: gameSession.name,
        status: gameSession.status,
      },
      settings: {
        difficultyPreset: settings.difficulty_preset,
        attendanceWindow: readJsonObjectSetting(settings.attendance_window),
        businessMarketWindow: readJsonObjectSetting(settings.business_market_window),
        stockMarketWindow: readJsonObjectSetting(settings.stock_market_window),
        newsSchedule: readJsonObjectSetting(settings.news_schedule),
        updatedAt: settings.updated_at,
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
      code: "game_settings_failed",
      message: "Game settings request failed.",
      retryable: false,
    });
  }
}

async function handleStaffBootstrapRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to load staff bootstrap data.",
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

    const authHeader = request.headers.get("authorization");
    const accessToken = extractBearerToken(authHeader);

    if (!accessToken) {
      return jsonError(401, {
        code: "missing_staff_auth_user",
        message: "A verified Supabase Auth user is required to load staff data.",
        retryable: false,
      });
    }

    const authClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseAnonKey,
    );

    const authUserResult = await authClient.auth.getUser(accessToken);
    const authUser = authUserResult.data.user;

    if (authUserResult.error || !authUser?.id) {
      return jsonError(401, {
        code: "missing_staff_auth_user",
        message: "A verified Supabase Auth user is required to load staff data.",
        retryable: false,
      });
    }

    const serviceClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const staffResponse = await serviceClient
      .from("staff_users")
      .select("id,supabase_auth_user_id,email,display_name")
      .eq("supabase_auth_user_id", authUser.id)
      .maybeSingle();

    if (staffResponse.error) {
      return jsonError(500, {
        code: "staff_bootstrap_failed",
        message: "Staff bootstrap failed.",
        retryable: false,
      });
    }

    const staff = staffResponse.data;

    if (!staff?.id) {
      return jsonError(403, {
        code: "staff_not_found",
        message: "No staff user is linked to the Supabase Auth user.",
        retryable: false,
      });
    }

    const sessionsResponse = await serviceClient
      .from("game_sessions")
      .select("id,name,status,created_at,updated_at")
      .eq("owner_staff_user_id", staff.id)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (sessionsResponse.error) {
      return jsonError(500, {
        code: "staff_bootstrap_failed",
        message: "Staff bootstrap failed.",
        retryable: false,
      });
    }

    return jsonResponse<StaffBootstrapBody>(200, {
      ok: true,
      staff: {
        id: staff.id,
        supabaseAuthUserId: staff.supabase_auth_user_id,
        email: staff.email,
        displayName: staff.display_name,
      },
      activeGameSessions: (sessionsResponse.data ?? []).map((session) => ({
        id: session.id,
        name: session.name,
        status: session.status,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
      })),
    });
  } catch {
    return jsonError(500, {
      code: "staff_bootstrap_failed",
      message: "Staff bootstrap failed.",
      retryable: false,
    });
  }
}

async function handleLicensingActivationRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to activate licensing.",
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

    const authHeader = request.headers.get("authorization");
    const accessToken = extractBearerToken(authHeader);

    if (!accessToken) {
      return jsonError(401, {
        code: "missing_staff_auth_user",
        message: "A verified Supabase Auth user is required to activate licensing.",
        retryable: false,
      });
    }

    const authClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseAnonKey,
    );

    const authUserResult = await authClient.auth.getUser(accessToken);
    const authUser = authUserResult.data.user;

    if (authUserResult.error || !authUser?.id) {
      return jsonError(401, {
        code: "missing_staff_auth_user",
        message: "A verified Supabase Auth user is required to activate licensing.",
        retryable: false,
      });
    }

    const serviceClient = createClient(
      envResult.value.supabaseUrl,
      envResult.value.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const parsedBody = await readActivationRequestBody(request);
    const normalizedPurchaseCode = normalizePurchaseCode(parsedBody.body.purchaseCode);
    const purchaseCodeHash = await sha256Hex(normalizedPurchaseCode);
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    const staffResponse = await serviceClient
      .from("staff_users")
      .select("id,supabase_auth_user_id,email,display_name")
      .eq("supabase_auth_user_id", authUser.id)
      .maybeSingle();

    if (staffResponse.error) {
      return jsonError(500, {
        code: "licensing_activation_failed",
        message: "Purchase-code activation failed.",
        retryable: false,
      });
    }

    if (!staffResponse.data?.id) {
      return jsonError(403, {
        code: "staff_not_found",
        message: "No staff user is linked to the Supabase Auth user.",
        retryable: false,
      });
    }

    const activationResponse = await serviceClient.rpc(
      "redeem_purchase_code_for_game",
      {
        p_staff_user_id: staffResponse.data.id,
        p_purchase_code_hash: purchaseCodeHash,
        p_game_name: parsedBody.body.gameName,
        p_game_settings: buildGameSettings(parsedBody.body),
        p_request_metadata: {
          requestId,
          source: "classroom_api_edge_licensing_activation",
          supabaseAuthUserId: authUser.id,
        },
      },
    );

    if (activationResponse.error) {
      const safeError = mapActivationRpcError(activationResponse.error.message);

      return jsonError(safeError.status, {
        code: safeError.code,
        message: safeError.message,
        retryable: safeError.retryable,
      });
    }

    const activationRow = readActivationRpcRow(activationResponse.data);

    if (!activationRow) {
      return jsonError(500, {
        code: "licensing_activation_failed",
        message: "Purchase-code activation failed.",
        retryable: false,
      });
    }

    return jsonResponse<ActivationSuccessBody>(200, {
      ok: true,
      activation: {
        gameSessionId: activationRow.game_session_id,
        entitlementId: activationRow.entitlement_id,
        purchaseCodeId: activationRow.purchase_code_id,
        purchaseCodeStatus: activationRow.purchase_code_status,
        redeemedCount: activationRow.redeemed_count,
        maxRedemptions: activationRow.max_redemptions,
        activatedAt: activationRow.activated_at,
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
      code: "licensing_activation_failed",
      message: "Purchase-code activation failed.",
      retryable: false,
    });
  }
}

async function resolveActivePlayerSession(
  serviceClient: EdgeSupabaseClient,
  sessionTokenHash: string,
): Promise<
  | {
      readonly ok: true;
      readonly session: {
        readonly id: string;
        readonly game_session_id: string;
        readonly player_id: string;
        readonly status: string;
        readonly expires_at: string;
        readonly revoked_at: string | null;
      };
      readonly gameSession: {
        readonly id: string;
        readonly name: string;
        readonly status: string;
      };
      readonly player: {
        readonly id: string;
        readonly display_name: string;
        readonly roster_label: string | null;
        readonly status: string;
      };
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    }
> {
  const sessionResponse = await serviceClient
    .from("player_sessions")
    .select("id,game_session_id,player_id,status,expires_at,revoked_at")
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle();

  if (sessionResponse.error) {
    return {
      ok: false,
      status: 500,
      error: {
        code: "player_session_lookup_failed",
        message: "Player session lookup failed.",
        retryable: false,
      },
    };
  }

  const session = sessionResponse.data as {
    readonly id: string;
    readonly game_session_id: string;
    readonly player_id: string;
    readonly status: string;
    readonly expires_at: string;
    readonly revoked_at: string | null;
  } | null;

  if (
    !session?.id ||
    session.status !== "active" ||
    session.revoked_at !== null ||
    Date.parse(session.expires_at) <= Date.now()
  ) {
    return {
      ok: false,
      status: 401,
      error: {
        code: "invalid_player_session",
        message: "Player session is invalid or expired.",
        retryable: false,
      },
    };
  }

  const gameResponse = await serviceClient
    .from("game_sessions")
    .select("id,name,status")
    .eq("id", session.game_session_id)
    .eq("status", "active")
    .maybeSingle();

  if (gameResponse.error) {
    return {
      ok: false,
      status: 500,
      error: {
        code: "player_session_lookup_failed",
        message: "Player session lookup failed.",
        retryable: false,
      },
    };
  }

  const gameSession = gameResponse.data as {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  } | null;

  if (!gameSession?.id) {
    return {
      ok: false,
      status: 401,
      error: {
        code: "invalid_player_session",
        message: "Player session is invalid or expired.",
        retryable: false,
      },
    };
  }

  const playerResponse = await serviceClient
    .from("players")
    .select("id,display_name,roster_label,status")
    .eq("game_session_id", session.game_session_id)
    .eq("id", session.player_id)
    .maybeSingle();

  if (playerResponse.error) {
    return {
      ok: false,
      status: 500,
      error: {
        code: "player_session_lookup_failed",
        message: "Player session lookup failed.",
        retryable: false,
      },
    };
  }

  const player = playerResponse.data as {
    readonly id: string;
    readonly display_name: string;
    readonly roster_label: string | null;
    readonly status: string;
  } | null;

  if (!player?.id || player.status !== "active") {
    return {
      ok: false,
      status: 401,
      error: {
        code: "invalid_player_session",
        message: "Player session is invalid or expired.",
        retryable: false,
      },
    };
  }

  return {
    ok: true,
    session,
    gameSession,
    player,
  };
}

function readPlayerAttendanceWindowConfig(
  value: unknown,
): PlayerAttendanceWindowConfig {
  const attendanceWindow = isRecord(value) ? value : {};
  const timezone = readValidTimeZone(attendanceWindow.timezone, "Asia/Seoul");
  const lateCutoffMinutes = readOptionalTimeMinutes(attendanceWindow.lateCutoff);
  const presentRewardAmount = readOptionalNonNegativeAmount(
    attendanceWindow.presentRewardAmount,
  );
  const lateRewardAmount = readOptionalNonNegativeAmount(
    attendanceWindow.lateRewardAmount,
  );
  const currencyCode = normalizeCurrencyCode(
    parseOptionalText(attendanceWindow.currencyCode) ?? "ECO",
  );

  return {
    timezone,
    lateCutoffMinutes,
    presentRewardAmount,
    lateRewardAmount,
    currencyCode,
  };
}

function readValidTimeZone(value: unknown, fallbackTimeZone: string): string {
  if (typeof value !== "string" || !value.trim()) {
    return fallbackTimeZone;
  }

  const timezone = value.trim();

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return fallbackTimeZone;
  }
}

function readLocalDateForTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not compute local attendance date.");
  }

  return `${year}-${month}-${day}`;
}

function readLocalMinutesForTimeZone(timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;

  if (!hour || !minute) {
    throw new Error("Could not compute local attendance time.");
  }

  return Number(hour) * 60 + Number(minute);
}

function readOptionalTimeMinutes(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}

function readOptionalNonNegativeAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }

  return Math.round(amount * 100) / 100;
}

function readPlayerAttendanceClockInRpcRow(
  value: unknown,
): PlayerAttendanceClockInRpcRow | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const row = value[0];

  if (!isRecord(row)) {
    return null;
  }

  if (
    typeof row.attendance_id !== "string" ||
    typeof row.attendance_status !== "string" ||
    typeof row.attendance_date !== "string" ||
    typeof row.clocked_in_at !== "string" ||
    typeof row.was_created !== "boolean" ||
    typeof row.currency_code !== "string"
  ) {
    return null;
  }

  if (
    row.ledger_entry_id !== null &&
    typeof row.ledger_entry_id !== "string"
  ) {
    return null;
  }

  if (
    typeof row.reward_amount !== "number" &&
    typeof row.reward_amount !== "string"
  ) {
    return null;
  }

  return {
    attendance_id: row.attendance_id,
    attendance_status: row.attendance_status,
    attendance_date: row.attendance_date,
    clocked_in_at: row.clocked_in_at,
    was_created: row.was_created,
    ledger_entry_id: row.ledger_entry_id,
    reward_amount: row.reward_amount,
    currency_code: row.currency_code,
  };
}

function mapAttendanceClockInRpcError(message: string): {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly retryable: boolean;
} {
  switch (message.trim().toUpperCase()) {
    case "GAME_SESSION_REQUIRED":
    case "PLAYER_REQUIRED":
    case "ATTENDANCE_DATE_REQUIRED":
    case "INVALID_ATTENDANCE_STATUS":
    case "INVALID_REWARD_AMOUNT":
    case "INVALID_CURRENCY_CODE":
      return {
        code: "invalid_attendance_clock_in",
        message: "Attendance clock-in request is invalid.",
        status: 400,
        retryable: false,
      };

    case "PLAYER_NOT_FOUND":
      return {
        code: "player_not_found",
        message: "Player was not found for this game session.",
        status: 404,
        retryable: false,
      };

    default:
      return {
        code: "attendance_clock_in_failed",
        message: "Attendance clock-in failed.",
        status: 500,
        retryable: false,
      };
  }
}

function readLedgerHistoryLimitQuery(value: string | null): number {
  const rawLimit = value?.trim();

  if (!rawLimit) {
    return 50;
  }

  if (!/^\d+$/.test(rawLimit)) {
    throw new EdgeActivationError(
      "invalid_ledger_limit",
      "limit must be a positive integer.",
      400,
    );
  }

  const limit = Number.parseInt(rawLimit, 10);

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new EdgeActivationError(
      "invalid_ledger_limit",
      "limit must be between 1 and 100.",
      400,
    );
  }

  return limit;
}

function readStaffAttendanceDailyRoutePath(
  pathname: string,
): StaffAttendanceDailyRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const gamesIndex = segments.lastIndexOf("games");

  if (gamesIndex < 0) {
    return null;
  }

  const gameSessionId = segments[gamesIndex + 1];
  const attendanceSegment = segments[gamesIndex + 2];

  if (
    gameSessionId &&
    isUuid(gameSessionId) &&
    attendanceSegment === "attendance" &&
    gamesIndex + 3 === segments.length
  ) {
    return { gameSessionId };
  }

  return null;
}

function readAttendanceDateQuery(
  value: string | null,
  timeZone: string,
): string {
  const rawDate = value?.trim();

  if (!rawDate) {
    return readLocalDateForTimeZone(timeZone);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    throw new EdgeActivationError(
      "invalid_attendance_date",
      "date must use YYYY-MM-DD format.",
      400,
    );
  }

  const parsedDate = new Date(`${rawDate}T00:00:00.000Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== rawDate
  ) {
    throw new EdgeActivationError(
      "invalid_attendance_date",
      "date must be a real calendar date.",
      400,
    );
  }

  return rawDate;
}

function readStaffAttendanceScanRoutePath(
  pathname: string,
): StaffAttendanceScanRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const gamesIndex = segments.lastIndexOf("games");

  if (gamesIndex < 0) {
    return null;
  }

  const gameSessionId = segments[gamesIndex + 1];
  const attendanceSegment = segments[gamesIndex + 2];
  const scanSegment = segments[gamesIndex + 3];

  if (
    gameSessionId &&
    isUuid(gameSessionId) &&
    attendanceSegment === "attendance" &&
    scanSegment === "scan" &&
    gamesIndex + 4 === segments.length
  ) {
    return { gameSessionId };
  }

  return null;
}

async function readStaffAttendanceScanRequestBody(
  request: Request,
): Promise<StaffAttendanceScanRequestBody> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  return {
    playerId: parseRequiredText(value.playerId, "playerId", "Player ID is required."),
    deviceTimezone: parseOptionalText(value.deviceTimezone),
  };
}

function readInitialBalanceSeedRoutePath(
  pathname: string,
): InitialBalanceSeedRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const gamesIndex = segments.lastIndexOf("games");

  if (gamesIndex < 0) {
    return null;
  }

  const gameSessionId = segments[gamesIndex + 1];
  const playersSegment = segments[gamesIndex + 2];
  const seedBalancesSegment = segments[gamesIndex + 3];

  if (
    gameSessionId &&
    isUuid(gameSessionId) &&
    playersSegment === "players" &&
    seedBalancesSegment === "seed-balances" &&
    gamesIndex + 4 === segments.length
  ) {
    return { gameSessionId };
  }

  return null;
}

async function readInitialBalanceSeedRequestBody(
  request: Request,
): Promise<InitialBalanceSeedRequestBody> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  return {
    amount: parseInitialBalanceSeedAmount(value.amount),
    reason: parseOptionalText(value.reason) ?? "Initial balance seed",
    accountType: normalizeAccountType(parseOptionalText(value.accountType) ?? "cash"),
    currencyCode: normalizeCurrencyCode(parseOptionalText(value.currencyCode) ?? "ECO"),
  };
}

function parseInitialBalanceSeedAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new EdgeActivationError(
      "seed_amount_required",
      "amount must be a positive number.",
      400,
    );
  }

  return Math.round(amount * 100) / 100;
}

function normalizeAccountType(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (!/^[a-z0-9_-]{1,32}$/.test(normalizedValue)) {
    throw new EdgeActivationError(
      "invalid_account_type",
      "accountType must be 1 to 32 letters, numbers, underscores, or hyphens.",
      400,
    );
  }

  return normalizedValue;
}

function readInitialBalanceSeedRpcRow(
  value: unknown,
): InitialBalanceSeedRpcRow | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const row = value[0];

  if (!isRecord(row)) {
    return null;
  }

  if (
    typeof row.created_count !== "number" ||
    typeof row.skipped_count !== "number" ||
    typeof row.account_type !== "string" ||
    typeof row.currency_code !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }

  if (
    typeof row.seed_amount !== "number" &&
    typeof row.seed_amount !== "string"
  ) {
    return null;
  }

  return {
    created_count: row.created_count,
    skipped_count: row.skipped_count,
    account_type: row.account_type,
    currency_code: row.currency_code,
    seed_amount: row.seed_amount,
    created_at: row.created_at,
  };
}

function mapInitialBalanceSeedRpcError(message: string): {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly retryable: boolean;
} {
  switch (message.trim().toUpperCase()) {
    case "GAME_SESSION_REQUIRED":
    case "SEED_AMOUNT_REQUIRED":
    case "ACCOUNT_TYPE_REQUIRED":
    case "INVALID_CURRENCY_CODE":
      return {
        code: "invalid_initial_balance_seed",
        message: "Initial balance seed request is invalid.",
        status: 400,
        retryable: false,
      };

    case "GAME_SESSION_NOT_FOUND":
      return {
        code: "game_session_not_found",
        message: "Game session was not found.",
        status: 404,
        retryable: false,
      };

    default:
      return {
        code: "initial_balance_seed_failed",
        message: "Initial balance seed failed.",
        status: 500,
        retryable: false,
      };
  }
}

function readStaffLedgerAdjustmentRoutePath(
  pathname: string,
): StaffLedgerAdjustmentRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const gamesIndex = segments.lastIndexOf("games");

  if (gamesIndex < 0) {
    return null;
  }

  const gameSessionId = segments[gamesIndex + 1];
  const playersSegment = segments[gamesIndex + 2];
  const playerId = segments[gamesIndex + 3];
  const ledgerAdjustmentsSegment = segments[gamesIndex + 4];

  if (
    gameSessionId &&
    isUuid(gameSessionId) &&
    playersSegment === "players" &&
    playerId &&
    isUuid(playerId) &&
    ledgerAdjustmentsSegment === "ledger-adjustments" &&
    gamesIndex + 5 === segments.length
  ) {
    return {
      gameSessionId,
      playerId,
    };
  }

  return null;
}

async function readStaffLedgerAdjustmentRequestBody(
  request: Request,
): Promise<StaffLedgerAdjustmentRequestBody> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  return {
    amount: parseLedgerAmount(value.amount),
    reason: parseRequiredText(
      value.reason,
      "ledger_adjustment_reason_required",
      "reason is required.",
    ),
    accountType: parseOptionalText(value.accountType) ?? "cash",
    currencyCode: normalizeCurrencyCode(parseOptionalText(value.currencyCode) ?? "ECO"),
  };
}

function parseLedgerAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(amount) || amount === 0) {
    throw new EdgeActivationError(
      "ledger_amount_required",
      "amount must be a non-zero number.",
      400,
    );
  }

  return Math.round(amount * 100) / 100;
}

function normalizeCurrencyCode(value: string): string {
  const normalizedValue = value.trim().toUpperCase();

  if (!/^[A-Z0-9]{3,16}$/.test(normalizedValue)) {
    throw new EdgeActivationError(
      "invalid_currency_code",
      "currencyCode must be 3 to 16 uppercase letters or numbers.",
      400,
    );
  }

  return normalizedValue;
}

function readLedgerAdjustmentRpcRow(
  value: unknown,
): StaffLedgerAdjustmentRpcRow | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const row = value[0];

  if (!isRecord(row)) {
    return null;
  }

  if (
    typeof row.ledger_entry_id !== "string" ||
    typeof row.account_balance_id !== "string" ||
    typeof row.account_type !== "string" ||
    typeof row.currency_code !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }

  if (
    typeof row.balance !== "number" &&
    typeof row.balance !== "string"
  ) {
    return null;
  }

  return {
    ledger_entry_id: row.ledger_entry_id,
    account_balance_id: row.account_balance_id,
    account_type: row.account_type,
    balance: row.balance,
    currency_code: row.currency_code,
    created_at: row.created_at,
  };
}

function mapLedgerRpcError(message: string): {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly retryable: boolean;
} {
  switch (message.trim().toUpperCase()) {
    case "GAME_SESSION_REQUIRED":
    case "PLAYER_REQUIRED":
    case "ACCOUNT_TYPE_REQUIRED":
    case "LEDGER_AMOUNT_REQUIRED":
    case "INVALID_CURRENCY_CODE":
    case "INVALID_LEDGER_ENTRY_TYPE":
    case "SOURCE_DOMAIN_REQUIRED":
    case "SOURCE_ACTION_REQUIRED":
    case "INVALID_CREATED_BY_TYPE":
      return {
        code: "invalid_ledger_adjustment",
        message: "Ledger adjustment request is invalid.",
        status: 400,
        retryable: false,
      };

    case "PLAYER_NOT_FOUND":
      return {
        code: "player_not_found",
        message: "Player was not found for this game session.",
        status: 404,
        retryable: false,
      };

    default:
      return {
        code: "ledger_adjustment_failed",
        message: "Ledger adjustment failed.",
        status: 500,
        retryable: false,
      };
  }
}

function readGameJoinCodeRoutePath(pathname: string): GameJoinCodeRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const gamesIndex = segments.lastIndexOf("games");

  if (gamesIndex < 0) {
    return null;
  }

  const gameSessionId = segments[gamesIndex + 1];
  const joinCodeSegment = segments[gamesIndex + 2];
  const resetSegment = segments[gamesIndex + 3];

  if (
    gameSessionId &&
    isUuid(gameSessionId) &&
    joinCodeSegment === "join-code" &&
    resetSegment === "reset" &&
    gamesIndex + 4 === segments.length
  ) {
    return { gameSessionId };
  }

  return null;
}

async function readPlayerLoginRequestBody(
  request: Request,
): Promise<PlayerLoginRequestBody> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  return {
    gameJoinCode: parseRequiredText(
      value.gameJoinCode,
      "game_join_code_required",
      "gameJoinCode is required.",
    ),
    studentCode: parseRequiredText(
      value.studentCode,
      "student_code_required",
      "studentCode is required.",
    ),
  };
}

function readBalanceNumber(value: number | string): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function invalidPlayerSessionResponse(): Response {
  return jsonError(401, {
    code: "invalid_player_session",
    message: "Player session is invalid or expired.",
    retryable: false,
  });
}

function invalidPlayerLoginResponse(): Response {
  return jsonError(401, {
    code: "invalid_player_login",
    message: "Game join code or student code is invalid.",
    retryable: false,
  });
}

function generateGameJoinCode(): string {
  return `ECO-${generateCompactCode(6)}`;
}

function generateSessionToken(): string {
  return `ps_${generateCompactCode(32).toLowerCase()}`;
}

function generateCompactCode(length: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));

  return [...bytes]
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
}

async function resetGameJoinCode(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  staffUserId: string,
): Promise<
  | {
      readonly ok: true;
      readonly gameJoinCode: string;
      readonly updatedAt: string;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    }
> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const gameJoinCode = generateGameJoinCode();
    const gameJoinCodeHash = await sha256Hex(normalizeJoinCode(gameJoinCode));

    const updateResponse = await serviceClient
      .from("game_sessions")
      .update({
        game_join_code_hash: gameJoinCodeHash,
        game_join_code_status: "active",
      })
      .eq("id", gameSessionId)
      .eq("owner_staff_user_id", staffUserId)
      .select("updated_at")
      .single();

    if (!updateResponse.error && updateResponse.data?.updated_at) {
      return {
        ok: true,
        gameJoinCode,
        updatedAt: updateResponse.data.updated_at,
      };
    }

    const message = updateResponse.error?.message?.toLowerCase() ?? "";

    if (!message.includes("duplicate") && !message.includes("unique")) {
      return {
        ok: false,
        status: 500,
        error: {
          code: "join_code_reset_failed",
          message: "Game join code could not be reset.",
          retryable: false,
        },
      };
    }
  }

  return {
    ok: false,
    status: 409,
    error: {
      code: "join_code_generation_conflict",
      message: "A unique game join code could not be generated.",
      retryable: true,
    },
  };
}

async function createPlayerSession(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  playerId: string,
): Promise<
  | {
      readonly ok: true;
      readonly sessionToken: string;
      readonly expiresAt: string;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    }
> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sessionToken = generateSessionToken();
    const sessionTokenHash = await sha256Hex(sessionToken);
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

    const sessionResponse = await serviceClient
      .from("player_sessions")
      .insert({
        game_session_id: gameSessionId,
        player_id: playerId,
        session_token_hash: sessionTokenHash,
        status: "active",
        expires_at: expiresAt,
      })
      .select("expires_at")
      .single();

    if (!sessionResponse.error && sessionResponse.data?.expires_at) {
      return {
        ok: true,
        sessionToken,
        expiresAt: sessionResponse.data.expires_at,
      };
    }

    const message = sessionResponse.error?.message?.toLowerCase() ?? "";

    if (!message.includes("duplicate") && !message.includes("unique")) {
      return {
        ok: false,
        status: 500,
        error: {
          code: "player_login_failed",
          message: "Player login failed.",
          retryable: false,
        },
      };
    }
  }

  return {
    ok: false,
    status: 409,
    error: {
      code: "player_session_generation_conflict",
      message: "A unique player session could not be generated.",
      retryable: true,
    },
  };
}

function normalizeJoinCode(value: string): string {
  const normalizedValue = value
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!normalizedValue) {
    throw new EdgeActivationError(
      "game_join_code_required",
      "gameJoinCode is required.",
      400,
    );
  }

  if (!/^[A-Z0-9-]+$/.test(normalizedValue)) {
    throw new EdgeActivationError(
      "invalid_game_join_code",
      "gameJoinCode may only contain letters, numbers, and hyphens.",
      400,
    );
  }

  return normalizedValue;
}

function readPlayerRosterRoutePath(pathname: string): PlayerRosterRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const gamesIndex = segments.lastIndexOf("games");

  if (gamesIndex < 0) {
    return null;
  }

  const gameSessionId = segments[gamesIndex + 1];
  const playersSegment = segments[gamesIndex + 2];

  if (!gameSessionId || playersSegment !== "players") {
    return null;
  }

  if (!isUuid(gameSessionId)) {
    return null;
  }

  if (gamesIndex + 3 === segments.length) {
    return {
      kind: "players",
      gameSessionId,
    };
  }

  const playerId = segments[gamesIndex + 3];
  const accessCodeSegment = segments[gamesIndex + 4];
  const resetSegment = segments[gamesIndex + 5];

  if (
    playerId &&
    isUuid(playerId) &&
    accessCodeSegment === "access-code" &&
    resetSegment === "reset" &&
    gamesIndex + 6 === segments.length
  ) {
    return {
      kind: "resetAccessCode",
      gameSessionId,
      playerId,
    };
  }

  return null;
}

async function readOwnedGameSession(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  staffUserId: string,
): Promise<
  | {
      readonly ok: true;
      readonly gameSession: {
        readonly id: string;
        readonly name: string;
        readonly status: string;
      };
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    }
> {
  const gameResponse = await serviceClient
    .from("game_sessions")
    .select("id,name,status,owner_staff_user_id")
    .eq("id", gameSessionId)
    .eq("owner_staff_user_id", staffUserId)
    .maybeSingle();

  if (gameResponse.error) {
    return {
      ok: false,
      status: 500,
      error: {
        code: "game_session_lookup_failed",
        message: "Game session lookup failed.",
        retryable: false,
      },
    };
  }

  const gameSession = gameResponse.data;

  if (!gameSession?.id) {
    return {
      ok: false,
      status: 404,
      error: {
        code: "game_session_not_found",
        message: "Game session was not found for this staff user.",
        retryable: false,
      },
    };
  }

  return {
    ok: true,
    gameSession: {
      id: gameSession.id,
      name: gameSession.name,
      status: gameSession.status,
    },
  };
}

async function readCreatePlayerRequestBody(
  request: Request,
): Promise<CreatePlayerRequestBody> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  return {
    displayName: parseRequiredText(
      value.displayName,
      "player_display_name_required",
      "displayName is required.",
    ),
    rosterLabel: parseOptionalText(value.rosterLabel),
  };
}

function generateStudentCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));

  return [...bytes]
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
}

async function createPlayerAccessCredential(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  playerId: string,
): Promise<
  | {
      readonly ok: true;
      readonly studentCode: string;
      readonly createdAt: string;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    }
> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const studentCode = generateStudentCode();
    const credentialHash = await sha256Hex(normalizeStudentCode(studentCode));

    const credentialResponse = await serviceClient
      .from("player_access_credentials")
      .insert({
        game_session_id: gameSessionId,
        player_id: playerId,
        normalized_student_code_hash: credentialHash,
        status: "active",
      })
      .select("created_at")
      .single();

    if (!credentialResponse.error && credentialResponse.data?.created_at) {
      return {
        ok: true,
        studentCode,
        createdAt: credentialResponse.data.created_at,
      };
    }

    const message = credentialResponse.error?.message?.toLowerCase() ?? "";

    if (!message.includes("duplicate") && !message.includes("unique")) {
      return {
        ok: false,
        status: 500,
        error: {
          code: "access_code_reset_failed",
          message: "Player access code could not be reset.",
          retryable: false,
        },
      };
    }
  }

  return {
    ok: false,
    status: 409,
    error: {
      code: "access_code_generation_conflict",
      message: "A unique player access code could not be generated.",
      retryable: true,
    },
  };
}

function normalizeStudentCode(value: string): string {
  const normalizedValue = value
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!normalizedValue) {
    throw new EdgeActivationError(
      "student_code_required",
      "studentCode is required.",
      400,
    );
  }

  if (!/^[A-Z0-9-]+$/.test(normalizedValue)) {
    throw new EdgeActivationError(
      "invalid_student_code",
      "studentCode may only contain letters, numbers, and hyphens.",
      400,
    );
  }

  return normalizedValue;
}

function readGameSettingsRoutePath(pathname: string): GameSettingsRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  const gamesIndex = segments.lastIndexOf("games");

  if (gamesIndex < 0) {
    return null;
  }

  const gameSessionId = segments[gamesIndex + 1];
  const settingsSegment = segments[gamesIndex + 2];

  if (!gameSessionId || settingsSegment !== "settings") {
    return null;
  }

  if (gamesIndex + 3 !== segments.length) {
    return null;
  }

  if (!isUuid(gameSessionId)) {
    return null;
  }

  return { gameSessionId };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function readGameSettingsPatchBody(
  request: Request,
): Promise<GameSettingsPatchBody> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  return {
    difficultyPreset: parseOptionalText(value.difficultyPreset),
    attendanceWindow: parseOptionalJsonObject(value.attendanceWindow),
    businessMarketWindow: parseOptionalJsonObject(value.businessMarketWindow),
    stockMarketWindow: parseOptionalJsonObject(value.stockMarketWindow),
    newsSchedule: parseOptionalJsonObject(value.newsSchedule),
  };
}

function buildGameSettingsUpdatePayload(
  body: GameSettingsPatchBody,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (body.difficultyPreset !== undefined && body.difficultyPreset !== null) {
    payload.difficulty_preset = body.difficultyPreset;
  }

  if (body.attendanceWindow !== undefined && body.attendanceWindow !== null) {
    payload.attendance_window = body.attendanceWindow;
  }

  if (
    body.businessMarketWindow !== undefined &&
    body.businessMarketWindow !== null
  ) {
    payload.business_market_window = body.businessMarketWindow;
  }

  if (body.stockMarketWindow !== undefined && body.stockMarketWindow !== null) {
    payload.stock_market_window = body.stockMarketWindow;
  }

  if (body.newsSchedule !== undefined && body.newsSchedule !== null) {
    payload.news_schedule = body.newsSchedule;
  }

  return payload;
}

function readJsonObjectSetting(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

async function readActivationRequestBody(
  request: Request,
): Promise<ParsedRequestBodyResult> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "Request body must be a JSON object.",
      400,
    );
  }

  return {
    body: {
      purchaseCode: parseRequiredText(
        value.purchaseCode,
        "purchase_code_required",
        "purchaseCode is required.",
      ),
      gameName: parseRequiredText(
        value.gameName,
        "game_name_required",
        "gameName is required.",
      ),
      difficultyPreset: parseOptionalText(value.difficultyPreset),
      attendanceWindow: parseOptionalJsonObject(value.attendanceWindow),
      businessMarketWindow: parseOptionalJsonObject(value.businessMarketWindow),
      stockMarketWindow: parseOptionalJsonObject(value.stockMarketWindow),
      newsSchedule: parseOptionalJsonObject(value.newsSchedule),
    },
  };
}

function parseRequiredText(
  value: unknown,
  code: string,
  message: string,
): string {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  if (!normalizedValue) {
    throw new EdgeActivationError(code, message, 400);
  }

  return normalizedValue;
}

function parseOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw invalidActivationSettingsError();
  }

  const normalizedValue = value.trim();

  return normalizedValue || null;
}

function parseOptionalJsonObject(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw invalidActivationSettingsError();
  }

  return value;
}

function invalidActivationSettingsError(): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_activation_settings",
    "Activation settings must use valid JSON object values.",
    400,
  );
}

function normalizePurchaseCode(value: string): string {
  const normalizedValue = value
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!normalizedValue) {
    throw new EdgeActivationError(
      "purchase_code_required",
      "purchaseCode is required.",
      400,
    );
  }

  if (!/^[A-Z0-9-]+$/.test(normalizedValue)) {
    throw new EdgeActivationError(
      "invalid_request_body",
      "purchaseCode may only contain letters, numbers, and hyphens.",
      400,
    );
  }

  return normalizedValue;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildGameSettings(
  body: ActivationRequestBody,
): Record<string, unknown> {
  return {
    difficultyPreset: body.difficultyPreset ?? "standard",
    attendanceWindow: body.attendanceWindow ?? {},
    businessMarketWindow: body.businessMarketWindow ?? {},
    stockMarketWindow: body.stockMarketWindow ?? {},
    newsSchedule: body.newsSchedule ?? {},
  };
}

function readActivationRpcRow(value: unknown): ActivationRpcRow | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const row = value[0];

  if (!isRecord(row)) {
    return null;
  }

  if (
    typeof row.game_session_id !== "string" ||
    typeof row.entitlement_id !== "string" ||
    typeof row.purchase_code_id !== "string" ||
    typeof row.purchase_code_status !== "string" ||
    typeof row.redeemed_count !== "number" ||
    typeof row.max_redemptions !== "number" ||
    typeof row.activated_at !== "string"
  ) {
    return null;
  }

  return {
    game_session_id: row.game_session_id,
    entitlement_id: row.entitlement_id,
    purchase_code_id: row.purchase_code_id,
    purchase_code_status: row.purchase_code_status,
    redeemed_count: row.redeemed_count,
    max_redemptions: row.max_redemptions,
    activated_at: row.activated_at,
  };
}

function mapActivationRpcError(message: string): {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly retryable: boolean;
} {
  switch (message.trim().toUpperCase()) {
    case "STAFF_USER_REQUIRED":
    case "PURCHASE_CODE_HASH_REQUIRED":
    case "GAME_NAME_REQUIRED":
      return {
        code: "invalid_redemption_input",
        message: "Activation request is missing required information.",
        status: 400,
        retryable: false,
      };

    case "PURCHASE_CODE_NOT_FOUND":
      return {
        code: "purchase_code_not_found",
        message: "Purchase code was not found.",
        status: 404,
        retryable: false,
      };

    case "PURCHASE_CODE_EXHAUSTED":
      return {
        code: "purchase_code_exhausted",
        message: "Purchase code has already been fully redeemed.",
        status: 409,
        retryable: false,
      };

    case "PURCHASE_CODE_EXPIRED":
      return {
        code: "purchase_code_expired",
        message: "Purchase code has expired.",
        status: 410,
        retryable: false,
      };

    case "PURCHASE_CODE_REVOKED":
      return {
        code: "purchase_code_revoked",
        message: "Purchase code has been revoked.",
        status: 403,
        retryable: false,
      };

    case "PURCHASE_CODE_NOT_ACTIVE":
      return {
        code: "purchase_code_not_active",
        message: "Purchase code is not active.",
        status: 409,
        retryable: false,
      };

    case "PURCHASE_CODE_REDEMPTION_CONFLICT":
      return {
        code: "purchase_code_redemption_conflict",
        message: "Purchase code redemption conflicted with another activation attempt.",
        status: 409,
        retryable: true,
      };

    default:
      return {
        code: "licensing_activation_failed",
        message: "Purchase-code activation failed.",
        status: 500,
        retryable: false,
      };
  }
}

function extractBearerToken(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() || null;
}

function readSupabaseEnv():
  | { readonly ok: true; readonly value: SupabaseEnv }
  | { readonly ok: false } {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      supabaseUrl,
      supabaseAnonKey,
      supabaseServiceRoleKey,
    },
  };
}

function jsonError(
  status: number,
  error: EdgeErrorBody["error"],
): Response {
  return jsonResponse<EdgeErrorBody>(status, {
    ok: false,
    error,
  });
}

function jsonResponse<TBody>(
  status: number,
  body: TBody,
): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
