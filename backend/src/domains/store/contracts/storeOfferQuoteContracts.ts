export const BUSINESS_STORE_OFFER_QUOTE_PRICING_VERSION =
  "business-offer-fixed-price-v2" as const;

export type StoreOfferQuoteStatus = "created" | "used" | "expired" | "cancelled";

export interface CreateBusinessStoreOfferQuoteCommand {
  readonly gameSessionId: string;
  readonly buyerPlayerId: string;
  readonly offerKey: string;
  readonly quantity: number;
  readonly expectedOfferVersion: number;
  readonly idempotencyKey: string;
}

export interface BusinessStoreOfferQuoteDto {
  readonly quoteKey: string;
  readonly quoteStatus: StoreOfferQuoteStatus;
  readonly offerKey: string;
  readonly offerVersion: number;
  readonly businessKey: string;
  readonly sellerPartyKey: string;
  readonly catalogItemKey: string;
  readonly canonicalItemKey: string;
  readonly storeItemKey: string;
  readonly inventoryAccountKey: string;
  readonly buyerCountryCode: string;
  readonly quantity: number;
  readonly availableQuantityAtQuote: number;
  readonly sellerUnitPrice: number;
  readonly finalUnitPrice: number;
  readonly sellerTotalPrice: number;
  readonly finalTotalPrice: number;
  readonly sellerCurrencyCode: string;
  readonly buyerCurrencyCode: string;
  readonly exchangeRate: number;
  readonly pricingVersion: typeof BUSINESS_STORE_OFFER_QUOTE_PRICING_VERSION;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly replayed: boolean;
}

export interface StoreOfferQuoteRepository {
  createBusinessOfferQuote(
    command: CreateBusinessStoreOfferQuoteCommand,
  ): Promise<BusinessStoreOfferQuoteDto>;
}

export class StoreOfferQuoteContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StoreOfferQuoteContractError";
    this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PATTERNS = {
  quoteKey: /^quote_[0-9a-f]{32}$/u,
  offerKey: /^sof_[0-9a-f]{32}$/u,
  businessKey: /^biz_[0-9a-f]{32}$/u,
  sellerPartyKey: /^pty_[0-9a-f]{32}$/u,
  catalogItemKey: /^itm_[0-9a-f]{32}$/u,
  inventoryAccountKey: /^iac_[0-9a-f]{32}$/u,
  canonicalItemKey: /^[a-z0-9][a-z0-9._-]{0,159}$/u,
  storeItemKey: /^[a-z0-9_-]{1,64}$/u,
  buyerCountryCode: /^[A-Z][A-Z0-9_]{2,31}$/u,
  currency: /^[A-Z0-9_]{3,16}$/u,
} as const;

export function normalizeBusinessStoreOfferQuoteCommand(
  value: CreateBusinessStoreOfferQuoteCommand,
): CreateBusinessStoreOfferQuoteCommand {
  const idempotencyKey = typeof value.idempotencyKey === "string"
    ? value.idempotencyKey.trim()
    : "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) {
    fail("invalid_store_offer_quote_command", "idempotencyKey must contain 8 to 160 characters.");
  }
  const quantity = integer(value.quantity, "quantity", true);
  if (quantity > 1_000_000) {
    fail("invalid_store_offer_quote_command", "quantity must not exceed 1000000.");
  }
  return {
    gameSessionId: commandPattern(value.gameSessionId, UUID, "gameSessionId"),
    buyerPlayerId: commandPattern(value.buyerPlayerId, UUID, "buyerPlayerId"),
    offerKey: commandPattern(value.offerKey, PATTERNS.offerKey, "offerKey"),
    quantity,
    expectedOfferVersion: integer(
      value.expectedOfferVersion,
      "expectedOfferVersion",
      true,
    ),
    idempotencyKey,
  };
}

