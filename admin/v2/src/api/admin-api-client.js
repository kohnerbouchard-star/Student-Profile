import { normalizeAdminError } from "../core/error-envelope.js";

export const ADMIN_API_BASE_PATH = "/api/admin";
export const ADMIN_OVERVIEW_RESOURCE_KEYS = Object.freeze([
  "dashboard",
  "games",
  "notifications",
  "store",
]);

const DEFAULT_TIMEOUT_MS = 15_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_GAME_PATTERN = /^[a-z0-9][a-z0-9._~-]{15,127}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const STORE_CREATE_FIELDS = Object.freeze([
  "itemKey",
  "name",
  "description",
  "category",
  "price",
  "currencyCode",
  "stockQuantity",
  "status",
  "visibility",
  "sortOrder",
]);
const STORE_UPDATE_FIELDS = Object.freeze(STORE_CREATE_FIELDS.filter((field) => field !== "itemKey"));

class AdminTransportDiagnostic extends Error {
  constructor({
    status = 0,
    code = "REQUEST_FAILED",
    requestId = "",
    retryable = false,
    retryAfterSeconds = null,
    fieldErrors = {},
  } = {}) {
    super("Admin API request failed.");
    this.name = "AdminTransportDiagnostic";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
    this.fieldErrors = fieldErrors;
  }
}

function normalizeTimeout(value, fallback = DEFAULT_TIMEOUT_MS) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 250 && numeric <= 120_000
    ? Math.round(numeric)
    : fallback;
}

function requireGameToken(value) {
  const token = String(value || "").trim();
  if (!UUID_PATTERN.test(token) && !OPAQUE_GAME_PATTERN.test(token)) {
    throw new AdminTransportDiagnostic({ status: 400, code: "GAME_CONTEXT_REQUIRED" });
  }
  return encodeURIComponent(token);
}

function requireItemToken(value) {
  const token = String(value || "").trim();
  if (!UUID_PATTERN.test(token)) {
    throw new AdminTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return encodeURIComponent(token);
}

function requireIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new AdminTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return key;
}

function storeCollectionPath(gameId, { includeReadProjection = false } = {}) {
  const path = `/games/${requireGameToken(gameId)}/store/items`;
  return includeReadProjection ? `${path}?include=stock,prices,purchaseStats` : path;
}

function storeItemPath(gameId, itemId) {
  return `${storeCollectionPath(gameId)}/${requireItemToken(itemId)}`;
}

function overviewResourceSpecs(gameId) {
  return Object.freeze({
    dashboard: () => `/games/${requireGameToken(gameId)}/dashboard`,
    games: () => "/games",
    notifications: () => "/notifications?scope=admin-console",
    store: () => storeCollectionPath(gameId, { includeReadProjection: true }),
  });
}

function canonicalResponseCode(value) {
  const code = String(value || "REQUEST_FAILED").trim();
  if (["staff_mfa_required", "aal2_required"].includes(code.toLowerCase())) {
    return "MFA_REQUIRED";
  }
  return code;
}

function bodyErrorDiagnostic(payload, response) {
  const bodyError = payload?.error && typeof payload.error === "object" ? payload.error : {};
  return new AdminTransportDiagnostic({
    status: Number(response.status || 0),
    code: canonicalResponseCode(bodyError.code || payload?.code),
    requestId: String(
      response.headers?.get?.("x-request-id")
        || bodyError.requestId
        || payload?.requestId
        || "",
    ),
    retryable: bodyError.retryable === true || payload?.retryable === true,
    fieldErrors: bodyError.fieldErrors || payload?.fieldErrors || {},
    retryAfterSeconds: (() => {
      const value = Number(response.headers?.get?.("retry-after"));
      return Number.isInteger(value) && value > 0 ? Math.min(value, 3600) : null;
    })(),
  });
}

function invalidResponse(response) {
  return new AdminTransportDiagnostic({
    status: Number(response?.status || 0),
    code: "INVALID_RESPONSE",
    requestId: response?.headers?.get?.("x-request-id") || "",
    retryable: true,
  });
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let payload = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      throw new AdminTransportDiagnostic({
        status: Number(response.status || 0),
        code: response.ok ? "INVALID_RESPONSE" : "REQUEST_FAILED",
        requestId: response.headers?.get?.("x-request-id") || "",
        retryable: response.ok || Number(response.status || 0) >= 500,
      });
    }
  }

  if (!response.ok) throw bodyErrorDiagnostic(payload, response);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw invalidResponse(response);
  }
  return payload;
}

