interface QueryError {
  readonly message: string;
}

interface QueryResponse<T> {
  readonly data: T | null;
  readonly error: QueryError | null;
}

interface SelectBuilder {
  maybeSingle(): PromiseLike<QueryResponse<Record<string, unknown> | null>>;
}

interface FilterBuilder extends SelectBuilder {
  eq(column: string, value: unknown): FilterBuilder;
}

interface UpdateBuilder {
  eq(column: string, value: unknown): UpdateBuilder;
  is(column: string, value: unknown): UpdateBuilder;
  select(columns: string): SelectBuilder;
}

interface QueryBuilder {
  select(columns: string): FilterBuilder;
  update(values: unknown): UpdateBuilder;
}

interface PlayerSessionLogoutClient {
  from(tableName: "player_sessions"): QueryBuilder;
}

export interface PlayerSessionLogoutRecord {
  readonly id: string;
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly status: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface RevokeActivePlayerSessionInput {
  readonly id: string;
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly sessionTokenHash: string;
  readonly revokedAt: string;
}

export interface PlayerSessionLogoutRepository {
  readonly findByTokenHash: (
    sessionTokenHash: string,
  ) => Promise<PlayerSessionLogoutRecord | null>;
  readonly revokeActiveSession: (
    input: RevokeActivePlayerSessionInput,
  ) => Promise<PlayerSessionLogoutRecord | null>;
}

interface PlayerSessionRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly player_id: string;
  readonly status: string;
  readonly expires_at: string;
  readonly revoked_at: string | null;
}

const PLAYER_SESSION_SELECT =
  "id,game_session_id,player_id,status,expires_at,revoked_at";

export class PlayerSessionLogoutPersistenceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PlayerSessionLogoutPersistenceError";
    this.code = code;
  }
}

export class SupabasePlayerSessionLogoutRepository
  implements PlayerSessionLogoutRepository {
  constructor(private readonly client: PlayerSessionLogoutClient) {}

  async findByTokenHash(
    sessionTokenHash: string,
  ): Promise<PlayerSessionLogoutRecord | null> {
    const response = await this.client
      .from("player_sessions")
      .select(PLAYER_SESSION_SELECT)
      .eq("session_token_hash", sessionTokenHash)
      .maybeSingle();

    if (response.error) {
      throw logoutPersistenceError();
    }

    return response.data
      ? toPlayerSessionLogoutRecord(
        response.data as unknown as PlayerSessionRow,
      )
      : null;
  }

  async revokeActiveSession(
    input: RevokeActivePlayerSessionInput,
  ): Promise<PlayerSessionLogoutRecord | null> {
    const response = await this.client
      .from("player_sessions")
      .update({
        status: "revoked",
        revoked_at: input.revokedAt,
      })
      .eq("id", input.id)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId)
      .eq("session_token_hash", input.sessionTokenHash)
      .eq("status", "active")
      .is("revoked_at", null)
      .select(PLAYER_SESSION_SELECT)
      .maybeSingle();

    if (response.error) {
      throw logoutPersistenceError();
    }

    return response.data
      ? toPlayerSessionLogoutRecord(
        response.data as unknown as PlayerSessionRow,
      )
      : null;
  }
}

function toPlayerSessionLogoutRecord(
  row: PlayerSessionRow,
): PlayerSessionLogoutRecord {
  return {
    id: row.id,
    gameSessionId: row.game_session_id,
    playerId: row.player_id,
    status: row.status,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? null,
  };
}

function logoutPersistenceError(): PlayerSessionLogoutPersistenceError {
  return new PlayerSessionLogoutPersistenceError(
    "player_logout_failed",
    "Player logout could not be completed.",
  );
}
