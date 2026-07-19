import {
  SEOUL_STOCK_MARKET_TIME_ZONE,
  resolveStockMarketWindowSettings,
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
    if (isSchemaNotAppliedError(response.error)) {
      return SEOUL_STOCK_MARKET_TIME_ZONE;
    }

    throw new StockMarketRunnerError(
      "stock_market_state_load_failed",
      "Stock market timezone setting could not be loaded.",
      500,
    );
  }

  return resolveStockMarketWindowSettings({
    timezone: response.data,
  }).timezone;
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
