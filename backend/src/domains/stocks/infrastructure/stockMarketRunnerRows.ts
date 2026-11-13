// Persistence row shapes and projections owned by the Stocks runner adapter.
import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import type {
  StockMarketRegimeKind,
  StockMarketShockScope,
} from "../contracts/stockMarketEngineContracts.ts";

export interface GameSessionRow {
  readonly id: string;
}

export interface GameSessionStockAssetRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly ticker: string;
  readonly company_name: string;
  readonly sector_key: string;
  readonly country_code: string;
  readonly current_price: number | string;
  readonly previous_close: number | string;
  readonly open_price: number | string;
  readonly day_high: number | string;
  readonly day_low: number | string;
  readonly market_cap?: number | string | null;
  readonly shares_outstanding?: number | string | null;
  readonly beta: number | string;
  readonly liquidity: number | string;
  readonly current_volatility: number | string;
  readonly long_run_volatility: number | string;
  readonly fair_value_anchor?: number | string | null;
  readonly recent_returns: readonly JsonValue[];
  readonly chart_history: readonly JsonValue[];
  readonly fundamentals: JsonObject;
  readonly country_exposure: JsonObject;
  readonly sector_exposure: JsonObject;
  readonly commodity_exposure: JsonObject;
}

export interface StockPriceTickIndexRow {
  readonly tick_index: number | string;
}

export interface StockMarketEventRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly shock_id: string;
  readonly scope: StockMarketShockScope | string;
  readonly target_key?: string | null;
  readonly magnitude: number | string;
  readonly decay: number | string;
  readonly confidence: number | string;
  readonly volatility_impact?: number | string | null;
  readonly volume_impact?: number | string | null;
  readonly headline: string;
  readonly explanation: string;
  readonly created_tick: number | string;
  readonly expires_tick?: number | string | null;
}

export interface StockMarketRegimeRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly regime: StockMarketRegimeKind | string;
  readonly starts_tick: number | string;
  readonly ends_tick?: number | string | null;
  readonly drift_bias: number | string;
  readonly volatility_multiplier: number | string;
  readonly news_sensitivity: number | string;
  readonly volume_multiplier: number | string;
  readonly beta_multiplier?: number | string | null;
  readonly sector_rotation: JsonObject;
  readonly student_label?: string | null;
}

export interface CountryProfileRow {
  readonly id: string;
  readonly country_code: string;
}

export interface CountryEconomicSnapshotRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly country_profile_id: string;
  readonly snapshot_sequence: number | string;
  readonly effective_at: string;
  readonly gdp_growth_rate: number | string;
  readonly inflation_rate: number | string;
  readonly unemployment_rate: number | string;
  readonly interest_rate: number | string;
  readonly consumer_confidence_index: number | string;
  readonly business_confidence_index: number | string;
  readonly trade_balance_index: number | string;
  readonly export_strength_index: number | string;
  readonly market_risk_index: number | string;
  readonly political_stability_index: number | string;
  readonly infrastructure_index: number | string;
  readonly energy_security_index: number | string;
  readonly supply_constraint_index: number | string;
  readonly import_dependency_index: number | string;
}

export const STOCK_ASSET_SELECT = [
  "id",
  "game_session_id",
  "ticker",
  "company_name",
  "sector_key",
  "country_code",
  "current_price",
  "previous_close",
  "open_price",
  "day_high",
  "day_low",
  "market_cap",
  "shares_outstanding",
  "beta",
  "liquidity",
  "current_volatility",
  "long_run_volatility",
  "fair_value_anchor",
  "recent_returns",
  "chart_history",
  "fundamentals",
  "country_exposure",
  "sector_exposure",
  "commodity_exposure",
].join(",");

export const STOCK_EVENT_SELECT = [
  "id",
  "game_session_id",
  "shock_id",
  "scope",
  "target_key",
  "magnitude",
  "decay",
  "confidence",
  "volatility_impact",
  "volume_impact",
  "headline",
  "explanation",
  "created_tick",
  "expires_tick",
].join(",");

export const STOCK_REGIME_SELECT = [
  "id",
  "game_session_id",
  "regime",
  "starts_tick",
  "ends_tick",
  "drift_bias",
  "volatility_multiplier",
  "news_sensitivity",
  "volume_multiplier",
  "beta_multiplier",
  "sector_rotation",
  "student_label",
].join(",");

export const COUNTRY_SNAPSHOT_SELECT = [
  "id",
  "game_session_id",
  "country_profile_id",
  "snapshot_sequence",
  "effective_at",
  "gdp_growth_rate",
  "inflation_rate",
  "unemployment_rate",
  "interest_rate",
  "consumer_confidence_index",
  "business_confidence_index",
  "trade_balance_index",
  "export_strength_index",
  "market_risk_index",
  "political_stability_index",
  "infrastructure_index",
  "energy_security_index",
  "supply_constraint_index",
  "import_dependency_index",
].join(",");
