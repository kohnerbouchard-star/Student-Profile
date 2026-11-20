import type { ISODateTimeString, UUID } from "../auth/types.ts";
import type { JsonObject, JsonValue } from "./coreTableTypes.ts";

export type StockMarketEventScope = "global" | "country" | "sector" | "ticker";

export type StockMarketRegimeName =
  | "bull"
  | "bear"
  | "sideways"
  | "crisis"
  | "recovery"
  | "sector_rotation";

export interface StockTemplatesRow {
  readonly id: UUID;
  readonly ticker: string;
  readonly company_name: string;
  readonly sector_key: string;
  readonly country_code: string;
  readonly description?: string | null;
  readonly base_price: number;
  readonly beta: number;
  readonly liquidity: number;
  readonly long_run_volatility: number;
  readonly shares_outstanding?: number | null;
  readonly fundamentals: JsonObject;
  readonly country_exposure: JsonObject;
  readonly sector_exposure: JsonObject;
  readonly commodity_exposure: JsonObject;
  readonly is_active: boolean;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface StockTemplateInsert {
  readonly ticker: string;
  readonly company_name: string;
  readonly sector_key: string;
  readonly country_code: string;
  readonly description?: string | null;
  readonly base_price: number;
  readonly beta: number;
  readonly liquidity: number;
  readonly long_run_volatility: number;
  readonly shares_outstanding?: number | null;
  readonly fundamentals?: JsonObject;
  readonly country_exposure?: JsonObject;
  readonly sector_exposure?: JsonObject;
  readonly commodity_exposure?: JsonObject;
  readonly is_active?: boolean;
}

export type StockTemplateUpdate = Partial<StockTemplateInsert>;

export interface GameSessionStockAssetsRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly template_id?: UUID | null;
  readonly ticker: string;
  readonly company_name: string;
  readonly sector_key: string;
  readonly country_code: string;
  readonly description?: string | null;
  readonly current_price: number;
  readonly previous_close: number;
  readonly open_price: number;
  readonly day_high: number;
  readonly day_low: number;
  readonly market_cap?: number | null;
  readonly shares_outstanding?: number | null;
  readonly beta: number;
  readonly liquidity: number;
  readonly current_volatility: number;
  readonly long_run_volatility: number;
  readonly fair_value_anchor?: number | null;
  readonly recent_returns: JsonValue[];
  readonly chart_history: JsonValue[];
  readonly fundamentals: JsonObject;
  readonly country_exposure: JsonObject;
  readonly sector_exposure: JsonObject;
  readonly commodity_exposure: JsonObject;
  readonly is_active: boolean;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface GameSessionStockAssetInsert {
  readonly game_session_id: UUID;
  readonly template_id?: UUID | null;
  readonly ticker: string;
  readonly company_name: string;
  readonly sector_key: string;
  readonly country_code: string;
  readonly description?: string | null;
  readonly current_price: number;
  readonly previous_close: number;
  readonly open_price: number;
  readonly day_high: number;
  readonly day_low: number;
  readonly market_cap?: number | null;
  readonly shares_outstanding?: number | null;
  readonly beta: number;
  readonly liquidity: number;
  readonly current_volatility: number;
  readonly long_run_volatility: number;
  readonly fair_value_anchor?: number | null;
  readonly recent_returns?: JsonValue[];
  readonly chart_history?: JsonValue[];
  readonly fundamentals?: JsonObject;
  readonly country_exposure?: JsonObject;
  readonly sector_exposure?: JsonObject;
  readonly commodity_exposure?: JsonObject;
  readonly is_active?: boolean;
}

export type GameSessionStockAssetUpdate = Partial<GameSessionStockAssetInsert>;

export interface StockPriceTicksRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly stock_asset_id: UUID;
  readonly tick_index: number;
  readonly ticker: string;
  readonly price: number;
  readonly previous_price: number;
  readonly log_return: number;
  readonly change_pct: number;
  readonly volume: number;
  readonly current_volatility: number;
  readonly long_run_volatility: number;
  readonly explanation: JsonObject;
  readonly created_at: ISODateTimeString;
}

export interface StockPriceTickInsert {
  readonly game_session_id: UUID;
  readonly stock_asset_id: UUID;
  readonly tick_index: number;
  readonly ticker: string;
  readonly price: number;
  readonly previous_price: number;
  readonly log_return: number;
  readonly change_pct: number;
  readonly volume: number;
  readonly current_volatility: number;
  readonly long_run_volatility: number;
  readonly explanation?: JsonObject;
}

export type StockPriceTickUpdate = Partial<StockPriceTickInsert>;

