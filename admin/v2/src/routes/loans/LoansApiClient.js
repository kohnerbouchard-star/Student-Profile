import { normalizeAdminError } from "../../core/error-envelope.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_GAME_PATTERN = /^[a-z0-9][a-z0-9._~-]{15,127}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const PUBLIC_KEY_PATTERNS = Object.freeze({
  application: /^lna_[0-9a-f]{32}$/i,
  loan: /^lon_[0-9a-f]{32}$/i,
  product: /^lop_[0-9a-f]{32}$/i,
});

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function timeout(value, fallback = DEFAULT_TIMEOUT_MS) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 250 && number <= 120_000 ? Math.round(number) : fallback;
}

function invalidRequest(status = 400, code = "INVALID_REQUEST") {
  const error = new Error("Admin Loans request is invalid.");
  error.status = status;
  error.code = code;
  error.retryable = false;
  return error;
}

function safeError(error, context = {}) {
  return error && typeof error === "object" && "userMessage" in error
    ? error
    : normalizeAdminError(error, context);
}

function gameToken(value) {
  const token = String(value || "").trim();
  if (!UUID_PATTERN.test(token) && !OPAQUE_GAME_PATTERN.test(token)) throw invalidRequest();
  return encodeURIComponent(token);
}

function publicToken(value, kind) {
  const token = String(value || "").trim().toLowerCase();
  if (!PUBLIC_KEY_PATTERNS[kind]?.test(token)) throw invalidRequest();
  return encodeURIComponent(token);
}

function idempotencyKey(value) {
  const key = String(value || "").trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) throw invalidRequest();
  return key;
}

function validateRead(payload) {
  return isRecord(payload?.data)
    && isRecord(payload.data.summary)
    && Array.isArray(payload.data.currencyTotals)
    && Array.isArray(payload.data.loans)
    && Array.isArray(payload.data.payments)
    && Array.isArray(payload.data.applications)
    && Array.isArray(payload.data.products);
}

function validateMutation(payload) {
  return isRecord(payload?.data) && Object.hasOwn(payload.data, "result");
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
      const error = new Error("Admin Loans request failed.");
      error.status = Number(response.status || 0);
      error.code = String(payload?.error?.code || payload?.code || "REQUEST_FAILED");
      error.requestId = String(response.headers?.get?.("x-request-id") || payload?.requestId || "");
      error.retryAfterSeconds = Number(response.headers?.get?.("retry-after")) || null;
      error.retryable = payload?.retryable === true || Number(response.status || 0) >= 500;
      throw error;
    }
    if (!isRecord(payload) || (validate && !validate(payload))) {
      throw invalidRequest(Number(response.status || 0), "INVALID_RESPONSE");
    }
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

export function createLoansApiClient({ fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Loans Admin BFF transport is unavailable.");
  let activeRead = null;
  const inFlight = new Map();

  function readLoans({ gameId, signal, timeoutMs: requestTimeoutMs } = {}) {
    try {
      activeRead?.abort();
      const controller = new AbortController();
      activeRead = controller;
      const abort = () => controller.abort(signal?.reason);
      if (signal?.aborted) abort();
      else signal?.addEventListener?.("abort", abort, { once: true });
      const request = requestJson(fetchImpl, `/games/${gameToken(gameId)}/economy/loans`, {
        signal: controller.signal,
        timeoutMs: timeout(requestTimeoutMs, timeout(timeoutMs)),
        validate: validateRead,
      });
      return request.finally(() => {
        signal?.removeEventListener?.("abort", abort);
        if (activeRead === controller) activeRead = null;
      });
    } catch (error) {
      return Promise.reject(safeError(error));
    }
  }

  function cancelLoansRequest() {
    if (!activeRead) return false;
    activeRead.abort();
    activeRead = null;
    return true;
  }

  function mutation({ path, body, key, signal, timeoutMs: requestTimeoutMs }) {
    try {
      const fingerprint = JSON.stringify({ path, body });
      const existing = key ? inFlight.get(key) : null;
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          return Promise.reject(safeError(invalidRequest(409, "CONFLICT")));
        }
        return existing.promise;
      }
      const promise = requestJson(fetchImpl, path, {
        method: "POST",
        body,
        headers: key ? { "Idempotency-Key": key } : {},
        signal,
        timeoutMs: timeout(requestTimeoutMs, timeout(timeoutMs)),
        validate: validateMutation,
      });
      if (!key) return promise;
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

  function reviewApplication({ gameId, applicationId, decision, reason, idempotencyKey: requestKey, signal } = {}) {
    const key = idempotencyKey(requestKey);
    return mutation({
      path: `/games/${gameToken(gameId)}/economy/loan-applications/${publicToken(applicationId, "application")}/review`,
      body: { decision, reason, idempotencyKey: key },
      key,
      signal,
    });
  }

  function upsertProduct({ gameId, input, idempotencyKey: requestKey, signal } = {}) {
    if (!isRecord(input)) return Promise.reject(safeError(invalidRequest(422, "VALIDATION_FAILED")));
    const key = idempotencyKey(requestKey);
    return mutation({
      path: `/games/${gameToken(gameId)}/economy/loan-products`,
      body: { ...input, productKey: input.productKey || null, idempotencyKey: key },
      key,
      signal,
    });
  }

  function restructureLoan({ gameId, loanId, input, idempotencyKey: requestKey, signal } = {}) {
    if (!isRecord(input)) return Promise.reject(safeError(invalidRequest(422, "VALIDATION_FAILED")));
    const key = idempotencyKey(requestKey);
    return mutation({
      path: `/games/${gameToken(gameId)}/economy/loans/${publicToken(loanId, "loan")}/restructure`,
      body: { ...input, idempotencyKey: key },
      key,
      signal,
    });
  }

  function serviceLoans({ gameId, asOf = null, signal } = {}) {
    return mutation({
      path: `/games/${gameToken(gameId)}/economy/loans/service`,
      body: { asOf },
      key: null,
      signal,
    });
  }

  return Object.freeze({
    readLoans,
    cancelLoansRequest,
    reviewApplication,
    upsertProduct,
    restructureLoan,
    serviceLoans,
  });
}
