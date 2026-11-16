import { ApiRequestError } from "../../api/errors.js";

const PUBLIC_KEYS = Object.freeze({
  account: /^bac_[0-9a-f]{32}$/u,
  bankTransaction: /^btx_[0-9a-f]{32}$/u,
  fixing: /^fxf_[0-9a-f]{32}$/u,
  fundingQuote: /^pfq_[0-9a-f]{32}$/u,
  fundingReceipt: /^pfr_[0-9a-f]{32}$/u,
  listing: /^lst_[0-9a-f]{32}$/u,
  order: /^ord_[0-9a-f]{32}$/u,
  reservation: /^mpr_[0-9a-f]{32}$/u,
});
const ITEM_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const CURRENCY = /^[A-Z0-9_]{3,16}$/u;
const INTERNAL_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function invalid(field) {
  throw new ApiRequestError(
    "Marketplace funding returned incomplete data and could not be displayed safely.",
    { code: "INVALID_RESPONSE", endpointKey: "marketplacePurchase", body: { field } },
  );
}
function assertPublic(value) {
  if (INTERNAL_UUID.test(JSON.stringify(value))) invalid("publicIdentity");
}
function text(value, field) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > 500 || INTERNAL_UUID.test(result)) invalid(field);
  return result;
}
function publicKey(value, kind, field) {
  const result = text(value, field).toLowerCase();
  if (!PUBLIC_KEYS[kind].test(result)) invalid(field);
  return result;
}
function itemKey(value) {
  const result = text(value, "itemKey").toLowerCase();
  if (!ITEM_KEY.test(result)) invalid("itemKey");
  return result;
}
function currency(value, field = "currencyCode") {
  const result = text(value, field).toUpperCase();
  if (!CURRENCY.test(result)) invalid(field);
  return result;
}
function number(value, field, { minimum = 0, positive = false } = {}) {
  const result = Number(value);
  if (
    !Number.isFinite(result) || result < minimum ||
    (positive && result <= 0) || Math.abs(result) >= 1_000_000_000_000_000
  ) invalid(field);
  return result;
}
function integer(value, field, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) invalid(field);
  return result;
}
function boolean(value, field) {
  if (typeof value !== "boolean") invalid(field);
  return value;
}
function timestamp(value, field, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  const result = text(value, field);
  if (!Number.isFinite(Date.parse(result))) invalid(field);
  return new Date(result).toISOString();
}
function nearlyEqual(left, right, tolerance = 1e-8) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function fundingQuoteLine(value) {
  const row = object(value);
  const result = Object.freeze({
    lineNumber: integer(row.lineNumber, "lineNumber", 1, 3),
    sourceAccountKey: publicKey(row.sourceAccountKey, "account", "sourceAccountKey"),
    sourceCurrencyCode: currency(row.sourceCurrencyCode, "sourceCurrencyCode"),
    sourceMinorUnit: integer(row.sourceMinorUnit, "sourceMinorUnit", 0, 18),
    targetCurrencyCode: currency(row.targetCurrencyCode, "targetCurrencyCode"),
    targetMinorUnit: integer(row.targetMinorUnit, "targetMinorUnit", 0, 18),
    postedAmount: number(row.postedAmount, "postedAmount", { minimum: 0 }),
    heldAmount: number(row.heldAmount, "heldAmount", { minimum: 0 }),
    availableAmount: number(row.availableAmount, "availableAmount", { minimum: 0 }),
    targetContribution: number(row.targetContribution, "targetContribution", { positive: true }),
    sourceDebit: number(row.sourceDebit, "sourceDebit", { positive: true }),
    referenceRate: number(row.referenceRate, "referenceRate", { positive: true }),
    customerRate: number(row.customerRate, "customerRate", { positive: true }),
    effectiveRate: number(row.effectiveRate, "effectiveRate", { positive: true }),
    spreadRate: number(row.spreadRate, "spreadRate", { minimum: 0 }),
    requiresFx: boolean(row.requiresFx, "requiresFx"),
    roundingDisclosure: text(row.roundingDisclosure, "roundingDisclosure"),
  });
  if (!nearlyEqual(result.availableAmount, result.postedAmount - result.heldAmount)) {
    invalid("availableAmount");
  }
  if (result.requiresFx) {
    if (
      result.sourceCurrencyCode === result.targetCurrencyCode ||
      !nearlyEqual(result.spreadRate, 0.01) ||
      result.customerRate >= result.referenceRate
    ) invalid("requiresFx");
  } else if (
    result.sourceCurrencyCode !== result.targetCurrencyCode ||
    !nearlyEqual(result.spreadRate, 0) ||
    !nearlyEqual(result.referenceRate, 1) ||
    !nearlyEqual(result.customerRate, 1) ||
    !nearlyEqual(result.effectiveRate, 1) ||
    !nearlyEqual(result.sourceDebit, result.targetContribution)
  ) invalid("sameCurrencyLine");
  return result;
}

