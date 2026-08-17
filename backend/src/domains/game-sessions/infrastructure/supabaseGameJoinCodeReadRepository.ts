import {
  GameJoinCodeReadPersistenceError,
  type GameJoinCodeReadRecord,
  type GameJoinCodeReadRepository,
  type GameJoinCodeReadScope,
} from "../application/readGameJoinCode.ts";

interface QueryError {
  readonly message?: string;
}

interface QueryResponse {
  readonly data: Record<string, unknown> | null;
  readonly error: QueryError | null;
}

interface GameJoinCodeFilterQueryBuilder {
  eq(column: string, value: unknown): GameJoinCodeFilterQueryBuilder;
  maybeSingle(): PromiseLike<QueryResponse>;
}

interface GameJoinCodeTableQueryBuilder {
  select(columns: string): GameJoinCodeFilterQueryBuilder;
}

export interface GameJoinCodeSupabaseClient {
  from(table: string): GameJoinCodeTableQueryBuilder;
}

const GAME_JOIN_CODE_READ_COLUMNS = [
  "id",
  "owner_staff_user_id",
  "game_join_code",
  "game_join_code_status",
  "updated_at",
].join(",");

export function createSupabaseGameJoinCodeReadRepository(
  client: GameJoinCodeSupabaseClient,
): GameJoinCodeReadRepository {
  return {
    async readOwnedGameJoinCode(
      input: GameJoinCodeReadScope,
    ): Promise<GameJoinCodeReadRecord | null> {
      const response = await client
        .from("game_sessions")
        .select(GAME_JOIN_CODE_READ_COLUMNS)
        .eq("id", input.applicationContext.gameSessionId)
        .eq(
          "owner_staff_user_id",
          input.applicationContext.actor.staffUserId,
        )
        .maybeSingle();

      if (response.error) throw new GameJoinCodeReadPersistenceError();
      if (!response.data) return null;

      return mapRecord(response.data);
    },
  };
}

function mapRecord(row: Record<string, unknown>): GameJoinCodeReadRecord {
  try {
    return {
      gameSessionId: requiredText(row.id),
      ownerStaffUserId: requiredText(row.owner_staff_user_id),
      gameJoinCode: optionalText(row.game_join_code),
      joinCodeStatus: requiredText(row.game_join_code_status),
      updatedAt: optionalText(row.updated_at),
    };
  } catch {
    throw new GameJoinCodeReadPersistenceError();
  }
}

function requiredText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new GameJoinCodeReadPersistenceError();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
