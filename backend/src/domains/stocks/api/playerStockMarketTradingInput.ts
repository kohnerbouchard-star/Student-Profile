import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import {
  type StockMarketFundingAllocation,
  type PlayerStockMarketTradingAction,
  StockMarketTradingError,
} from "../contracts/stockMarketTradingContracts.ts";

export interface CreateBuyQuoteBody {
  readonly action: "create_buy_quote";
  readonly ticker: string;
  readonly quantity: number;
  readonly expectedPrice: number;
  readonly expectedTickIndex: number;
  readonly allocations: readonly StockMarketFundingAllocation[];
  readonly idempotencyKey: string;
}

export interface BuyNowBody {
  readonly action: "buy_now";
  readonly ticker: string;
  readonly quantity: number;
  readonly expectedPrice: number;
  readonly expectedTickIndex: number;
  readonly allocations: readonly StockMarketFundingAllocation[];
  readonly idempotencyKey: string;
}

export interface SettleBuyQuoteBody {
  readonly action: "settle_buy_quote";
  readonly quoteKey: string;
  readonly idempotencyKey: string;
}

export interface SettleSellBody {
  readonly action: "settle_sell";
  readonly ticker: string;
  readonly quantity: number;
  readonly expectedPrice: number;
  readonly expectedTickIndex: number;
  readonly destinationAccountKey: string;
  readonly idempotencyKey: string;
}

export type PlayerStockMarketTradingBody =
  | CreateBuyQuoteBody
  | BuyNowBody
  | SettleBuyQuoteBody
  | SettleSellBody;

type PlayerStockMarketRequestAction = PlayerStockMarketTradingAction | "buy_now";

const TICKER = /^[A-Z0-9][A-Z0-9._-]{0,31}$/u;
const STOCK_BUY_QUOTE_KEY = /^sbq_[0-9a-f]{32}$/u;
const BANK_ACCOUNT_KEY = /^bac_[0-9a-f]{32}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u;
const LEGACY_ORDER_FIELDS = new Set(["side", "orderType", "timeInForce", "limitPrice"]);

export function parsePlayerStockMarketTradingValue(
  request: Request,
  value: Record<string, unknown>,
): PlayerStockMarketTradingBody {
  const action = readAction(value);
  if (action === "create_buy_quote" || action === "buy_now") {
    assertExactKeys(value, [
      "action", "ticker", "quantity", "expectedPrice", "expectedTickIndex",
      "allocations", "idempotencyKey",
    ]);
    return {
      action,
      ticker: readTicker(value.ticker),
      quantity: readPositiveDecimal(value.quantity, "quantity", 4, 1_000_000),
      expectedPrice: readPositiveDecimal(
        value.expectedPrice,
        "expectedPrice",
        4,
        1_000_000_000_000,
      ),
      expectedTickIndex: readTickIndex(value.expectedTickIndex),
      allocations: readAllocations(value.allocations),
      idempotencyKey: readIdempotencyKey(request, value.idempotencyKey),
    };
  }
  if (action === "settle_buy_quote") {
    assertExactKeys(value, ["action", "quoteKey", "idempotencyKey"]);
    return {
      action,
      quoteKey: readPublicKey(value.quoteKey, "quoteKey", STOCK_BUY_QUOTE_KEY),
      idempotencyKey: readIdempotencyKey(request, value.idempotencyKey),
    };
  }
  assertExactKeys(value, [
    "action", "ticker", "quantity", "expectedPrice", "expectedTickIndex",
    "destinationAccountKey", "idempotencyKey",
  ]);
  return {
    action,
    ticker: readTicker(value.ticker),
    quantity: readPositiveDecimal(value.quantity, "quantity", 4, 1_000_000),
    expectedPrice: readPositiveDecimal(
      value.expectedPrice,
      "expectedPrice",
      4,
      1_000_000_000_000,
    ),
    expectedTickIndex: readTickIndex(value.expectedTickIndex),
    destinationAccountKey: readPublicKey(
      value.destinationAccountKey,
      "destinationAccountKey",
      BANK_ACCOUNT_KEY,
    ),
    idempotencyKey: readIdempotencyKey(request, value.idempotencyKey),
  };
}

