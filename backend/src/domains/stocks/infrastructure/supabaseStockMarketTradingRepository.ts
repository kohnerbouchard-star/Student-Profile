import {
  type ExecuteStockMarketOrderRpcArgs,
  type ExecuteStockMarketOrderRpcRow,
  type StockMarketOrderExecuteInput,
  StockMarketTradingError,
  type StockMarketTradingExecuteResult,
  type StockMarketTradingRepository,
} from "../contracts/stockMarketTradingContracts.ts";

interface SupabaseTradingQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface SupabaseTradingQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabaseTradingQueryError | null;
}

interface SupabaseStockMarketTradingClient {
  rpc<Data = unknown>(
    functionName: string,
    args?: unknown,
  ): PromiseLike<SupabaseTradingQueryResponse<Data>>;
}

export class SupabaseStockMarketTradingRepository
  implements StockMarketTradingRepository {
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
    >("execute_stock_market_order", args);

    if (response.error) {
      throw mapTradingError(response.error);
    }

    const row = response.data?.[0];

    if (!row) {
      throw new StockMarketTradingError(
        "stock_market_trading_failed",
        "Stock market order execution returned no result.",
        500,
      );
    }

    if (row.status === "rejected") {
      throw mapRejectedOrder(row.rejection_reason);
    }

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
        accountType: "cash",
        currencyCode: row.cash_currency_code,
        balance: toNumber(row.cash_balance),
      },
      holding: {
        quantity: toNumber(row.holding_quantity),
        averageCost: toNumber(row.average_cost),
      },
    };
  }
}

function mapRejectedOrder(
  rejectionReason: string | null,
): StockMarketTradingError {
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

function mapTradingError(
  error: SupabaseTradingQueryError,
): StockMarketTradingError {
  const upperMessage = error.message.toUpperCase();

  if (isSchemaNotAppliedError(error)) {
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

function isSchemaNotAppliedError(error: SupabaseTradingQueryError): boolean {
  const message = error.message.toLowerCase();

  return error.code === "42P01" ||
    error.code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache");
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
