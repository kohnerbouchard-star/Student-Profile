// Adapter-local row shapes, query contracts and select lists. No I/O.
import type { JsonValue } from "../../../supabase/tableTypes.ts";

export type PlayerStoryContextTableName =
  | "players"
  | "player_country_assignments"
  | "country_profiles"
  | "account_balances"
  | "stock_holdings"
  | "game_session_stock_assets"
  | "game_session_contracts"
  | "player_contract_progress"
  | "player_story_relationships"
  | "game_session_story_flags";

export interface SupabasePlayerStoryContextQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

export interface SupabasePlayerStoryContextQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabasePlayerStoryContextQueryError | null;
}

export interface SupabasePlayerStoryContextClient {
  from(
    tableName: PlayerStoryContextTableName,
  ): SupabasePlayerStoryContextQueryBuilder;
}

export interface SupabasePlayerStoryContextQueryBuilder {
  select(columns: string): SupabasePlayerStoryContextFilterBuilder;
}

export interface SupabasePlayerStoryContextFilterBuilder
  extends PromiseLike<SupabasePlayerStoryContextQueryResponse<unknown[]>> {
  eq(
    column: string,
    value: unknown,
  ): SupabasePlayerStoryContextFilterBuilder;
  in(
    column: string,
    values: readonly unknown[],
  ): SupabasePlayerStoryContextFilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): SupabasePlayerStoryContextFilterBuilder;
}

export interface PlayerRow {
  readonly id: string;
}

export interface CountryAssignmentRow {
  readonly player_id: string;
  readonly country_profile_id: string;
  readonly assigned_at: string;
}

export interface CountryProfileRow {
  readonly id: string;
  readonly country_code: string;
  readonly currency_code?: string | null;
}

export interface AccountBalanceRow {
  readonly player_id: string;
  readonly account_type: string;
  readonly balance: number | string;
  readonly currency_code: string;
}

export interface StockHoldingRow {
  readonly player_id: string;
  readonly stock_asset_id: string;
  readonly quantity: number | string;
}

export interface StockAssetRow {
  readonly id: string;
  readonly sector_key?: string | null;
  readonly country_code?: string | null;
  readonly current_price: number | string;
}

export interface GameSessionContractRow {
  readonly id: string;
  readonly contract_key: string;
  readonly status: string;
  readonly visibility: string;
}

export interface PlayerContractProgressRow {
  readonly player_id: string;
  readonly contract_id: string;
  readonly status: string;
}

export interface StoryRelationshipRow {
  readonly player_id: string;
  readonly character_key: string;
  readonly character_name: string;
  readonly country_code: string | null;
  readonly relationship_role: string;
  readonly stage: string;
  readonly contact_count: number | string;
  readonly reply_count: number | string;
  readonly trust_score: number | string;
  readonly memory: Record<string, JsonValue>;
  readonly updated_at: string;
}

export interface StoryFlagRow {
  readonly flag_key: string;
  readonly value: JsonValue;
  readonly created_at: string;
}

export interface CountryInfo {
  readonly countryId: string | null;
  readonly countryCode: string | null;
  readonly currencyCode: string | null;
}

export const PLAYER_SELECT = "id";
export const COUNTRY_ASSIGNMENT_SELECT =
  "player_id,country_profile_id,assigned_at";
export const COUNTRY_PROFILE_SELECT = "id,country_code,currency_code";
export const CASH_SELECT = "player_id,account_type,balance,currency_code";
export const HOLDING_SELECT = "player_id,stock_asset_id,quantity";
export const STOCK_ASSET_SELECT = "id,sector_key,country_code,current_price";
export const CONTRACT_SELECT = "id,contract_key,status,visibility";
export const CONTRACT_PROGRESS_SELECT = "player_id,contract_id,status";
export const STORY_RELATIONSHIP_SELECT =
  "player_id,character_key,character_name,country_code,relationship_role,stage,contact_count,reply_count,trust_score,memory,updated_at";
export const STORY_FLAG_SELECT = "flag_key,value,created_at";
