import { normalizeAdminError } from "../../core/error-envelope.js";

const ADMIN_API_BASE_PATH = "/api/admin";
const DEFAULT_TIMEOUT_MS = 15_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_GAME_PATTERN = /^[a-z0-9][a-z0-9._~-]{15,127}$/i;
const LISTING_ID_PATTERN = /^lst_[0-9a-f]{32}$/;
const DISPUTE_ID_PATTERN = /^dsp_[0-9a-f]{32}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const LISTING_ACTIONS = new Set(["hold", "approve", "reject"]);
const DISPUTE_ACTIONS = new Set(["refund", "resolve-seller", "reject"]);
const POLICY_FIELDS = Object.freeze([
  "marketplaceEnabled",
  "crossCountryTradingEnabled",
  "moderationRequired",
  "feeRate",
  "taxRate",
  "listingDurationHours",
  "purchaseReservationMinutes",
  "disputeWindowDays",
  "disputesEnabled",
  "countryFeeOverrides",
  "blockedCountryCodes",
]);

class MarketplaceTransportDiagnostic extends Error {
  constructor({ status = 0, code = "REQUEST_FAILED", requestId = "", retryable = false, retryAfterSeconds = null } = {}) {
    super("Marketplace administrator request failed.");
    this.name = "MarketplaceTransportDiagnostic";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function normalizeTimeout(value, fallback = DEFAULT_TIMEOUT_MS) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 250 && numeric <= 120_000 ? Math.round(numeric) : fallback;
}

function safeRejection(error) {
  if (error && typeof error === "object" && "userMessage" in error) return Promise.reject(error);
  return Promise.reject(normalizeAdminError(error));
}

function requireGameToken(value) {
  const token = String(value || "").trim();
  if (!UUID_PATTERN.test(token) && !OPAQUE_GAME_PATTERN.test(token)) {
    throw new MarketplaceTransportDiagnostic({ status: 400, code: "GAME_CONTEXT_REQUIRED" });
  }
  return encodeURIComponent(token);
}

function requirePublicId(value, pattern) {
  const token = String(value || "").trim().toLowerCase();
  if (!pattern.test(token)) {
    throw new MarketplaceTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return encodeURIComponent(token);
}

function requireIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new MarketplaceTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return key;
}

function requireVersion(value) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new MarketplaceTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return version;
}

