/// <reference lib="dom" />

import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  type PlayerSessionLogoutRecord,
  PlayerSessionLogoutError,
  type PlayerSessionLogoutRepository,
  type PlayerSessionLogoutResponseBody,
  type PlayerSessionLogoutRoute,
  PlayerSessionLogoutPersistenceError,
} from "../contracts/playerSessionLogoutContracts.ts";
import { SupabasePlayerSessionLogoutRepository } from "../infrastructure/supabasePlayerSessionLogoutRepository.ts";
import {
  readPlayerSessionTokenFromRequest,
  resolveActivePlayerSession,
} from "./playerSessionHttpHelpers.ts";
import {
  rejectClientSuppliedBodyIdentity,
  rejectClientSuppliedPlayerIdentity,
} from "./playerRequestScope.ts";

const MAX_LOGOUT_BODY_BYTES = 1_024;
const GAME_SCOPE_HEADERS = [
  "x-econovaria-game-session-id",
  "x-econovaria-game-id",
] as const;

export interface PlayerSessionLogoutHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (token: string) => Promise<string>;
  readonly resolvePlayerSession?: (
    client: EdgeSupabaseClient,
    tokenHash: string,
  ) => ReturnType<typeof resolveActivePlayerSession>;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerSessionLogoutRepository;
  readonly now?: () => Date;
}

export async function handlePlayerSessionLogoutRequest(
  request: Request,
  route: PlayerSessionLogoutRoute,
  dependencies: PlayerSessionLogoutHttpHandlerDependencies,
): Promise<Response> {
  if (route.kind !== "logout") {
    return jsonError(400, {
      code: "invalid_player_logout_request",
      message: "Player logout route is malformed.",
      retryable: false,
    });
  }
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to log out the player session.",
      retryable: false,
    });
  }
  if (request.headers.has("x-stock-market-runner-secret")) {
    return jsonError(400, {
      code: "stock_runner_secret_not_allowed",
      message: "Player logout requests must not send a runner secret.",
      retryable: false,
    });
  }

  try {
    rejectClientSuppliedPlayerIdentity(request);
    validateLogoutQueryAndHeaders(request);
    await validateLogoutBody(request);

    const token = readPlayerSessionTokenFromRequest(request);
    if (!token) return invalidSessionResponse();

    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();
    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    const client = dependencies.createServiceClient(envResult.value);
    const tokenHash = await (dependencies.hashSessionToken ?? sha256Hex)(token);
    const repository = dependencies.createRepository
      ? dependencies.createRepository(client)
      : new SupabasePlayerSessionLogoutRepository(client as never);
    const session = await repository.findByTokenHash(tokenHash);
    if (!session) return invalidSessionResponse();

    if (isRevoked(session)) {
      return logoutSuccessResponse(session.revokedAt as string, true);
    }

    const now = dependencies.now?.() ?? new Date();
    if (
      session.status !== "active" ||
      Date.parse(session.expiresAt) <= now.getTime()
    ) {
      return invalidSessionResponse();
    }

    const active = await (dependencies.resolvePlayerSession ?? resolveActivePlayerSession)(
      client,
      tokenHash,
    );
    if (!active.ok) return jsonError(active.status, active.error);
    if (
      active.session.id !== session.internalSessionUuid ||
      active.session.game_session_id !== session.gameId ||
      active.session.player_id !== session.playerUuid
    ) {
      throw scopeViolation();
    }

    const revokedAt = now.toISOString();
    const revoked = await repository.revokeActiveSession({
      internalSessionUuid: session.internalSessionUuid,
      gameId: session.gameId,
      playerUuid: session.playerUuid,
      sessionTokenHash: tokenHash,
      revokedAt,
    });

    if (revoked) {
      if (!sameScope(revoked, session) || !isRevoked(revoked)) {
        throw scopeViolation();
      }
      return logoutSuccessResponse(revoked.revokedAt as string, false);
    }

    const replay = await repository.findByTokenHash(tokenHash);
    if (replay && sameScope(replay, session) && isRevoked(replay)) {
      return logoutSuccessResponse(replay.revokedAt as string, true);
    }

    throw new PlayerSessionLogoutError(
      "player_logout_conflict",
      "Player logout could not be completed because session state changed.",
      409,
      true,
    );
  } catch (error) {
    if (
      error instanceof EdgeActivationError ||
      error instanceof PlayerSessionLogoutError
    ) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }
    if (error instanceof PlayerSessionLogoutPersistenceError) {
      return jsonError(503, {
        code: "player_logout_service_unavailable",
        message: "Player logout is temporarily unavailable.",
        retryable: true,
      });
    }
    return jsonError(500, {
      code: "player_logout_failed",
      message: "Player logout could not be completed.",
      retryable: false,
    });
  }
}

function validateLogoutQueryAndHeaders(request: Request): void {
  const url = new URL(request.url);
  let unexpected: string | null = null;
  url.searchParams.forEach((_value, key) => {
    unexpected ??= key;
  });
  if (unexpected) {
    throw invalidRequest(`Player logout does not accept query parameter: ${unexpected}.`);
  }
  if (GAME_SCOPE_HEADERS.some((header) => request.headers.has(header))) {
    throw invalidRequest(
      "Player logout derives game scope from x-player-session-token.",
    );
  }
}

async function validateLogoutBody(request: Request): Promise<void> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const normalized = contentLength.trim();
    if (!/^\d+$/u.test(normalized) || Number(normalized) > MAX_LOGOUT_BODY_BYTES) {
      throw invalidRequest(
        `Player logout body must not exceed ${MAX_LOGOUT_BODY_BYTES} bytes.`,
      );
    }
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_LOGOUT_BODY_BYTES) {
    throw invalidRequest(
      `Player logout body must not exceed ${MAX_LOGOUT_BODY_BYTES} bytes.`,
    );
  }
  if (!text.trim()) return;

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw invalidRequest("Request body must be valid JSON.");
  }
  if (!isRecord(value)) {
    throw invalidRequest("Request body must be a JSON object.");
  }
  rejectClientSuppliedBodyIdentity(value);
  if (Object.keys(value).length !== 0) {
    throw invalidRequest("Player logout does not accept request fields.");
  }
}

function logoutSuccessResponse(
  revokedAt: string,
  alreadyLoggedOut: boolean,
): Response {
  const response = jsonResponse<PlayerSessionLogoutResponseBody>(200, {
    ok: true,
    message: "Player session logged out.",
    alreadyLoggedOut,
    status: "revoked",
    revokedAt,
  });
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}

function invalidSessionResponse(): Response {
  return jsonError(401, {
    code: "invalid_player_session",
    message: "Player session is invalid or expired.",
    retryable: false,
  });
}

function invalidRequest(message: string): PlayerSessionLogoutError {
  return new PlayerSessionLogoutError(
    "invalid_player_logout_request",
    message,
    400,
    false,
  );
}

function scopeViolation(): PlayerSessionLogoutError {
  return new PlayerSessionLogoutError(
    "player_logout_scope_violation",
    "Player logout could not be completed.",
    500,
    false,
  );
}

function isRevoked(session: PlayerSessionLogoutRecord): boolean {
  return session.status === "revoked" && session.revokedAt !== null;
}

function sameScope(
  left: PlayerSessionLogoutRecord,
  right: PlayerSessionLogoutRecord,
): boolean {
  return left.internalSessionUuid === right.internalSessionUuid &&
    left.gameId === right.gameId &&
    left.playerUuid === right.playerUuid;
}