function fundingQuote(value, reservationKey) {
  const row = object(value);
  const lines = list(row.lines).map(fundingQuoteLine);
  if (lines.length < 1 || lines.length > 3) invalid("fundingQuote.lines");
  const accountKeys = new Set(lines.map((line) => line.sourceAccountKey));
  if (accountKeys.size !== lines.length) invalid("fundingQuote.accounts");
  const result = Object.freeze({
    quoteKey: publicKey(row.quoteKey, "fundingQuote", "quoteKey"),
    fundingContextKind: text(row.fundingContextKind, "fundingContextKind"),
    fundingContextKey: publicKey(row.fundingContextKey, "reservation", "fundingContextKey"),
    targetCurrencyCode: currency(row.targetCurrencyCode, "targetCurrencyCode"),
    targetMinorUnit: integer(row.targetMinorUnit, "targetMinorUnit", 0, 18),
    targetAmount: number(row.targetAmount, "targetAmount", { positive: true }),
    fixingKey: publicKey(row.fixingKey, "fixing", "fixingKey"),
    policyVersion: text(row.policyVersion, "policyVersion"),
    requiresFx: boolean(row.requiresFx, "requiresFx"),
    expiresAt: timestamp(row.expiresAt, "expiresAt"),
    lines: Object.freeze(lines),
  });
  if (
    result.fundingContextKind !== "marketplace.purchase" ||
    result.fundingContextKey !== reservationKey ||
    !nearlyEqual(
      result.targetAmount,
      lines.reduce((sum, line) => sum + line.targetContribution, 0),
    ) ||
    result.requiresFx !== lines.some((line) => line.requiresFx) ||
    lines.some((line) => line.targetCurrencyCode !== result.targetCurrencyCode)
  ) invalid("fundingQuote.binding");
  return result;
}

function fundingReceiptLine(value) {
  const row = object(value);
  return Object.freeze({
    lineNumber: integer(row.lineNumber, "lineNumber", 1, 3),
    sourceAccountKey: publicKey(row.sourceAccountKey, "account", "sourceAccountKey"),
    sourceCurrencyCode: currency(row.sourceCurrencyCode, "sourceCurrencyCode"),
    targetContribution: number(row.targetContribution, "targetContribution", { positive: true }),
    sourceDebit: number(row.sourceDebit, "sourceDebit", { positive: true }),
    referenceRate: number(row.referenceRate, "referenceRate", { positive: true }),
    customerRate: number(row.customerRate, "customerRate", { positive: true }),
    effectiveRate: number(row.effectiveRate, "effectiveRate", { positive: true }),
    spreadRate: number(row.spreadRate, "spreadRate", { minimum: 0 }),
    requiresFx: boolean(row.requiresFx, "requiresFx"),
  });
}

function fundingReceipt(value, reservationKey) {
  const row = object(value);
  const lines = list(row.lines).map(fundingReceiptLine);
  if (lines.length < 1 || lines.length > 3) invalid("fundingReceipt.lines");
  const result = Object.freeze({
    receiptKey: publicKey(row.receiptKey, "fundingReceipt", "receiptKey"),
    quoteKey: publicKey(row.quoteKey, "fundingQuote", "quoteKey"),
    bankTransactionKey: publicKey(row.bankTransactionKey, "bankTransaction", "bankTransactionKey"),
    targetAccountKey: publicKey(row.targetAccountKey, "account", "targetAccountKey"),
    fundingContextKind: text(row.fundingContextKind, "fundingContextKind"),
    fundingContextKey: publicKey(row.fundingContextKey, "reservation", "fundingContextKey"),
    targetCurrencyCode: currency(row.targetCurrencyCode, "targetCurrencyCode"),
    targetAmount: number(row.targetAmount, "targetAmount", { positive: true }),
    targetReserveDrawAmount: number(row.targetReserveDrawAmount, "targetReserveDrawAmount", { minimum: 0 }),
    sourceDomain: text(row.sourceDomain, "sourceDomain"),
    sourceAction: text(row.sourceAction, "sourceAction"),
    createdAt: timestamp(row.createdAt, "createdAt"),
    lines: Object.freeze(lines),
  });
  if (
    result.fundingContextKind !== "marketplace.purchase" ||
    result.fundingContextKey !== reservationKey ||
    result.sourceDomain !== "marketplace" ||
    result.sourceAction !== "marketplace_purchase_funding" ||
    !nearlyEqual(
      result.targetAmount,
      lines.reduce((sum, line) => sum + line.targetContribution, 0),
    )
  ) invalid("fundingReceipt.binding");
  return result;
}

function responseBody(value) {
  const root = object(value);
  assertPublic(root);
  return object(root.data || root);
}

