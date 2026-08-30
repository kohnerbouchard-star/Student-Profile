import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import { StockMarketTradingError } from "../contracts/stockMarketTradingContracts.ts";
import {
  parsePlayerStockMarketTradingValue,
  type PlayerStockMarketTradingBody,
} from "./playerStockMarketTradingInput.ts";

const MAX_BODY_BYTES = 16_384;
const UUID_ANY =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;

export async function readPlayerStockMarketTradingBody(
  request: Request,
): Promise<PlayerStockMarketTradingBody> {
  if (!/^application\/json(?:\s*;|$)/iu.test(
    String(request.headers.get("content-type") || ""),
  )) throw invalidRequest("Request body must use application/json.");

  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw invalidRequest("Request body is too large.");
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) throw invalidRequest("Request body is too large.");

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (_error) {
    throw invalidRequest("Request body must be valid JSON.");
  }
  if (!isRecord(value)) throw invalidRequest("Request body must be a JSON object.");
  if (UUID_ANY.test(JSON.stringify(value))) {
    throw invalidRequest(
      "Player Stock trading accepts public keys and ticker symbols, not UUIDs.",
    );
  }
  return parsePlayerStockMarketTradingValue(request, value);
}

function invalidRequest(message: string): StockMarketTradingError {
  return new StockMarketTradingError(
    "invalid_stock_market_trading_request",
    message,
    400,
  );
}
