import type {
  ActorType,
  GameSessionRecord,
  ISODateTimeString,
  PlayerSessionRecord,
  StaffUserRecord,
  UUID,
} from "../auth/types.ts";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface StaffUsersRow extends StaffUserRecord {
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface StaffUserInsert {
  readonly supabase_auth_user_id: UUID;
  readonly email: string;
  readonly display_name: string;
}

export interface GameSessionsRow extends GameSessionRecord {
  readonly name: string;
  readonly game_join_code_hash?: string | null;
  readonly game_join_code_status: "pending" | "active" | "revoked" | string;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface GameSessionInsert {
  readonly owner_staff_user_id: UUID;
  readonly name: string;
  readonly status?: "active" | "archived" | "disabled" | string;
  readonly game_join_code_hash?: string | null;
  readonly game_join_code_status?: "pending" | "active" | "revoked" | string;
}

export interface GameSettingsRecord {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly difficulty_preset: string;
  readonly attendance_window: JsonObject;
  readonly business_market_window: JsonObject;
  readonly stock_market_window: JsonObject;
  readonly news_schedule: JsonObject;
}

export interface GameSettingsRow extends GameSettingsRecord {
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface GameSettingsInsert {
  readonly game_session_id: UUID;
  readonly difficulty_preset?: string;
  readonly attendance_window?: JsonObject;
  readonly business_market_window?: JsonObject;
  readonly stock_market_window?: JsonObject;
  readonly news_schedule?: JsonObject;
}

export interface PurchaseCodeRecord {
  readonly id: UUID;
  readonly code_hash: string;
  readonly status: "active" | "exhausted" | "expired" | "revoked" | string;
  readonly max_redemptions: number;
  readonly redeemed_count: number;
  readonly expires_at?: ISODateTimeString | null;
}

export interface PurchaseCodesRow extends PurchaseCodeRecord {
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface EntitlementRecord {
  readonly id: UUID;
  readonly purchase_code_id: UUID;
  readonly staff_user_id: UUID;
  readonly game_session_id: UUID;
  readonly status: "active" | "expired" | "revoked" | string;
}

export interface EntitlementsRow extends EntitlementRecord {
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface EntitlementInsert {
  readonly purchase_code_id: UUID;
  readonly staff_user_id: UUID;
  readonly game_session_id: UUID;
  readonly status?: "active" | "expired" | "revoked" | string;
}

export interface RedeemPurchaseCodeForGameRpcArgs {
  readonly p_staff_user_id: UUID;
  readonly p_purchase_code_hash: string;
  readonly p_game_name: string;
  readonly p_game_settings?: JsonObject;
  readonly p_request_metadata?: JsonObject;
}

export interface RedeemPurchaseCodeForGameRpcRow {
  readonly game_session_id: UUID;
  readonly entitlement_id: UUID;
  readonly purchase_code_id: UUID;
  readonly purchase_code_status:
    | "active"
    | "exhausted"
    | "expired"
    | "revoked"
    | string;
  readonly redeemed_count: number;
  readonly max_redemptions: number;
  readonly activated_at: ISODateTimeString;
}

export interface ApplyStockMarketRunnerTickRpcArgs {
  readonly p_game_session_id: UUID;
  readonly p_tick_index: number;
  readonly p_asset_updates: readonly JsonObject[];
  readonly p_tick_rows: readonly JsonObject[];
}

export interface ApplyStockMarketRunnerTickRpcRow {
  readonly assets_updated: number;
  readonly ticks_inserted: number;
}

export interface ApplyStockMarketRunnerMinuteRpcArgs
  extends ApplyStockMarketRunnerTickRpcArgs {
  readonly p_exchange_code: string;
  readonly p_market_minute: ISODateTimeString;
}

export type ApplyStockMarketRunnerMinuteRpcRow =
  ApplyStockMarketRunnerTickRpcRow;

export interface InitializeStockMarketAssetsForGameRpcArgs {
  readonly p_game_session_id: UUID;
  readonly p_mode?: "missing_only" | "reset_empty_only" | string;
}

export interface InitializeStockMarketAssetsForGameRpcRow {
  readonly game_session_id: UUID;
  readonly templates_available: number;
  readonly assets_before: number;
  readonly assets_inserted: number;
  readonly baseline_ticks_inserted: number;
  readonly assets_after: number;
}

export interface ExecuteStockMarketOrderRpcArgs {
  readonly p_game_session_id: UUID;
  readonly p_player_session_id: UUID;
  readonly p_stock_asset_id: UUID;
  readonly p_side: "buy" | "sell" | string;
  readonly p_quantity: number;
  readonly p_idempotency_key: string;
}

export interface ExecuteStockMarketOrderRpcRow {
  readonly order_id: UUID;
  readonly game_session_id: UUID;
  readonly player_session_id: UUID;
  readonly player_id: UUID;
  readonly stock_asset_id: UUID;
  readonly ticker: string;
  readonly side: "buy" | "sell" | string;
  readonly quantity: number;
  readonly execution_price: number | null;
  readonly gross_value: number;
  readonly status: "filled" | "rejected" | string;
  readonly rejection_reason: string | null;
  readonly cash_balance: number;
  readonly cash_currency_code: string;
  readonly holding_quantity: number;
  readonly average_cost: number;
}

export interface PlayerSessionsRow extends PlayerSessionRecord {
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface AuditLogRow {
  readonly id: UUID;
  readonly game_session_id?: UUID | null;
  readonly actor_type: ActorType;
  readonly actor_id?: UUID | null;
  readonly action: string;
  readonly target_type: string;
  readonly target_id?: UUID | null;
  readonly metadata: JsonObject;
  readonly created_at: ISODateTimeString;
}

export interface AuditLogInsert {
  readonly game_session_id?: UUID | null;
  readonly actor_type: ActorType;
  readonly actor_id?: UUID | null;
  readonly action: string;
  readonly target_type: string;
  readonly target_id?: UUID | null;
  readonly metadata?: JsonObject;
}

export type MutationIdempotencyStatus = "STARTED" | "COMPLETED" | "FAILED";

export interface MutationIdempotencyKeysRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly player_id: UUID;
  readonly route_key: string;
  readonly idempotency_key: string;
  readonly request_hash: string;
  readonly status: MutationIdempotencyStatus | string;
  readonly result_type?: string | null;
  readonly result_id?: UUID | null;
  readonly response_body?: JsonObject | null;
  readonly created_at: ISODateTimeString;
  readonly completed_at?: ISODateTimeString | null;
  readonly expires_at: ISODateTimeString;
}
