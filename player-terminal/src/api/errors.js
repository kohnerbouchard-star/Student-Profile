export class ApiConnectionPendingError extends Error {
  constructor({ endpointKey, method, path, payload }) {
    super(`Backend connection pending for ${method} ${path}`);
    this.name = "ApiConnectionPendingError";
    this.endpointKey = endpointKey;
    this.method = method;
    this.path = path;
    this.payload = payload;
  }
}

const STATUS_MESSAGES = Object.freeze({
  400: "The request could not be processed. Check the entered information and try again.",
  401: "Your player session has expired. Reconnect through the Econovaria sign-in screen.",
  403: "This action is not available for your player account.",
  404: "The requested player resource is no longer available.",
  409: "This action conflicts with a newer update. Refresh this section and try again.",
  422: "The request contains information the game cannot accept.",
  429: "Too many requests were sent. Wait a moment and try again.",
  500: "The game service could not complete the request. Try again shortly.",
  502: "The game service is temporarily unavailable. Try again shortly.",
  503: "The game service is temporarily unavailable. Try again shortly.",
  504: "The game service took too long to respond. Try again."
});

const CODE_MESSAGES = Object.freeze({
  ACTION_COOLDOWN: "That action was just submitted. Wait a moment before trying again.",
  BUSINESS_LABOR_CAPACITY_UNAVAILABLE: "The required workers do not have enough labor minutes left in the current payroll period. Reduce the production run or wait for the next payroll period.",
  BUSINESS_LABOR_REQUIREMENT_INVALID: "This recipe's labor requirement is not currently usable. Choose another product or contact the game administrator.",
  BUSINESS_LABOR_RESERVATION_CONSUMPTION_CONFLICT: "Workforce capacity changed while production was settling. Refresh the Business page before retrying.",
  BUSINESS_LABOR_ROLE_COVERAGE_UNAVAILABLE: "This recipe needs more active workers in a required role. Hire an eligible candidate before producing.",
  BUSINESS_LABOR_SKILL_UNAVAILABLE: "Your active workforce does not meet this recipe's skill requirement. Hire a sufficiently skilled candidate before producing.",
  BUSINESS_PRODUCTION_RECIPE_AMBIGUOUS: "This product is linked to more than one canonical recipe. Production is unavailable until the recipe mapping is corrected.",
  INVALID_RESPONSE: "This section received incomplete data and could not be opened safely.",
  INVALID_STORE_OFFER_PURCHASE: "The selected Business offer purchase request is invalid. Refresh the Store and try again.",
  INVALID_STORE_OFFER_QUOTE: "The selected Business offer quote request is invalid. Refresh the Store and try again.",
  INVALID_STORE_OFFER_RECEIPT_KEY: "This Store receipt reference is invalid.",
  NETWORK_ERROR: "The player terminal could not reach the game service.",
  OFFLINE: "The device appears to be offline. Reconnect and try again.",
  REQUEST_ABORTED: "The request was cancelled.",
  REQUEST_TIMEOUT: "The game service took too long to respond. Try again.",
  ROUTE_DATA_UNAVAILABLE: "This section could not be loaded. Other terminal sections remain available.",
  STORE_IDEMPOTENCY_CONFLICT: "This purchase request conflicts with an earlier Store request. Review the purchase and try again.",
  STORE_INSUFFICIENT_BALANCE: "You do not have enough available checking funds for this Store purchase.",
  STORE_INSUFFICIENT_STOCK: "The requested quantity is no longer available. Request a new Store quote.",
  STORE_ITEM_NOT_AVAILABLE: "This Store item is no longer available.",
  STORE_OFFER_CONFLICT: "This seller offer changed after the quote was issued. Request a new quote.",
  STORE_OFFER_CURRENCY_UNAVAILABLE: "This offer cannot be purchased with your current local currency.",
  STORE_OFFER_INVENTORY_RESERVED: "The selected stock is currently reserved. Refresh the Store or choose another offer.",
  STORE_OFFER_NOT_AVAILABLE: "This seller offer is no longer available. Refresh the Store and choose another offer.",
  STORE_OFFER_PURCHASE_UNAVAILABLE: "This Business offer purchase is no longer available. No funds or inventory moved.",
  STORE_OFFER_SELF_PURCHASE_FORBIDDEN: "You cannot purchase an offer from your own Business.",
  STORE_OFFER_VERSION_CONFLICT: "This seller offer changed. Refresh the Store before requesting a new quote.",
  STORE_OFFER_WITHDRAWAL_PENDING: "This seller offer is being withdrawn and can no longer be purchased. Refresh the Store and choose another offer.",
  PLAYER_STORE_OFFER_CATALOG_FAILED: "Current seller offers could not be loaded safely. Refresh the Store and try again.",
  PLAYER_STORE_OFFER_IDENTITY_FAILED: "This Business seller's public identity could not be verified. Choose another offer.",
  PLAYER_STORE_OFFER_PURCHASE_FAILED: "The Business offer purchase could not be completed. No funds or inventory moved.",
  PLAYER_STORE_OFFER_QUOTE_FAILED: "The Business offer quote could not be created. Refresh the Store and try again.",
  PLAYER_STORE_OFFER_RECEIPT_READ_FAILED: "The purchase receipt could not be reloaded yet. The completed purchase was not retried.",
  STORE_OFFER_QUOTE_BUSINESS_UNAVAILABLE: "This Business seller is no longer available. Choose another Store offer.",
  STORE_OFFER_QUOTE_BUYER_COUNTRY_UNAVAILABLE: "Your current country cannot settle this Business offer.",
  STORE_OFFER_QUOTE_CATALOG_UNAVAILABLE: "This Store product is no longer available. Refresh the Store.",
  STORE_OFFER_QUOTE_CROSS_CURRENCY_UNSUPPORTED: "This offer cannot be purchased with your current local currency.",
  STORE_OFFER_QUOTE_CUSTODY_MISSING: "This offer is no longer backed by available seller inventory.",
  STORE_OFFER_QUOTE_CUSTODY_UNAVAILABLE: "Seller inventory changed. Refresh the Store before trying again.",
  STORE_OFFER_QUOTE_IDEMPOTENCY_CONFLICT: "This quote request conflicts with an earlier request. Review the selected offer and try again.",
  STORE_OFFER_QUOTE_INSUFFICIENT_STOCK: "The selected seller no longer has that quantity available. Refresh the Store and choose again.",
  STORE_OFFER_QUOTE_INVENTORY_RESERVED: "The selected stock is currently reserved. Refresh the Store or choose another offer.",
  STORE_OFFER_QUOTE_ITEM_UNAVAILABLE: "This Store product is no longer available. Refresh the Store.",
  STORE_OFFER_QUOTE_LISTING_NOT_FOUND: "This seller listing is no longer available. Refresh the Store.",
  STORE_OFFER_QUOTE_LISTING_QUANTITY_INVALID: "The selected seller no longer has that quantity available. Refresh the Store and choose again.",
  STORE_OFFER_QUOTE_OFFER_NOT_FOUND: "This seller offer was withdrawn. Refresh the Store and choose another offer.",
  STORE_OFFER_QUOTE_OFFER_STATUS_INVALID: "This seller offer is no longer active. Refresh the Store and choose another offer.",
  STORE_OFFER_QUOTE_OFFER_VERSION_CONFLICT: "This seller offer changed. Refresh the Store before requesting a new quote.",
  STORE_OFFER_QUOTE_PARTY_UNAVAILABLE: "This Business seller is no longer available. Choose another Store offer.",
  STORE_OFFER_QUOTE_REQUEST_INVALID: "The selected Store offer could not be quoted. Refresh the Store and try again.",
  STORE_OFFER_QUOTE_SELF_PURCHASE_FORBIDDEN: "You cannot purchase an offer from your own Business.",
  STORE_OFFER_QUOTE_SELLER_CURRENCY_INVALID: "This seller offer has an unavailable settlement currency.",
  STORE_OFFER_QUOTE_SELLER_UNAVAILABLE: "This seller is no longer available. Choose another Store offer.",
  STORE_OFFER_SETTLEMENT_BUSINESS_CASH_UNAVAILABLE: "This Business purchase cannot be settled right now. No funds or inventory moved.",
  STORE_OFFER_SETTLEMENT_BUSINESS_CURRENCY_INVALID: "This seller offer has an unavailable settlement currency.",
  STORE_OFFER_SETTLEMENT_BUSINESS_UNAVAILABLE: "This Business seller is no longer available. Request a new quote from another offer.",
  STORE_OFFER_SETTLEMENT_BUYER_INVENTORY_UNAVAILABLE: "Your inventory cannot receive this purchase right now. No funds or inventory moved.",
  STORE_OFFER_SETTLEMENT_BUYER_UNAVAILABLE: "Your player account cannot complete this purchase right now.",
  STORE_OFFER_SETTLEMENT_CATALOG_UNAVAILABLE: "This Store product is no longer available. Request a new quote.",
  STORE_OFFER_SETTLEMENT_COST_CURRENCY_DRIFT: "This offer's settlement details changed. No funds or inventory moved.",
  STORE_OFFER_SETTLEMENT_CUSTODY_MISSING: "This offer is no longer backed by seller inventory. Request a new quote.",
  STORE_OFFER_SETTLEMENT_CUSTODY_UNAVAILABLE: "Seller inventory changed. No funds or inventory moved.",
  STORE_OFFER_SETTLEMENT_IDEMPOTENCY_CONFLICT: "This purchase request conflicts with an earlier Store request. Review the receipt or selected offer before retrying.",
  STORE_OFFER_SETTLEMENT_INSUFFICIENT_FUNDS: "You do not have enough available checking funds for this Business offer purchase.",
  STORE_OFFER_SETTLEMENT_INSUFFICIENT_STOCK: "The selected seller no longer has that quantity available. Request a new quote.",
  STORE_OFFER_SETTLEMENT_INVENTORY_RESERVED: "The selected stock is currently reserved. Request a new quote or choose another offer.",
  STORE_OFFER_SETTLEMENT_ITEM_UNAVAILABLE: "This Store product is no longer available. Request a new quote.",
  STORE_OFFER_SETTLEMENT_INVENTORY_UNAVAILABLE: "Seller or buyer inventory changed. No funds or inventory moved; request a new quote.",
  STORE_OFFER_SETTLEMENT_LISTING_NOT_FOUND: "This seller listing is no longer available. Request a new quote.",
  STORE_OFFER_SETTLEMENT_LISTING_QUANTITY_INVALID: "The selected seller no longer has that quantity available. Request a new quote.",
  STORE_OFFER_SETTLEMENT_OFFER_NOT_FOUND: "This seller offer was withdrawn. Refresh the Store and choose another offer.",
  STORE_OFFER_SETTLEMENT_OFFER_CONFLICT: "This seller offer changed after the quote was issued. Request a new quote.",
  STORE_OFFER_SETTLEMENT_OFFER_STATUS_INVALID: "This seller offer is no longer active. Refresh the Store and choose another offer.",
  STORE_OFFER_SETTLEMENT_OFFER_VERSION_CONFLICT: "This seller offer changed after the quote was issued. Request a new quote.",
  STORE_OFFER_SETTLEMENT_QUOTE_EXPIRED: "This Business offer quote expired. Request a new authoritative quote.",
  STORE_OFFER_SETTLEMENT_QUOTE_MISMATCH: "The selected offer no longer matches this quote. Request a new quote.",
  STORE_OFFER_SETTLEMENT_QUOTE_NOT_FOUND: "This Business offer quote is no longer available. Request a new quote.",
  STORE_OFFER_SETTLEMENT_QUOTE_STATUS_INVALID: "This Business offer quote is no longer active. Request a new quote.",
  STORE_OFFER_SETTLEMENT_MONEY_UNAVAILABLE: "This Business purchase cannot be settled right now. No funds or inventory moved.",
  STORE_OFFER_SETTLEMENT_PARTY_UNAVAILABLE: "This Business seller is no longer available. Request a new quote from another offer.",
  STORE_OFFER_SETTLEMENT_REQUEST_INVALID: "The Business offer purchase could not be accepted. Review the Store and try again.",
  STORE_OFFER_SETTLEMENT_SELF_PURCHASE_FORBIDDEN: "You cannot purchase an offer from your own Business.",
  STORE_OFFER_SETTLEMENT_SELLER_UNAVAILABLE: "This seller is no longer available. Request a new quote from another offer.",
  STORE_PURCHASE_IN_PROGRESS: "This Store purchase is still processing. Wait a moment before retrying.",
  STORE_QUOTE_ALREADY_USED: "This Store quote was already used. Request a new quote.",
  STORE_QUOTE_EXPIRED: "This Store quote expired. Request a new authoritative quote.",
  STORE_QUOTE_NOT_FOUND: "This Store quote is no longer available. Request a new quote.",
  STORE_QUOTE_NOT_AVAILABLE: "This Business offer quote is no longer available. Request a new quote.",
  STORE_OFFER_RECEIPT_NOT_FOUND: "This immutable Store receipt could not be found for the current Player session."
});