export function normalizeMarketplaceFundingQuote(value) {
  const body = responseBody(value);
  const row = object(body.reservation || body);
  const reservationKey = publicKey(row.reservationKey, "reservation", "reservationKey");
  const result = Object.freeze({
    reservationKey,
    listingKey: publicKey(row.listingKey, "listing", "listingKey"),
    itemKey: itemKey(row.itemKey),
    quantity: integer(row.quantity, "quantity", 1),
    unitPrice: number(row.unitPrice, "unitPrice", { positive: true }),
    subtotal: number(row.subtotal, "subtotal", { positive: true }),
    feeRate: number(row.feeRate, "feeRate", { minimum: 0 }),
    taxRate: number(row.taxRate, "taxRate", { minimum: 0 }),
    feeAmount: number(row.feeAmount, "feeAmount", { minimum: 0 }),
    taxAmount: number(row.taxAmount, "taxAmount", { minimum: 0 }),
    buyerTotal: number(row.buyerTotal, "buyerTotal", { positive: true }),
    sellerProceeds: number(row.sellerProceeds, "sellerProceeds", { positive: true }),
    currencyCode: currency(row.currencyCode),
    status: text(row.status, "status").toLowerCase(),
    version: integer(row.version, "version", 1),
    listingVersion: integer(row.listingVersion, "listingVersion", 1),
    expiresAt: timestamp(row.expiresAt, "expiresAt"),
    replayed: boolean(row.replayed, "replayed"),
    fundingQuote: fundingQuote(row.fundingQuote, reservationKey),
  });
  if (
    !new Set(["reserved", "settling"]).has(result.status) ||
    !nearlyEqual(result.subtotal, result.sellerProceeds) ||
    !nearlyEqual(
      result.buyerTotal,
      result.subtotal + result.feeAmount + result.taxAmount,
    ) ||
    !nearlyEqual(result.buyerTotal, result.fundingQuote.targetAmount) ||
    result.currencyCode !== result.fundingQuote.targetCurrencyCode
  ) invalid("reservation.binding");
  return result;
}

export function normalizeMarketplaceFundingOrder(value) {
  const body = responseBody(value);
  const row = object(body.order || body);
  const reservationKey = publicKey(row.reservationKey, "reservation", "reservationKey");
  const result = Object.freeze({
    orderKey: publicKey(row.orderKey, "order", "orderKey"),
    reservationKey,
    listingKey: publicKey(row.listingKey, "listing", "listingKey"),
    itemKey: itemKey(row.itemKey),
    quantity: integer(row.quantity, "quantity", 1),
    unitPrice: number(row.unitPrice, "unitPrice", { positive: true }),
    subtotal: number(row.subtotal, "subtotal", { positive: true }),
    feeAmount: number(row.feeAmount, "feeAmount", { minimum: 0 }),
    taxAmount: number(row.taxAmount, "taxAmount", { minimum: 0 }),
    buyerTotal: number(row.buyerTotal, "buyerTotal", { positive: true }),
    sellerProceeds: number(row.sellerProceeds, "sellerProceeds", { positive: true }),
    currencyCode: currency(row.currencyCode),
    status: text(row.status, "status").toLowerCase(),
    version: integer(row.version, "version", 1),
    completedAt: timestamp(row.completedAt, "completedAt"),
    refundedAt: timestamp(row.refundedAt, "refundedAt", { nullable: true }),
    replayed: boolean(row.replayed, "replayed"),
    fundingReceipt: fundingReceipt(row.fundingReceipt, reservationKey),
    distributionBankTransactionKey: publicKey(
      row.distributionBankTransactionKey,
      "bankTransaction",
      "distributionBankTransactionKey",
    ),
  });
  if (
    !new Set(["completed", "disputed", "refunded"]).has(result.status) ||
    !nearlyEqual(result.subtotal, result.sellerProceeds) ||
    !nearlyEqual(
      result.buyerTotal,
      result.subtotal + result.feeAmount + result.taxAmount,
    ) ||
    !nearlyEqual(result.buyerTotal, result.fundingReceipt.targetAmount) ||
    result.currencyCode !== result.fundingReceipt.targetCurrencyCode
  ) invalid("order.binding");
  return result;
}

export function resolveMarketplaceFundingFailure(error) {
  const code = String(error?.code || error?.body?.code || "").toLowerCase();
  if (code.includes("insufficient")) {
    return "Selected Checking accounts no longer have enough available funds.";
  }
  if (code.includes("liquidity") || code.includes("facility")) {
    return "Retail FX capacity is currently unavailable. Choose another account or try a same-currency account.";
  }
  if (code.includes("expired") || code.includes("stale")) {
    return "The Marketplace quote expired or the accepted fixing changed. Create a new quote.";
  }
  if (code.includes("quantity") || code.includes("listing") || code.includes("reservation")) {
    return "The listing or reserved quantity changed. Refresh Marketplace and create a new quote.";
  }
  if (code.includes("idempotency") || code.includes("conflict")) {
    return "This request conflicts with an earlier Marketplace action. Refresh before retrying.";
  }
  return String(error?.message || "Marketplace funding could not be completed.");
}