export function parseBusinessStoreOfferQuote(
  value: unknown,
): BusinessStoreOfferQuoteDto {
  const row = record(value);
  const quantity = integer(row.quantity, "quantity", true);
  const available = integer(row.availableQuantityAtQuote, "availableQuantityAtQuote");
  if (available < quantity) resultFail("availableQuantityAtQuote must cover quantity.");

  const sellerUnit = money(row.sellerUnitPrice, "sellerUnitPrice");
  const finalUnit = money(row.finalUnitPrice, "finalUnitPrice");
  const sellerTotal = money(row.sellerTotalPrice, "sellerTotalPrice");
  const finalTotal = money(row.finalTotalPrice, "finalTotalPrice");
  if (
    sellerUnit <= 0 || sellerUnit !== finalUnit || sellerTotal !== finalTotal ||
    sellerTotal !== round4(sellerUnit * quantity)
  ) {
    resultFail("Quote prices must preserve the exact seller price and quantity total.");
  }

  const sellerCurrency = pattern(row.sellerCurrencyCode, PATTERNS.currency, "sellerCurrencyCode");
  const buyerCurrency = pattern(row.buyerCurrencyCode, PATTERNS.currency, "buyerCurrencyCode");
  const exchangeRate = Number(row.exchangeRate);
  if (sellerCurrency !== buyerCurrency || exchangeRate !== 1) {
    resultFail("Checkpoint 10A.2 quotes must settle in one currency with exchangeRate 1.");
  }
  if (row.pricingVersion !== BUSINESS_STORE_OFFER_QUOTE_PRICING_VERSION) {
    resultFail("pricingVersion is not the fixed Business offer policy.");
  }

  const createdAt = timestamp(row.createdAt, "createdAt");
  const expiresAt = timestamp(row.expiresAt, "expiresAt");
  const lifetime = Date.parse(expiresAt) - Date.parse(createdAt);
  if (lifetime <= 0 || lifetime > 600_000) resultFail("Quote expiry is invalid.");

  return {
    quoteKey: pattern(row.quoteKey, PATTERNS.quoteKey, "quoteKey"),
    quoteStatus: status(row.quoteStatus),
    offerKey: pattern(row.offerKey, PATTERNS.offerKey, "offerKey"),
    offerVersion: integer(row.offerVersion, "offerVersion", true),
    businessKey: pattern(row.businessKey, PATTERNS.businessKey, "businessKey"),
    sellerPartyKey: pattern(row.sellerPartyKey, PATTERNS.sellerPartyKey, "sellerPartyKey"),
    catalogItemKey: pattern(row.catalogItemKey, PATTERNS.catalogItemKey, "catalogItemKey"),
    canonicalItemKey: pattern(row.canonicalItemKey, PATTERNS.canonicalItemKey, "canonicalItemKey"),
    storeItemKey: pattern(row.storeItemKey, PATTERNS.storeItemKey, "storeItemKey"),
    inventoryAccountKey: pattern(
      row.inventoryAccountKey,
      PATTERNS.inventoryAccountKey,
      "inventoryAccountKey",
    ),
    buyerCountryCode: pattern(
      row.buyerCountryCode,
      PATTERNS.buyerCountryCode,
      "buyerCountryCode",
    ),
    quantity,
    availableQuantityAtQuote: available,
    sellerUnitPrice: sellerUnit,
    finalUnitPrice: finalUnit,
    sellerTotalPrice: sellerTotal,
    finalTotalPrice: finalTotal,
    sellerCurrencyCode: sellerCurrency,
    buyerCurrencyCode: buyerCurrency,
    exchangeRate,
    pricingVersion: BUSINESS_STORE_OFFER_QUOTE_PRICING_VERSION,
    createdAt,
    expiresAt,
    replayed: boolean(row.replayed, "replayed"),
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_store_offer_quote_contract", "Quote result must be an object.");
  }
  return value as Record<string, unknown>;
}
function commandPattern(value: unknown, regex: RegExp, label: string): string {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!regex.test(text)) fail("invalid_store_offer_quote_command", `${label} has an invalid public format.`);
  return text;
}
function pattern(value: unknown, regex: RegExp, label: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!regex.test(text)) fail("invalid_store_offer_quote_contract", `${label} has an invalid public format.`);
  return text;
}
function integer(value: unknown, label: string, positive = false): number {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue < (positive ? 1 : 0)) {
    fail("invalid_store_offer_quote_contract", `${label} must be ${positive ? "a positive" : "a non-negative"} integer.`);
  }
  return numberValue;
}
function money(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    fail("invalid_store_offer_quote_contract", `${label} must be non-negative and finite.`);
  }
  return round4(numberValue);
}
function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}
function timestamp(value: unknown, label: string): string {
  const text = typeof value === "string" ? value : "";
  if (!Number.isFinite(Date.parse(text))) fail("invalid_store_offer_quote_contract", `${label} must be an ISO timestamp.`);
  return new Date(text).toISOString();
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") fail("invalid_store_offer_quote_contract", `${label} must be boolean.`);
  return value;
}
function status(value: unknown): StoreOfferQuoteStatus {
  if (value === "created" || value === "used" || value === "expired" || value === "cancelled") return value;
  fail("invalid_store_offer_quote_contract", "quoteStatus is invalid.");
}
function resultFail(message: string): never {
  fail("invalid_store_offer_quote_result", message);
}
function fail(code: string, message: string): never {
  throw new StoreOfferQuoteContractError(code, message);
}
