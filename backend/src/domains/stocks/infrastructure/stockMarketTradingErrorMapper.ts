import { StockMarketTradingError } from "../contracts/stockMarketTradingContracts.ts";
import {
  type StockMarketTradingPhase,
  type SupabaseTradingQueryError,
} from "./stockMarketTradingRpc.ts";

export function mapStockTradingRpcError(
  error: SupabaseTradingQueryError,
  phase: StockMarketTradingPhase,
): StockMarketTradingError {
  const source = [error.code, error.message, error.details, error.hint]
    .filter(Boolean).join(" ").toUpperCase();
  const token = [...source.matchAll(/[A-Z][A-Z0-9_]{4,}/gu)]
    .map((match) => match[0])
    .find((candidate) => /^(?:STOCK|PURCHASE|FUNDING|BANK|FX)_/u.test(candidate)) ?? "";

  if (isSchemaNotApplied(error, source)) {
    return failure(
      "stock_market_trading_schema_not_applied",
      "Multi-currency Stock market trading schema is not applied.",
      500,
    );
  }
  if (
    token.includes("REQUEST_INVALID") || token.includes("ALLOCATIONS_INVALID") ||
    token.includes("PRECISION_INVALID") || token.includes("GROSS_INVALID")
  ) return failure("invalid_stock_market_trading_request", "Stock market trading request is invalid.", 400);
  if (token.includes("PLAYER_NOT_FOUND")) {
    return failure("player_not_found", "Player could not be found in this game session.", 404);
  }
  if (token.includes("ASSET_NOT_FOUND")) {
    return failure("stock_asset_not_found", "Stock asset could not be found in this game session.", 404);
  }
  if (token.includes("QUOTE_NOT_FOUND")) {
    return failure("stock_quote_not_found", "Stock purchase quote could not be found.", 404);
  }
  if (token.includes("MARKET_CLOSED")) {
    return failure("stock_market_closed", "Stock market is closed. No trade was executed.", 409);
  }
  if (token.includes("PRICE_CHANGED")) {
    return failure("stale_stock_price", "The reviewed Stock price changed. Refresh the market and quote again.", 409);
  }
  if (token.includes("TICK_CHANGED") || token.includes("TICK_UNAVAILABLE")) {
    return failure("stale_stock_tick", "The reviewed Stock price tick is no longer current.", 409);
  }
  if (token.includes("QUOTE_EXPIRED")) {
    return failure("stock_quote_expired", "The Stock purchase quote expired. Create a new quote.", 409);
  }
  if (token.includes("QUOTE_CONSUMED")) {
    return failure("stock_quote_consumed", "The Stock purchase quote has already been consumed.", 409);
  }
  if (token.includes("DESTINATION_INVALID")) {
    return failure(
      "stock_destination_account_invalid",
      "Choose an active listing-currency Player Checking account for proceeds.",
      409,
    );
  }
  if (token.includes("SHARES_INSUFFICIENT")) {
    return failure("insufficient_shares", "Available Stock holdings are insufficient for this sale.", 409);
  }
  if (token.includes("IDEMPOTENCY") || token.includes("CONFLICT")) {
    return failure(
      "stock_market_idempotency_conflict",
      "This idempotency key was already used for a different Stock request.",
      409,
    );
  }
  if (fundsInsufficient(token)) {
    return phase === "sell_settlement"
      ? failure(
        "stock_market_liquidity_insufficient",
        "Stock market liquidity is insufficient for these listing-currency proceeds.",
        409,
      )
      : failure(
        "insufficient_cash",
        "Available Checking funds are insufficient for this Stock purchase.",
        409,
      );
  }
  if (token.includes("LIQUIDITY") && token.includes("INSUFFICIENT")) {
    return failure(
      "stock_market_liquidity_insufficient",
      "Stock market liquidity is insufficient for this settlement.",
      409,
    );
  }
  if (
    token.includes("UNAVAILABLE") || token.includes("INVALID") ||
    token.includes("MISMATCH") || token.includes("LIQUIDITY") ||
    token.includes("SESSION") || token.includes("CURRENCY")
  ) {
    return failure(
      "invalid_stock_market_trading_state",
      phase === "buy_quote"
        ? "Stock purchase quote is unavailable from the current market state."
        : "Stock settlement is unavailable from the quoted market state.",
      409,
    );
  }
  return failure(
    "stock_market_trading_failed",
    phase === "buy_quote"
      ? "Stock purchase quote could not be created."
      : "Stock settlement could not be completed.",
    500,
  );
}

function fundsInsufficient(token: string): boolean {
  return token.includes("FUNDING_INSUFFICIENT") ||
    token.includes("INSUFFICIENT_FUNDS") ||
    token.includes("AVAILABLE_BALANCE_INSUFFICIENT") ||
    token.includes("AVAILABLE_INSUFFICIENT");
}

function isSchemaNotApplied(error: SupabaseTradingQueryError, source: string): boolean {
  return error.code === "42P01" || error.code === "42703" ||
    error.code === "42883" || error.code === "PGRST202" ||
    source.includes("DOES NOT EXIST") || source.includes("SCHEMA CACHE") ||
    source.includes("COULD NOT FIND THE FUNCTION");
}

function failure(
  code: ConstructorParameters<typeof StockMarketTradingError>[0],
  message: string,
  status: number,
): StockMarketTradingError {
  return new StockMarketTradingError(code, message, status);
}
