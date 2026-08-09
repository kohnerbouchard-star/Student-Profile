import { normalizeAdminError } from "../../core/error-envelope.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_GAME_PATTERN = /^[a-z0-9][a-z0-9._~-]{15,127}$/i;
const BUSINESS_KEY_PATTERN = /^biz_[0-9a-f]{32}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;

function timeout(value, fallback = DEFAULT_TIMEOUT_MS) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 250 && number <= 120_000 ? Math.round(number) : fallback;
}

function gameToken(value) {
  const token = String(value || "").trim();
  if (!UUID_PATTERN.test(token) && !OPAQUE_GAME_PATTERN.test(token)) throw invalidRequest();
  return encodeURIComponent(token);
}

function businessToken(value) {
  const token = String(value || "").trim().toLowerCase();
  if (!BUSINESS_KEY_PATTERN.test(token)) throw invalidRequest();
  return encodeURIComponent(token);
}

function idempotencyKey(value) {
  const key = String(value || "").trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) throw invalidRequest();
  return key;
}

function invalidRequest(status = 400, code = "INVALID_REQUEST") {
  const error = new Error("Admin Business request is invalid.");
  error.status = status;
  error.code = code;
  error.retryable = false;
  return error;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeError(error, context = {}) {
  return error && typeof error === "object" && "userMessage" in error
    ? error
    : normalizeAdminError(error, context);
}

async function requestJson(fetchImpl, path, {
  method = "GET",
  body,
  headers = {},
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  validate,
} = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener?.("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout(timeoutMs));

  try {
    const response = await fetchImpl(`/api/admin${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...headers,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });

    const raw = await response.text();
    let payload = null;
    if (raw.trim()) {
      try {
        payload = JSON.parse(raw);
      } catch {
        throw invalidRequest(Number(response.status || 0), response.ok ? "INVALID_RESPONSE" : "REQUEST_FAILED");
      }
    }
    if (!response.ok) {
      const error = new Error("Admin Business request failed.");
      error.status = Number(response.status || 0);
      error.code = String(payload?.error?.code || payload?.code || "REQUEST_FAILED");
      error.requestId = String(response.headers?.get?.("x-request-id") || payload?.requestId || "");
      error.retryAfterSeconds = Number(response.headers?.get?.("retry-after")) || null;
      error.retryable = payload?.retryable === true || Number(response.status || 0) >= 500;
      throw error;
    }
    if (!isRecord(payload)) throw invalidRequest(Number(response.status || 0), "INVALID_RESPONSE");
    if (validate && !validate(payload)) throw invalidRequest(Number(response.status || 0), "INVALID_RESPONSE");
    return payload;
  } catch (error) {
    if (error && typeof error === "object" && "userMessage" in error) throw error;
    const networkError = !timedOut && !controller.signal.aborted && !error?.status;
    throw safeError(error, {
      timedOut,
      networkError,
      code: !timedOut && controller.signal.aborted ? "REQUEST_ABORTED" : "",
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", abort);
  }
}

function validateBusinessRead(payload) {
  return isRecord(payload?.data) && Array.isArray(payload.data.businesses);
}

function validateBusinessMutation(payload) {
  return isRecord(payload?.data) && Object.hasOwn(payload.data, "result");
}

function complianceBody(input, key) {
  if (!isRecord(input)) throw invalidRequest(422, "VALIDATION_FAILED");
  return {
    requirementKey: input.requirementKey,
    requirementType: input.requirementType,
    status: input.status,
    feeAmount: input.feeAmount ?? 0,
    policyEffects: {},
    expiresAt: input.expiresAt || null,
    reason: input.reason,
    idempotencyKey: key,
  };
}

export function createBusinessApi({ fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Business Admin BFF transport is unavailable.");
  let activeRead = null;
  const inFlight = new Map();

  function readBusinesses({ gameId, signal, timeoutMs: requestTimeoutMs } = {}) {
    try {
      activeRead?.abort();
      const controller = new AbortController();
      activeRead = controller;
      const abort = () => controller.abort(signal?.reason);
      if (signal?.aborted) abort();
      else signal?.addEventListener?.("abort", abort, { once: true });
      const request = requestJson(
        fetchImpl,
        `/games/${gameToken(gameId)}/businesses`,
        {
          signal: controller.signal,
          timeoutMs: timeout(requestTimeoutMs, timeout(timeoutMs)),
          validate: validateBusinessRead,
        },
      );
      return request.finally(() => {
        signal?.removeEventListener?.("abort", abort);
        if (activeRead === controller) activeRead = null;
      });
    } catch (error) {
      return Promise.reject(safeError(error));
    }
  }

  function cancelBusinessRequest() {
    if (!activeRead) return false;
    activeRead.abort();
    activeRead = null;
    return true;
  }

  function setBusinessCompliance({
    gameId,
    businessKey,
    input,
    idempotencyKey: requestKey,
    signal,
    timeoutMs: requestTimeoutMs,
  } = {}) {
    try {
      const key = idempotencyKey(requestKey);
      const path = `/games/${gameToken(gameId)}/businesses/${businessToken(businessKey)}/compliance`;
      const body = complianceBody(input, key);
      const fingerprint = JSON.stringify({ path, body });
      const existing = inFlight.get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) return Promise.reject(safeError(invalidRequest(409, "CONFLICT")));
        return existing.promise;
      }
      const promise = requestJson(fetchImpl, path, {
        method: "POST",
        body,
        headers: { "Idempotency-Key": key },
        signal,
        timeoutMs: timeout(requestTimeoutMs, timeout(timeoutMs)),
        validate: validateBusinessMutation,
      });
      const entry = { fingerprint, promise };
      inFlight.set(key, entry);
      const clear = () => {
        if (inFlight.get(key) === entry) inFlight.delete(key);
      };
      promise.then(clear, clear);
      return promise;
    } catch (error) {
      return Promise.reject(safeError(error));
    }
  }

  return Object.freeze({ readBusinesses, cancelBusinessRequest, setBusinessCompliance });
}