const SAFE_DETAIL_KEYS = new Set([
  "groupName",
  "key",
  "endpointKey",
  "expectedSchemaVersion",
  "receivedSchemaVersion",
  "expectedService",
  "receivedService",
  "method",
  "pathTemplate"
]);
const GENERIC_DIAGNOSTIC_CODES = new Set(["", "REQUEST_FAILED", "ROUTE_DATA_UNAVAILABLE"]);

function safeDiagnosticText(value, maximum = 160) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maximum) : "";
}

export function sanitizeApiErrorDetail(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const detail = {};
  for (const key of SAFE_DETAIL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const item = value[key];
    if (typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item))) {
      detail[key] = item;
      continue;
    }
    const text = safeDiagnosticText(item);
    if (text) detail[key] = text;
  }
  return Object.keys(detail).length ? Object.freeze(detail) : null;
}

export function playerSafeErrorMessage({ status = 0, code = "" } = {}) {
  return CODE_MESSAGES[code] || STATUS_MESSAGES[status] || "The request could not be completed. Try again.";
}

export class ApiRequestError extends Error {
  constructor(message, {
    status = 0,
    code = "",
    path = "",
    endpointKey = "",
    requestId = "",
    retryAfterMs = 0,
    detail = null,
    cause = null
  } = {}) {
    super(message || playerSafeErrorMessage({ status, code }));
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.path = path;
    this.endpointKey = endpointKey;
    this.requestId = requestId;
    this.retryAfterMs = retryAfterMs;
    const safeDetail = sanitizeApiErrorDetail(detail);
    if (safeDetail) this.detail = safeDetail;
    if (cause) this.cause = cause;
  }
}

