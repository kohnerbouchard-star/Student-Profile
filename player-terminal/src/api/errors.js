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
  GAME_ARCHIVED: "This game is no longer active. Existing records remain read-only.",
  GAME_ENDED: "This game has ended. Existing records remain read-only.",
  GAME_MUTATIONS_PAUSED: "This game is paused. Economic actions are temporarily unavailable.",
  GAME_NOT_ACTIVE: "This game is no longer active. Existing records remain read-only.",
  GAME_PAUSED: "This game is paused. Economic actions are temporarily unavailable.",
  GAME_STATE_LOCKED: "This game is paused. Economic actions are temporarily unavailable.",
  INVALID_RESPONSE: "This section received incomplete data and could not be opened safely.",
  NETWORK_ERROR: "The player terminal could not reach the game service.",
  OFFLINE: "The device appears to be offline. Reconnect and try again.",
  REQUEST_ABORTED: "The request was cancelled.",
  REQUEST_TIMEOUT: "The game service took too long to respond. Try again.",
  ROUTE_DATA_UNAVAILABLE: "This section could not be loaded. Other terminal sections remain available.",
  STALE_DATA: "This information is out of date. Refresh this section before continuing.",
  STALE_PRICE: "The market price changed. Refresh the asset before retrying the order.",
  STORE_IDEMPOTENCY_CONFLICT: "This purchase request conflicts with an earlier Store request. Review the purchase and try again.",
  STORE_INSUFFICIENT_BALANCE: "You do not have enough available cash for this Store purchase.",
  STORE_INSUFFICIENT_STOCK: "The requested quantity is no longer available. Request a new Store quote.",
  STORE_ITEM_NOT_AVAILABLE: "This Store item is no longer available.",
  STORE_PURCHASE_IN_PROGRESS: "This Store purchase is still processing. Wait a moment before retrying.",
  STORE_QUOTE_ALREADY_USED: "This Store quote was already used. Request a new quote.",
  STORE_QUOTE_EXPIRED: "This Store quote expired. Request a new authoritative quote.",
  STORE_QUOTE_NOT_FOUND: "This Store quote is no longer available. Request a new quote."
});

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

export function normalizeApiError(error, context = {}) {
  if (error instanceof ApiConnectionPendingError) return error;
  if (error instanceof ApiRequestError) {
    if (!error.endpointKey) error.endpointKey = context.endpointKey || "";
    if (!error.path) error.path = context.path || "";
    if (!error.requestId) error.requestId = context.requestId || "";
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
    cause: error instanceof Error ? error : null
  });
}
