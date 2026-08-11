import { normalizeAdminError } from "../../core/error-envelope.js";

const DEFAULT_TIMEOUT_MS = 12_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;

function gameToken(value) {
  const token = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(token)) throw safeFailure({ status: 400, code: "INVALID_REQUEST" });
  return token;
}

function idempotencyKey(value) {
  const key = String(value || "").trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) throw safeFailure({ status: 400, code: "INVALID_REQUEST" });
  return key;
}

function safeFailure({ status = 0, code = "REQUEST_FAILED", requestId = "", retryAfterSeconds = null } = {}) {
  const error = new Error("Admin Attendance request failed.");
  error.name = "AdminAttendanceRequestError";
  error.status = status;
  error.code = code;
  error.requestId = requestId;
  error.retryAfterSeconds = retryAfterSeconds;
  return normalizeAdminError(error, { code, requestId });
}

function requestIdFrom(response, payload) {
  return String(
    response?.headers?.get?.("x-request-id")
      || payload?.requestId
      || payload?.error?.requestId
      || "",
  ).trim();
}

function retryAfterFrom(response) {
  const seconds = Number(response?.headers?.get?.("retry-after"));
  return Number.isInteger(seconds) && seconds > 0 ? Math.min(seconds, 3600) : null;
}

function responseCode(payload, status) {
  if (status === 423) return "CONFLICT";
  const raw = String(payload?.code || payload?.error?.code || "").trim().toUpperCase();
  if (raw) return raw;
  if (status === 401) return "SESSION_REQUIRED";
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 404) return "NOT_FOUND";
  if (status === 409 || status === 423) return "CONFLICT";
  if (status === 422 || status === 400) return "VALIDATION_FAILED";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVICE_UNAVAILABLE";
  return "REQUEST_FAILED";
}

function linkAbortSignal(source, target) {
  if (!source) return () => {};
  if (source.aborted) {
    target.abort(source.reason);
    return () => {};
  }
  const abort = () => target.abort(source.reason);
  source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

async function parseJson(response) {
  const type = String(response?.headers?.get?.("content-type") || "").toLowerCase();
  if (!type.includes("application/json")) return null;
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

async function requestAdminJson(fetchImpl, path, {
  method = "GET",
  body,
  idempotencyKey: requestKey,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const controller = new AbortController();
  const unlink = linkAbortSignal(signal, controller);
  let timedOut = false;
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Request timeout", "AbortError"));
  }, timeoutMs);

  try {
    const normalizedMethod = String(method || "GET").toUpperCase();
    const headers = new Headers({ Accept: "application/json" });
    const init = {
      method: normalizedMethod,
      headers,
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    };
    if (normalizedMethod !== "GET" && normalizedMethod !== "HEAD") {
      headers.set("Idempotency-Key", idempotencyKey(requestKey));
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify(body || {});
    }

    const response = await fetchImpl(`/api/admin${path}`, init);
    const payload = await parseJson(response);
    if (!response.ok) {
      const error = new Error("Attendance request rejected.");
      error.status = response.status;
      error.code = responseCode(payload, response.status);
      error.requestId = requestIdFrom(response, payload);
      error.retryAfterSeconds = retryAfterFrom(response);
      throw error;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw safeFailure({ status: response.status, code: "INVALID_RESPONSE" });
    }
    return payload;
  } catch (error) {
    if (error?.userMessage) throw error;
    if (timedOut) throw normalizeAdminError(error, { timedOut: true });
    if (error?.name === "AbortError") throw normalizeAdminError(error);
    const networkError = !Number(error?.status);
    throw normalizeAdminError(error, { networkError });
  } finally {
    globalThis.clearTimeout(timer);
    unlink();
  }
}

function attendanceBase(gameId) {
  return `/games/${gameToken(gameId)}/attendance`;
}

function mutationOptions(method, body, key, options = {}) {
  return {
    ...options,
    method,
    body,
    idempotencyKey: key,
  };
}

function payloadData(payload) {
  return payload?.data && typeof payload.data === "object" ? payload.data : payload;
}

/** Route-local adapter over the existing HttpOnly Admin BFF Attendance contracts. */
export function createAttendanceApi({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Attendance API fetch is unavailable.");
  let activeReadController = null;

  async function readAttendance({ gameId, signal, timeoutMs: requestTimeoutMs = timeoutMs } = {}) {
    activeReadController?.abort();
    const controller = new AbortController();
    activeReadController = controller;
    const unlink = linkAbortSignal(signal, controller);
    const base = attendanceBase(gameId);
    try {
      const enhanced = await requestAdminJson(
        fetchImpl,
        `${base}/today`,
        { signal: controller.signal, timeoutMs: requestTimeoutMs },
      );
      return Object.freeze({
        enhanced: payloadData(enhanced),
        current: activeReadController === controller,
      });
    } finally {
      unlink();
      if (activeReadController === controller) activeReadController = null;
    }
  }

  function cancelAttendanceRequest() {
    if (!activeReadController) return false;
    activeReadController.abort();
    activeReadController = null;
    return true;
  }

  function scanAttendance({ gameId, scanValue, deviceTimezone, idempotencyKey: key, signal } = {}) {
    return requestAdminJson(
      fetchImpl,
      `${attendanceBase(gameId)}/scan`,
      mutationOptions("POST", {
        playerId: String(scanValue || "").trim(),
        deviceTimezone: String(deviceTimezone || "").trim() || undefined,
      }, key, { signal, timeoutMs }),
    ).then(payloadData);
  }

  function correctAttendance({ gameId, playerId, attendanceDate, status, note, idempotencyKey: key, signal } = {}) {
    return requestAdminJson(
      fetchImpl,
      `${attendanceBase(gameId)}/corrections`,
      mutationOptions("POST", { playerId, attendanceDate, status, note }, key, { signal, timeoutMs }),
    ).then(payloadData);
  }

  function saveAttendanceNote({ gameId, playerId, attendanceDate, note, idempotencyKey: key, signal } = {}) {
    return requestAdminJson(
      fetchImpl,
      `${attendanceBase(gameId)}/notes`,
      mutationOptions("POST", { playerId, attendanceDate, note }, key, { signal, timeoutMs }),
    ).then(payloadData);
  }

  function adjustAttendanceReward({
    gameId,
    playerId,
    attendanceDate,
    amount,
    note,
    idempotencyKey: key,
    signal,
  } = {}) {
    return requestAdminJson(
      fetchImpl,
      `${attendanceBase(gameId)}/reward-adjustments`,
      mutationOptions("POST", {
        playerId,
        attendanceDate,
        amount,
        currencyMode: "player_country",
        accountType: "checking",
        note,
      }, key, { signal, timeoutMs }),
    ).then(payloadData);
  }

  function setAttendanceLock({ gameId, attendanceDate, locked, reason, idempotencyKey: key, signal } = {}) {
    return requestAdminJson(
      fetchImpl,
      `${attendanceBase(gameId)}/lock`,
      mutationOptions("POST", { attendanceDate, locked, reason }, key, { signal, timeoutMs }),
    ).then(payloadData);
  }

  return Object.freeze({
    readAttendance,
    cancelAttendanceRequest,
    scanAttendance,
    correctAttendance,
    saveAttendanceNote,
    adjustAttendanceReward,
    setAttendanceLock,
  });
}
