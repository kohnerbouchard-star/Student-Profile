export type StockMarketSeedCopyMode = "missing_only" | "reset_empty_only";

export interface StockMarketSeedCopyRequestBody {
  readonly gameSessionId: string;
  readonly mode?: StockMarketSeedCopyMode;
}

export interface StockMarketSeedCopySuccessBody {
  readonly ok: true;
  readonly gameSessionId: string;
  readonly templatesAvailable: number;
  readonly assetsBefore: number;
  readonly assetsInserted: number;
  readonly baselineTicksInserted: number;
  readonly assetsAfter: number;
}

export interface StockMarketSeedCopyInput {
  readonly gameSessionId: string;
  readonly mode: StockMarketSeedCopyMode;
}

export interface StockMarketSeedCopyResult {
  readonly gameSessionId: string;
  readonly templatesAvailable: number;
  readonly assetsBefore: number;
  readonly assetsInserted: number;
  readonly baselineTicksInserted: number;
  readonly assetsAfter: number;
}

export interface StockMarketSeedCopyRepository {
  initialize(input: StockMarketSeedCopyInput): Promise<StockMarketSeedCopyResult>;
}

export interface InitializeStockMarketAssetsForGameRpcArgs {
  readonly p_game_session_id: string;
  readonly p_mode?: StockMarketSeedCopyMode;
}

export interface InitializeStockMarketAssetsForGameRpcRow {
  readonly game_session_id: string;
  readonly templates_available: number;
  readonly assets_before: number;
  readonly assets_inserted: number;
  readonly baseline_ticks_inserted: number;
  readonly assets_after: number;
}

export type StockMarketSeedCopyErrorCode =
  | "invalid_stock_market_seed_copy_request"
  | "game_session_not_found"
  | "stock_market_already_initialized"
  | "stock_market_schema_not_applied"
  | "stock_market_seed_copy_failed";

export class StockMarketSeedCopyError extends Error {
  readonly code: StockMarketSeedCopyErrorCode;
  readonly status: number;

  constructor(
    code: StockMarketSeedCopyErrorCode,
    message: string,
    status = 500,
  ) {
    super(message);
    this.name = "StockMarketSeedCopyError";
    this.code = code;
    this.status = status;
  }
}
