import {
  ApiConnectionPendingError,
  ApiRequestError,
  playerSafeErrorMessage,
} from "../../api/errors.js";

const PUBLIC = Object.freeze({
  offer: /^sof_[0-9a-f]{32}$/u,
  quote: /^quote_[0-9a-f]{32}$/u,
  receipt: /^spr_[0-9a-f]{32}$/u,
  business: /^biz_[0-9a-f]{32}$/u,
  party: /^pty_[0-9a-f]{32}$/u,
  catalogItem: /^itm_[0-9a-f]{32}$/u,
  canonicalItem: /^[a-z0-9][a-z0-9._-]{0,159}$/u,
  storeItem: /^[a-z0-9_-]{1,64}$/u,
  currency: /^[A-Z0-9_]{3,16}$/u,
  uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu,
});

const BUSINESS_QUOTE_FIELDS = Object.freeze([
  "quoteKey", "quoteStatus", "offerKey", "offerVersion", "businessKey",
  "businessName", "sellerPartyKey", "sellerName", "catalogItemKey",
  "canonicalItemKey", "storeItemKey", "quantity", "availableQuantityAtQuote",
  "unitPrice", "totalPrice", "currencyCode", "expiresAt", "pricingVersion",
  "replayed",
]);
const BUSINESS_RECEIPT_FIELDS = Object.freeze([
  "receiptKey", "quoteKey", "offerKey", "businessKey", "businessName",
  "sellerPartyKey", "sellerName", "catalogItemKey", "canonicalItemKey",
  "storeItemKey", "quantity", "unitPrice", "totalPrice", "currencyCode",
  "offerVersionBefore", "offerVersionAfter", "remainingListedQuantity",
  "completedAt", "alreadyCompleted",
]);
const RESET_QUOTE_CODES = new Set([
  "STORE_INSUFFICIENT_STOCK",
  "STORE_ITEM_NOT_AVAILABLE",
  "STORE_OFFER_CONFLICT",
  "STORE_OFFER_INVENTORY_RESERVED",
  "STORE_OFFER_NOT_AVAILABLE",
  "STORE_OFFER_PURCHASE_UNAVAILABLE",
  "STORE_OFFER_VERSION_CONFLICT",
  "STORE_OFFER_WITHDRAWAL_PENDING",
  "STORE_OFFER_QUOTE_BUSINESS_UNAVAILABLE",
  "STORE_OFFER_QUOTE_CATALOG_UNAVAILABLE",
  "STORE_OFFER_QUOTE_CUSTODY_UNAVAILABLE",
  "STORE_OFFER_QUOTE_INSUFFICIENT_STOCK",
  "STORE_OFFER_QUOTE_INVENTORY_RESERVED",
  "STORE_OFFER_QUOTE_ITEM_UNAVAILABLE",
  "STORE_OFFER_QUOTE_LISTING_NOT_FOUND",
  "STORE_OFFER_QUOTE_OFFER_NOT_FOUND",
  "STORE_OFFER_QUOTE_OFFER_STATUS_INVALID",
  "STORE_OFFER_QUOTE_OFFER_VERSION_CONFLICT",
  "STORE_OFFER_QUOTE_PARTY_UNAVAILABLE",
  "STORE_OFFER_SETTLEMENT_CATALOG_UNAVAILABLE",
  "STORE_OFFER_SETTLEMENT_CUSTODY_UNAVAILABLE",
  "STORE_OFFER_SETTLEMENT_INSUFFICIENT_STOCK",
  "STORE_OFFER_SETTLEMENT_INVENTORY_RESERVED",
  "STORE_OFFER_SETTLEMENT_INVENTORY_UNAVAILABLE",
  "STORE_OFFER_SETTLEMENT_ITEM_UNAVAILABLE",
  "STORE_OFFER_SETTLEMENT_LISTING_NOT_FOUND",
  "STORE_OFFER_SETTLEMENT_MONEY_UNAVAILABLE",
  "STORE_OFFER_SETTLEMENT_OFFER_CONFLICT",
  "STORE_OFFER_SETTLEMENT_OFFER_NOT_FOUND",
  "STORE_OFFER_SETTLEMENT_OFFER_STATUS_INVALID",
  "STORE_OFFER_SETTLEMENT_OFFER_VERSION_CONFLICT",
  "STORE_OFFER_SETTLEMENT_PARTY_UNAVAILABLE",
  "STORE_OFFER_SETTLEMENT_QUOTE_EXPIRED",
  "STORE_OFFER_SETTLEMENT_QUOTE_MISMATCH",
  "STORE_OFFER_SETTLEMENT_QUOTE_NOT_FOUND",
  "STORE_OFFER_SETTLEMENT_QUOTE_STATUS_INVALID",
  "STORE_QUOTE_ALREADY_USED",
  "STORE_QUOTE_EXPIRED",
  "STORE_QUOTE_NOT_AVAILABLE",
  "STORE_QUOTE_NOT_FOUND",
]);