function readAction(value: Record<string, unknown>): PlayerStockMarketRequestAction {
  const action = typeof value.action === "string" ? value.action.trim().toLowerCase() : "";
  if (["create_buy_quote", "buy_now", "settle_buy_quote", "settle_sell"].includes(action)) {
    return action as PlayerStockMarketRequestAction;
  }
  if (!action && Object.keys(value).some((key) => LEGACY_ORDER_FIELDS.has(key))) {
    throw new StockMarketTradingError(
      "stock_market_trading_retired",
      "The legacy one-step Stock order endpoint is retired. Create a buy quote and settle it, or submit an immediate sell with one destination Checking account.",
      410,
    );
  }
  throw invalidRequest("action must be create_buy_quote, buy_now, settle_buy_quote, or settle_sell.");
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw invalidRequest(
      "Player Stock trading derives game, Player, ownership, and internal asset scope server-side.",
    );
  }
}

function readAllocations(value: unknown): readonly StockMarketFundingAllocation[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw invalidRequest("allocations must contain one to three Checking accounts.");
  }
  const accountKeys = new Set<string>();
  return Object.freeze(value.map((entry) => {
    if (!isRecord(entry)) {
      throw invalidRequest("Each funding allocation must be a JSON object.");
    }
    assertExactKeys(entry, ["sourceAccountKey", "targetAmount"]);
    const sourceAccountKey = readPublicKey(
      entry.sourceAccountKey,
      "sourceAccountKey",
      BANK_ACCOUNT_KEY,
    );
    if (accountKeys.has(sourceAccountKey)) {
      throw invalidRequest("Each Checking account may be allocated only once.");
    }
    accountKeys.add(sourceAccountKey);
    return Object.freeze({
      sourceAccountKey,
      targetAmount: readPositiveDecimal(
        entry.targetAmount,
        "targetAmount",
        4,
        999_999_999_999_999,
      ),
    });
  }));
}

function readTicker(value: unknown): string {
  const ticker = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!TICKER.test(ticker)) {
    throw invalidRequest("ticker must be a valid public market ticker.");
  }
  return ticker;
}

function readPublicKey(value: unknown, fieldName: string, pattern: RegExp): string {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!pattern.test(key)) throw invalidRequest(`${fieldName} must be a valid public key.`);
  return key;
}

function readPositiveDecimal(
  value: unknown,
  fieldName: string,
  scale: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" || !Number.isFinite(value) || value <= 0 ||
    value >= maximum || Number(value.toFixed(scale)) !== value
  ) {
    throw invalidRequest(
      `${fieldName} must be a positive number with at most ${scale} decimal places.`,
    );
  }
  return value;
}

function readTickIndex(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw invalidRequest("expectedTickIndex must be a non-negative integer.");
  }
  return value;
}

function readIdempotencyKey(request: Request, bodyValue: unknown): string {
  const bodyKey = typeof bodyValue === "string" ? bodyValue.trim() : "";
  const headerKeys = [
    request.headers.get("x-idempotency-key"),
    request.headers.get("idempotency-key"),
  ].map((value) => String(value || "").trim()).filter(Boolean);
  if (new Set(headerKeys).size > 1) throw invalidRequest("Idempotency headers must agree.");
  const headerKey = headerKeys[0] || "";
  if (bodyKey && headerKey && bodyKey !== headerKey) {
    throw invalidRequest("Body and header idempotency keys must agree.");
  }
  const key = bodyKey || headerKey;
  if (!IDEMPOTENCY_KEY.test(key)) {
    throw invalidRequest("idempotencyKey must be 8 to 160 safe characters.");
  }
  return key;
}

function invalidRequest(message: string): StockMarketTradingError {
  return new StockMarketTradingError(
    "invalid_stock_market_trading_request",
    message,
    400,
  );
}
