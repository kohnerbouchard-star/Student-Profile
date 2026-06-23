export interface StockMarketReadRequestBody {
  readonly gameSessionId: string;
  readonly ticker?: string;
  readonly includeHistory?: boolean;
  readonly historyLimit?: number;
}

export interface StockMarketReadInput {
  readonly gameSessionId: string;
  readonly ticker?: string;
  readonly includeHistory: boolean;
  readonly historyLimit: number;
}

export interface StockMarketBoardStockDto {
  readonly assetId: string;
  readonly ticker: string;
  readonly companyName: string;
  readonly sector: string;
  readonly countryCode: string;
  readonly currentPrice: number;
  readonly previousClose: number;
  readonly changePct: number;
  readonly openPrice: number;
  readonly dayHigh: number;
  readonly dayLow: number;
  readonly volume: number;
  readonly marketCap: number | null;
  readonly currentVolatility: number;
  readonly longRunVolatility: number;
  readonly description: string | null;
}

export interface StockMarketHistoryPointDto {
  readonly tickIndex: number;
  readonly price: number;
  readonly previousPrice: number;
  readonly changePct: number;
  readonly volume: number;
  readonly createdAt: string;
}

export interface StockMarketEmptyStateDto {
  readonly reason: "stock_market_not_initialized";
  readonly recommendedAction: "run_stock_market_seed_copy";
}

export interface StockMarketReadResult {
  readonly gameSessionId: string;
  readonly tickIndex: number;
  readonly stocks: readonly StockMarketBoardStockDto[];
  readonly ticker?: string;
  readonly stock?: StockMarketBoardStockDto | null;
  readonly history?: readonly StockMarketHistoryPointDto[];
  readonly emptyState?: StockMarketEmptyStateDto;
}

export interface StockMarketReadSuccessBody extends StockMarketReadResult {
  readonly ok: true;
}

export interface StockMarketReadRepository {
  read(input: StockMarketReadInput): Promise<StockMarketReadResult>;
}

export type StockMarketReadErrorCode =
  | "invalid_stock_market_read_request"
  | "stock_market_schema_not_applied"
  | "stock_market_read_failed";

export class StockMarketReadError extends Error {
  readonly code: StockMarketReadErrorCode;
  readonly status: number;

  constructor(code: StockMarketReadErrorCode, message: string, status = 500) {
    super(message);
    this.name = "StockMarketReadError";
    this.code = code;
    this.status = status;
  }
}
