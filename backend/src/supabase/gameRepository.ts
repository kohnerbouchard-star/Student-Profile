import type { GameSessionRecord } from "../auth/types";
import {
  normalizeRequiredQueryRow,
  type SupabaseRepositoryClient,
} from "./queryResult";
import {
  mapGameSessionRow,
  mapGameSettingsRow,
  type CoreSupabaseTables,
  type GameSessionInsert,
  type GameSettingsInsert,
  type GameSettingsRecord,
} from "./tableTypes";

type GameRepositoryTables = Pick<
  CoreSupabaseTables,
  "game_sessions" | "game_settings"
>;

export type SupabaseGameRepositoryClient =
  SupabaseRepositoryClient<GameRepositoryTables>;

export interface GameCreationRepository {
  createGameSession(input: GameSessionInsert): Promise<GameSessionRecord>;
  createGameSettings(input: GameSettingsInsert): Promise<GameSettingsRecord>;
}

export const GAME_SESSIONS_CREATION_COLUMNS =
  "id,owner_staff_user_id,name,status,game_join_code_hash,game_join_code_status,created_at,updated_at";

export const GAME_SETTINGS_CREATION_COLUMNS =
  "id,game_session_id,difficulty_preset,attendance_window,business_market_window,stock_market_window,news_schedule,created_at,updated_at";

export function createSupabaseGameRepository(
  client: SupabaseGameRepositoryClient,
): GameCreationRepository {
  return {
    createGameSession: (input) => createGameSession(client, input),
    createGameSettings: (input) => createGameSettings(client, input),
  };
}

export async function createGameSession(
  client: SupabaseGameRepositoryClient,
  input: GameSessionInsert,
): Promise<GameSessionRecord> {
  const response = await client
    .from("game_sessions")
    .insert({
      owner_staff_user_id: input.owner_staff_user_id,
      name: input.name,
      status: input.status ?? "active",
      game_join_code_hash: input.game_join_code_hash ?? null,
      game_join_code_status: input.game_join_code_status ?? "pending",
    })
    .select(GAME_SESSIONS_CREATION_COLUMNS)
    .single();

  const row = normalizeRequiredQueryRow(response, {
    tableName: "game_sessions",
    operation: "create game session",
  });

  return mapGameSessionRow(row);
}

export async function createGameSettings(
  client: SupabaseGameRepositoryClient,
  input: GameSettingsInsert,
): Promise<GameSettingsRecord> {
  const response = await client
    .from("game_settings")
    .insert({
      game_session_id: input.game_session_id,
      difficulty_preset: input.difficulty_preset ?? "standard",
      attendance_window: input.attendance_window ?? {},
      business_market_window: input.business_market_window ?? {},
      stock_market_window: input.stock_market_window ?? {},
      news_schedule: input.news_schedule ?? {},
    })
    .select(GAME_SETTINGS_CREATION_COLUMNS)
    .single();

  const row = normalizeRequiredQueryRow(response, {
    tableName: "game_settings",
    operation: "create game settings",
  });

  return mapGameSettingsRow(row);
}
