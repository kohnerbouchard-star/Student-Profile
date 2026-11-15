
import { normalizeAdminError } from "../../core/error-envelope.js";


const WORLD_MANAGEMENT_RESOURCE_KEYS = Object.freeze([
  "campaign",
  "history",
  "effects",
  "arrivals",
  "geography",
  "travel",
  "residency",
]);

const WORLD_ARRIVAL_CLASS_IDS = Object.freeze([
  "analyst",
  "builder",
  "maker",
  "mediator",
  "navigator",
  "operator",
  "steward",
  "trader",
]);

const DEFAULT_TIMEOUT_MS = 15_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_GAME_PATTERN = /^[a-z0-9][a-z0-9._~-]{15,127}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const CAMPAIGN_ID_PATTERN = /^cmp_[0-9a-f]{32}$/;
const EFFECT_ID_PATTERN = /^cec_[0-9a-f]{32}$/;
const ASSIGNMENT_ID_PATTERN = /^acl_[0-9a-f]{32}$/;
const ROUTE_ID_PATTERN = /^rte_[a-z0-9_]+$/;

class WorldTransportDiagnostic extends Error {
  constructor({
    status = 0,
    code = "REQUEST_FAILED",
    requestId = "",
    retryable = false,
    retryAfterSeconds = null,
  } = {}) {
    super("World administrator request failed.");
    this.name = "WorldTransportDiagnostic";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
    throw new WorldTransportDiagnostic({ status: 400, code: "GAME_CONTEXT_REQUIRED" });
  }
  return encodeURIComponent(token);
}