function requireReason(value) {
  const reason = String(value || "").trim();
  if (!reason || reason.length > 1_000) {
    throw new MarketplaceTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  return reason;
}

function marketplacePath(gameId, suffix = "") {
  return `/games/${requireGameToken(gameId)}/marketplace${suffix}`;
}

function canonicalResponseCode(value) {
  const code = String(value || "REQUEST_FAILED").trim();
  return ["staff_mfa_required", "aal2_required"].includes(code.toLowerCase()) ? "MFA_REQUIRED" : code;
}

function bodyError(payload, response) {
  const nested = payload?.error && typeof payload.error === "object" ? payload.error : {};
  const retryAfter = Number(response.headers?.get?.("retry-after"));
  return new MarketplaceTransportDiagnostic({
    status: Number(response.status || 0),
    code: canonicalResponseCode(nested.code || payload?.code),
    requestId: String(response.headers?.get?.("x-request-id") || nested.requestId || payload?.requestId || ""),
    retryable: nested.retryable === true || payload?.retryable === true,
    retryAfterSeconds: Number.isInteger(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 3600) : null,
  });
}

function invalidResponse(response) {
  return new MarketplaceTransportDiagnostic({
    status: Number(response?.status || 0),
    code: "INVALID_RESPONSE",
    requestId: String(response?.headers?.get?.("x-request-id") || ""),
    retryable: true,
  });
}

async function parseJson(response) {
  const bodyText = await response.text();
  let payload = null;
  if (bodyText.trim()) {
    try {
      payload = JSON.parse(bodyText);
    } catch (_error) {
      throw new MarketplaceTransportDiagnostic({
        status: Number(response.status || 0),
        code: response.ok ? "INVALID_RESPONSE" : "REQUEST_FAILED",
        requestId: String(response.headers?.get?.("x-request-id") || ""),
        retryable: response.ok || Number(response.status || 0) >= 500,
      });
    }
  }
  if (!response.ok) throw bodyError(payload, response);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw invalidResponse(response);
  return payload;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validateSnapshot(payload, response) {
  const data = payload?.data;
  if (
    !isRecord(data)
    || !isRecord(data.policy)
    || !Array.isArray(data.listings)
    || !Array.isArray(data.reservations)
    || !Array.isArray(data.orders)
    || !Array.isArray(data.disputes)
    || !Array.isArray(data.audit)
    || !Array.isArray(data.postings)
  ) throw invalidResponse(response);
  return payload;
}

function validateCommitted(payload, response) {
  if (!isRecord(payload?.data) || payload.data.committed !== true) throw invalidResponse(response);
  return payload;
}

function linkAbort(sourceSignal, controller) {
  if (!sourceSignal) return () => {};
  if (sourceSignal.aborted) {
    controller.abort(sourceSignal.reason);
    return () => {};
  }
  const abort = () => controller.abort(sourceSignal.reason);
  sourceSignal.addEventListener("abort", abort, { once: true });
  return () => sourceSignal.removeEventListener("abort", abort);
}

function abortError() {
  if (typeof DOMException === "function") return new DOMException("The request was cancelled.", "AbortError");
  const error = new Error("The request was cancelled.");
  error.name = "AbortError";
  return error;
}

function serializeJson(value) {
  try {
    return JSON.stringify(value);
  } catch (_error) {
    throw new MarketplaceTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
}

function cleanPolicy(value) {
  if (!isRecord(value)) throw new MarketplaceTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  const body = {};
  POLICY_FIELDS.forEach((field) => {
    if (Object.hasOwn(value, field)) body[field] = value[field];
  });
  if (Object.keys(body).length !== POLICY_FIELDS.length) {
    throw new MarketplaceTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  return body;
}

/** Source-owned Admin v2 adapter for the existing Marketplace moderation contract. */
export function createMarketplaceApiClient({ fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Marketplace Admin BFF transport is unavailable.");

  let activeReadController = null;
  const inFlightMutations = new Map();

  async function request(path, {
    method = "GET",
    body,
    idempotencyKey = "",
    signal,
    timeoutMs: requestTimeoutMs,
    validate,
  } = {}) {
    const controller = new AbortController();
    const unlink = linkAbort(signal, controller);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)));
    try {
      if (controller.signal.aborted) throw abortError();
      const headers = { Accept: "application/json" };
      if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetchImpl(`${ADMIN_API_BASE_PATH}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: serializeJson(body) }),
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      const payload = await parseJson(response);
      return typeof validate === "function" ? validate(payload, response) : payload;
    } catch (error) {
      if (error && typeof error === "object" && "userMessage" in error) throw error;
      const networkError = !timedOut && !controller.signal.aborted && !(error instanceof MarketplaceTransportDiagnostic);
      throw normalizeAdminError(error, {
        timedOut,
        networkError,
        code: !timedOut && controller.signal.aborted ? "REQUEST_ABORTED" : "",
      });
    } finally {
      clearTimeout(timer);
      unlink();
    }
  }

  function readMarketplace({ gameId, signal, timeoutMs: requestTimeoutMs } = {}) {
    try {
      activeReadController?.abort();
      const controller = new AbortController();
      activeReadController = controller;
      const unlink = linkAbort(signal, controller);
      return request(marketplacePath(gameId), {
        signal: controller.signal,
        timeoutMs: requestTimeoutMs,
        validate: validateSnapshot,
      }).finally(() => {
        unlink();
        if (activeReadController === controller) activeReadController = null;
      });
    } catch (error) {
      return safeRejection(error);
    }
  }

  function cancelMarketplaceRequest() {
    if (!activeReadController) return false;
    activeReadController.abort();
    activeReadController = null;
    return true;
  }

  function mutate({ method, path, body, idempotencyKey, signal, timeoutMs: requestTimeoutMs }) {
    let key;
    try {
      key = requireIdempotencyKey(idempotencyKey);
      const fingerprint = serializeJson({ method, path, body });
      const existing = inFlightMutations.get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          return safeRejection(new MarketplaceTransportDiagnostic({ status: 409, code: "CONFLICT" }));
        }
        return existing.promise;
      }
      const promise = request(path, {
        method,
        body,
        idempotencyKey: key,
        signal,
        timeoutMs: requestTimeoutMs,
        validate: validateCommitted,
      });
      const entry = { fingerprint, promise };
      inFlightMutations.set(key, entry);
      const clear = () => {
        if (inFlightMutations.get(key) === entry) inFlightMutations.delete(key);
      };
      promise.then(clear, clear);
      return promise;
    } catch (error) {
      return safeRejection(error);
    }
  }

  function reviewListing({ gameId, listingId, action, expectedVersion, reason, idempotencyKey, signal } = {}) {
    try {
      const normalizedAction = String(action || "").trim().toLowerCase();
      if (!LISTING_ACTIONS.has(normalizedAction)) {
        throw new MarketplaceTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
      }
      const key = requireIdempotencyKey(idempotencyKey);
      const id = requirePublicId(listingId, LISTING_ID_PATTERN);
      return mutate({
        method: "POST",
        path: marketplacePath(gameId, `/listings/${id}/${normalizedAction}`),
        idempotencyKey: key,
        signal,
        body: { expectedVersion: requireVersion(expectedVersion), reason: requireReason(reason), idempotencyKey: key },
      });
    } catch (error) {
      return safeRejection(error);
    }
  }

  function reviewDispute({ gameId, disputeId, action, expectedVersion, reason, idempotencyKey, signal } = {}) {
    try {
      const normalizedAction = String(action || "").trim().toLowerCase();
      if (!DISPUTE_ACTIONS.has(normalizedAction)) {
        throw new MarketplaceTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
      }
      const key = requireIdempotencyKey(idempotencyKey);
      const id = requirePublicId(disputeId, DISPUTE_ID_PATTERN);
      return mutate({
        method: "POST",
        path: marketplacePath(gameId, `/disputes/${id}/${normalizedAction}`),
        idempotencyKey: key,
        signal,
        body: { expectedVersion: requireVersion(expectedVersion), reason: requireReason(reason), idempotencyKey: key },
      });
    } catch (error) {
      return safeRejection(error);
    }
  }

  function updatePolicy({ gameId, policy, idempotencyKey, signal } = {}) {
    try {
      return mutate({
        method: "PATCH",
        path: marketplacePath(gameId, "/policy"),
        idempotencyKey: requireIdempotencyKey(idempotencyKey),
        signal,
        body: cleanPolicy(policy),
      });
    } catch (error) {
      return safeRejection(error);
    }
  }

  return Object.freeze({
    readMarketplace,
    cancelMarketplaceRequest,
    reviewListing,
    reviewDispute,
    updatePolicy,
  });
}
