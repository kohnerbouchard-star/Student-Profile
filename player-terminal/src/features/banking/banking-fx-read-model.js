import { ApiRequestError } from "../../api/errors.js";

const PUBLIC_KEYS = Object.freeze({
  account: /^bac_[0-9a-f]{32}$/u,
  fixing: /^fxf_[0-9a-f]{32}$/u,
  order: /^fxo_[0-9a-f]{32}$/u,
  quote: /^fxq_[0-9a-f]{32}$/u,
  receipt: /^fxr_[0-9a-f]{32}$/u,
});
const CURRENCY_CODE = /^[A-Z]{3}$/u;
const INTERNAL_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
const ORDER_PRODUCTS = new Set(["standard", "instant"]);
const TERMINAL_ORDER_STATUSES = new Set([
  "cancelled",
  "completed",
  "failed",
  "settled",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function body(value) {
  const source = object(value);
  if (source.data && typeof source.data === "object" && !Array.isArray(source.data)) {
    return source.data;
  }
  return source;
}

function invalid(endpointKey, fieldName) {
  throw new ApiRequestError("Banking FX returned incomplete data and could not be displayed safely.", {
    code: "INVALID_RESPONSE",
    endpointKey,
    body: { fieldName },
  });
}

function assertNoInternalIdentity(value, endpointKey) {
  if (INTERNAL_UUID.test(JSON.stringify(value))) invalid(endpointKey, "publicIdentity");
}

function text(value, endpointKey, fieldName, { optional = false } = {}) {
  const result = typeof value === "string" ? value.trim() : "";
  if (result || optional) return result;
  return invalid(endpointKey, fieldName);
}

function publicKey(value, kind, endpointKey, fieldName, { optional = false } = {}) {
  const result = text(value, endpointKey, fieldName, { optional }).toLowerCase();
  if (!result && optional) return "";
  if (PUBLIC_KEYS[kind].test(result)) return result;
  return invalid(endpointKey, fieldName);
}

function currencyCode(value, endpointKey, fieldName) {
  const result = text(value, endpointKey, fieldName).toUpperCase();
  if (CURRENCY_CODE.test(result)) return result;
  return invalid(endpointKey, fieldName);
}

function currency(value, endpointKey = "bankingFx") {
  const row = object(value);
  const minorUnit = Number(row.minorUnit ?? row.minor_unit);
  if (!Number.isSafeInteger(minorUnit) || minorUnit < 0 || minorUnit > 18) {
    invalid(endpointKey, "minorUnit");
  }
  return {
    currencyCode: currencyCode(
      row.currencyCode ?? row.currency_code,
      endpointKey,
      "currencyCode",
    ),
    minorUnit,
  };
}

function decimal(value, endpointKey, fieldName, { positive = false } = {}) {
  const result = Number(value);
  if (
    Number.isFinite(result) &&
    result >= 0 &&
    (!positive || result > 0) &&
    result <= 1_000_000_000_000_000
  ) return result;
  return invalid(endpointKey, fieldName);
}

function decimalString(value, endpointKey, fieldName, { positive = false } = {}) {
  const result = typeof value === "string" ? value.trim() : "";
  if (
    /^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/u.test(result) &&
    (!positive || !/^0(?:\.0+)?$/u.test(result))
  ) return result;
  return invalid(endpointKey, fieldName);
}

function timestamp(value, endpointKey, fieldName, { optional = false } = {}) {
  const result = text(value, endpointKey, fieldName, { optional });
  if (!result && optional) return "";
  if (Number.isFinite(Date.parse(result))) return result;
  return invalid(endpointKey, fieldName);
}

function pagination(value, endpointKey) {
  const page = object(value);
  const cursor = typeof page.cursor === "string" && page.cursor.trim()
    ? page.cursor.trim()
    : null;
  const nextCursor = typeof page.nextCursor === "string" && page.nextCursor.trim()
    ? page.nextCursor.trim()
    : null;
  const limit = Number(page.limit ?? 25);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    typeof page.hasMore !== "boolean"
  ) invalid(endpointKey, "pagination");
  return { cursor, nextCursor, hasMore: page.hasMore, limit };
}

export function normalizeBankingFxBalance(value, endpointKey = "bankingFx") {
  const row = object(value);
  const postedAmount = decimal(
    row.postedAmount ?? row.balance,
    endpointKey,
    "postedAmount",
  );
  const heldAmount = decimal(
    row.heldAmount ?? row.held ?? 0,
    endpointKey,
    "heldAmount",
  );
  const availableAmount = decimal(
    row.availableAmount ?? row.available,
    endpointKey,
    "availableAmount",
  );
  if (
    availableAmount > postedAmount ||
    postedAmount - heldAmount < -1e-9 ||
    Math.abs(availableAmount - (postedAmount - heldAmount)) > 1e-8
  ) {
    invalid(endpointKey, "availableAmount");
  }
  const accountKind = text(
    row.accountKind ?? row.accountType,
    endpointKey,
    "accountKind",
  ).toLowerCase();
  if (!new Set(["checking", "savings"]).has(accountKind)) {
    invalid(endpointKey, "accountKind");
  }
  return {
    accountKey: publicKey(row.accountKey, "account", endpointKey, "accountKey"),
    accountKind,
    currencyCode: currencyCode(row.currencyCode, endpointKey, "currencyCode"),
    postedAmount,
    heldAmount,
    availableAmount,
  };
}

export function normalizeBankingFxFixing(value, endpointKey = "bankingFx") {
  const fixing = object(value);
  if (!Object.keys(fixing).length) return null;
  return {
    fixingKey: publicKey(fixing.fixingKey, "fixing", endpointKey, "fixingKey"),
    effectiveAt: timestamp(fixing.effectiveAt, endpointKey, "effectiveAt"),
    calculatedAt: timestamp(
      fixing.calculatedAt,
      endpointKey,
      "calculatedAt",
      { optional: true },
    ),
    nextFixingAt: timestamp(fixing.nextFixingAt, endpointKey, "nextFixingAt"),
    overdue: fixing.overdue === true,
    policyVersion: text(
      fixing.policyVersion,
      endpointKey,
      "policyVersion",
    ),
  };
}

export function normalizeBankingFxOrder(value, endpointKey = "bankingFxOrders") {
  const order = object(value);
  const product = text(order.product, endpointKey, "product").toLowerCase();
  if (!ORDER_PRODUCTS.has(product)) invalid(endpointKey, "product");
  const status = text(order.status, endpointKey, "status").toLowerCase();
  const completedAt = timestamp(
    order.completedAt,
    endpointKey,
    "completedAt",
    { optional: true },
  );
  const receiptKey = publicKey(
    order.receiptKey,
    "receipt",
    endpointKey,
    "receiptKey",
    { optional: true },
  );
  if (TERMINAL_ORDER_STATUSES.has(status) && status === "settled" && !receiptKey) {
    invalid(endpointKey, "receiptKey");
  }
  return {
    orderKey: publicKey(order.orderKey, "order", endpointKey, "orderKey"),
    quoteKey: publicKey(order.quoteKey, "quote", endpointKey, "quoteKey"),
    product,
    status,
    sourceCurrencyCode: currencyCode(
      order.sourceCurrencyCode,
      endpointKey,
      "sourceCurrencyCode",
    ),
    targetCurrencyCode: currencyCode(
      order.targetCurrencyCode,
      endpointKey,
      "targetCurrencyCode",
    ),
    sourceAmount: decimalString(order.sourceAmount, endpointKey, "sourceAmount", {
      positive: true,
    }),
    feeAmount: decimalString(order.feeAmount ?? "0", endpointKey, "feeAmount"),
    targetAmount: decimalString(order.targetAmount, endpointKey, "targetAmount", {
      positive: true,
    }),
    submittedAt: timestamp(order.submittedAt, endpointKey, "submittedAt"),
    settlesAt: timestamp(
      order.settlesAt,
      endpointKey,
      "settlesAt",
      { optional: product === "instant" },
    ),
    completedAt,
    receiptKey,
    cancellable: order.cancellable === true || status === "pending" || status === "reserved",
  };
}

export function normalizeBankingFxQuote(value, endpointKey = "bankingFxQuote") {
  const source = body(value);
  const quote = object(source.quote || source);
  assertNoInternalIdentity(quote, endpointKey);
  const product = text(quote.product, endpointKey, "product").toLowerCase();
  if (!ORDER_PRODUCTS.has(product)) invalid(endpointKey, "product");
  const sourceCurrencyCode = currencyCode(
    quote.sourceCurrencyCode,
    endpointKey,
    "sourceCurrencyCode",
  );
  const targetCurrencyCode = currencyCode(
    quote.targetCurrencyCode,
    endpointKey,
    "targetCurrencyCode",
  );
  const requiresFx = quote.requiresFx !== false;
  if (!requiresFx && sourceCurrencyCode !== targetCurrencyCode) {
    invalid(endpointKey, "requiresFx");
  }
  return {
    quoteKey: publicKey(quote.quoteKey, "quote", endpointKey, "quoteKey"),
    product,
    sourceAccountKey: publicKey(
      quote.sourceAccountKey,
      "account",
      endpointKey,
      "sourceAccountKey",
    ),
    targetAccountKey: publicKey(
      quote.targetAccountKey,
      "account",
      endpointKey,
      "targetAccountKey",
    ),
    sourceCurrencyCode,
    targetCurrencyCode,
    sourceMinorUnit: minorUnit(
      quote.sourceMinorUnit,
      endpointKey,
      "sourceMinorUnit",
    ),
    targetMinorUnit: minorUnit(
      quote.targetMinorUnit,
      endpointKey,
      "targetMinorUnit",
    ),
    sourceAmountMode: quote.sourceAmountMode === "source_debit"
      ? "source_debit"
      : invalid(endpointKey, "sourceAmountMode"),
    sourceAmount: decimalString(quote.sourceAmount, endpointKey, "sourceAmount", {
      positive: true,
    }),
    referenceRate: decimalString(
      quote.referenceRate,
      endpointKey,
      "referenceRate",
      { positive: true },
    ),
    customerRate: decimalString(
      quote.customerRate,
      endpointKey,
      "customerRate",
      { positive: true },
    ),
    spreadRate: decimalString(quote.spreadRate ?? "0", endpointKey, "spreadRate"),
    feeAmount: decimalString(quote.feeAmount ?? "0", endpointKey, "feeAmount"),
    targetAmount: decimalString(quote.targetAmount, endpointKey, "targetAmount", {
      positive: true,
    }),
    fixingKey: publicKey(quote.fixingKey, "fixing", endpointKey, "fixingKey"),
    policyVersion: text(
      quote.policyVersion,
      endpointKey,
      "policyVersion",
    ),
    expiresAt: timestamp(quote.expiresAt, endpointKey, "expiresAt"),
    settlesAt: timestamp(quote.settlesAt, endpointKey, "settlesAt"),
    requiresFx,
    roundingDisclosure: text(
      quote.roundingDisclosure,
      endpointKey,
      "roundingDisclosure",
      { optional: true },
    ),
  };
}

function minorUnit(value, endpointKey, fieldName) {
  const result = Number(value);
  if (Number.isSafeInteger(result) && result >= 0 && result <= 18) return result;
  return invalid(endpointKey, fieldName);
}

export function normalizeBankingFxHistory(value) {
  const endpointKey = "bankingFxHistory";
  const source = body(value);
  assertNoInternalIdentity(source, endpointKey);
  const rows = list(source.points || source.history).map((point) => {
    const row = object(point);
    return {
      fixingKey: publicKey(row.fixingKey, "fixing", endpointKey, "fixingKey"),
      effectiveAt: timestamp(row.effectiveAt, endpointKey, "effectiveAt"),
      sourceCurrencyCode: currencyCode(
        row.sourceCurrencyCode,
        endpointKey,
        "sourceCurrencyCode",
      ),
      targetCurrencyCode: currencyCode(
        row.targetCurrencyCode,
        endpointKey,
        "targetCurrencyCode",
      ),
      referenceRate: decimalString(
        row.referenceRate,
        endpointKey,
        "referenceRate",
        { positive: true },
      ),
    };
  });
  return {
    range: new Set(["7d", "30d", "game"]).has(String(source.range || ""))
      ? String(source.range)
      : "7d",
    points: rows,
    pagination: pagination(source.pagination, endpointKey),
  };
}

export function normalizeBankingFxOrders(value) {
  const endpointKey = "bankingFxOrders";
  const source = body(value);
  assertNoInternalIdentity(source, endpointKey);
  return {
    orders: list(source.orders).map((order) =>
      normalizeBankingFxOrder(order, endpointKey)
    ),
    pagination: pagination(source.pagination, endpointKey),
  };
}

export function normalizeBankingFxOverview(value) {
  const endpointKey = "bankingFx";
  const source = body(value);
  assertNoInternalIdentity(source, endpointKey);
  const balances = list(source.balances || source.accounts).map((row) =>
    normalizeBankingFxBalance(row, endpointKey)
  );
  const currencies = list(source.currencies).map((row) =>
    currency(row, endpointKey)
  );
  if (!currencies.length) invalid(endpointKey, "currencies");
  const currencyCodes = new Set();
  for (const entry of currencies) {
    if (currencyCodes.has(entry.currencyCode)) {
      invalid(endpointKey, "currencyCode");
    }
    currencyCodes.add(entry.currencyCode);
  }
  const accountKeys = new Set();
  for (const balance of balances) {
    if (accountKeys.has(balance.accountKey)) invalid(endpointKey, "accountKey");
    if (!currencyCodes.has(balance.currencyCode)) {
      invalid(endpointKey, "currencyCode");
    }
    accountKeys.add(balance.accountKey);
  }
  const pendingOrders = list(
    source.pendingOrders || object(source.orders).pending,
  ).map((order) => normalizeBankingFxOrder(order, endpointKey));
  const completedOrders = list(
    source.completedOrders || object(source.orders).completed,
  ).map((order) => normalizeBankingFxOrder(order, endpointKey));
  return {
    configured: source.configured !== false,
    generatedAt: timestamp(
      source.generatedAt,
      endpointKey,
      "generatedAt",
      { optional: true },
    ),
    currencies,
    balances,
    fixing: normalizeBankingFxFixing(source.fixing, endpointKey),
    pendingOrders,
    completedOrders,
    history: {
      range: "7d",
      points: [],
      pagination: { cursor: null, nextCursor: null, hasMore: false, limit: 100 },
    },
    currentQuote: null,
    error: "",
  };
}
