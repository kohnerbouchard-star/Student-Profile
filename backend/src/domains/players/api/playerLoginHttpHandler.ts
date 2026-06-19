import {
  EdgeActivationError,
  type EdgeErrorBody,
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
  isRecord,
  parseRequiredText,
} from "../../../platform/supabase/edgeParsing.ts";
import { normalizeJoinCode } from "../../game-sessions/api/gameJoinCodeHttpHelpers.ts";
import { normalizeStudentCode } from "../domain/playerAccessCodes.ts";

interface PlayerLoginDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
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

export async function handlePlayerLoginRequest(
  request: Request,
  dependencies: PlayerLoginDependencies,
): Promise<Response> {
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
    const serviceClient = dependencies.createServiceClient(envResult.value);

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

function invalidPlayerLoginResponse(): Response {
  return jsonError(401, {
    code: "invalid_player_login",
    message: "Game join code or student code is invalid.",
    retryable: false,
  });
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
