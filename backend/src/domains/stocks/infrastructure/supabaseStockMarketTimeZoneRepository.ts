import {
  readRequiredStockMarketTimeZone,
} from "../calendars/stockMarketWindowSettings.ts";
import {
  StockMarketRunnerError,
} from "../contracts/stockMarketRunnerContracts.ts";

interface SupabaseStockMarketTimeZoneError {
  readonly message: string;
  readonly code?: string;
}

interface SupabaseStockMarketTimeZoneResponse {
  readonly data: unknown;
  readonly error: SupabaseStockMarketTimeZoneError | null;
}

export interface SupabaseStockMarketTimeZoneClient {
  rpc(
    functionName: string,
    args?: unknown,
  ): PromiseLike<SupabaseStockMarketTimeZoneResponse>;
}

export async function readServerStockMarketTimeZone(
  client: SupabaseStockMarketTimeZoneClient,
  gameSessionId: string,
): Promise<string> {
  const response = await client.rpc("resolve_stock_market_timezone", {
    p_game_session_id: gameSessionId,
  });

  if (response.error) {
    throw mapTimeZoneError(response.error);
  }

  try {
    return readRequiredStockMarketTimeZone({
      timezone: response.data,
    });
  } catch {
    throw new StockMarketRunnerError(
      "stock_market_state_load_failed",
      "Stock market timezone is missing or invalid for this game.",
      500,
    );
  }
}

function mapTimeZoneError(
  error: SupabaseStockMarketTimeZoneError,
): StockMarketRunnerError {
  const normalized = error.message.toUpperCase();

  if (
    normalized.includes("STOCK_MARKET_TIMEZONE_REQUIRED") ||
    normalized.includes("STOCK_MARKET_TIMEZONE_INVALID")
  ) {
    return new StockMarketRunnerError(
      "stock_market_state_load_failed",
      "Stock market timezone is missing or invalid for this game.",
      500,
    );
  }

  if (isSchemaNotAppliedError(error)) {
    return new StockMarketRunnerError(
      "stock_market_schema_not_applied",
      "Stock market timezone schema is not applied.",
      500,
    );
  }

  return new StockMarketRunnerError(
    "stock_market_state_load_failed",
    "Stock market timezone setting could not be loaded.",
    500,
  );
}

function isSchemaNotAppliedError(
  error: SupabaseStockMarketTimeZoneError,
): boolean {
  const message = error.message.toLowerCase();
  return error.code === "42883" ||
    error.code === "42P01" ||
    message.includes("does not exist") ||
    message.includes("schema cache");
}
