import {
  EdgeActivationError,
  type EdgeErrorBody,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  isRecord,
  parseRequiredText,
} from "../../../platform/supabase/edgeParsing.ts";
import { normalizeJoinCode } from "../../game-sessions/api/gameJoinCodeHttpHelpers.ts";
import { normalizeStudentCode } from "../domain/playerAccessCodes.ts";
import { normalizePlayerIdentifier } from "../domain/playerIdentifiers.ts";
import {
  isBrowserSafePlayerIdentifier,
  type PlayerLoginSuccessBody,
} from "../contracts/playerBrowserSessionContracts.ts";

interface PlayerLoginDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readEnvironment?: typeof readSupabaseEnv;
  readonly hashValue?: typeof sha256Hex;
  readonly generateSessionToken?: () => string;
  readonly now?: () => number;
}

interface PlayerLoginRequestBody {
  readonly gameJoinCode: string;
  readonly playerIdentifier: string;
  readonly accessCode: string;
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
    const envResult = (dependencies.readEnvironment ?? readSupabaseEnv)();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const body = await readPlayerLoginRequestBody(request);
    const hashValue = dependencies.hashValue ?? sha256Hex;
    const gameJoinCodeHash = await hashValue(
      normalizeJoinCode(body.gameJoinCode),
    );
    const playerIdentifierNormalized = normalizePlayerIdentifier(
      body.playerIdentifier,
    );
    const accessCodeHash = await hashValue(
      normalizeStudentCode(body.accessCode),
    );
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

    const playerResponse = await serviceClient
      .from("players")
      .select("id,display_name,roster_label,player_identifier,status")
      .eq("game_session_id", gameSession.id)
      .eq("player_identifier_normalized", playerIdentifierNormalized)
      .eq("status", "active")
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
      readonly player_identifier: string;
      readonly status: string;
    } | null;

    if (
      !player?.id ||
      !isBrowserSafePlayerIdentifier(player.player_identifier) ||
      player.status !== "active"
    ) {
      return invalidPlayerLoginResponse();
    }

    const credentialResponse = await serviceClient
      .from("player_access_credentials")
      .select("id,player_id,status")
      .eq("game_session_id", gameSession.id)
      .eq("player_id", player.id)
      .eq("normalized_student_code_hash", accessCodeHash)
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

    if (!credential?.player_id || credential.player_id !== player.id) {
      return invalidPlayerLoginResponse();
    }

    const sessionResult = await createPlayerSession(
      serviceClient,
      gameSession.id,
      player.id,
      {
        generateSessionToken: dependencies.generateSessionToken,
        hashValue,
        now: dependencies.now,
      },
    );

    if (!sessionResult.ok) {
      return jsonError(sessionResult.status, sessionResult.error);
    }

    return jsonResponse<PlayerLoginSuccessBody>(200, {
      ok: true,
      gameSession: {
        name: gameSession.name,
        status: gameSession.status,
      },
      player: {
        displayName: player.display_name,
        rosterLabel: player.roster_label ?? null,
        playerIdentifier: player.player_identifier,
        status: player.status,
      },
      session: {
        token: sessionResult.sessionToken,
        status: "active",
        expiresAt: sessionResult.expiresAt,
      },
    }, privatePlayerResponseHeaders());
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

export async function readPlayerLoginRequestBody(
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
      value.gameJoinCode ?? value.gameCode ?? value.sessionCode,
      "game_join_code_required",
      "gameJoinCode is required.",
    ),
    playerIdentifier: parseRequiredText(
      value.playerIdentifier ?? value.playerId ?? value.rfidCardId ??
        value.rfidId ?? value.cardId ?? value.externalPlayerId,
      "player_identifier_required",
      "playerIdentifier is required.",
    ),
    accessCode: parseRequiredText(
      value.accessCode ?? value.studentCode ?? value.playerAccessCode ??
        value.pin,
      "player_access_code_required",
      "accessCode is required.",
    ),
  };
}

function invalidPlayerLoginResponse(): Response {
  return jsonError(401, {
    code: "invalid_player_login",
    message: "Game Code, Player ID, or Access Code is invalid.",
    retryable: false,
  });
}

async function createPlayerSession(
  serviceClient: EdgeSupabaseClient,
  gameSessionId: string,
  playerId: string,
  options: {
    readonly generateSessionToken?: () => string;
    readonly hashValue: typeof sha256Hex;
    readonly now?: () => number;
  },
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
    const sessionToken =
      (options.generateSessionToken ?? generateSessionToken)();
    const sessionTokenHash = await options.hashValue(sessionToken);
    const expiresAt = new Date(
      (options.now ?? Date.now)() + 12 * 60 * 60 * 1000,
    ).toISOString();

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

function privatePlayerResponseHeaders(): HeadersInit {
  return {
    "cache-control": "private, no-store, max-age=0",
    "pragma": "no-cache",
    "vary": "authorization, x-player-session-token",
  };
}