function safeMessage(error, defaultMessage) {
  if (error instanceof ApiConnectionPendingError) {
    return "Store purchasing is awaiting the authoritative backend connection.";
  }
  const code = String(error?.code || "").trim().toUpperCase();
  const status = Number(error?.status || 0);
  if (code || status) return playerSafeErrorMessage({ status, code });
  return String(error?.message || defaultMessage || "The Store request could not be completed.");
}

function invalidStoreResponse() {
  return new ApiRequestError("The Store returned an invalid public response. Refresh the Store before trying again.", {
    code: "INVALID_RESPONSE",
    endpointKey: "store",
  });
}

function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || PUBLIC.uuid.test(JSON.stringify(value))) {
    throw invalidStoreResponse();
  }
  return value;
}

function exactPublicFields(value, fields) {
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw invalidStoreResponse();
  }
}

function exactMoney(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw invalidStoreResponse();
  }
  const rounded = Math.round((value + Number.EPSILON) * 10_000) / 10_000;
  if (value !== rounded) throw invalidStoreResponse();
  return value;
}

function textMatches(value, expected, pattern) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!pattern.test(candidate) || (expected && candidate !== expected)) throw invalidStoreResponse();
  return candidate;
}

export function storeQuoteFromOperation(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const quote = result.quote;
  return quote && typeof quote === "object" && !Array.isArray(quote) ? quote : result;
}

function storeReceiptFromOperation(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const receipt = result.receipt;
  return receipt && typeof receipt === "object" && !Array.isArray(receipt) ? receipt : result;
}

export function validateBusinessOfferQuote(result, { item, offer, quantity, now = Date.now() }) {
  const quote = record(storeQuoteFromOperation(result));
  exactPublicFields(quote, BUSINESS_QUOTE_FIELDS);
  textMatches(quote.quoteKey, "", PUBLIC.quote);
  if (quote.quoteStatus !== "created") throw invalidStoreResponse();
  textMatches(quote.offerKey, offer.offerKey, PUBLIC.offer);
  if (!Number.isSafeInteger(quote.offerVersion) || quote.offerVersion !== offer.version) throw invalidStoreResponse();
  textMatches(quote.businessKey, offer.businessKey, PUBLIC.business);
  if (quote.businessName !== offer.businessName || quote.sellerName !== offer.sellerName) throw invalidStoreResponse();
  textMatches(quote.sellerPartyKey, offer.sellerPartyKey || offer.sellerKey, PUBLIC.party);
  textMatches(quote.catalogItemKey, item.catalogItemKey, PUBLIC.catalogItem);
  textMatches(quote.canonicalItemKey, item.canonicalItemKey, PUBLIC.canonicalItem);
  textMatches(quote.storeItemKey, item.storeItemKey || item.itemKey || item.id, PUBLIC.storeItem);
  if (
    !Number.isSafeInteger(quote.quantity) || quote.quantity !== quantity ||
    !Number.isSafeInteger(quote.availableQuantityAtQuote) ||
    quote.availableQuantityAtQuote < quantity
  ) throw invalidStoreResponse();
  const unitPrice = exactMoney(quote.unitPrice);
  const totalPrice = exactMoney(quote.totalPrice);
  if (unitPrice <= 0 || unitPrice !== offer.unitPrice || totalPrice !== exactMoney(unitPrice * quantity)) {
    throw invalidStoreResponse();
  }
  textMatches(quote.currencyCode, offer.currencyCode, PUBLIC.currency);
  const expiresAt = typeof quote.expiresAt === "string" ? Date.parse(quote.expiresAt) : Number.NaN;
  if (
    !Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== quote.expiresAt ||
    expiresAt <= now || quote.pricingVersion !== "business-offer-fixed-price-v2" ||
    typeof quote.replayed !== "boolean"
  ) {
    throw invalidStoreResponse();
  }
  return Object.freeze({ ...quote });
}

