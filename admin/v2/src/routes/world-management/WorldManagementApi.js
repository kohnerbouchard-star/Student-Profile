import { createAdminBffTransport } from "../../api/admin-bff-transport.js";
import { normalizeAdminError } from "../../core/error-envelope.js";

export const WORLD_MANAGEMENT_RESOURCE_KEYS = Object.freeze([
  "campaign",
  "history",
  "effects",
  "arrivals",
  "geography",
  "travel",
  "residency",
]);

export const WORLD_ARRIVAL_CLASS_IDS = Object.freeze([
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

/**
 * Route-owned adapter for the authoritative World administrator contracts.
 * The default transport is the existing scoped HttpOnly Admin BFF.
 */
export function createWorldManagementApi({
  selectedGameId,
  session = () => globalThis.EconovariaAdminAuthSession?.read?.(),
  fetchImpl = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const gameId = String(selectedGameId || "").trim();
  if (!gameId) throw new TypeError("World Management game context is unavailable.");

  const transport = typeof fetchImpl === "function"
    ? fetchImpl
    : createAdminBffTransport({ selectedGameId: gameId, session });

  let activeRequestVersion = 0;
  let activeController = null;
  const inFlightMutations = new Map();

  async function readWorldManagement({ signal, timeoutMs: requestTimeoutMs } = {}) {
    activeRequestVersion += 1;
    const requestVersion = activeRequestVersion;
    activeController?.abort();

    const batchController = new AbortController();
    activeController = batchController;
    const unlinkAbort = linkAbortSignal(signal, batchController);
    const specs = resourceSpecs(gameId);
    const requestTimeout = normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs));

    try {
      const entries = await Promise.all(WORLD_MANAGEMENT_RESOURCE_KEYS.map(async (key) => [
        key,
        await settlePanel(
          transport,
          specs[key],
          { signal: batchController.signal, timeoutMs: requestTimeout },
          PANEL_VALIDATORS[key],
        ),
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

  function cancelWorldRequest() {
    if (!activeController) return false;
    activeRequestVersion += 1;
    activeController.abort();
    activeController = null;
    return true;
  }

  function mutation({ path, body, idempotencyKey, signal, timeoutMs: requestTimeoutMs }) {
    try {
      const key = requireIdempotencyKey(idempotencyKey);
      const fingerprint = JSON.stringify({ path, body });
      const existing = inFlightMutations.get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          return asSafeRejection(
            new WorldTransportDiagnostic({ status: 409, code: "CONFLICT" }),
          );
        }
        return existing.promise;
      }

      const promise = requestWorldJson(transport, path, {
        method: "POST",
        body,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        signal,
        timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
        validate: validateMutation,
      });
      const entry = { fingerprint, promise };
      inFlightMutations.set(key, entry);
      const clear = () => {
        if (inFlightMutations.get(key) === entry) inFlightMutations.delete(key);
      };
      promise.then(clear, clear);
      return promise;
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function controlCampaign({
    campaignId,
    action,
    expectedRevision,
    reason,
    idempotencyKey,
    signal,
  } = {}) {
    try {
      const campaign = requirePublicId(campaignId, CAMPAIGN_ID_PATTERN);
      const normalizedAction = String(action || "").trim().toLowerCase();
      if (!["pause", "resume", "emergency_disable"].includes(normalizedAction)) {
        throw new WorldTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
      }
      return mutation({
        path: `${basePath(gameId)}/campaign/control`,
        body: {
          action: normalizedAction,
          campaignId: campaign,
          correctedPhase: null,
          expectedRevision: requireRevision(expectedRevision),
          reason: requireReason(reason),
        },
        idempotencyKey,
        signal,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function recoverEffect({
    effectId,
    reason,
    requestId,
    idempotencyKey = requestId,
    signal,
  } = {}) {
    try {
      const effect = requirePublicId(effectId, EFFECT_ID_PATTERN);
      const requestKey = requireIdempotencyKey(requestId);
      return mutation({
        path: `${basePath(gameId)}/campaign/effects/${encodeURIComponent(effect)}/recover`,
        body: { reason: requireReason(reason), requestId: requestKey },
        idempotencyKey,
        signal,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function correctArrivalClass({
    assignmentId,
    classId,
    expectedRevision,
    reason,
    requestId,
    idempotencyKey = requestId,
    signal,
  } = {}) {
    try {
      const assignment = requirePublicId(assignmentId, ASSIGNMENT_ID_PATTERN);
      const requestKey = requireIdempotencyKey(requestId);
      const normalizedClassId = String(classId || "").trim().toLowerCase();
      if (!WORLD_ARRIVAL_CLASS_IDS.includes(normalizedClassId)) {
        throw new WorldTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
      }
      return mutation({
        path: `${basePath(gameId)}/arrival-classes/${encodeURIComponent(assignment)}/correct`,
        body: {
          classId: normalizedClassId,
          expectedRevision: requireRevision(expectedRevision),
          reason: requireReason(reason),
          requestId: requestKey,
        },
        idempotencyKey,
        signal,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function updateRouteState({
    routeIds,
    status,
    reason,
    expectedRevision,
    requestId,
    idempotencyKey = requestId,
    signal,
  } = {}) {
    try {
      const normalizedRouteIds = Array.isArray(routeIds)
        ? routeIds.map((routeId) => requirePublicId(routeId, ROUTE_ID_PATTERN))
        : [];
      if (normalizedRouteIds.length < 1 || normalizedRouteIds.length > 100) {
        throw new WorldTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
      }
      const requestKey = requireIdempotencyKey(requestId);
      const normalizedStatus = String(status || "").trim().toLowerCase();
      const normalizedReason = String(reason || "").trim().toLowerCase();
      const supportedPair = (normalizedStatus === "closed" && normalizedReason === "war")
        || (normalizedStatus === "open" && normalizedReason === "recovery");
      if (!supportedPair) {
        throw new WorldTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
      }
      return mutation({
        path: `${basePath(gameId)}/routes/state`,
        body: {
          costMultiplierBasisPoints: 10_000,
          durationMultiplierBasisPoints: 10_000,
          expectedRevision: requireRevision(expectedRevision),
          reason: normalizedReason,
          requestId: requestKey,
          routeIds: normalizedRouteIds,
          status: normalizedStatus,
        },
        idempotencyKey,
        signal,
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  return Object.freeze({
    readWorldManagement,
    cancelWorldRequest,
    controlCampaign,
    recoverEffect,
    correctArrivalClass,
    updateRouteState,
    getRequestVersion: () => activeRequestVersion,
    isCurrentRequestVersion: (version) => Number(version) === activeRequestVersion,
  });
}
