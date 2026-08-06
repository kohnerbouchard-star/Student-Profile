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

class AdminTransportDiagnostic extends Error {
  constructor({
    status = 0,
    code = "REQUEST_FAILED",
    requestId = "",
    retryable = false,
    retryAfterSeconds = null,
  } = {}) {
    super("Admin API request failed.");
    this.name = "AdminTransportDiagnostic";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
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

function overviewResourceSpecs(gameId) {
  return Object.freeze({
    dashboard: () => `/games/${requireGameToken(gameId)}/dashboard`,
    games: () => "/games",
    notifications: () => "/notifications?scope=admin-console",
    store: () => `/games/${requireGameToken(gameId)}/store/items?include=stock,prices,purchaseStats`,
  });
}

function bodyErrorDiagnostic(payload, response) {
  const bodyError = payload?.error && typeof payload.error === "object" ? payload.error : {};
  return new AdminTransportDiagnostic({
    status: Number(response.status || 0),
    code: String(bodyError.code || payload?.code || "REQUEST_FAILED"),
    requestId: String(
      response.headers?.get?.("x-request-id")
        || bodyError.requestId
        || payload?.requestId
        || "",
    ),
    retryable: bodyError.retryable === true || payload?.retryable === true,
    retryAfterSeconds: (() => {
      const value = Number(response.headers?.get?.("retry-after"));
      return Number.isInteger(value) && value > 0 ? Math.min(value, 3600) : null;
    })(),
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
        retryable: Number(response.status || 0) >= 500,
      });
    }
  }

  if (!response.ok) throw bodyErrorDiagnostic(payload, response);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AdminTransportDiagnostic({
      status: Number(response.status || 0),
      code: "INVALID_RESPONSE",
      requestId: response.headers?.get?.("x-request-id") || "",
      retryable: true,
    });
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

async function requestAdminJson(fetchImpl, path, { signal, timeoutMs }) {
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
    const response = await fetchImpl(`${ADMIN_API_BASE_PATH}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    return await parseJsonResponse(response);
  } catch (error) {
    if (error && typeof error === "object" && "userMessage" in error) throw error;
    const isNetworkError = !timedOut
      && !controller.signal.aborted
      && !(error instanceof AdminTransportDiagnostic);
    throw normalizeAdminError(error, { timedOut, networkError: isNetworkError });
  } finally {
    clearTimeout(timeout);
    unlinkAbort();
  }
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
 * Creates the Admin v2 read-only API adapter. The configured fetch is expected
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

  return Object.freeze({
    readOverview,
    cancelOverviewRequest,
    getRequestVersion: () => activeRequestVersion,
    isCurrentRequestVersion: (version) => Number(version) === activeRequestVersion,
  });
}
