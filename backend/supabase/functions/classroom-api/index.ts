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
      balances: [],
      attendance: {
        status: "not_configured",
      },
      availableActions: [
        "attendance.clock_in",
        "dashboard.view",
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
