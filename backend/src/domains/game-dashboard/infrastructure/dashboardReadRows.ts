// Adapter-local query contracts, row shapes and select lists. No I/O or policy.
import type { StorePurchaseStatus } from "../../store/purchaseHistoryTypes.ts";

export interface DashboardQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

export interface DashboardQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: DashboardQueryError | null;
}

export type DashboardTableName =
  | "account_balances"
  | "country_profiles"
  | "game_session_stock_assets"
  | "game_sessions"
  | "inventory_holdings"
  | "player_country_assignments"
  | "players"
  | "stock_market_events"
  | "stock_price_ticks"
  | "stock_orders"
  | "stock_trades"
  | "store_purchases";

export interface SupabasePlayerGameDashboardClient {
  from(tableName: DashboardTableName): SupabasePlayerGameDashboardQueryBuilder;
  rpc<Data = unknown>(
    functionName: string,
    args?: unknown,
  ): PromiseLike<DashboardQueryResponse<Data>>;
}

export interface SupabasePlayerGameDashboardQueryBuilder {
  select(columns: string): SupabasePlayerGameDashboardFilterBuilder;
}

export interface SupabasePlayerGameDashboardFilterBuilder
  extends PromiseLike<DashboardQueryResponse<unknown[]>> {
  eq(
    column: string,
    value: unknown,
  ): SupabasePlayerGameDashboardFilterBuilder;
  in(
    column: string,
    values: readonly unknown[],
  ): SupabasePlayerGameDashboardFilterBuilder;
  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): SupabasePlayerGameDashboardFilterBuilder;
  limit(count: number): SupabasePlayerGameDashboardFilterBuilder;
  maybeSingle(): PromiseLike<DashboardQueryResponse<unknown>>;
}

export interface GameSessionRow {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly updated_at?: string | null;
}

export interface PlayerRow {
  readonly id: string;
  readonly display_name: string;
  readonly roster_label?: string | null;
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

export interface StockOrderRow {
  readonly id: string;
  readonly player_id: string;
  readonly stock_asset_id: string;
  readonly ticker: string;
  readonly side: string;
  readonly quantity: number | string;
  readonly execution_price?: number | string | null;
  readonly gross_value: number | string;
  readonly status: string;
  readonly rejection_reason?: string | null;
  readonly idempotency_key: string;
  readonly created_at: string;
}

export interface StockTradeRow {
  readonly id: string;
  readonly order_id: string;
  readonly player_id: string;
  readonly stock_asset_id: string;
  readonly ticker: string;
  readonly side: string;
  readonly quantity: number | string;
  readonly execution_price: number | string;
  readonly gross_value: number | string;
  readonly created_at: string;
}

export interface InventoryHoldingRow {
  readonly id: string;
  readonly store_item_id: string;
  readonly quantity_owned: number | string;
  readonly quantity_reserved: number | string;
  readonly updated_at: string;
}

export interface StorePurchaseRow {
  readonly id: string;
  readonly store_item_id: string;
  readonly quantity: number | string;
  readonly final_total_price: number | string;
  readonly currency_code: string;
  readonly status: StorePurchaseStatus;
  readonly created_at: string;
}

export interface StockMarketEventRow {
  readonly id: string;
  readonly shock_id: string;
  readonly category?: string | null;
  readonly sentiment?: string | null;
  readonly source?: string | null;
  readonly visibility?: string | null;
  readonly scope: string;
  readonly target_key?: string | null;
  readonly headline: string;
  readonly explanation: string;
  readonly created_tick: number | string;
  readonly expires_tick?: number | string | null;
  readonly created_at: string;
}

export interface CountryInfo {
  readonly countryCode: string | null;
  readonly currencyCode: string | null;
}

export const GAME_SESSION_SELECT = "id,name,status,updated_at";
export const PLAYER_SELECT = "id,display_name,roster_label";
export const COUNTRY_ASSIGNMENT_SELECT =
  "player_id,country_profile_id,assigned_at";
export const COUNTRY_PROFILE_SELECT = "id,country_code,currency_code";
export const CASH_SELECT = "player_id,account_type,balance,currency_code";
export const ORDER_SELECT = [
  "id",
  "player_id",
  "stock_asset_id",
  "ticker",
  "side",
  "quantity",
  "execution_price",
  "gross_value",
  "status",
  "rejection_reason",
  "idempotency_key",
  "created_at",
].join(",");
export const TRADE_SELECT = [
  "id",
  "order_id",
  "player_id",
  "stock_asset_id",
  "ticker",
  "side",
  "quantity",
  "execution_price",
  "gross_value",
  "created_at",
].join(",");
export const INVENTORY_SELECT =
  "id,store_item_id,quantity_owned,quantity_reserved,updated_at";
export const STORE_PURCHASE_SELECT =
  "id,store_item_id,quantity,final_total_price,currency_code,status,created_at";
export const MARKET_NEWS_SELECT = [
  "id",
  "shock_id",
  "category",
  "sentiment",
  "source",
  "visibility",
  "scope",
  "target_key",
  "headline",
  "explanation",
  "created_tick",
  "expires_tick",
  "created_at",
].join(",");
