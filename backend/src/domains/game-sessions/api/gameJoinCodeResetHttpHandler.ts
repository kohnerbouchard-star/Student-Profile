import {
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

interface GameJoinCodeResetDependencies {
  readonly resolveStaffForRequest: (
    request: Request,
    env: SupabaseEnv,
    options: {
      readonly missingMessage: string;
    },
  ) => Promise<StaffRequestResolution>;
}

type StaffRequestResolution =
  | {
      readonly ok: true;
      readonly staff: {
        readonly id: string;
        readonly email: string | null;
      };
      readonly serviceClient: EdgeSupabaseClient;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    };

interface GameJoinCodeSuccessBody {
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

interface IssuedJoinCodeRow {
  readonly game_join_code: string;
  readonly game_join_code_status: string;
  readonly updated_at: string;
}

export async function handleResetGameJoinCodeRequest(
  request: Request,
  gameSessionId: string,
  dependencies: GameJoinCodeResetDependencies,
): Promise<Response> {
  if (!new Set(["GET", "POST"]).has(request.method)) {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use GET to read or POST to rotate a game join code.",
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
      missingMessage: request.method === "GET"
        ? "A verified Supabase Auth user is required to read a game join code."
        : "A verified Supabase Auth user is required to reset a game join code.",
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

    const joinCodeResult = request.method === "GET"
      ? await readGameJoinCode(staffResult.serviceClient, gameSessionId, staffResult.staff.id)
      : await issueGameJoinCode(staffResult.serviceClient, gameSessionId, staffResult.staff.id);

    if (!joinCodeResult.ok) {
      return jsonError(joinCodeResult.status, joinCodeResult.error);
    }

    return jsonResponse<GameJoinCodeSuccessBody>(200, {
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
      code: request.method === "GET" ? "join_code_read_failed" : "join_code_reset_failed",
      message: request.method === "GET"
        ? "Game join code could not be loaded."
        : "Game join code could not be reset.",
      retryable: false,
    });
  }
}

async function readGameJoinCode(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  staffUserId: string,
): Promise<JoinCodeResult> {
  const response = await serviceClient
    .from("game_sessions")
    .select("game_join_code,game_join_code_status,updated_at")
    .eq("id", gameSessionId)
    .eq("owner_staff_user_id", staffUserId)
    .maybeSingle();

  if (response.error) {
    return failure("join_code_read_failed", "Game join code could not be loaded.", 500, false);
  }

  const row = response.data as IssuedJoinCodeRow | null;
  if (!row?.game_join_code || row.game_join_code_status !== "active" || !row.updated_at) {
    return failure(
      "join_code_not_available",
      "This legacy game does not have a persisted readable code yet. Rotate it once to create one.",
      409,
      false,
    );
  }

  return {
    ok: true,
    gameJoinCode: row.game_join_code,
    updatedAt: row.updated_at,
  };
}

async function issueGameJoinCode(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  staffUserId: string,
): Promise<JoinCodeResult> {
  const response = await serviceClient.rpc("issue_game_join_code_v1", {
    p_game_session_id: gameSessionId,
    p_staff_user_id: staffUserId,
  });

  if (response.error) {
    const message = response.error.message?.toUpperCase() ?? "";
    const conflict = message.includes("GENERATION_CONFLICT");
    const unavailable = message.includes("GAME_UNAVAILABLE");

    return failure(
      conflict
        ? "join_code_generation_conflict"
        : unavailable
        ? "join_code_game_unavailable"
        : "join_code_reset_failed",
      conflict
        ? "A unique game join code could not be generated."
        : unavailable
        ? "Game join code cannot be changed for this game."
        : "Game join code could not be reset.",
      conflict || unavailable ? 409 : 500,
      conflict,
    );
  }

  const row = (Array.isArray(response.data) ? response.data[0] : response.data) as
    | IssuedJoinCodeRow
    | null;

  if (!row?.game_join_code || row.game_join_code_status !== "active" || !row.updated_at) {
    return failure("join_code_reset_failed", "Game join code could not be reset.", 500, false);
  }

  return {
    ok: true,
    gameJoinCode: row.game_join_code,
    updatedAt: row.updated_at,
  };
}

type JoinCodeResult =
  | {
      readonly ok: true;
      readonly gameJoinCode: string;
      readonly updatedAt: string;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: EdgeErrorBody["error"];
    };

function failure(
  code: string,
  message: string,
  status: number,
  retryable: boolean,
): JoinCodeResult {
  return {
    ok: false,
    status,
    error: { code, message, retryable },
  };
}
