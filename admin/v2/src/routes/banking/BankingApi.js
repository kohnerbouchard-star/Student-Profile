import { ADMIN_API_BASE_PATH } from "../../api/admin-api-client.js";
import { normalizeAdminError } from "../../core/error-envelope.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_GAME_PATTERN = /^[a-z0-9][a-z0-9._~-]{15,127}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const CURRENCY_CODE_PATTERN = /^[A-Z][A-Z0-9]{1,11}$/;
const ACCOUNT_TYPES = new Set(["checking", "savings"]);

class BankingTransportDiagnostic extends Error {
  constructor({ status = 0, code = "REQUEST_FAILED", requestId = "", retryable = false, retryAfterSeconds = null } = {}) {
    super("Banking request failed.");
    this.name = "BankingTransportDiagnostic";
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
    throw new BankingTransportDiagnostic({ status: 400, code: "GAME_CONTEXT_REQUIRED" });
  }
  return encodeURIComponent(token);
}

function requirePlayerToken(value) {
  const token = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(token)) {
    throw new BankingTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return encodeURIComponent(token);
}

function requireIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new BankingTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return key;
}

function requireAccountType(value) {
  const accountType = String(value || "").trim().toLowerCase();
  if (!ACCOUNT_TYPES.has(accountType)) {
    throw new BankingTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  return accountType;
}

function requireCurrencyCode(value) {
  const currencyCode = String(value || "").trim().toUpperCase();
  if (!CURRENCY_CODE_PATTERN.test(currencyCode)) {
    throw new BankingTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  return currencyCode;
}

function requireAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) {
    throw new BankingTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  return Math.round(amount * 100) / 100;
}

function requireReason(value) {
  const reason = String(value || "").trim();
  if (!reason || reason.length > 300) {
    throw new BankingTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  return reason;
}

function invalidResponse(response) {
  return new BankingTransportDiagnostic({
    status: Number(response?.status || 0),
    code: "INVALID_RESPONSE",
    requestId: response?.headers?.get?.("x-request-id") || "",
    retryable: true,
  });
}

function bodyErrorDiagnostic(payload, response) {
  const bodyError = payload?.error && typeof payload.error === "object" ? payload.error : {};
  const retryAfter = Number(response.headers?.get?.("retry-after"));
  const responseCode = String(bodyError.code || payload?.code || "REQUEST_FAILED").trim();
  const code = ["staff_mfa_required", "aal2_required"].includes(responseCode.toLowerCase())
    ? "MFA_REQUIRED"
    : responseCode;
  return new BankingTransportDiagnostic({
    status: Number(response.status || 0),
    code,
    requestId: String(response.headers?.get?.("x-request-id") || bodyError.requestId || payload?.requestId || ""),
    retryable: bodyError.retryable === true || payload?.retryable === true || Number(response.status || 0) >= 500,
    retryAfterSeconds: Number.isInteger(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 3600) : null,
  });
}

async function parseJsonResponse(response) {
  const text = await response.text();
  let payload = null;
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      throw new BankingTransportDiagnostic({
        status: Number(response.status || 0),
        code: response.ok ? "INVALID_RESPONSE" : "REQUEST_FAILED",
        requestId: response.headers?.get?.("x-request-id") || "",
        retryable: response.ok || Number(response.status || 0) >= 500,
      });
    }
  }
  if (!response.ok) throw bodyErrorDiagnostic(payload, response);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw invalidResponse(response);
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

async function requestJson(fetchImpl, path, {
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
    const response = await fetchImpl(`${ADMIN_API_BASE_PATH}${path}`, {
      method: String(method || "GET").toUpperCase(),
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
      && !(error instanceof BankingTransportDiagnostic);
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

function validateBankingRead(payload, response) {
  const data = payload?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw invalidResponse(response);
  if (!Array.isArray(data.players) && !Array.isArray(data.roster)) throw invalidResponse(response);
  return payload;
}

function validateBankingHistory(payload, response) {
  const data = payload?.data;
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.ledgerEntries)) {
    throw invalidResponse(response);
  }
  return payload;
}

function validateAdjustment(payload, response) {
  if (payload?.data?.adjusted !== true) throw invalidResponse(response);
  return payload;
}

function asSafeRejection(error) {
  return Promise.reject(
    error && typeof error === "object" && "userMessage" in error
      ? error
      : normalizeAdminError(error),
  );
}

/** Route-owned adapter for the authoritative economy.adjust Banking Admin/BFF contracts. */
export function createBankingApiClient({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Banking API fetch is unavailable.");

  let activeReadController = null;
  let activeHistoryController = null;
  const inFlightMutations = new Map();

  function readBanking({ gameId, signal, timeoutMs: requestTimeoutMs } = {}) {
    try {
      const gameToken = requireGameToken(gameId);
      activeReadController?.abort();
      const controller = new AbortController();
      activeReadController = controller;
      const unlink = linkAbortSignal(signal, controller);
      return requestJson(fetchImpl, `/games/${gameToken}/banking/players`, {
        signal: controller.signal,
        timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
        validate: validateBankingRead,
      }).finally(() => {
        unlink();
        if (activeReadController === controller) activeReadController = null;
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function cancelBankingRequest() {
    if (!activeReadController) return false;
    activeReadController.abort();
    activeReadController = null;
    return true;
  }

  function readBankingHistory({ gameId, playerId, signal, timeoutMs: requestTimeoutMs } = {}) {
    try {
      const path = `/games/${requireGameToken(gameId)}/banking/players/${requirePlayerToken(playerId)}/history-audit`;
      activeHistoryController?.abort();
      const controller = new AbortController();
      activeHistoryController = controller;
      const unlink = linkAbortSignal(signal, controller);
      return requestJson(fetchImpl, path, {
        signal: controller.signal,
        timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
        validate: validateBankingHistory,
      }).finally(() => {
        unlink();
        if (activeHistoryController === controller) activeHistoryController = null;
      });
    } catch (error) {
      return asSafeRejection(error);
    }
  }

  function cancelBankingHistoryRequest() {
    if (!activeHistoryController) return false;
    activeHistoryController.abort();
    activeHistoryController = null;
    return true;
  }

  function adjustBankingBalance({
    gameId,
    playerId,
    accountType,
    currencyCode,
    amount,
    reason,
    idempotencyKey,
    signal,
    timeoutMs: requestTimeoutMs,
  } = {}) {
    try {
      const key = requireIdempotencyKey(idempotencyKey);
      const path = `/games/${requireGameToken(gameId)}/banking/players/${requirePlayerToken(playerId)}/ledger-adjustments`;
      const body = {
        amount: requireAmount(amount),
        reason: requireReason(reason),
        accountType: requireAccountType(accountType),
        currencyCode: requireCurrencyCode(currencyCode),
        idempotencyKey: key,
      };
      const fingerprint = JSON.stringify({ path, body });
      const existing = inFlightMutations.get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          return asSafeRejection(new BankingTransportDiagnostic({ status: 409, code: "CONFLICT" }));
        }
        return existing.promise;
      }

      const promise = requestJson(fetchImpl, path, {
        method: "POST",
        body,
        headers: { "Idempotency-Key": key },
        signal,
        timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
        validate: validateAdjustment,
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

  return Object.freeze({
    readBanking,
    cancelBankingRequest,
    readBankingHistory,
    cancelBankingHistoryRequest,
    adjustBankingBalance,
  });
}
