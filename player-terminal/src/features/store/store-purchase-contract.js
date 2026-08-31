import {
  ApiConnectionPendingError,
  ApiRequestError,
  playerSafeErrorMessage,
} from "../../api/errors.js";
import {
  validateStoreFundingQuoteEvidence,
  validateStoreFundingReceiptEvidence,
} from "./store-funding-intent.js";

const PUBLIC = Object.freeze({
  offer: /^sof_[0-9a-f]{32}$/u,
  quote: /^quote_[0-9a-f]{32}$/u,
  receipt: /^spr_[0-9a-f]{32}$/u,
  business: /^biz_[0-9a-f]{32}$/u,
  party: /^pty_[0-9a-f]{32}$/u,
  catalogItem: /^itm_[0-9a-f]{32}$/u,
  inventoryTransaction: /^itx_[0-9a-f]{32}$/u,
  canonicalItem: /^[a-z0-9][a-z0-9._-]{0,159}$/u,
  storeItem: /^[a-z0-9_-]{1,64}$/u,
  currency: /^[A-Z0-9_]{3,16}$/u,
  contextDigest: /^[0-9a-f]{64}$/u,
  uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu,
});

const BUSINESS_QUOTE_FIELDS = Object.freeze([
  "quoteKey", "quoteStatus", "offerKey", "offerVersion", "businessKey",
  "businessName", "sellerPartyKey", "sellerName", "catalogItemKey",
  "canonicalItemKey", "storeItemKey", "quantity", "availableQuantityAtQuote",
  "unitPrice", "totalPrice", "currencyCode", "expiresAt", "pricingVersion",
  "replayed", "contextDigest", "fundingQuote",
]);
const BUSINESS_RECEIPT_FIELDS = Object.freeze([
  "receiptKey", "quoteKey", "offerKey", "businessKey", "businessName",
  "sellerPartyKey", "sellerName", "catalogItemKey", "canonicalItemKey",
  "storeItemKey", "inventoryTransactionKey", "quantity", "unitPrice", "totalPrice",
  "sellerProceeds", "currencyCode",
  "offerVersionBefore", "offerVersionAfter", "remainingListedQuantity",
  "completedAt", "alreadyCompleted", "contextDigest", "fundingReceipt",
]);
const SYSTEM_OFFER_QUOTE_FIELDS = Object.freeze([
  "quoteKey", "quoteStatus", "itemKey", "itemName", "quantity", "baseUnitPrice",
  "inflationMultiplier", "locationMultiplier", "scarcityMultiplier", "discountAmount",
  "finalUnitPrice", "finalTotalPrice", "currencyCode", "itemCurrencyCode",
  "playerCurrencyCode", "exchangeRate", "itemLocalFinalUnitPrice",
  "itemLocalFinalTotalPrice", "expiresAt", "pricingVersion", "replayed",
  "offerKey", "offerVersion", "sellerKind", "sellerPartyKey", "sellerName",
  "availableQuantityAtQuote",
  "contextDigest", "fundingQuote",
]);
const SYSTEM_OFFER_RECEIPT_FIELDS = Object.freeze([
  "receiptKey", "quoteKey", "itemKey", "itemName", "quantity", "finalUnitPrice",
  "finalTotalPrice", "currencyCode", "inventoryQuantityOwned", "inventoryTransactionKey",
  "offerKey", "sellerKind", "sellerPartyKey", "sellerName", "offerVersionBefore",
  "offerVersionAfter", "remainingSellerQuantity", "sellerProceeds",
  "completedAt", "alreadyCompleted", "contextDigest", "fundingReceipt",
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

export function validateBusinessOfferQuote(result, { item, offer, quantity, allocationIntent = null, now = Date.now() }) {
  const quote = record(storeQuoteFromOperation(result));
  exactPublicFields(quote, BUSINESS_QUOTE_FIELDS);
  textMatches(quote.quoteKey, "", PUBLIC.quote);
  textMatches(quote.contextDigest, "", PUBLIC.contextDigest);
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
  const fundingQuote = validateStoreFundingQuoteEvidence(quote.fundingQuote, {
    commercialQuoteKey: quote.quoteKey,
    targetCurrencyCode: quote.currencyCode,
    targetAmount: quote.totalPrice,
    fundingContextKind: "store.business-offer",
    commercialExpiresAt: quote.expiresAt,
    allocationIntent,
  });
  return Object.freeze({ ...quote, fundingQuote });
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
  textMatches(receipt.inventoryTransactionKey, "", PUBLIC.inventoryTransaction);
  textMatches(receipt.contextDigest, quote.contextDigest, PUBLIC.contextDigest);
  const unitPrice = exactMoney(receipt.unitPrice);
  const totalPrice = exactMoney(receipt.totalPrice);
  const sellerProceeds = exactMoney(receipt.sellerProceeds);
  if (
    !Number.isSafeInteger(receipt.quantity) || receipt.quantity !== quote.quantity ||
    unitPrice !== quote.unitPrice || totalPrice !== quote.totalPrice || sellerProceeds !== quote.totalPrice ||
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
  const fundingReceipt = validateStoreFundingReceiptEvidence(receipt.fundingReceipt, {
    quote: quote.fundingQuote,
    sourceAction: "business_offer_purchase_funding",
  });
  return Object.freeze({ ...receipt, fundingReceipt });
}

export function validateImmutableBusinessOfferReceipt(result, { item, offer, quote, committedReceipt }) {
  const committed = record(committedReceipt);
  exactPublicFields(committed, BUSINESS_RECEIPT_FIELDS);
  const immutable = validateBusinessOfferReceipt(result, { item, offer, quote });
  for (const field of BUSINESS_RECEIPT_FIELDS) {
    if (field === "alreadyCompleted") continue;
    if (field === "fundingReceipt") {
      if (JSON.stringify(immutable[field]) !== JSON.stringify(committed[field])) throw invalidStoreResponse();
      continue;
    }
    if (immutable[field] !== committed[field]) throw invalidStoreResponse();
  }
  if (
    immutable.alreadyCompleted !== committed.alreadyCompleted &&
    !(committed.alreadyCompleted === false && immutable.alreadyCompleted === true)
  ) throw invalidStoreResponse();
  return immutable;
}

export function validateSystemOfferQuote(result, { item, offer, quantity, allocationIntent = null }) {
  const quote = record(storeQuoteFromOperation(result));
  exactPublicFields(quote, SYSTEM_OFFER_QUOTE_FIELDS);
  textMatches(quote.quoteKey, "", PUBLIC.quote);
  textMatches(quote.contextDigest, "", PUBLIC.contextDigest);
  textMatches(quote.offerKey, offer.offerKey, PUBLIC.offer);
  textMatches(quote.sellerPartyKey, offer.sellerPartyKey || offer.sellerKey, PUBLIC.party);
  const sellerKind = String(offer.sellerKind || "");
  const expiresAt = typeof quote.expiresAt === "string" ? Date.parse(quote.expiresAt) : Number.NaN;
  if (
    quote.quoteStatus !== "created" ||
    !new Set(["seeded", "npc"]).has(sellerKind) || quote.sellerKind !== sellerKind ||
    quote.sellerName !== offer.sellerName ||
    !Number.isSafeInteger(quote.offerVersion) || quote.offerVersion !== offer.version ||
    !Number.isSafeInteger(quote.availableQuantityAtQuote) ||
    quote.availableQuantityAtQuote < quantity || quote.availableQuantityAtQuote > offer.availableQuantity ||
    String(quote.itemKey || item.itemKey || item.id) !== String(item.itemKey || item.id) ||
    !Number.isSafeInteger(quote.quantity) || quote.quantity !== quantity ||
    exactMoney(quote.baseUnitPrice) !== exactMoney(offer.unitPrice) ||
    exactMoney(quote.finalUnitPrice) <= 0 ||
    exactMoney(quote.finalTotalPrice) !== exactMoney(quote.finalUnitPrice * quantity) ||
    textMatches(quote.currencyCode, offer.currencyCode, PUBLIC.currency) !== quote.currencyCode ||
    quote.itemCurrencyCode !== quote.currencyCode || quote.playerCurrencyCode !== quote.currencyCode ||
    quote.exchangeRate !== 1 || quote.itemLocalFinalUnitPrice !== quote.finalUnitPrice ||
    quote.itemLocalFinalTotalPrice !== quote.finalTotalPrice ||
    !Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== quote.expiresAt ||
    expiresAt <= Date.now() ||
    typeof quote.pricingVersion !== "string" ||
    !quote.pricingVersion.startsWith(`store-system-offer-funded-v2:${sellerKind}:`) ||
    typeof quote.replayed !== "boolean"
  ) throw invalidStoreResponse();
  const fundingQuote = validateStoreFundingQuoteEvidence(quote.fundingQuote, {
    commercialQuoteKey: quote.quoteKey,
    targetCurrencyCode: quote.currencyCode,
    targetAmount: quote.finalTotalPrice,
    fundingContextKind: "store.system-offer",
    commercialExpiresAt: quote.expiresAt,
    allocationIntent,
  });
  return Object.freeze({ ...quote, fundingQuote });
}

export function validateSystemOfferReceipt(result, { item, offer, quote }) {
  const receipt = record(storeReceiptFromOperation(result));
  exactPublicFields(receipt, SYSTEM_OFFER_RECEIPT_FIELDS);
  textMatches(receipt.quoteKey, quote.quoteKey, PUBLIC.quote);
  textMatches(receipt.offerKey, quote.offerKey, PUBLIC.offer);
  textMatches(receipt.sellerPartyKey, quote.sellerPartyKey, PUBLIC.party);
  textMatches(receipt.inventoryTransactionKey, "", PUBLIC.inventoryTransaction);
  textMatches(receipt.contextDigest, quote.contextDigest, PUBLIC.contextDigest);
  const expectedVersionAfter = quote.sellerKind === "npc"
    ? quote.offerVersion + 1
    : quote.offerVersion;
  if (
    !/^receipt_[0-9a-f]{32}$/u.test(String(receipt.receiptKey || "")) ||
    String(receipt.itemKey || item.itemKey || item.id) !== String(item.itemKey || item.id) ||
    receipt.sellerKind !== quote.sellerKind || receipt.sellerName !== quote.sellerName ||
    receipt.offerVersionBefore !== quote.offerVersion || receipt.offerVersionAfter !== expectedVersionAfter ||
    !Number.isSafeInteger(receipt.remainingSellerQuantity) || receipt.remainingSellerQuantity < 0 ||
    receipt.remainingSellerQuantity > quote.availableQuantityAtQuote - quote.quantity ||
    !Number.isSafeInteger(receipt.quantity) || receipt.quantity !== quote.quantity ||
    exactMoney(receipt.finalUnitPrice) !== quote.finalUnitPrice ||
    exactMoney(receipt.finalTotalPrice) !== quote.finalTotalPrice ||
    exactMoney(receipt.sellerProceeds) !== quote.finalTotalPrice ||
    !Number.isSafeInteger(receipt.inventoryQuantityOwned) || receipt.inventoryQuantityOwned < receipt.quantity ||
    receipt.currencyCode !== quote.currencyCode ||
    typeof receipt.completedAt !== "string" || !Number.isFinite(Date.parse(receipt.completedAt)) ||
    new Date(Date.parse(receipt.completedAt)).toISOString() !== receipt.completedAt ||
    typeof receipt.alreadyCompleted !== "boolean"
  ) throw invalidStoreResponse();
  const fundingReceipt = validateStoreFundingReceiptEvidence(receipt.fundingReceipt, {
    quote: quote.fundingQuote,
    sourceAction: "system_offer_purchase_funding",
  });
  if (offer.offerKey !== receipt.offerKey || offer.sellerKind !== receipt.sellerKind) throw invalidStoreResponse();
  return Object.freeze({ ...receipt, fundingReceipt });
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
