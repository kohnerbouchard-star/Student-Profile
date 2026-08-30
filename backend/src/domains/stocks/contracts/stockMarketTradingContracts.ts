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

export interface PlayerSafeStockMarketOrderDto {
  readonly ticker: string;
  readonly side: StockMarketOrderSide;
  readonly quantity: number;
  readonly executionPrice: number;
  readonly grossValue: number;
  readonly status: StockMarketOrderStatus;
  readonly rejectionReason: string | null;
}

export interface StockMarketCashDto {
  readonly accountType: "checking";
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

export interface PlayerSafeStockMarketTradingExecuteSuccessBody {
  readonly ok: true;
  readonly action: "execute_order";
  readonly order: PlayerSafeStockMarketOrderDto;
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

export type PlayerStockMarketTradingAction =
  | "create_buy_quote"
  | "settle_buy_quote"
  | "settle_sell";

export interface StockMarketFundingAllocation {
  readonly sourceAccountKey: string;
  readonly targetAmount: number;
}

export interface StockMarketBuyQuoteInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly ticker: string;
  readonly quantity: number;
  readonly expectedPrice: number;
  readonly expectedTickIndex: number;
  readonly allocations: readonly StockMarketFundingAllocation[];
  readonly idempotencyKey: string;
}

export interface StockMarketBuySettlementInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly quoteKey: string;
  readonly idempotencyKey: string;
}

export interface StockMarketSellSettlementInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly ticker: string;
  readonly quantity: number;
  readonly expectedPrice: number;
  readonly expectedTickIndex: number;
  readonly destinationAccountKey: string;
  readonly idempotencyKey: string;
}

export type StockMarketPublicEvidence = Readonly<Record<string, unknown>>;

export interface StockMarketBuyQuoteDto {
  readonly quoteKey: string;
  readonly ticker: string;
  readonly listingCurrencyCode: string;
  readonly quantity: number;
  readonly quotedPrice: number;
  readonly priceTickIndex: number;
  readonly grossValue: number;
  readonly expiresAt: string;
  readonly funding: StockMarketPublicEvidence;
}

export interface StockMarketBuySettlementDto {
  readonly quoteKey: string;
  readonly ticker: string;
  readonly listingCurrencyCode: string;
  readonly quantity: number;
  readonly executionPrice: number;
  readonly priceTickIndex: number;
  readonly grossValue: number;
  readonly holdingQuantityAfter: number;
  readonly averageCostAfter: number;
  readonly filledAt: string;
  readonly alreadyCompleted: boolean;
  readonly funding: StockMarketPublicEvidence;
}

export interface StockMarketSellSettlementDto {
  readonly ticker: string;
  readonly listingCurrencyCode: string;
  readonly quantity: number;
  readonly executionPrice: number;
  readonly priceTickIndex: number;
  readonly grossValue: number;
  readonly holdingQuantityAfter: number;
  readonly averageCostAfter: number;
  readonly filledAt: string;
  readonly destinationAccountKey: string;
  readonly settlementTransactionKey: string;
  readonly alreadyCompleted: boolean;
}

export interface PlayerSafeStockMarketBuyQuoteSuccessBody {
  readonly ok: true;
  readonly action: "create_buy_quote";
  readonly quote: StockMarketBuyQuoteDto;
}

export interface PlayerSafeStockMarketBuySettlementSuccessBody {
  readonly ok: true;
  readonly action: "settle_buy_quote";
  readonly settlement: StockMarketBuySettlementDto;
}

export interface PlayerSafeStockMarketSellSettlementSuccessBody {
  readonly ok: true;
  readonly action: "settle_sell";
  readonly settlement: StockMarketSellSettlementDto;
}

export type PlayerSafeStockMarketTradingSuccessBody =
  | PlayerSafeStockMarketBuyQuoteSuccessBody
  | PlayerSafeStockMarketBuySettlementSuccessBody
  | PlayerSafeStockMarketSellSettlementSuccessBody;

export interface CreateStockBuyQuoteRpcArgs {
  readonly p_game_session_id: string;
  readonly p_player_id: string;
  readonly p_ticker: string;
  readonly p_quantity: number;
  readonly p_expected_price: number;
  readonly p_expected_tick_index: number;
  readonly p_allocations: readonly {
    readonly sourceAccountKey: string;
    readonly targetAmount: number;
  }[];
  readonly p_idempotency_key: string;
}

export interface SettleStockBuyQuoteRpcArgs {
  readonly p_game_session_id: string;
  readonly p_player_id: string;
  readonly p_quote_key: string;
  readonly p_idempotency_key: string;
}

export interface SettleStockSellRpcArgs {
  readonly p_game_session_id: string;
  readonly p_player_id: string;
  readonly p_ticker: string;
  readonly p_quantity: number;
  readonly p_expected_price: number;
  readonly p_expected_tick_index: number;
  readonly p_destination_account_key: string;
  readonly p_idempotency_key: string;
}

export interface PlayerStockMarketTradingRepository {
  createBuyQuote(input: StockMarketBuyQuoteInput): Promise<StockMarketBuyQuoteDto>;
  settleBuyQuote(
    input: StockMarketBuySettlementInput,
  ): Promise<StockMarketBuySettlementDto>;
  settleSell(
    input: StockMarketSellSettlementInput,
  ): Promise<StockMarketSellSettlementDto>;
}

export type StockMarketTradingErrorCode =
  | "invalid_stock_market_trading_request"
  | "stock_market_trading_retired"
  | "game_session_not_found"
  | "player_session_not_found"
  | "player_not_found"
  | "stock_asset_not_found"
  | "stock_market_closed"
  | "stale_stock_price"
  | "stale_stock_tick"
  | "stock_quote_not_found"
  | "stock_quote_expired"
  | "stock_quote_consumed"
  | "stock_destination_account_invalid"
  | "insufficient_cash"
  | "insufficient_shares"
  | "stock_market_liquidity_insufficient"
  | "stock_market_idempotency_conflict"
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