export function validateBusinessOfferReceipt(result, { item, offer, quote }) {
  const receipt = record(storeReceiptFromOperation(result));
  exactPublicFields(receipt, BUSINESS_RECEIPT_FIELDS);
  textMatches(receipt.receiptKey, "", PUBLIC.receipt);
  textMatches(receipt.quoteKey, quote.quoteKey, PUBLIC.quote);
  textMatches(receipt.offerKey, quote.offerKey, PUBLIC.offer);
  textMatches(receipt.businessKey, quote.businessKey, PUBLIC.business);
  if (receipt.businessName !== quote.businessName || receipt.sellerName !== quote.sellerName) throw invalidStoreResponse();
  textMatches(receipt.sellerPartyKey, quote.sellerPartyKey, PUBLIC.party);
  textMatches(receipt.catalogItemKey, item.catalogItemKey, PUBLIC.catalogItem);
  textMatches(receipt.canonicalItemKey, item.canonicalItemKey, PUBLIC.canonicalItem);
  textMatches(receipt.storeItemKey, item.storeItemKey || item.itemKey || item.id, PUBLIC.storeItem);
  const unitPrice = exactMoney(receipt.unitPrice);
  const totalPrice = exactMoney(receipt.totalPrice);
  if (
    !Number.isSafeInteger(receipt.quantity) || receipt.quantity !== quote.quantity ||
    unitPrice !== quote.unitPrice || totalPrice !== quote.totalPrice ||
    receipt.currencyCode !== quote.currencyCode ||
    receipt.offerVersionBefore !== quote.offerVersion ||
    receipt.offerVersionAfter !== receipt.offerVersionBefore + 1 ||
    !Number.isSafeInteger(receipt.remainingListedQuantity) || receipt.remainingListedQuantity < 0 ||
    typeof receipt.completedAt !== "string" ||
    !Number.isFinite(Date.parse(receipt.completedAt)) ||
    new Date(receipt.completedAt).toISOString() !== receipt.completedAt ||
    typeof receipt.alreadyCompleted !== "boolean" ||
    offer.offerKey !== receipt.offerKey
  ) throw invalidStoreResponse();
  return Object.freeze({ ...receipt });
}

export function validateImmutableBusinessOfferReceipt(result, { item, offer, quote, committedReceipt }) {
  const committed = record(committedReceipt);
  exactPublicFields(committed, BUSINESS_RECEIPT_FIELDS);
  const immutable = validateBusinessOfferReceipt(result, { item, offer, quote });
  for (const field of BUSINESS_RECEIPT_FIELDS) {
    if (field === "alreadyCompleted") continue;
    if (immutable[field] !== committed[field]) throw invalidStoreResponse();
  }
  if (
    immutable.alreadyCompleted !== committed.alreadyCompleted &&
    !(committed.alreadyCompleted === false && immutable.alreadyCompleted === true)
  ) throw invalidStoreResponse();
  return immutable;
}

