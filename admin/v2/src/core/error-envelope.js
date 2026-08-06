const MESSAGE_BY_CODE = Object.freeze({
  REQUEST_FAILED: "The request could not be completed. Try again.",
  INVALID_REQUEST: "The request could not be processed. Review the information and try again.",
  SESSION_REQUIRED: "Your administrator session has expired. Sign in again to continue.",
  MFA_REQUIRED: "Additional administrator verification is required before continuing.",
  PERMISSION_DENIED: "You do not have permission to access this administrator resource.",
  GAME_CONTEXT_REQUIRED: "Select an available game and try again.",
  NOT_FOUND: "The requested administrator resource is no longer available.",
  CONFLICT: "This information changed before the request completed. Refresh and try again.",
  VALIDATION_FAILED: "Some information could not be accepted. Review the highlighted fields.",
  RATE_LIMITED: "Too many requests were sent. Wait a moment and try again.",
  REQUEST_TIMEOUT: "The administrator service took too long to respond. Try again.",
  REQUEST_ABORTED: "The request was cancelled.",
  NETWORK_ERROR: "The administrator console could not reach the service. Check the connection and try again.",
  SERVICE_UNAVAILABLE: "The administrator service is temporarily unavailable. Try again shortly.",
  INVALID_RESPONSE: "The administrator service returned incomplete data. Try again.",
});

const CODE_ALIASES = Object.freeze({
  UNAUTHORIZED: "SESSION_REQUIRED",
  AUTH_REQUIRED: "SESSION_REQUIRED",
  SESSION_INVALID: "SESSION_REQUIRED",
  SESSION_EXPIRED: "SESSION_REQUIRED",
  REAUTH_REQUIRED: "SESSION_REQUIRED",
  FORBIDDEN: "PERMISSION_DENIED",
  ACCESS_DENIED: "PERMISSION_DENIED",
  INSUFFICIENT_PERMISSION: "PERMISSION_DENIED",
  GAME_REQUIRED: "GAME_CONTEXT_REQUIRED",
  GAME_NOT_SELECTED: "GAME_CONTEXT_REQUIRED",
  GAME_NOT_FOUND: "NOT_FOUND",
  RESOURCE_NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_FAILED",
  INVALID_INPUT: "VALIDATION_FAILED",
  RATE_LIMIT_EXCEEDED: "RATE_LIMITED",
  TOO_MANY_REQUESTS: "RATE_LIMITED",
  TIMEOUT: "REQUEST_TIMEOUT",
  ABORT_ERR: "REQUEST_ABORTED",
  FETCH_FAILED: "NETWORK_ERROR",
  UPSTREAM_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  BAD_GATEWAY: "SERVICE_UNAVAILABLE",
});

const SAFE_CODES = new Set(Object.keys(MESSAGE_BY_CODE));
const SAFE_MESSAGES = new Set(Object.values(MESSAGE_BY_CODE));
const SAFE_FIELD_NAMES = new Set([
  "amount",
  "category",
  "currencyCode",
  "date",
  "description",
  "displayName",
  "email",
  "gameName",
  "joinCode",
  "name",
  "note",
  "price",
  "quantity",
  "search",
  "status",
  "stock",
  "title",
]);

export const ADMIN_SAFE_ERROR_CODES = Object.freeze([...SAFE_CODES]);

function statusFrom(error) {
  const numeric = Number(error?.status ?? error?.statusCode ?? error?.response?.status ?? 0);
  return Number.isInteger(numeric) && numeric >= 100 && numeric <= 599 ? numeric : 0;
}

function codeForStatus(status) {
  if (status === 400) return "INVALID_REQUEST";
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 404) return "NOT_FOUND";
  if (status === 408 || status === 504) return "REQUEST_TIMEOUT";
  if (status === 409) return "CONFLICT";
  if (status === 422) return "VALIDATION_FAILED";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVICE_UNAVAILABLE";
  return "REQUEST_FAILED";
}

function rawCodeFrom(error) {
  return String(
    error?.code
      || error?.body?.code
      || error?.body?.error?.code
      || error?.error?.code
      || "",
  ).trim().toUpperCase();
}

function canonicalCode(error, context, status) {
  if (context.timedOut === true) return "REQUEST_TIMEOUT";
  if (context.networkError === true) return "NETWORK_ERROR";
  if (error?.name === "AbortError") return "REQUEST_ABORTED";

  const rawCode = String(context.code || rawCodeFrom(error)).trim().toUpperCase();
  const aliased = CODE_ALIASES[rawCode] || rawCode;
  return SAFE_CODES.has(aliased) ? aliased : codeForStatus(status);
}

function safeRequestId(value) {
  const candidate = String(value || "").trim();
  return /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(candidate) ? candidate : "";
}

function requestIdFrom(error, context) {
  return safeRequestId(
    context.requestId
      || error?.requestId
      || error?.body?.requestId
      || error?.body?.error?.requestId
      || error?.error?.requestId,
  );
}

function safeFieldErrors(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
  const result = {};
  Object.keys(value).slice(0, 20).forEach((fieldName) => {
    if (SAFE_FIELD_NAMES.has(fieldName)) {
      result[fieldName] = "Review this field and try again.";
    }
  });
  return Object.freeze(result);
}

function isRetryable(code, status, error) {
  if (["NETWORK_ERROR", "RATE_LIMITED", "REQUEST_TIMEOUT", "SERVICE_UNAVAILABLE"].includes(code)) return true;
  if (["REQUEST_ABORTED", "SESSION_REQUIRED", "MFA_REQUIRED", "PERMISSION_DENIED", "VALIDATION_FAILED"].includes(code)) return false;
  if (status >= 500 || status === 408 || status === 429) return true;
  return error?.retryable === true && status !== 401 && status !== 403;
}

export function createAdminErrorEnvelope({
  code = "REQUEST_FAILED",
  fieldErrors = {},
  requestId = "",
  retryAfterSeconds = null,
  retryable,
} = {}) {
  const canonical = SAFE_CODES.has(code) ? code : "REQUEST_FAILED";
  return Object.freeze({
    code: canonical,
    userMessage: MESSAGE_BY_CODE[canonical],
    fieldErrors: safeFieldErrors(fieldErrors),
    retryable: retryable === true,
    requestId: safeRequestId(requestId),
    retryAfterSeconds: Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.min(retryAfterSeconds, 3600)
      : null,
  });
}

/** Converts any transport/backend failure to the only error shape allowed in Admin v2 UI. */
export function normalizeAdminError(error, context = {}) {
  const status = statusFrom(error);
  const code = canonicalCode(error, context, status);
  return createAdminErrorEnvelope({
    code,
    fieldErrors: context.fieldErrors,
    requestId: requestIdFrom(error, context),
    retryAfterSeconds: Number(error?.retryAfterSeconds) || null,
    retryable: isRetryable(code, status, error),
  });
}

export function isAdminErrorEnvelope(value) {
  return Boolean(
    value
      && SAFE_CODES.has(value.code)
      && SAFE_MESSAGES.has(value.userMessage)
      && value.fieldErrors
      && typeof value.fieldErrors === "object"
      && typeof value.retryable === "boolean"
      && typeof value.requestId === "string"
      && (value.retryAfterSeconds === null
        || (Number.isInteger(value.retryAfterSeconds) && value.retryAfterSeconds > 0)),
  );
}
