/// <reference lib="dom" />

import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { sha256Hex } from "../../../platform/supabase/edgeCrypto.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import {
  readPlayerSessionTokenFromRequest,
  resolveActivePlayerSession,
} from "./playerSessionHttpHelpers.ts";
import {
  readRequestedGameSessionId,
  rejectClientSuppliedBodyIdentity,
  rejectClientSuppliedPlayerIdentity,
  requireMatchingPlayerGameSession,
} from "./playerRequestScope.ts";
import type {
  PlayerSessionLogoutRecord,
  PlayerSessionLogoutRepository,
} from "../infrastructure/playerSessionLogoutRepository.ts";
import {
  PlayerSessionLogoutPersistenceError,
  SupabasePlayerSessionLogoutRepository,
} from "../infrastructure/playerSessionLogoutRepository.ts";

export interface PlayerSessionLogoutHttpHandlerDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: typeof readSupabaseEnv;
  readonly hashSessionToken?: (sessionToken: string) => Promise<string>;
  readonly resolvePlayerSession?: typeof resolveActivePlayerSession;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => PlayerSessionLogoutRepository;
  readonly now?: () => string;
}

interface PlayerSessionLogoutResponseBody {
  readonly ok: true;
  readonly message: "Player session logged out.";
  readonly alreadyLoggedOut: boolean;
  readonly session: {
    readonly id: string;
    readonly status: "revoked";
    readonly revokedAt: string;
  };
}

export async function handlePlayerSessionLogoutRequest(
  request: Request,
  dependencies: PlayerSessionLogoutHttpHandlerDependencies,
): Promise<Response> {
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
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Classroom API runtime configuration is incomplete.",
        retryable: false,
      });
    }

    rejectClientSuppliedPlayerIdentity(request);
    await validateLogoutBody(request);
    const requestedGameSessionId = readRequestedGameSessionId(request);
    const sessionToken = readPlayerSessionTokenFromRequest(request);

    if (!sessionToken) {
      return invalidLogoutSessionResponse();
    }

    const serviceClient = dependencies.createServiceClient(envResult.value);
    const sessionTokenHash = await (dependencies.hashSessionToken ?? sha256Hex)(
      sessionToken,
    );
    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabasePlayerSessionLogoutRepository(serviceClient as never);
    const session = await repository.findByTokenHash(sessionTokenHash);

    if (!session) {
      return invalidLogoutSessionResponse();
    }

    requireMatchingPlayerGameSession(
      requestedGameSessionId,
      session.gameSessionId,
    );

    if (isRevoked(session)) {
      return logoutSuccessResponse(session, true);
    }

    if (
      session.status !== "active" ||
      !Number.isFinite(Date.parse(session.expiresAt)) ||
      Date.parse(session.expiresAt) <= Date.now()
    ) {
      return invalidLogoutSessionResponse();
    }

    const activeSession = await (dependencies.resolvePlayerSession ??
      resolveActivePlayerSession)(serviceClient, sessionTokenHash);

    if (!activeSession.ok) {
      return jsonError(activeSession.status, activeSession.error);
    }

    if (
      activeSession.session.id !== session.id ||
      activeSession.session.game_session_id !== session.gameSessionId ||
      activeSession.session.player_id !== session.playerId
    ) {
      return jsonError(500, {
        code: "player_logout_scope_violation",
        message: "Player logout could not be completed.",
        retryable: false,
      });
    }

    const revokedAt = (dependencies.now ?? (() => new Date().toISOString()))();
    const revokedSession = await repository.revokeActiveSession({
      id: session.id,
      gameSessionId: session.gameSessionId,
      playerId: session.playerId,
      sessionTokenHash,
      revokedAt,
    });

    if (revokedSession) {
      if (
        !sameSessionScope(revokedSession, session) || !isRevoked(revokedSession)
      ) {
        return jsonError(500, {
          code: "player_logout_scope_violation",
          message: "Player logout could not be completed.",
          retryable: false,
        });
      }

      return logoutSuccessResponse(revokedSession, false);
    }

    // A concurrent identical logout may win the conditional update. Re-read the
    // token-owned row so the operation remains replay-safe without broadening scope.
    const concurrentResult = await repository.findByTokenHash(sessionTokenHash);

    if (
      concurrentResult &&
      sameSessionScope(concurrentResult, session) &&
      isRevoked(concurrentResult)
    ) {
      return logoutSuccessResponse(concurrentResult, true);
    }

    return jsonError(409, {
      code: "player_logout_conflict",
      message:
        "Player logout could not be completed because session state changed.",
      retryable: true,
    });
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    if (error instanceof PlayerSessionLogoutPersistenceError) {
      return jsonError(500, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }

    return jsonError(500, {
      code: "player_logout_failed",
      message: "Player logout could not be completed.",
      retryable: false,
    });
  }
}

async function validateLogoutBody(request: Request): Promise<void> {
  const text = await request.text();

  if (!text.trim()) {
    return;
  }

  let value: unknown;

  try {
    value = JSON.parse(text);
  } catch {
    throw invalidLogoutRequest("Request body must be valid JSON.");
  }

  if (!isRecord(value)) {
    throw invalidLogoutRequest("Request body must be a JSON object.");
  }

  rejectClientSuppliedBodyIdentity(value);

  if (Object.keys(value).length !== 0) {
    throw invalidLogoutRequest("Player logout does not accept request fields.");
  }
}

function logoutSuccessResponse(
  session: PlayerSessionLogoutRecord,
  alreadyLoggedOut: boolean,
): Response {
  return jsonResponse<PlayerSessionLogoutResponseBody>(200, {
    ok: true,
    message: "Player session logged out.",
    alreadyLoggedOut,
    session: {
      id: session.id,
      status: "revoked",
      revokedAt: session.revokedAt as string,
    },
  });
}

function invalidLogoutSessionResponse(): Response {
  return jsonError(401, {
    code: "invalid_player_session",
    message: "Player session is invalid or expired.",
    retryable: false,
  });
}

function invalidLogoutRequest(message: string): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_player_logout_request",
    message,
    400,
    false,
  );
}

function isRevoked(session: PlayerSessionLogoutRecord): boolean {
  return session.status === "revoked" && Boolean(session.revokedAt);
}

function sameSessionScope(
  left: PlayerSessionLogoutRecord,
  right: PlayerSessionLogoutRecord,
): boolean {
  return left.id === right.id &&
    left.gameSessionId === right.gameSessionId &&
    left.playerId === right.playerId;
}
