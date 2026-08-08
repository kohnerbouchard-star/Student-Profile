import { normalizeAdminError } from "../../core/error-envelope.js";

const LOCAL_ADMIN_API_PREFIX = "/api/admin";
const DEFAULT_TIMEOUT_MS = 15_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_GAME_PATTERN = /^[a-z0-9][a-z0-9._~-]{15,127}$/i;
const THREAD_PATTERN = /^thr_[0-9a-f]{32}$/;
const MESSAGE_PATTERN = /^msg_[0-9a-f]{32}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const THREAD_ACTIONS = new Set(["disable", "enable", "close"]);
const MESSAGE_ACTIONS = new Set(["hide", "unhide"]);
const THREAD_STATUSES = new Set(["all", "active", "disabled", "closed"]);

class MessagesTransportDiagnostic extends Error {
  constructor({ status = 0, code = "REQUEST_FAILED", requestId = "", retryAfterSeconds = null } = {}) {
    super("Messages request failed.");
    this.name = "MessagesTransportDiagnostic";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeTimeout(value, fallback = DEFAULT_TIMEOUT_MS) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 250 && numeric <= 120_000
    ? Math.round(numeric)
    : fallback;
}

function requireGameToken(value) {
  const token = text(value).toLowerCase();
  if (!UUID_PATTERN.test(token) && !OPAQUE_GAME_PATTERN.test(token)) {
    throw new MessagesTransportDiagnostic({ status: 400, code: "GAME_CONTEXT_REQUIRED" });
  }
  return encodeURIComponent(token);
}

function requirePublicId(value, pattern) {
  const id = text(value).toLowerCase();
  if (!pattern.test(id)) {
    throw new MessagesTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return encodeURIComponent(id);
}

function requireIdempotencyKey(value) {
  const key = text(value);
  if (!IDEMPOTENCY_PATTERN.test(key)) {
    throw new MessagesTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return key;
}

function responseDiagnostic(payload, response) {
  const retryAfter = Number(response.headers?.get?.("retry-after"));
  return new MessagesTransportDiagnostic({
    status: Number(response.status || 0),
    code: text(payload?.code || payload?.error?.code || "REQUEST_FAILED"),
    requestId: text(
      response.headers?.get?.("x-request-id")
      || payload?.requestId
      || payload?.error?.requestId,
    ),
    retryAfterSeconds: Number.isInteger(retryAfter) && retryAfter > 0 ? retryAfter : null,
  });
}

async function parseResponse(response) {
  const raw = await response.text();
  let payload = null;
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch (_error) {
      throw new MessagesTransportDiagnostic({
        status: Number(response.status || 0),
        code: response.ok ? "INVALID_RESPONSE" : "REQUEST_FAILED",
        requestId: text(response.headers?.get?.("x-request-id")),
      });
    }
  }
  if (!response.ok) throw responseDiagnostic(payload, response);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MessagesTransportDiagnostic({ status: response.status, code: "INVALID_RESPONSE" });
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

async function requestJson(fetchImpl, path, {
  method = "GET",
  body,
  headers = {},
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const controller = new AbortController();
  const unlink = linkAbortSignal(signal, controller);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, normalizeTimeout(timeoutMs));

  try {
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    const response = await fetchImpl(`${LOCAL_ADMIN_API_PREFIX}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...headers,
        ...(serialized === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(serialized === undefined ? {} : { body: serialized }),
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    return await parseResponse(response);
  } catch (error) {
    if (error && typeof error === "object" && "userMessage" in error) throw error;
    throw normalizeAdminError(error, {
      timedOut,
      networkError: !timedOut && !controller.signal.aborted && !(error instanceof MessagesTransportDiagnostic),
      code: !timedOut && controller.signal.aborted ? "REQUEST_ABORTED" : "",
    });
  } finally {
    clearTimeout(timer);
    unlink();
  }
}

function readPath(gameId, { query = "", status = "all", limit = 25, offset = 0 } = {}) {
  const normalizedStatus = text(status).toLowerCase();
  const normalizedLimit = Number(limit);
  const normalizedOffset = Number(offset);
  if (!THREAD_STATUSES.has(normalizedStatus)
    || !Number.isSafeInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > 50
    || !Number.isSafeInteger(normalizedOffset) || normalizedOffset < 0 || normalizedOffset > 10_000) {
    throw new MessagesTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  const search = new URLSearchParams({
    status: normalizedStatus,
    limit: String(normalizedLimit),
    offset: String(normalizedOffset),
  });
  const normalizedQuery = text(query);
  if (normalizedQuery) search.set("q", normalizedQuery.slice(0, 100));
  return `/games/${requireGameToken(gameId)}/messages?${search}`;
}

function mutationHeaders(idempotencyKey) {
  const key = requireIdempotencyKey(idempotencyKey);
  return { "Idempotency-Key": key, "X-Request-Id": key };
}

export function createMessagesAdminClient({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Messages Admin BFF transport is unavailable.");
  let activeReadController = null;

  async function readMessages(options = {}) {
    activeReadController?.abort();
    const controller = new AbortController();
    activeReadController = controller;
    try {
      return await requestJson(fetchImpl, readPath(options.gameId, options), {
        signal: controller.signal,
        timeoutMs: normalizeTimeout(options.timeoutMs, normalizeTimeout(timeoutMs)),
      });
    } finally {
      if (activeReadController === controller) activeReadController = null;
    }
  }

  function cancelMessagesRequest() {
    if (!activeReadController) return false;
    activeReadController.abort();
    activeReadController = null;
    return true;
  }

  function moderateThread({ gameId, threadId, action, reason = "", idempotencyKey, signal } = {}) {
    const normalizedAction = text(action).toLowerCase();
    if (!THREAD_ACTIONS.has(normalizedAction)) {
      return Promise.reject(normalizeAdminError(new MessagesTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" })));
    }
    const path = `/games/${requireGameToken(gameId)}/messages/threads/${requirePublicId(threadId, THREAD_PATTERN)}/${normalizedAction}`;
    const key = requireIdempotencyKey(idempotencyKey);
    return requestJson(fetchImpl, path, {
      method: "POST",
      headers: mutationHeaders(key),
      body: { reason: text(reason).slice(0, 1000), idempotencyKey: key },
      signal,
      timeoutMs,
    });
  }

  function moderateMessage({ gameId, threadId, messageId, action, reason = "", idempotencyKey, signal } = {}) {
    const normalizedAction = text(action).toLowerCase();
    if (!MESSAGE_ACTIONS.has(normalizedAction)) {
      return Promise.reject(normalizeAdminError(new MessagesTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" })));
    }
    const path = `/games/${requireGameToken(gameId)}/messages/threads/${requirePublicId(threadId, THREAD_PATTERN)}/messages/${requirePublicId(messageId, MESSAGE_PATTERN)}/${normalizedAction}`;
    const key = requireIdempotencyKey(idempotencyKey);
    return requestJson(fetchImpl, path, {
      method: "POST",
      headers: mutationHeaders(key),
      body: { reason: text(reason).slice(0, 1000), idempotencyKey: key },
      signal,
      timeoutMs,
    });
  }

  function deleteExpiredThread({ gameId, threadId, reason, idempotencyKey, signal } = {}) {
    const path = `/games/${requireGameToken(gameId)}/messages/threads/${requirePublicId(threadId, THREAD_PATTERN)}/delete`;
    const key = requireIdempotencyKey(idempotencyKey);
    return requestJson(fetchImpl, path, {
      method: "POST",
      headers: mutationHeaders(key),
      body: { reason: text(reason).slice(0, 1000), idempotencyKey: key },
      signal,
      timeoutMs,
    });
  }

  return Object.freeze({
    readMessages,
    cancelMessagesRequest,
    moderateThread,
    moderateMessage,
    deleteExpiredThread,
  });
}
