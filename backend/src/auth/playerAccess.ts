import {
  allowAccess,
  denyAccess,
  type AccessResult,
  type PlayerIdentity,
  type PlayerSessionRecord,
} from "./types";

export interface PlayerSessionRepository {
  findPlayerSessionsByTokenHash(
    sessionTokenHash: string,
  ): Promise<ReadonlyArray<PlayerSessionRecord>>;
}

export interface PlayerSessionTokenHasher {
  hashPlayerSessionToken(sessionToken: string): Promise<string> | string;
}

export interface ResolvePlayerIdentityOptions {
  readonly now?: () => Date;
}

export interface PlayerAccessDependencies {
  readonly playerSessions: PlayerSessionRepository;
  readonly tokenHasher: PlayerSessionTokenHasher;
}

export async function resolvePlayerIdentityFromSessionToken(
  sessionToken: string | null | undefined,
  dependencies: PlayerAccessDependencies,
  options: ResolvePlayerIdentityOptions = {},
): Promise<AccessResult<PlayerIdentity>> {
  const normalizedToken = normalizePlayerSessionToken(sessionToken);

  if (!normalizedToken) {
    return denyAccess(
      "missing_player_session_token",
      "Player session token is required.",
      401,
    );
  }

  const sessionTokenHash = await dependencies.tokenHasher.hashPlayerSessionToken(
    normalizedToken,
  );
  const sessions = await dependencies.playerSessions.findPlayerSessionsByTokenHash(
    sessionTokenHash,
  );

  if (sessions.length === 0) {
    return denyAccess(
      "player_session_not_found",
      "Player session was not found.",
      401,
    );
  }

  if (sessions.length !== 1) {
    return denyAccess(
      "player_session_not_unique",
      "Player session token resolved to more than one session.",
      409,
    );
  }

  return resolvePlayerIdentityFromSessionRecord(sessions[0], options);
}

export function resolvePlayerIdentityFromSessionRecord(
  session: PlayerSessionRecord,
  options: ResolvePlayerIdentityOptions = {},
): AccessResult<PlayerIdentity> {
  const activeCheck = validateActivePlayerSession(session, options.now?.() ?? new Date());

  if (!activeCheck.ok) {
    return activeCheck;
  }

  return allowAccess({
    kind: "player",
    actorType: "player",
    playerSessionId: session.id,
    gameSessionId: session.game_session_id,
    playerId: session.player_id,
    expiresAt: session.expires_at,
  });
}

export function validateActivePlayerSession(
  session: PlayerSessionRecord,
  now: Date,
): AccessResult<PlayerSessionRecord> {
  if (session.status !== "active") {
    return denyAccess(
      "player_session_inactive",
      "Player session is not active.",
      401,
      { playerSessionId: session.id, status: session.status },
    );
  }

  if (session.revoked_at) {
    return denyAccess(
      "player_session_revoked",
      "Player session has been revoked.",
      401,
      { playerSessionId: session.id },
    );
  }

  const expiresAt = new Date(session.expires_at);

  if (Number.isNaN(expiresAt.getTime())) {
    return denyAccess(
      "invalid_player_session_expiry",
      "Player session expiry is invalid.",
      409,
      { playerSessionId: session.id },
    );
  }

  if (expiresAt <= now) {
    return denyAccess(
      "player_session_expired",
      "Player session has expired.",
      401,
      { playerSessionId: session.id },
    );
  }

  return allowAccess(session);
}

export function normalizePlayerSessionToken(
  sessionToken: string | null | undefined,
): string | null {
  const normalizedToken = sessionToken?.trim();
  return normalizedToken || null;
}
