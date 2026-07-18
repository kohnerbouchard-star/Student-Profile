import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import {
  readPlayerSessionTokenFromRequest,
  resolveActivePlayerSession,
} from "./playerSessionHttpHelpers.ts";

const PLAYER_IDENTITY_QUERY_FIELDS = [
  "playerId",
  "player_id",
  "playerUuid",
  "player_uuid",
  "playerSessionId",
  "player_session_id",
  "sessionId",
  "session_id",
  "ownerId",
  "owner_id",
  "ownerUuid",
  "owner_uuid",
  "recipientUuid",
  "recipient_uuid",
  "recipientPlayerUuid",
  "recipient_player_uuid",
] as const;

const PLAYER_IDENTITY_HEADERS = [
  "x-player-id",
  "x-player-uuid",
  "x-player-session-id",
  "x-player-session",
  "x-owner-id",
  "x-owner-uuid",
  "x-recipient-uuid",
  "x-recipient-player-uuid",
] as const;

const GAME_SCOPE_QUERY_FIELDS = [
  "gameSessionId",
  "game_session_id",
  "gameId",
  "game_id",
] as const;

const GAME_SCOPE_HEADERS = [
  "x-econovaria-game-session-id",
  "x-econovaria-game-id",
] as const;

const BODY_OWNERSHIP_FIELDS = [
  ...PLAYER_IDENTITY_QUERY_FIELDS,
  ...GAME_SCOPE_QUERY_FIELDS,
] as const;

type ActivePlayerSessionResolution = Awaited<
  ReturnType<typeof resolveActivePlayerSession>
>;

type ResolvedActivePlayerSession = Extract<
  ActivePlayerSessionResolution,
  { readonly ok: true }
>;

export interface PlayerRequestAuthorizationContext {
  readonly actorType: "player";
  readonly source: "player_session";
  readonly gameScope: "session";
  readonly resourceScope: "own_player";
}

export interface PlayerRequestScope {
  readonly playerUuid: string;
  readonly gameId: string;
  readonly activeSessionId: string;
  readonly sessionValid: true;
  readonly sessionExpiresAt: string;
  readonly authorizationContext: PlayerRequestAuthorizationContext;
}

export interface PlayerRequestScopeDependencies {
  readonly hashSessionToken: (sessionToken: string) => Promise<string>;
  readonly resolvePlayerSession: (
    sessionTokenHash: string,
  ) => Promise<ActivePlayerSessionResolution>;
  readonly now?: () => Date;
}

export interface ResolvePlayerRequestScopeOptions {
  readonly body?: Record<string, unknown> | null;
}

export async function resolvePlayerRequestScope(
  request: Request,
  dependencies: PlayerRequestScopeDependencies,
  options: ResolvePlayerRequestScopeOptions = {},
): Promise<PlayerRequestScope> {
  rejectClientSuppliedPlayerIdentity(request);

  if (options.body) {
    rejectClientSuppliedBodyIdentity(options.body);
  }

  const sessionToken = readPlayerSessionTokenFromRequest(request);

  if (!sessionToken) {
    throw new EdgeActivationError(
      "missing_player_session",
      "Player session token is required.",
      401,
      false,
    );
  }

  const sessionTokenHash = await dependencies.hashSessionToken(sessionToken);
  const sessionResult = await dependencies.resolvePlayerSession(sessionTokenHash);

  if (!sessionResult.ok) {
    throw new EdgeActivationError(
      sessionResult.error.code,
      sessionResult.error.message,
      sessionResult.status,
      sessionResult.error.retryable,
    );
  }

  validateResolvedPlayerSession(
    sessionResult,
    dependencies.now?.() ?? new Date(),
  );

  requireMatchingPlayerGameSession(
    readRequestedGameSessionId(request),
    sessionResult.session.game_session_id,
  );

  return {
    playerUuid: sessionResult.player.id,
    gameId: sessionResult.gameSession.id,
    activeSessionId: sessionResult.session.id,
    sessionValid: true,
    sessionExpiresAt: sessionResult.session.expires_at,
    authorizationContext: {
      actorType: "player",
      source: "player_session",
      gameScope: "session",
      resourceScope: "own_player",
    },
  };
}