function linkAbortSignal(sourceSignal, targetController) {
  if (!sourceSignal) return () => {};
  if (sourceSignal.aborted) {
    targetController.abort(sourceSignal.reason);
    return () => {};
  }

  const abort = () => targetController.abort(sourceSignal.reason);
  sourceSignal.addEventListener("abort", abort, { once: true });
  return () => sourceSignal.removeEventListener("abort", abort);
}

function abortError() {
  if (typeof DOMException === "function") {
    return new DOMException("The request was cancelled.", "AbortError");
  }
  const error = new Error("The request was cancelled.");
  error.name = "AbortError";
  return error;
}

function serializeJsonBody(body) {
  if (body === undefined) return undefined;
  try {
    return JSON.stringify(body);
  } catch (_error) {
    throw new AdminTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
}

async function requestAdminJson(fetchImpl, path, {
  method = "GET",
  body,
  headers = {},
  signal,
  timeoutMs,
  validate,
}) {
  if (!String(path || "").startsWith("/")) {
    throw normalizeAdminError(new AdminTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" }));
  }

  const controller = new AbortController();
  const unlinkAbort = linkAbortSignal(signal, controller);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, normalizeTimeout(timeoutMs));

  try {
    if (controller.signal.aborted) throw abortError();
    const serializedBody = serializeJsonBody(body);
    const response = await fetchImpl(`${ADMIN_API_BASE_PATH}${path}`, {
      method: String(method || "GET").toUpperCase(),
      headers: { Accept: "application/json", ...headers },
      ...(serializedBody === undefined ? {} : { body: serializedBody }),
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    const payload = await parseJsonResponse(response);
    return typeof validate === "function" ? validate(payload, response) : payload;
  } catch (error) {
    if (error && typeof error === "object" && "userMessage" in error) throw error;
    const isNetworkError = !timedOut
      && !controller.signal.aborted
      && !(error instanceof AdminTransportDiagnostic);
    throw normalizeAdminError(error, {
      timedOut,
      networkError: isNetworkError,
      code: !timedOut && controller.signal.aborted ? "REQUEST_ABORTED" : "",
      fieldErrors: error?.fieldErrors,
    });
  } finally {
    clearTimeout(timeout);
    unlinkAbort();
  }
}

function storeMutationBody(value, allowedFields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AdminTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  const body = {};
  allowedFields.forEach((field) => {
    if (Object.hasOwn(value, field) && value[field] !== undefined) {
      body[field] = value[field];
    }
  });
  if (Object.keys(body).length === 0) {
    throw new AdminTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  return body;
}

function validateStoreRead(payload, response) {
  const data = payload?.data;
  if (
    !data
    || typeof data !== "object"
    || Array.isArray(data)
    || (!Array.isArray(data.storeItems) && !Array.isArray(data.items))
  ) {
    throw invalidResponse(response);
  }
  return payload;
}

function validateStoreMutation(payload, response) {
  if (
    payload?.ok !== true
    || !payload.item
    || typeof payload.item !== "object"
    || Array.isArray(payload.item)
  ) {
    throw invalidResponse(response);
  }
  return payload;
}

function asSafeRejection(error) {
  return Promise.reject(
    error && typeof error === "object" && "userMessage" in error
      ? error
      : normalizeAdminError(error, { fieldErrors: error?.fieldErrors }),
  );
}

async function settlePanel(fetchImpl, pathFactory, options) {
  try {
    const path = pathFactory();
    const value = await requestAdminJson(fetchImpl, path, options);
    return Object.freeze({ status: "fulfilled", value });
  } catch (error) {
    const reason = error && typeof error === "object" && "userMessage" in error
      ? error
      : normalizeAdminError(error);
    return Object.freeze({ status: "rejected", reason });
  }
}

/**
 * Creates the Admin v2 API adapter. The configured fetch is expected
 * to be a scoped HttpOnly Admin BFF transport; this module never creates or
 * forwards an Authorization header and never calls the Staff API directly.
 */
export function createAdminApiClient({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Admin API fetch is unavailable.");

  let activeRequestVersion = 0;
  let activeController = null;
  let activeStoreController = null;
  const inFlightMutations = new Map();

  async function readOverview({ gameId, signal, timeoutMs: requestTimeoutMs } = {}) {
    activeRequestVersion += 1;
    const requestVersion = activeRequestVersion;
    activeController?.abort();

    const batchController = new AbortController();
    activeController = batchController;
    const unlinkAbort = linkAbortSignal(signal, batchController);
    const specs = overviewResourceSpecs(gameId);
    const options = {
      signal: batchController.signal,
      timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
    };

    try {
      const entries = await Promise.all(ADMIN_OVERVIEW_RESOURCE_KEYS.map(async (key) => [
        key,
        await settlePanel(fetchImpl, specs[key], options),
      ]));
      return Object.freeze({
        requestVersion,
        current: requestVersion === activeRequestVersion,
        panels: Object.freeze(Object.fromEntries(entries)),
      });
    } finally {
      unlinkAbort();
      if (activeController === batchController) activeController = null;
    }
  }

  function cancelOverviewRequest() {
    if (!activeController) return false;
    activeRequestVersion += 1;
    activeController.abort();
    activeController = null;
    return true;
  }

  function readStore({ gameId, signal, timeoutMs: requestTimeoutMs } = {}) {
    try {
      const path = storeCollectionPath(gameId, { includeReadProjection: true });
      activeStoreController?.abort();
      const storeController = new AbortController();
      activeStoreController = storeController;
      const unlinkAbort = linkAbortSignal(signal, storeController);
      const request = requestAdminJson(
        fetchImpl,
        path,
        {
          signal: storeController.signal,
          timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
          validate: validateStoreRead,
        },
      );
      return request.finally(() => {
        unlinkAbort();
        if (activeStoreController === storeController) activeStoreController = null;
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function cancelStoreRequest() {
    if (!activeStoreController) return false;
    activeStoreController.abort();
    activeStoreController = null;
    return true;
  }

  function storeMutation({
    method,
    path,
    body,
    idempotencyKey,
    signal,
    timeoutMs: requestTimeoutMs,
  }) {
    const key = requireIdempotencyKey(idempotencyKey);
    const fingerprint = serializeJsonBody({ method, path, body });
    const existing = inFlightMutations.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return asSafeRejection(
          new AdminTransportDiagnostic({ status: 409, code: "CONFLICT" }),
        );
      }
      return existing.promise;
    }

    const promise = requestAdminJson(fetchImpl, path, {
      method,
      body,
      headers: {
        "Idempotency-Key": key,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      signal,
      timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
      validate: validateStoreMutation,
    });
    const entry = { fingerprint, promise };
    inFlightMutations.set(key, entry);
    const clear = () => {
      if (inFlightMutations.get(key) === entry) inFlightMutations.delete(key);
    };
    promise.then(clear, clear);
    return promise;
  }

  function createStoreItem({
    gameId,
    item,
    input,
    idempotencyKey,
    signal,
    timeoutMs: requestTimeoutMs,
  } = {}) {
    try {
      return storeMutation({
        method: "POST",
        path: storeCollectionPath(gameId),
        body: storeMutationBody(item ?? input, STORE_CREATE_FIELDS),
        idempotencyKey,
        signal,
        timeoutMs: requestTimeoutMs,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function updateStoreItem({
    gameId,
    itemId,
    changes,
    input,
    idempotencyKey,
    signal,
    timeoutMs: requestTimeoutMs,
  } = {}) {
    try {
      return storeMutation({
        method: "PATCH",
        path: storeItemPath(gameId, itemId),
        body: storeMutationBody(changes ?? input, STORE_UPDATE_FIELDS),
        idempotencyKey,
        signal,
        timeoutMs: requestTimeoutMs,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function archiveStoreItem({
    gameId,
    itemId,
    idempotencyKey,
    signal,
    timeoutMs: requestTimeoutMs,
  } = {}) {
    try {
      return storeMutation({
        method: "DELETE",
        path: storeItemPath(gameId, itemId),
        body: undefined,
        idempotencyKey,
        signal,
        timeoutMs: requestTimeoutMs,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  return Object.freeze({
    readOverview,
    cancelOverviewRequest,
    readStore,
    cancelStoreRequest,
    createStoreItem,
    updateStoreItem,
    archiveStoreItem,
    getRequestVersion: () => activeRequestVersion,
    isCurrentRequestVersion: (version) => Number(version) === activeRequestVersion,
  });
}