export interface StockMarketEventsRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly shock_id: string;
  readonly scope: StockMarketEventScope | string;
  readonly target_key?: string | null;
  readonly magnitude: number;
  readonly decay: number;
  readonly confidence: number;
  readonly volatility_impact?: number | null;
  readonly volume_impact?: number | null;
  readonly headline: string;
  readonly explanation: string;
  readonly created_tick: number;
  readonly expires_tick?: number | null;
  readonly is_active: boolean;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface StockMarketEventInsert {
  readonly game_session_id: UUID;
  readonly shock_id: string;
  readonly scope: StockMarketEventScope | string;
  readonly target_key?: string | null;
  readonly magnitude: number;
  readonly decay: number;
  readonly confidence: number;
  readonly volatility_impact?: number | null;
  readonly volume_impact?: number | null;
  readonly headline: string;
  readonly explanation: string;
  readonly created_tick: number;
  readonly expires_tick?: number | null;
  readonly is_active?: boolean;
}

export type StockMarketEventUpdate = Partial<StockMarketEventInsert>;

export interface StockMarketRegimesRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly regime: StockMarketRegimeName | string;
  readonly starts_tick: number;
  readonly ends_tick?: number | null;
  readonly drift_bias: number;
  readonly volatility_multiplier: number;
  readonly news_sensitivity: number;
  readonly volume_multiplier: number;
  readonly beta_multiplier?: number | null;
  readonly sector_rotation: JsonObject;
  readonly student_label?: string | null;
  readonly is_active: boolean;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface StockMarketRegimeInsert {
  readonly game_session_id: UUID;
  readonly regime: StockMarketRegimeName | string;
  readonly starts_tick: number;
  readonly ends_tick?: number | null;
  readonly drift_bias: number;
  readonly volatility_multiplier: number;
  readonly news_sensitivity: number;
  readonly volume_multiplier: number;
  readonly beta_multiplier?: number | null;
  readonly sector_rotation?: JsonObject;
  readonly student_label?: string | null;
  readonly is_active?: boolean;
}

export type StockMarketRegimeUpdate = Partial<StockMarketRegimeInsert>;

export interface StockHoldingsRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly player_session_id: UUID;
  readonly player_id: UUID;
  readonly stock_asset_id: UUID;
  readonly ticker: string;
  readonly quantity: number;
  readonly reserved_quantity: number;
  readonly average_cost: number;
  readonly realized_pnl: number;
  readonly created_at: ISODateTimeString;
  readonly updated_at: ISODateTimeString;
}

export interface StockHoldingInsert {
  readonly game_session_id: UUID;
  readonly player_session_id: UUID;
  readonly player_id: UUID;
  readonly stock_asset_id: UUID;
  readonly ticker: string;
  readonly quantity?: number;
  readonly reserved_quantity?: number;
  readonly average_cost?: number;
  readonly realized_pnl?: number;
}

export type StockHoldingUpdate = Partial<StockHoldingInsert>;

export interface StockOrdersRow {
  readonly id: UUID;
  readonly game_session_id: UUID;
  readonly player_session_id: UUID;
  readonly player_id: UUID;
  readonly stock_asset_id: UUID;
  readonly ticker: string;
  readonly side: "buy" | "sell" | string;
  readonly order_type: "market" | string;
  readonly quantity: number;
  readonly requested_price?: number | null;
  readonly execution_price?: number | null;
  readonly gross_value: number;
  readonly status: "filled" | "rejected" | string;
  readonly rejection_reason?: string | null;
  readonly idempotency_key: string;
  readonly cash_balance_after: number;
  readonly cash_currency_code: string;
  readonly holding_quantity_after: number;
  readonly average_cost_after: number;
  readonly created_at: ISODateTimeString;
  readonly filled_at?: ISODateTimeString | null;
}

export interface StockOrderInsert {
  readonly game_session_id: UUID;
  readonly player_session_id: UUID;
  readonly player_id: UUID;
  readonly stock_asset_id: UUID;
  readonly ticker: string;
  readonly side: "buy" | "sell" | string;
  readonly order_type?: "market" | string;
  readonly quantity: number;
  readonly requested_price?: number | null;
  readonly execution_price?: number | null;
  readonly gross_value?: number;
  readonly status: "filled" | "rejected" | string;
  readonly rejection_reason?: string | null;
  readonly idempotency_key: string;
  readonly cash_balance_after?: number;
  readonly cash_currency_code?: string;
  readonly holding_quantity_after?: number;
  readonly average_cost_after?: number;
  readonly filled_at?: ISODateTimeString | null;
}

export type StockOrderUpdate = Partial<StockOrderInsert>;

export interface StockTradesRow {
  readonly id: UUID;
  readonly order_id: UUID;
  readonly game_session_id: UUID;
  readonly player_session_id: UUID;
  readonly player_id: UUID;
  readonly stock_asset_id: UUID;
  readonly ticker: string;
  readonly side: "buy" | "sell" | string;
  readonly quantity: number;
  readonly execution_price: number;
  readonly gross_value: number;
  readonly created_at: ISODateTimeString;
}

export interface StockTradeInsert {
  readonly order_id: UUID;
  readonly game_session_id: UUID;
  readonly player_session_id: UUID;
  readonly player_id: UUID;
  readonly stock_asset_id: UUID;
  readonly ticker: string;
  readonly side: "buy" | "sell" | string;
  readonly quantity: number;
  readonly execution_price: number;
  readonly gross_value: number;
}
