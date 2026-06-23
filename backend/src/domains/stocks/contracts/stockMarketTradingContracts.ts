export type StockMarketTradingAction = "execute_order";
export type StockMarketOrderSide = "buy" | "sell";
export type StockMarketOrderStatus = "filled" | "rejected";

export interface StockMarketTradingExecuteOrderRequestBody {
  readonly action: "execute_order";
  readonly gameSessionId: string;
  readonly playerSessionId: string;
  readonly stockAssetId: string;
  readonly side: StockMarketOrderSide;
  readonly quantity: number;
  readonly idempotencyKey: string;
}

export type StockMarketTradingRequestBody =
  StockMarketTradingExecuteOrderRequestBody;

export interface StockMarketOrderDto {
  readonly orderId: string;
  readonly gameSessionId: string;
  readonly playerSessionId: string;
  readonly stockAssetId: string;
  readonly ticker: string;
  readonly side: StockMarketOrderSide;
  readonly quantity: number;
  readonly executionPrice: number;
  readonly grossValue: number;
  readonly status: StockMarketOrderStatus;
  readonly rejectionReason: string | null;
}

export interface StockMarketCashDto {
  readonly accountType: "cash";
  readonly currencyCode: string;
  readonly balance: number;
}

export interface StockMarketHoldingDto {
  readonly quantity: number;
  readonly averageCost: number;
}

export interface StockMarketTradingExecuteSuccessBody {
  readonly ok: true;
  readonly action: "execute_order";
  readonly order: StockMarketOrderDto;
  readonly cash: StockMarketCashDto;
  readonly holding: StockMarketHoldingDto;
}

export type StockMarketTradingSuccessBody =
  StockMarketTradingExecuteSuccessBody;

export interface StockMarketOrderExecuteInput {
  readonly gameSessionId: string;
  readonly playerSessionId: string;
  readonly stockAssetId: string;
  readonly side: StockMarketOrderSide;
  readonly quantity: number;
  readonly idempotencyKey: string;
}

export interface StockMarketTradingRepository {
  executeOrder(
    input: StockMarketOrderExecuteInput,
  ): Promise<StockMarketTradingExecuteResult>;
}

export interface StockMarketTradingExecuteResult {
  readonly order: StockMarketOrderDto;
  readonly cash: StockMarketCashDto;
  readonly holding: StockMarketHoldingDto;
}

export interface ExecuteStockMarketOrderRpcArgs {
  readonly p_game_session_id: string;
  readonly p_player_session_id: string;
  readonly p_stock_asset_id: string;
  readonly p_side: StockMarketOrderSide;
  readonly p_quantity: number;
  readonly p_idempotency_key: string;
}

export interface ExecuteStockMarketOrderRpcRow {
  readonly order_id: string;
  readonly game_session_id: string;
  readonly player_session_id: string;
  readonly player_id: string;
  readonly stock_asset_id: string;
  readonly ticker: string;
  readonly side: StockMarketOrderSide | string;
  readonly quantity: number | string;
  readonly execution_price: number | string | null;
  readonly gross_value: number | string;
  readonly status: StockMarketOrderStatus | string;
  readonly rejection_reason: string | null;
  readonly cash_balance: number | string;
  readonly cash_currency_code: string;
  readonly holding_quantity: number | string;
  readonly average_cost: number | string;
}

export type StockMarketTradingErrorCode =
  | "invalid_stock_market_trading_request"
  | "game_session_not_found"
  | "player_session_not_found"
  | "stock_asset_not_found"
  | "insufficient_cash"
  | "insufficient_shares"
  | "invalid_stock_market_trading_state"
  | "stock_market_trading_schema_not_applied"
  | "stock_market_trading_failed";

export class StockMarketTradingError extends Error {
  readonly code: StockMarketTradingErrorCode;
  readonly status: number;

  constructor(
    code: StockMarketTradingErrorCode,
    message: string,
    status = 500,
  ) {
    super(message);
    this.name = "StockMarketTradingError";
    this.code = code;
    this.status = status;
  }
}