export function rejectClientSuppliedPlayerIdentity(request: Request): void {
  const url = new URL(request.url);

  for (const fieldName of PLAYER_IDENTITY_QUERY_FIELDS) {
    if (url.searchParams.has(fieldName)) {
      throw invalidPlayerRequest(
        "Player ownership must be derived from x-player-session-token.",
      );
    }
  }

  for (const headerName of PLAYER_IDENTITY_HEADERS) {
    if (request.headers.has(headerName)) {
      throw invalidPlayerRequest(
        "Player ownership must be derived from x-player-session-token.",
      );
    }
  }
}

export function rejectClientSuppliedBodyIdentity(
  body: Record<string, unknown>,
): void {
  for (const fieldName of BODY_OWNERSHIP_FIELDS) {
    if (fieldName in body) {
      throw invalidPlayerRequest(
        "Player and game ownership must be derived from x-player-session-token.",
      );
    }
  }
}

export function readRequestedGameSessionId(request: Request): string | null {
  const url = new URL(request.url);
  const values: string[] = [];

  for (const fieldName of GAME_SCOPE_QUERY_FIELDS) {
    values.push(...url.searchParams.getAll(fieldName));
  }

  for (const headerName of GAME_SCOPE_HEADERS) {
    const value = request.headers.get(headerName);

    if (value !== null) {
      values.push(value);
    }
  }

  if (values.length === 0) {
    return null;
  }

  const normalizedValues = values.map((value) => value.trim());

  if (
    normalizedValues.some((value) => !value) ||
    new Set(normalizedValues).size !== 1
  ) {
    throw invalidPlayerRequest(
      "At most one consistent game scope may be supplied for verification.",
    );
  }

  return normalizedValues[0];
}

export function requireMatchingPlayerGameSession(
  requestedGameSessionId: string | null,
  authenticatedGameSessionId: string,
): void {
  if (
    requestedGameSessionId !== null &&
    requestedGameSessionId !== authenticatedGameSessionId
  ) {
    throw new EdgeActivationError(
      "invalid_player_session_scope",
      "Requested game scope does not match the authenticated player session.",
      401,
      false,
    );
  }
}

function validateResolvedPlayerSession(
  resolution: ResolvedActivePlayerSession,
  now: Date,
): void {
  const { session, gameSession, player } = resolution;

  if (session.revoked_at !== null || session.status === "revoked") {
    throw new EdgeActivationError(
      "player_session_revoked",
      "Player session has been revoked.",
      401,
      false,
    );
  }

  const expiresAt = new Date(session.expires_at);

  if (Number.isNaN(expiresAt.getTime())) {
    throw new EdgeActivationError(
      "invalid_player_session_expiry",
      "Player session expiry is invalid.",
      409,
      false,
    );
  }

  if (session.status === "expired" || expiresAt <= now) {
    throw new EdgeActivationError(
      "player_session_expired",
      "Player session has expired.",
      401,
      false,
    );
  }

  if (session.status !== "active") {
    throw new EdgeActivationError(
      "player_session_inactive",
      "Player session is not active.",
      401,
      false,
    );
  }

  if (
    gameSession.status !== "active" ||
    player.status !== "active" ||
    gameSession.id !== session.game_session_id ||
    player.id !== session.player_id
  ) {
    throw new EdgeActivationError(
      "invalid_player_session_scope",
      "Player session does not resolve to one active player in one active game.",
      401,
      false,
    );
  }
}

function invalidPlayerRequest(message: string): EdgeActivationError {
  return new EdgeActivationError(
    "invalid_player_request",
    message,
    400,
    false,
  );
}
