import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import {
  StockMarketRunnerError,
  type StockMarketRunnerRequestBody,
} from "../contracts/stockMarketRunnerContracts.ts";
import {
  parseStockMarketNewsCreateRequest,
} from "../contracts/stockMarketNewsContracts.ts";

export async function readStockMarketRunnerRequestBody(
  request: Request,
): Promise<StockMarketRunnerRequestBody> {
  let value: unknown;

  try {
    value = await request.json();
  } catch (_error) {
    throw new StockMarketRunnerError(
      "invalid_stock_market_runner_request",
      "Request body must be valid JSON.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new StockMarketRunnerError(
      "invalid_stock_market_runner_request",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (
    Array.isArray(value.gameSessionId) ||
    Array.isArray(value.gameSessionIds) ||
    Array.isArray(value.gameSessions) ||
    Array.isArray(value.sessions)
  ) {
    throw new StockMarketRunnerError(
      "invalid_stock_market_runner_request",
      "Stock market runner accepts exactly one gameSessionId per request.",
      400,
    );
  }

  const action = typeof value.action === "string"
    ? value.action.trim()
    : "run_tick";

  if (action === "post_market_news") {
    return {
      action,
      ...parseStockMarketNewsCreateRequest(value),
    };
  }

  if (action !== "run_tick") {
    throw new StockMarketRunnerError(
      "invalid_stock_market_runner_request",
      "Unsupported stock market runner action.",
      400,
    );
  }

  const gameSessionId = typeof value.gameSessionId === "string"
    ? value.gameSessionId.trim()
    : "";

  if (!gameSessionId) {
    throw new StockMarketRunnerError(
      "invalid_stock_market_runner_request",
      "gameSessionId is required.",
      400,
    );
  }

  return {
    action: "run_tick",
    gameSessionId,
    tickIndex: readOptionalTickIndex(value.tickIndex),
    seed: readOptionalSeed(value.seed),
  };
}

function readOptionalTickIndex(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new StockMarketRunnerError(
      "invalid_stock_market_runner_request",
      "tickIndex must be a non-negative integer when provided.",
      400,
    );
  }

  return value;
}

function readOptionalSeed(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const seed = typeof value === "string" ? value.trim() : "";

  if (!seed) {
    throw new StockMarketRunnerError(
      "invalid_stock_market_runner_request",
      "seed must be a non-empty string when provided.",
      400,
    );
  }

  return seed;
}