function statusFrom(error) {
  const value = Number(error?.status ?? error?.statusCode ?? error?.response?.status ?? 0);
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 0;
}

function codeFrom(error, status) {
  const raw = String(error?.code || error?.body?.code || error?.body?.error?.code || "").toUpperCase();
  if (/^[A-Z0-9_]{2,64}$/.test(raw)) return raw;
  if (status === 401) return "SESSION_INVALID";
  if (status === 429) return "RATE_LIMITED";
  if (error?.name === "AbortError") return "REQUEST_ABORTED";
  return "REQUEST_FAILED";
}

export function collectSafeApiDiagnostic(error) {
  let current = error;
  let selected = null;
  for (let depth = 0; current && depth < 6; depth += 1) {
    const status = statusFrom(current);
    const code = codeFrom(current, status);
    const candidate = {
      status,
      code,
      endpointKey: safeDiagnosticText(current?.endpointKey, 80),
      path: safeDiagnosticText(current?.path, 200),
      requestId: safeDiagnosticText(current?.requestId, 100),
      detail: sanitizeApiErrorDetail(current?.detail || current?.body)
    };
    if (!selected || (GENERIC_DIAGNOSTIC_CODES.has(selected.code) && !GENERIC_DIAGNOSTIC_CODES.has(code))) {
      selected = candidate;
    }
    current = current?.cause;
  }
  if (!selected) return Object.freeze({ status: 0, code: "REQUEST_FAILED", endpointKey: "", path: "", requestId: "", detail: null });
  return Object.freeze(selected);
}

export function normalizeApiError(error, context = {}) {
  if (error instanceof ApiConnectionPendingError) return error;
  if (error instanceof ApiRequestError) {
    if (!error.endpointKey) error.endpointKey = context.endpointKey || "";
    if (!error.path) error.path = context.path || "";
    if (!error.requestId) error.requestId = context.requestId || "";
    if (!error.detail) {
      const detail = sanitizeApiErrorDetail(error?.body);
      if (detail) error.detail = detail;
    }
    return error;
  }

  const status = statusFrom(error);
  const code = context.code || codeFrom(error, status);
  return new ApiRequestError(playerSafeErrorMessage({ status, code }), {
    status,
    code,
    path: context.path || "",
    endpointKey: context.endpointKey || "",
    requestId: context.requestId || "",
    retryAfterMs: Number(context.retryAfterMs || error?.retryAfterMs || 0),
    detail: error?.detail || error?.body,
    cause: error instanceof Error ? error : null
  });
}
