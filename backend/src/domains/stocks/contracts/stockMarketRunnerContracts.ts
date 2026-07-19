import type {
  StockMarketAssetInput,
  StockMarketCountryInput,
  StockMarketEngineInput,
  StockMarketEngineResult,
  StockMarketMacroInput,
  StockMarketRegimeInput,
  StockMarketSectorInput,
  StockMarketShockInput,
} from "./stockMarketEngineContracts.ts";
import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import type {
  StockMarketNewsCreateInput,
  StockMarketNewsDto,
} from "./stockMarketNewsContracts.ts";
import type { StockExchangeCode } from "../calendars/stockMarketExchangeCalendar.ts";

export type StockMarketRunnerRequestBody =
  | StockMarketRunnerTickRequestBody
  | StockMarketRunnerDueMinutesRequestBody
  | StockMarketRunnerPostMarketNewsRequestBody;

export interface StockMarketRunnerTickRequestBody {
  readonly action: "run_tick";
  readonly gameSessionId: string;
  readonly tickIndex?: number;
  readonly seed?: string;
  readonly marketMinute?: string;
  readonly exchangeCode?: StockExchangeCode;
}

export interface StockMarketRunnerDueMinutesRequestBody {
  readonly action: "run_due_minutes";
  readonly gameSessionId: string;
  readonly maxCatchUpMinutes?: number;
  readonly exchangeCode?: StockExchangeCode;
}

export interface StockMarketRunnerPostMarketNewsRequestBody
  extends StockMarketNewsCreateInput {
  readonly action: "post_market_news";
}

export interface StockMarketRunnerSuccessBody {
  readonly ok: true;
  readonly action: "run_tick";
  readonly gameSessionId: string;
  readonly exchangeCode: StockExchangeCode;
  readonly marketMinute: string;
  readonly tickIndex: number;
  readonly assetsProcessed: number;
  readonly ticksInserted: number;
  readonly generatedAt: string;
}

export interface StockMarketRunnerDueMinutesSuccessBody {
  readonly ok: true;
  readonly action: "run_due_minutes";
  readonly gameSessionId: string;
  readonly exchangeCode: StockExchangeCode;
  readonly evaluatedThrough: string;
  readonly minutesProcessed: number;
  readonly marketMinutes: readonly string[];
  readonly firstTickIndex: number | null;
  readonly lastTickIndex: number | null;
  readonly assetsProcessed: number;
  readonly ticksInserted: number;
  readonly backlogRemaining: boolean;
  readonly generatedAt: string;
}

export interface StockMarketRunnerPostMarketNewsSuccessBody {
  readonly ok: true;
  readonly action: "post_market_news";
  readonly gameSessionId: string;
  readonly news: StockMarketNewsDto;
}

export interface StockMarketRunnerLoadedState {
  readonly gameSessionId: string;
  readonly exchangeCode: StockExchangeCode;
  readonly marketMinute: string;
  readonly tickIndex: number;
  readonly assets: readonly StockMarketAssetInput[];
  readonly macro: StockMarketMacroInput;
  readonly countries: readonly StockMarketCountryInput[];
  readonly sectors: readonly StockMarketSectorInput[];
  readonly shocks: readonly StockMarketShockInput[];
  readonly regime?: StockMarketRegimeInput;
}

export interface StockMarketRunnerLoadInput {
  readonly gameSessionId: string;
  readonly exchangeCode: StockExchangeCode;
  readonly marketMinute: string;
  readonly tickIndex?: number;
}

export interface StockMarketRunnerAssetUpdate {
  readonly game_session_id: string;
  readonly asset_id: string;
  readonly current_price: number;
  readonly previous_close: number;
  readonly open_price: number;
  readonly day_high: number;
  readonly day_low: number;
  readonly market_cap: number;
  readonly current_volatility: number;
  readonly long_run_volatility: number;
  readonly recent_returns: readonly JsonValue[];
  readonly chart_history: readonly JsonValue[];
}

export interface StockMarketRunnerTickRow {
  readonly game_session_id: string;
  readonly stock_asset_id: string;
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
}

export interface StockMarketRunnerPersistencePayload {
  readonly gameSessionId: string;
  readonly exchangeCode: StockExchangeCode;
  readonly marketMinute: string;
  readonly tickIndex: number;
  readonly assetUpdates: readonly StockMarketRunnerAssetUpdate[];
  readonly tickRows: readonly StockMarketRunnerTickRow[];
}

export interface StockMarketRunnerApplyResult {
  readonly assetsUpdated: number;
  readonly ticksInserted: number;
}

export interface StockMarketRunnerRepository {
  readLastProcessedMinute(
    gameSessionId: string,
    exchangeCode: StockExchangeCode,
  ): Promise<string | null>;
  load(input: StockMarketRunnerLoadInput): Promise<StockMarketRunnerLoadedState>;
  apply(
    payload: StockMarketRunnerPersistencePayload,
  ): Promise<StockMarketRunnerApplyResult>;
}

export interface StockMarketRunnerRunInput {
  readonly gameSessionId: string;
  readonly exchangeCode: StockExchangeCode;
  readonly marketMinute: string;
  readonly tickIndex?: number;
  readonly seed?: string;
}

export interface StockMarketRunnerResult {
  readonly gameSessionId: string;
  readonly exchangeCode: StockExchangeCode;
  readonly marketMinute: string;
  readonly tickIndex: number;
  readonly assetsProcessed: number;
  readonly ticksInserted: number;
  readonly generatedAt: string;
}

export interface StockMarketRunnerDueMinutesResult {
  readonly gameSessionId: string;
  readonly exchangeCode: StockExchangeCode;
  readonly evaluatedThrough: string;
  readonly results: readonly StockMarketRunnerResult[];
  readonly backlogRemaining: boolean;
}

export type StockMarketRunnerErrorCode =
  | "invalid_stock_market_runner_request"
  | "game_session_not_found"
  | "no_active_stock_assets"
  | "stock_tick_already_exists"
  | "stock_market_minute_already_exists"
  | "stock_market_closed"
  | "stock_market_schema_not_applied"
  | "stock_market_state_load_failed"
  | "stock_market_tick_apply_failed"
  | "stock_market_engine_failed";

export class StockMarketRunnerError extends Error {
  readonly code: StockMarketRunnerErrorCode;
  readonly status: number;

  constructor(
    code: StockMarketRunnerErrorCode,
    message: string,
    status = 500,
  ) {
    super(message);
    this.name = "StockMarketRunnerError";
    this.code = code;
    this.status = status;
  }
}

export type CalculateStockMarketTick = (
  input: StockMarketEngineInput,
) => StockMarketEngineResult;