export function validateSeededQuote(result, { item, quantity }) {
  const quote = record(storeQuoteFromOperation(result));
  textMatches(quote.quoteKey, "", PUBLIC.quote);
  if (
    String(quote.itemKey || item.itemKey || item.id) !== String(item.itemKey || item.id) ||
    Number(quote.quantity) !== quantity ||
    !Number.isFinite(Number(quote.finalUnitPrice)) || Number(quote.finalUnitPrice) < 0 ||
    !Number.isFinite(Number(quote.finalTotalPrice)) ||
    Number(quote.finalTotalPrice) !== Number(quote.finalUnitPrice) * quantity ||
    !PUBLIC.currency.test(String(quote.currencyCode || "")) ||
    !Number.isFinite(Date.parse(String(quote.expiresAt || "")))
  ) throw invalidStoreResponse();
  return Object.freeze({ ...quote });
}

export function validateSeededReceipt(result, { item, quote }) {
  const receipt = record(storeReceiptFromOperation(result));
  textMatches(receipt.quoteKey, quote.quoteKey, PUBLIC.quote);
  if (
    !/^receipt_[0-9a-f]{32}$/u.test(String(receipt.receiptKey || "")) ||
    String(receipt.itemKey || item.itemKey || item.id) !== String(item.itemKey || item.id) ||
    Number(receipt.quantity) !== Number(quote.quantity) ||
    Number(receipt.finalTotalPrice) !== Number(quote.finalTotalPrice) ||
    receipt.currencyCode !== quote.currencyCode
  ) throw invalidStoreResponse();
  return Object.freeze({ ...receipt });
}

export function resolveStorePurchaseFailure(error, defaultMessage = "The Store purchase could not be completed.") {
  const code = String(error?.code || "").trim().toUpperCase();
  const status = Number(error?.status || 0);
  return Object.freeze({
    code,
    status,
    message: safeMessage(error, defaultMessage),
    resetQuote: RESET_QUOTE_CODES.has(code),
    retryable: code === "STORE_PURCHASE_IN_PROGRESS" || error?.retryable === true,
    sessionInvalid: status === 401,
  });
}

export function dispatchStoreSessionInvalid(error, config = {}, runtime = globalThis) {
  const failure = resolveStorePurchaseFailure(error);
  if (!failure.sessionInvalid) return false;
  const detail = Object.freeze({
    reason: "invalid_player_session",
    terminal: "player",
    status: failure.status || 401,
    code: failure.code || "SESSION_INVALID",
    requestId: String(error?.requestId || ""),
  });
  try {
    if (typeof config.onSessionInvalid === "function") config.onSessionInvalid(detail);
  } catch {
    // Host callbacks cannot block the safe recovery event.
  }
  const eventName = String(config.sessionInvalidEvent || "econovaria:player-session-invalid");
  if (typeof runtime.CustomEvent === "function" && typeof runtime.dispatchEvent === "function") {
    runtime.dispatchEvent(new runtime.CustomEvent(eventName, { detail }));
  }
  return true;
}

export function quoteExpired(quote) {
  const expiresAt = Date.parse(String(quote?.expiresAt || ""));
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

export function createSeededStoreOffer(item) {
  const itemKey = String(item?.itemKey || item?.id || "");
  const availableQuantity = Math.max(0, Math.trunc(Number(item?.stock) || 0));
  return {
    offerKey: `seeded:${itemKey}`,
    sellerPartyKey: `seeded:${itemKey}`,
    sellerKey: `seeded:${itemKey}`,
    sellerKind: "seeded",
    sellerName: "Econovaria Store",
    businessKey: null,
    businessName: null,
    unitPrice: Number(item?.price) || 0,
    currencyCode: String(item?.currencyCode || "ECO"),
    availableQuantity,
    status: "active",
    purchasability: "seeded_offer",
    purchasable: availableQuantity > 0,
    version: 1,
  };
}
