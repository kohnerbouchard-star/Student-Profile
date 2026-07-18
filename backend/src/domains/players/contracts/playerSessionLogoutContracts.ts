export type PlayerSessionLogoutRoute =
  | { readonly kind: "logout" }
  | { readonly kind: "malformed" };

export interface PlayerSessionLogoutRecord {
  readonly internalSessionUuid: string;
  readonly gameId: string;
  readonly playerUuid: string;
  readonly status: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface RevokeActivePlayerSessionInput {
  readonly internalSessionUuid: string;
  readonly gameId: string;
  readonly playerUuid: string;
  readonly sessionTokenHash: string;
  readonly revokedAt: string;
}

export interface PlayerSessionLogoutRepository {
  findByTokenHash(
    sessionTokenHash: string,
  ): Promise<PlayerSessionLogoutRecord | null>;

  revokeActiveSession(
    input: RevokeActivePlayerSessionInput,
  ): Promise<PlayerSessionLogoutRecord | null>;
}

export interface PlayerSessionLogoutResponseBody {
  readonly ok: true;
  readonly message: "Player session logged out.";
  readonly alreadyLoggedOut: boolean;
  readonly status: "revoked";
  readonly revokedAt: string;
}

export class PlayerSessionLogoutError extends Error {
  constructor(
    readonly code:
      | "invalid_player_logout_request"
      | "player_logout_scope_violation"
      | "player_logout_conflict"
      | "player_logout_service_unavailable",
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PlayerSessionLogoutError";
  }
}

export class PlayerSessionLogoutPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerSessionLogoutPersistenceError";
  }
}
