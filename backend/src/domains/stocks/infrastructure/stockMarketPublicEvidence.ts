import {
  type StockMarketPublicEvidence,
  StockMarketTradingError,
} from "../contracts/stockMarketTradingContracts.ts";

const UUID_ANY =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
export const STOCK_BUY_QUOTE_KEY = /^sbq_[0-9a-f]{32}$/u;
export const BANK_ACCOUNT_KEY = /^bac_[0-9a-f]{32}$/u;
export const BANK_TRANSACTION_KEY = /^btx_[0-9a-f]{32}$/u;
export const CURRENCY_CODE = /^[A-Z0-9_]{3,16}$/u;
export const STOCK_TICKER = /^[A-Z0-9][A-Z0-9._-]{0,31}$/u;
const MAX_PUBLIC_DEPTH = 12;
const MAX_PUBLIC_KEYS = 300;
const MAX_PUBLIC_ARRAY = 1000;
const MAX_PUBLIC_TEXT = 5000;

export function stockPublicEvidence(value: unknown): StockMarketPublicEvidence {
  const cloned = clonePublicJson(value, 0);
  if (!cloned || typeof cloned !== "object" || Array.isArray(cloned)) {
    throw invalidPublicResponse();
  }
  return Object.freeze(cloned as Record<string, unknown>);
}

export function stockPublicRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidPublicResponse();
  }
  if (UUID_ANY.test(JSON.stringify(value))) throw invalidPublicResponse();
  return value as Record<string, unknown>;
}

export function stockPublicKey(value: unknown, pattern: RegExp): string {
  const candidate = stockPublicText(value);
  if (!pattern.test(candidate)) throw invalidPublicResponse();
  return candidate;
}

export function stockFiniteNumber(
  value: unknown,
  minimum = Number.NEGATIVE_INFINITY,
): number {
  const candidate = typeof value === "number"
    ? value
    : typeof value === "string" && /^-?[0-9]+(?:\.[0-9]+)?$/u.test(value)
    ? Number(value)
    : Number.NaN;
  if (
    !Number.isFinite(candidate) || candidate < minimum ||
    Math.abs(candidate) >= 1_000_000_000_000_000
  ) throw invalidPublicResponse();
  return candidate;
}

export function stockNonNegativeInteger(value: unknown): number {
  const candidate = Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 0) {
    throw invalidPublicResponse();
  }
  return candidate;
}

export function stockBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalidPublicResponse();
  return value;
}

export function stockIsoTimestamp(value: unknown): string {
  const candidate = stockPublicText(value);
  if (!Number.isFinite(Date.parse(candidate))) throw invalidPublicResponse();
  return new Date(candidate).toISOString();
}

function stockPublicText(value: unknown): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate || candidate.length > 400 || UUID_ANY.test(candidate)) {
    throw invalidPublicResponse();
  }
  return candidate;
}

function clonePublicJson(value: unknown, depth: number): unknown {
  if (depth > MAX_PUBLIC_DEPTH) throw invalidPublicResponse();
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw invalidPublicResponse();
    return value;
  }
  if (typeof value === "string") {
    if (value.length > MAX_PUBLIC_TEXT || UUID_ANY.test(value)) {
      throw invalidPublicResponse();
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_PUBLIC_ARRAY) throw invalidPublicResponse();
    return Object.freeze(value.map((item) => clonePublicJson(item, depth + 1)));
  }
  if (!value || typeof value !== "object") throw invalidPublicResponse();
  const entries = Object.entries(value);
  if (entries.length > MAX_PUBLIC_KEYS) throw invalidPublicResponse();
  const output: Record<string, unknown> = {};
  for (const [key, child] of entries) {
    if (["__proto__", "constructor", "prototype"].includes(key)) {
      throw invalidPublicResponse();
    }
    output[key] = clonePublicJson(child, depth + 1);
  }
  return Object.freeze(output);
}

function invalidPublicResponse(): StockMarketTradingError {
  return new StockMarketTradingError(
    "stock_market_trading_failed",
    "Stock market trading returned an invalid public response.",
    500,
  );
}