function requirePublicId(value, pattern) {
  const token = String(value || "").trim().toLowerCase();
  if (!pattern.test(token)) {
    throw new WorldTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  return token;
}

function requireIdempotencyKey(value) {
  const token = String(value || "").trim();
  if (!IDEMPOTENCY_PATTERN.test(token)) {
    throw new WorldTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  return token;
}

function requireRevision(value) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new WorldTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  return revision;
}

function requireReason(value) {
  const reason = String(value || "").trim();
  if (reason.length < 12 || reason.length > 1_000) {
    throw new WorldTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  return reason;
}

function basePath(gameId) {
  return `/api/admin/games/${requireGameToken(gameId)}/world`;
}

function resourceSpecs(gameId) {
  const base = basePath(gameId);
  return Object.freeze({
    campaign: () => `${base}/campaign`,
    history: () => `${base}/campaign/history?limit=100`,
    effects: () => `${base}/campaign/effects?status=all&limit=100`,
    arrivals: () => `${base}/arrival-classes?limit=100`,
    geography: () => `${base}/geography`,
    travel: () => `${base}/travel?limit=100`,
    residency: () => `${base}/residency?limit=100`,
  });
}

function canonicalResponseCode(value) {
  const code = String(value || "REQUEST_FAILED").trim();
  if (["staff_mfa_required", "aal2_required"].includes(code.toLowerCase())) {
    return "MFA_REQUIRED";
  }
  return code;
}

function invalidResponse(response) {
  return new WorldTransportDiagnostic({
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
      throw new WorldTransportDiagnostic({
        status: Number(response.status || 0),
        code: response.ok ? "INVALID_RESPONSE" : "REQUEST_FAILED",
        requestId: response.headers?.get?.("x-request-id") || "",
        retryable: response.ok || Number(response.status || 0) >= 500,
      });
    }
  }

  if (!response.ok) {
    const bodyError = isRecord(payload?.error) ? payload.error : {};
    const retryAfter = Number(response.headers?.get?.("retry-after"));
    throw new WorldTransportDiagnostic({
      status: Number(response.status || 0),
      code: canonicalResponseCode(bodyError.code || payload?.code),
      requestId: String(
        response.headers?.get?.("x-request-id")
          || bodyError.requestId
          || payload?.requestId
          || "",
      ),
      retryable: bodyError.retryable === true || payload?.retryable === true,
      retryAfterSeconds: Number.isInteger(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter, 3600)
        : null,
    });
  }

  if (!isRecord(payload)) throw invalidResponse(response);
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

async function requestWorldJson(fetchImpl, path, {
  method = "GET",
  body,
  headers = {},
  signal,
  timeoutMs,
  validate,
} = {}) {
  const controller = new AbortController();
  const unlinkAbort = linkAbortSignal(signal, controller);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, normalizeTimeout(timeoutMs));

  try {
    if (controller.signal.aborted) throw abortError();
    const serializedBody = body === undefined ? undefined : JSON.stringify(body);
    const response = await fetchImpl(path, {
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
      && !(error instanceof WorldTransportDiagnostic);
    throw normalizeAdminError(error, {
      timedOut,
      networkError: isNetworkError,
      code: !timedOut && controller.signal.aborted ? "REQUEST_ABORTED" : "",
    });
  } finally {
    clearTimeout(timeout);
    unlinkAbort();
  }
}

function validateData(payload, response, predicate) {
  if (!isRecord(payload?.data) || !predicate(payload.data)) {
    throw invalidResponse(response);
  }
  return payload;
}

const PANEL_VALIDATORS = Object.freeze({
  campaign: (payload, response) => validateData(
    payload,
    response,
    (data) => Array.isArray(data.campaigns) && isRecord(data.scheduler),
  ),
  history: (payload, response) => validateData(
    payload,
    response,
    (data) => Array.isArray(data.history),
  ),
  effects: (payload, response) => validateData(
    payload,
    response,
    (data) => Array.isArray(data.effects) && isRecord(data.summary),
  ),
  arrivals: (payload, response) => validateData(
    payload,
    response,
    (data) => Array.isArray(data.assignments),
  ),
  geography: (payload, response) => validateData(
    payload,
    response,
    (data) => (data.runtime === null || isRecord(data.runtime))
      && Array.isArray(data.locations)
      && Array.isArray(data.routes),
  ),
  travel: (payload, response) => validateData(
    payload,
    response,
    (data) => Array.isArray(data.states) && Array.isArray(data.journeys),
  ),
  residency: (payload, response) => validateData(
    payload,
    response,
    (data) => Array.isArray(data.residency),
  ),
});

function asSafeRejection(error) {
  return Promise.reject(
    error && typeof error === "object" && "userMessage" in error
      ? error
      : normalizeAdminError(error),
  );
}

async function settlePanel(fetchImpl, pathFactory, options, validator) {
  try {
    const value = await requestWorldJson(fetchImpl, pathFactory(), {
      ...options,
      validate: validator,
    });
    return Object.freeze({ status: "fulfilled", value });
  } catch (error) {
    return Object.freeze({
      status: "rejected",
      reason: error && typeof error === "object" && "userMessage" in error
        ? error
        : normalizeAdminError(error),
    });
  }
}

function validateMutation(payload, response) {
  if (!isRecord(payload?.data)) throw invalidResponse(response);
  return payload;
}

export {
  WORLD_MANAGEMENT_RESOURCE_KEYS,
  WORLD_ARRIVAL_CLASS_IDS,
  DEFAULT_TIMEOUT_MS,
  UUID_PATTERN,
  OPAQUE_GAME_PATTERN,
  IDEMPOTENCY_PATTERN,
  CAMPAIGN_ID_PATTERN,
  EFFECT_ID_PATTERN,
  ASSIGNMENT_ID_PATTERN,
  ROUTE_ID_PATTERN,
  WorldTransportDiagnostic,
  isRecord,
  normalizeTimeout,
  requireGameToken,
  requirePublicId,
  requireIdempotencyKey,
  requireRevision,
  requireReason,
  basePath,
  resourceSpecs,
  canonicalResponseCode,
  invalidResponse,
  parseJsonResponse,
  linkAbortSignal,
  abortError,
  requestWorldJson,
  validateData,
  PANEL_VALIDATORS,
  asSafeRejection,
  settlePanel,
  validateMutation,
};
