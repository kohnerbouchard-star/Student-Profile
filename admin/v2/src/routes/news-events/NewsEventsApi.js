import { normalizeAdminError } from "../../core/error-envelope.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const EFFECT_ID_PATTERN = /^cec_[0-9a-f]{32}$/i;
const GAME_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_GAME_PATTERN = /^[a-z0-9][a-z0-9._~-]{15,127}$/i;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requireGameId(value) {
  const gameId = String(value || "").trim();
  if (!GAME_ID_PATTERN.test(gameId) && !OPAQUE_GAME_PATTERN.test(gameId)) {
    throw new TypeError("News & Events game context is invalid.");
  }
  return encodeURIComponent(gameId);
}

function requireEffectId(value) {
  const effectId = String(value || "").trim().toLowerCase();
  if (!EFFECT_ID_PATTERN.test(effectId)) throw new TypeError("News publication recovery target is invalid.");
  return effectId;
}

function requireRequestId(value) {
  const requestId = String(value || "").trim();
  if (!REQUEST_ID_PATTERN.test(requestId)) throw new TypeError("News publication recovery request identity is invalid.");
  return requestId;
}

function requireReason(value) {
  const reason = String(value || "").trim();
  if (reason.length < 12 || reason.length > 1_000) {
    throw new TypeError("Recovery reason must be between 12 and 1,000 characters.");
  }
  return reason;
}

function panelValidator(key, payload) {
  const data = payload?.data;
  if (!isRecord(data)) return false;
  if (key === "campaign") return Array.isArray(data.campaigns);
  if (key === "history") return Array.isArray(data.history);
  if (key === "effects") return Array.isArray(data.effects) && isRecord(data.summary);
  return false;
}

function headerRequestId(response) {
  return String(
    response?.headers?.get?.("x-request-id")
      || response?.headers?.get?.("request-id")
      || "",
  ).trim();
}

async function safeJson(response) {
  try {
    const payload = await response.json();
    return isRecord(payload) ? payload : null;
  } catch (_error) {
    return null;
  }
}

function responseError(response, body) {
  const error = new Error("Admin News & Events request failed.");
  error.status = Number(response?.status || 0);
  error.code = body?.code || body?.error?.code || "";
  error.retryable = body?.retryable === true || body?.error?.retryable === true;
  error.requestId = headerRequestId(response) || body?.requestId || body?.error?.requestId || "";
  const retryAfter = Number(response?.headers?.get?.("retry-after") || 0);
  if (Number.isInteger(retryAfter) && retryAfter > 0) error.retryAfterSeconds = retryAfter;
  return error;
}

function invalidResponse(response) {
  const error = new Error("Admin News & Events response was incomplete.");
  error.status = Number(response?.status || 0);
  error.code = "INVALID_RESPONSE";
  error.requestId = headerRequestId(response);
  error.retryable = true;
  return error;
}

function linkedSignal(externalSignal, controller) {
  if (!externalSignal) return () => {};
  if (externalSignal.aborted) {
    controller.abort(externalSignal.reason);
    return () => {};
  }
  const abort = () => controller.abort(externalSignal.reason);
  externalSignal.addEventListener("abort", abort, { once: true });
  return () => externalSignal.removeEventListener("abort", abort);
}

async function readPanel(fetchImpl, key, path, { signal, timeoutMs }) {
  const controller = new AbortController();
  const unlink = linkedSignal(signal, controller);
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  try {
    const response = await fetchImpl(path, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    const body = await safeJson(response);
    if (!response.ok) throw responseError(response, body);
    if (!panelValidator(key, body)) throw invalidResponse(response);
    return Object.freeze({ data: body.data, requestId: headerRequestId(response) });
  } finally {
    clearTimeout(timer);
    unlink();
  }
}

function safePanelFailure(error, context = {}) {
  return Object.freeze({
    status: "rejected",
    reason: normalizeAdminError(error, context),
  });
}

function settledPanel(result) {
  return result.status === "fulfilled"
    ? Object.freeze({ status: "fulfilled", value: result.value })
    : safePanelFailure(result.reason, {
      timedOut: result.reason?.name === "TimeoutError",
      networkError: result.reason instanceof TypeError && !Number(result.reason?.status),
    });
}

/**
 * Route-local adapter over the existing world campaign Admin BFF contracts.
 * It deliberately exposes no create/edit/schedule mutation because those
 * capabilities do not exist in the current News/Event Admin contract.
 */
export function createNewsEventsApi({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("News & Events Admin transport is unavailable.");
  const boundedTimeout = Number.isFinite(Number(timeoutMs))
    ? Math.max(1_000, Math.min(Number(timeoutMs), 60_000))
    : DEFAULT_TIMEOUT_MS;
  let requestVersion = 0;
  let activeController = null;

  function cancelRead() {
    if (!activeController) return false;
    activeController.abort(new DOMException("Request cancelled", "AbortError"));
    activeController = null;
    return true;
  }

  async function readNewsEvents({ gameId, signal } = {}) {
    const id = requireGameId(gameId);
    cancelRead();
    requestVersion += 1;
    const version = requestVersion;
    const controller = new AbortController();
    activeController = controller;
    const unlink = linkedSignal(signal, controller);
    const base = `/api/admin/games/${id}/world/campaign`;
    try {
      const settled = await Promise.allSettled([
        readPanel(fetchImpl, "campaign", base, { signal: controller.signal, timeoutMs: boundedTimeout }),
        readPanel(fetchImpl, "history", `${base}/history?limit=250`, { signal: controller.signal, timeoutMs: boundedTimeout }),
        readPanel(fetchImpl, "effects", `${base}/effects?status=all&limit=250`, { signal: controller.signal, timeoutMs: boundedTimeout }),
      ]);
      return Object.freeze({
        requestVersion: version,
        current: version === requestVersion && !controller.signal.aborted,
        panels: Object.freeze({
          campaign: settledPanel(settled[0]),
          history: settledPanel(settled[1]),
          effects: settledPanel(settled[2]),
        }),
      });
    } finally {
      unlink();
      if (activeController === controller) activeController = null;
    }
  }

  async function recoverNewsPublication({ gameId, effectId, reason, requestId } = {}) {
    const id = requireGameId(gameId);
    const target = requireEffectId(effectId);
    const identity = requireRequestId(requestId);
    const reviewedReason = requireReason(reason);
    const path = `/api/admin/games/${id}/world/campaign/effects/${target}/recover`;
    let response;
    let body;
    try {
      response = await fetchImpl(path, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": identity,
        },
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        body: JSON.stringify({ reason: reviewedReason, requestId: identity }),
      });
      body = await safeJson(response);
      if (!response.ok) throw responseError(response, body);
      if (!isRecord(body?.data)) throw invalidResponse(response);
      return Object.freeze({ data: body.data, requestId: headerRequestId(response) });
    } catch (error) {
      throw normalizeAdminError(error, {
        networkError: error instanceof TypeError && !Number(error?.status),
      });
    }
  }

  return Object.freeze({
    readNewsEvents,
    recoverNewsPublication,
    cancelNewsEventsRequest: cancelRead,
  });
}
