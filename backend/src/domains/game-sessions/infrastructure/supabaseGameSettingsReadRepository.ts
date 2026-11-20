import {
  type GameSettingsPersistenceRow,
  GameSettingsReadPersistenceError,
  type GameSettingsReadRepository,
} from "../application/readGameSettings.ts";

interface QueryError {
  readonly message?: string;
}

interface QueryResponse {
  readonly data: Record<string, unknown> | null;
  readonly error: QueryError | null;
}

interface GameSettingsFilterQueryBuilder {
  eq(column: string, value: unknown): GameSettingsFilterQueryBuilder;
  maybeSingle(): PromiseLike<QueryResponse>;
}

interface GameSettingsTableQueryBuilder {
  select(columns: string): GameSettingsFilterQueryBuilder;
}

export interface GameSettingsSupabaseClient {
  from(table: string): GameSettingsTableQueryBuilder;
}

export const GAME_SETTINGS_READ_COLUMNS = [
  "difficulty_preset",
  "attendance_window",
  "business_market_window",
  "stock_market_window",
  "news_schedule",
  "updated_at",
].join(",");

export function createSupabaseGameSettingsReadRepository(
  client: GameSettingsSupabaseClient,
): GameSettingsReadRepository {
  return {
    async readGameSettings(input) {
      const response = await client
        .from("game_settings")
        .select(GAME_SETTINGS_READ_COLUMNS)
        .eq("game_session_id", input.applicationContext.gameSessionId)
        .maybeSingle();

      return readMaybeRow(response);
    },

    async readAdminGameSettingsView(input) {
      const gameSessionId = input.applicationContext.gameSessionId;
      const [settingsResponse, policyResponse] = await Promise.all([
        client
          .from("game_settings")
          .select("*")
          .eq("game_session_id", gameSessionId)
          .maybeSingle(),
        client
          .from("game_difficulty_policy_settings")
          .select("*")
          .eq("game_session_id", gameSessionId)
          .maybeSingle(),
      ]);

      return {
        settings: readMaybeRow(settingsResponse),
        difficultyPolicy: readMaybeRow(policyResponse),
      };
    },
  };
}

function readMaybeRow(
  response: QueryResponse,
): GameSettingsPersistenceRow | null {
  if (response.error) throw new GameSettingsReadPersistenceError();
  if (response.data == null) return null;
  if (!isRecord(response.data)) throw new GameSettingsReadPersistenceError();
  return response.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
