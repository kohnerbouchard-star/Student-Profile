import {
  type CreateStockBuyQuoteRpcArgs,
  type ExecuteStockMarketOrderRpcArgs,
  type ExecuteStockMarketOrderRpcRow,
  type PlayerStockMarketTradingRepository,
  type SettleStockBuyQuoteRpcArgs,
  type SettleStockSellRpcArgs,
  type StockMarketBuyQuoteDto,
  type StockMarketBuyQuoteInput,
  type StockMarketBuySettlementDto,
  type StockMarketBuySettlementInput,
  type StockMarketOrderExecuteInput,
  type StockMarketSellSettlementDto,
  type StockMarketSellSettlementInput,
  StockMarketTradingError,
  type StockMarketTradingExecuteResult,
  type StockMarketTradingRepository,
} from "../contracts/stockMarketTradingContracts.ts";
import { mapStockTradingRpcError } from "./stockMarketTradingErrorMapper.ts";
import {
  type SupabaseStockMarketTradingClient,
  type SupabaseTradingQueryError,
  unwrapStockTradingRpcJson,
} from "./stockMarketTradingRpc.ts";
import {
  parseStockBuyQuote,
  parseStockBuySettlement,
  parseStockSellSettlement,
} from "./stockMarketTradingResponse.ts";

export class SupabaseStockMarketTradingRepository
  implements StockMarketTradingRepository, PlayerStockMarketTradingRepository {
  constructor(private readonly client: SupabaseStockMarketTradingClient) {}

  async executeOrder(
    input: StockMarketOrderExecuteInput,
  ): Promise<StockMarketTradingExecuteResult> {
    const args: ExecuteStockMarketOrderRpcArgs = {
      p_game_session_id: input.gameSessionId,
      p_player_session_id: input.playerSessionId,
      p_stock_asset_id: input.stockAssetId,
      p_side: input.side,
      p_quantity: input.quantity,
      p_idempotency_key: input.idempotencyKey,
    };
    const response = await this.client.rpc<
      readonly ExecuteStockMarketOrderRpcRow[]
    >("execute_stock_market_order_calendar_gated", args);
    if (response.error) throw mapRetainedTradingError(response.error);

    const row = response.data?.[0];
    if (!row) {
      throw new StockMarketTradingError(
        "stock_market_trading_failed",
        "Stock market order execution returned no result.",
        500,
      );
    }
    if (row.status === "rejected") throw mapRejectedOrder(row.rejection_reason);

    return {
      order: {
        orderId: row.order_id,
        gameSessionId: row.game_session_id,
        playerSessionId: row.player_session_id,
        stockAssetId: row.stock_asset_id,
        ticker: row.ticker,
        side: row.side === "sell" ? "sell" : "buy",
        quantity: toNumber(row.quantity),
        executionPrice: toNumber(row.execution_price),
        grossValue: toNumber(row.gross_value),
        status: "filled",
        rejectionReason: null,
      },
      cash: {
        accountType: "checking",
        currencyCode: row.cash_currency_code,
        balance: toNumber(row.cash_balance),
      },
      holding: {
        quantity: toNumber(row.holding_quantity),
        averageCost: toNumber(row.average_cost),
      },
    };
  }

  async createBuyQuote(
    input: StockMarketBuyQuoteInput,
  ): Promise<StockMarketBuyQuoteDto> {
    const args: CreateStockBuyQuoteRpcArgs = {
      p_game_session_id: input.gameSessionId,
      p_player_id: input.playerId,
      p_ticker: input.ticker,
      p_quantity: input.quantity,
      p_expected_price: input.expectedPrice,
      p_expected_tick_index: input.expectedTickIndex,
      p_allocations: input.allocations.map((allocation) => ({
        sourceAccountKey: allocation.sourceAccountKey,
        targetAmount: allocation.targetAmount,
      })),
      p_idempotency_key: input.idempotencyKey,
    };
    const response = await this.client.rpc("create_stock_buy_quote_v1", args);
    if (response.error) throw mapStockTradingRpcError(response.error, "buy_quote");
    return parseStockBuyQuote(unwrapStockTradingRpcJson(response.data));
  }

  async settleBuyQuote(
    input: StockMarketBuySettlementInput,
  ): Promise<StockMarketBuySettlementDto> {
    const args: SettleStockBuyQuoteRpcArgs = {
      p_game_session_id: input.gameSessionId,
      p_player_id: input.playerId,
      p_quote_key: input.quoteKey,
      p_idempotency_key: input.idempotencyKey,
    };
    const response = await this.client.rpc("settle_stock_buy_quote_v1", args);
    if (response.error) {
      throw mapStockTradingRpcError(response.error, "buy_settlement");
    }
    return parseStockBuySettlement(unwrapStockTradingRpcJson(response.data));
  }

  async settleSell(
    input: StockMarketSellSettlementInput,
  ): Promise<StockMarketSellSettlementDto> {
    const args: SettleStockSellRpcArgs = {
      p_game_session_id: input.gameSessionId,
      p_player_id: input.playerId,
      p_ticker: input.ticker,
      p_quantity: input.quantity,
      p_expected_price: input.expectedPrice,
      p_expected_tick_index: input.expectedTickIndex,
      p_destination_account_key: input.destinationAccountKey,
      p_idempotency_key: input.idempotencyKey,
    };
    const response = await this.client.rpc("settle_stock_sell_v1", args);
    if (response.error) {
      throw mapStockTradingRpcError(response.error, "sell_settlement");
    }
    return parseStockSellSettlement(unwrapStockTradingRpcJson(response.data));
  }
}

