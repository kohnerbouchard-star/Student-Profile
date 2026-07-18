import {
  type PlayerSessionLogoutRecord,
  type PlayerSessionLogoutRepository,
  type RevokeActivePlayerSessionInput,
  PlayerSessionLogoutPersistenceError,
} from "../contracts/playerSessionLogoutContracts.ts";

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

const PLAYER_SESSION_SELECT =
  "id,game_session_id,player_id,status,expires_at,revoked_at";

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

    if (response.error) throw persistenceError();
    return response.data ? toRecord(response.data) : null;
  }

  async revokeActiveSession(
    input: RevokeActivePlayerSessionInput,
  ): Promise<PlayerSessionLogoutRecord | null> {
    const response = await this.client
      .from("player_sessions")
      .update({ status: "revoked", revoked_at: input.revokedAt })
      .eq("id", input.internalSessionUuid)
      .eq("game_session_id", input.gameId)
      .eq("player_id", input.playerUuid)
      .eq("session_token_hash", input.sessionTokenHash)
      .eq("status", "active")
      .is("revoked_at", null)
      .select(PLAYER_SESSION_SELECT)
      .maybeSingle();

    if (response.error) throw persistenceError();
    return response.data ? toRecord(response.data) : null;
  }
}

function toRecord(row: Record<string, unknown>): PlayerSessionLogoutRecord {
  return {
    internalSessionUuid: requireUuid(row.id),
    gameId: requireUuid(row.game_session_id),
    playerUuid: requireUuid(row.player_id),
    status: requireText(row.status),
    expiresAt: requireDateTime(row.expires_at),
    revokedAt: row.revoked_at === null ? null : requireDateTime(row.revoked_at),
  };
}

function requireText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw persistenceError();
}

function requireUuid(value: unknown): string {
  const text = requireText(value).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    throw persistenceError();
  }
  return text;
}

function requireDateTime(value: unknown): string {
  const text = requireText(value);
  if (Number.isNaN(Date.parse(text))) throw persistenceError();
  return text;
}

function persistenceError(): PlayerSessionLogoutPersistenceError {
  return new PlayerSessionLogoutPersistenceError(
    "Player logout persistence is unavailable.",
  );
}
