export type StockMarketPlayerReadAction =
  | "read_portfolio"
  | "read_holdings"
  | "read_orders"
  | "read_trades";

export type StockMarketPlayerOrderSide = "buy" | "sell";
export type StockMarketPlayerOrderStatus = "filled" | "rejected";

export interface StockMarketPlayerReadRequestBody {
  readonly action: StockMarketPlayerReadAction;
  readonly gameSessionId: string;
  readonly playerSessionId: string;
  readonly limit?: number;
}

export interface StockMarketPlayerReadInput {
  readonly action: StockMarketPlayerReadAction;
  readonly gameSessionId: string;
  readonly playerSessionId: string;
  readonly limit: number;
}

export interface StockMarketPlayerCashDto {
  readonly accountType: "cash";
  readonly currencyCode: string;
  readonly balance: number;
}

export interface StockMarketPlayerHoldingDto {
  readonly stockAssetId: string;
  readonly ticker: string;
  readonly companyName: string;
  readonly sector: string;
  readonly countryCode: string;
  readonly quantity: number;
  readonly averageCost: number;
  readonly currentPrice: number;
  readonly marketValue: number;
  readonly costBasis: number;
  readonly unrealizedPnl: number;
  readonly unrealizedPnlPct: number;
  readonly realizedPnl: number;
}

export interface StockMarketPlayerPortfolioSummaryDto {
  readonly cashBalance: number;
  readonly holdingsMarketValue: number;
  readonly totalEquity: number;
  readonly totalCostBasis: number;
  readonly unrealizedPnl: number;
  readonly realizedPnl: number;
  readonly positionsCount: number;
}

export interface StockMarketPlayerOrderDto {
  readonly orderId: string;
  readonly stockAssetId: string;
  readonly ticker: string;
  readonly side: StockMarketPlayerOrderSide;
  readonly quantity: number;
  readonly executionPrice: number;
  readonly grossValue: number;
  readonly status: StockMarketPlayerOrderStatus;
  readonly rejectionReason: string | null;
  readonly idempotencyKey: string;
  readonly createdAt: string;
}

export interface StockMarketPlayerTradeDto {
  readonly tradeId: string;
  readonly orderId: string;
  readonly stockAssetId: string;
  readonly ticker: string;
  readonly side: StockMarketPlayerOrderSide;
  readonly quantity: number;
  readonly executionPrice: number;
  readonly grossValue: number;
  readonly createdAt: string;
}

interface StockMarketPlayerReadBaseResult {
  readonly gameSessionId: string;
  readonly playerSessionId: string;
  readonly playerId: string;
}

export interface StockMarketPlayerPortfolioReadResult
  extends StockMarketPlayerReadBaseResult {
  readonly action: "read_portfolio";
  readonly cash: StockMarketPlayerCashDto;
  readonly summary: StockMarketPlayerPortfolioSummaryDto;
  readonly holdings: readonly StockMarketPlayerHoldingDto[];
}

export interface StockMarketPlayerHoldingsReadResult
  extends StockMarketPlayerReadBaseResult {
  readonly action: "read_holdings";
  readonly cash: StockMarketPlayerCashDto;
  readonly summary: StockMarketPlayerPortfolioSummaryDto;
  readonly holdings: readonly StockMarketPlayerHoldingDto[];
}

export interface StockMarketPlayerOrdersReadResult
  extends StockMarketPlayerReadBaseResult {
  readonly action: "read_orders";
  readonly orders: readonly StockMarketPlayerOrderDto[];
}

export interface StockMarketPlayerTradesReadResult
  extends StockMarketPlayerReadBaseResult {
  readonly action: "read_trades";
  readonly trades: readonly StockMarketPlayerTradeDto[];
}

export type StockMarketPlayerReadResult =
  | StockMarketPlayerPortfolioReadResult
  | StockMarketPlayerHoldingsReadResult
  | StockMarketPlayerOrdersReadResult
  | StockMarketPlayerTradesReadResult;

export type StockMarketPlayerReadSuccessBody =
  & { readonly ok: true }
  & StockMarketPlayerReadResult;

export interface StockMarketPlayerReadRepository {
  read(input: StockMarketPlayerReadInput): Promise<StockMarketPlayerReadResult>;
}

export type StockMarketPlayerReadErrorCode =
  | "invalid_stock_market_player_read_request"
  | "player_session_not_found"
  | "invalid_player_session"
  | "stock_market_player_read_schema_not_applied"
  | "stock_market_player_read_failed";

export class StockMarketPlayerReadError extends Error {
  readonly code: StockMarketPlayerReadErrorCode;
  readonly status: number;

  constructor(
    code: StockMarketPlayerReadErrorCode,
    message: string,
    status = 500,
  ) {
    super(message);
    this.name = "StockMarketPlayerReadError";
    this.code = code;
    this.status = status;
  }
}