function mapRejectedOrder(rejectionReason: string | null): StockMarketTradingError {
  if (rejectionReason === "insufficient_cash") {
    return new StockMarketTradingError(
      "insufficient_cash",
      "Insufficient player cash for this stock order.",
      409,
    );
  }
  if (rejectionReason === "insufficient_shares") {
    return new StockMarketTradingError(
      "insufficient_shares",
      "Insufficient stock holdings for this sell order.",
      409,
    );
  }
  return new StockMarketTradingError(
    "invalid_stock_market_trading_state",
    "Stock market order was rejected.",
    409,
  );
}

function mapRetainedTradingError(
  error: SupabaseTradingQueryError,
): StockMarketTradingError {
  const upperMessage = String(error.message ?? "").toUpperCase();
  if (isRetainedSchemaNotAppliedError(error)) {
    return new StockMarketTradingError(
      "stock_market_trading_schema_not_applied",
      "Stock market trading schema is not applied.",
      500,
    );
  }
  if (upperMessage.includes("STOCK_TRADING_GAME_SESSION_NOT_FOUND")) {
    return new StockMarketTradingError(
      "game_session_not_found",
      "Game session could not be found.",
      404,
    );
  }
  if (upperMessage.includes("STOCK_TRADING_PLAYER_SESSION_NOT_FOUND")) {
    return new StockMarketTradingError(
      "player_session_not_found",
      "Player session could not be found in this game session.",
      404,
    );
  }
  if (upperMessage.includes("STOCK_TRADING_STOCK_ASSET_NOT_FOUND")) {
    return new StockMarketTradingError(
      "stock_asset_not_found",
      "Stock asset could not be found in this game session.",
      404,
    );
  }
  if (upperMessage.includes("STOCK_TRADING_MARKET_CLOSED")) {
    return new StockMarketTradingError(
      "stock_market_closed",
      "Stock market is closed. The order was not executed.",
      409,
    );
  }
  if (
    upperMessage.includes("STOCK_TRADING_INVALID") ||
    upperMessage.includes("STOCK_TRADING_IDEMPOTENCY_KEY_REQUIRED")
  ) {
    return new StockMarketTradingError(
      "invalid_stock_market_trading_request",
      "Stock market trading request is invalid.",
      400,
    );
  }
  return new StockMarketTradingError(
    "stock_market_trading_failed",
    "Stock market trading could not be completed.",
    500,
  );
}

function isRetainedSchemaNotAppliedError(error: SupabaseTradingQueryError): boolean {
  const message = String(error.message ?? "").toLowerCase();
  return error.code === "42P01" || error.code === "42703" ||
    message.includes("does not exist") || message.includes("schema cache");
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
