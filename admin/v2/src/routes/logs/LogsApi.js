import { normalizeAdminError } from "../../core/error-envelope.js";

const ADMIN_API_BASE_PATH = "/api/admin";
const DEFAULT_TIMEOUT_MS = 15_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_GAME_PATTERN = /^[a-z0-9][a-z0-9._~-]{15,127}$/i;
const PAGE_SIZES = new Set([25, 50, 100, 200, 500]);

class LogsTransportDiagnostic extends Error {
  constructor({ status = 0, code = "REQUEST_FAILED", requestId = "", retryable = false, retryAfterSeconds = null } = {}) {
    super("Admin Logs request failed.");
    this.name = "LogsTransportDiagnostic";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function gameToken(value) {
  const token = String(value || "").trim();
  if (!UUID_PATTERN.test(token) && !OPAQUE_GAME_PATTERN.test(token)) {
    throw new LogsTransportDiagnostic({ status: 400, code: "GAME_CONTEXT_REQUIRED" });
  }
  return encodeURIComponent(token);
}

function integer(value, fallback, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : fallback;
}

function filterText(value, maximum = 160) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function isoDateTime(value) {
  const source = filterText(value, 80);
  if (!source) return "";
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function normalizeLogsQuery(filters = {}) {
  const pageSizeCandidate = integer(filters.pageSize, 50, 1, 500);
  const pageSize = PAGE_SIZES.has(pageSizeCandidate) ? pageSizeCandidate : 50;
  return Object.freeze({
    page: integer(filters.page, 1, 1, 1_000_000),
    pageSize,
    search: filterText(filters.search, 120),
    action: filterText(filters.action, 160),
    actorType: filterText(filters.actorType, 80),
    targetType: filterText(filters.targetType, 80),
    startAt: isoDateTime(filters.startAt),
    endAt: isoDateTime(filters.endAt),
  });
}

export function logsPath(gameId, filters = {}) {
  const normalized = normalizeLogsQuery(filters);
  const params = new URLSearchParams({
    page: String(normalized.page),
    pageSize: String(normalized.pageSize),
  });
  for (const key of ["search", "action", "actorType", "targetType", "startAt", "endAt"]) {
    if (normalized[key]) params.set(key, normalized[key]);
  }
  return `/games/${gameToken(gameId)}/logs?${params.toString()}`;
}

function invalidResponse(response) {
  return new LogsTransportDiagnostic({
    status: Number(response?.status || 0),
    code: "INVALID_RESPONSE",
    requestId: String(response?.headers?.get?.("x-request-id") || ""),
    retryable: true,
  });
}

function responseFailure(response, payload) {
  const bodyError = payload?.error && typeof payload.error === "object" ? payload.error : {};
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  return new LogsTransportDiagnostic({
    status: Number(response?.status || 0),
    code: String(bodyError.code || payload?.code || "REQUEST_FAILED"),
    requestId: String(response?.headers?.get?.("x-request-id") || bodyError.requestId || payload?.requestId || ""),
    retryable: bodyError.retryable === true || payload?.retryable === true || Number(response?.status || 0) >= 500,
    retryAfterSeconds: Number.isSafeInteger(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 3600) : null,
  });
}

function validLogsPayload(payload, response) {
  const data = payload?.data;
  const rows = data?.logs ?? data?.auditLogs;
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(rows)) {
    throw invalidResponse(response);
  }
  if (data.pagination != null && (typeof data.pagination !== "object" || Array.isArray(data.pagination))) {
    throw invalidResponse(response);
  }
  return payload;
}

async function parseResponse(response) {
  const raw = await response.text();
  let payload = null;
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch (_error) {
      throw invalidResponse(response);
    }
  }
  if (!response.ok) throw responseFailure(response, payload);
  return validLogsPayload(payload, response);
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

/** Read-only Logs adapter for the scoped HttpOnly Admin BFF. */
export function createLogsApiClient({ fetchImpl = globalThis.fetch?.bind(globalThis), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Admin Logs API transport is unavailable.");
  let requestVersion = 0;
  let activeController = null;

  async function readLogs({ gameId, filters, signal, timeoutMs: requestTimeoutMs } = {}) {
    requestVersion += 1;
    const version = requestVersion;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const unlinkAbort = linkAbortSignal(signal, controller);
    const timeout = setTimeout(() => controller.abort(), integer(requestTimeoutMs, timeoutMs, 250, 120_000));

    try {
      const response = await fetchImpl(`${ADMIN_API_BASE_PATH}${logsPath(gameId, filters)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      const payload = await parseResponse(response);
      return Object.freeze({
        requestVersion: version,
        current: version === requestVersion,
        payload,
      });
    } catch (error) {
      if (error && typeof error === "object" && "userMessage" in error) throw error;
      throw normalizeAdminError(error, {
        timedOut: controller.signal.aborted && !signal?.aborted,
        code: controller.signal.aborted && signal?.aborted ? "REQUEST_ABORTED" : "",
      });
    } finally {
      clearTimeout(timeout);
      unlinkAbort();
      if (activeController === controller) activeController = null;
    }
  }

  function cancelLogsRequest() {
    if (!activeController) return false;
    requestVersion += 1;
    activeController.abort();
    activeController = null;
    return true;
  }

  return Object.freeze({
    readLogs,
    cancelLogsRequest,
    getRequestVersion: () => requestVersion,
  });
}
