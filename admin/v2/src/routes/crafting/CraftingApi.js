import { normalizeAdminError } from "../../core/error-envelope.js";

const ADMIN_API_BASE_PATH = "/api/admin";
const DEFAULT_TIMEOUT_MS = 15_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_GAME_PATTERN = /^[a-z0-9][a-z0-9._~-]{15,127}$/i;
const JOB_KEY_PATTERN = /^cft_[0-9a-f]{32}$/;
const ITEM_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const CRAFTING_STATUSES = new Set(["in_progress", "completed", "claimed", "cancelled", "failed"]);
const RECOVERY_OUTCOMES = new Set(["release_and_fail", "requeue"]);
const SCARCITY_BANDS = new Set(["abundant", "available", "constrained", "scarce", "unavailable"]);

class CraftingTransportDiagnostic extends Error {
  constructor({
    status = 0,
    code = "REQUEST_FAILED",
    requestId = "",
    retryable = false,
    retryAfterSeconds = null,
  } = {}) {
    super("Crafting administrator request failed.");
    this.name = "CraftingTransportDiagnostic";
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
    throw new CraftingTransportDiagnostic({ status: 400, code: "GAME_CONTEXT_REQUIRED" });
  }
  return encodeURIComponent(token);
}

function requireJobKey(value) {
  const key = String(value || "").trim().toLowerCase();
  if (!JOB_KEY_PATTERN.test(key)) {
    throw new CraftingTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return encodeURIComponent(key);
}

function requireItemKey(value) {
  const key = String(value || "").trim().toLowerCase();
  if (!ITEM_KEY_PATTERN.test(key)) {
    throw new CraftingTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return encodeURIComponent(key);
}

function requireIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new CraftingTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return key;
}

function canonicalResponseCode(value) {
  const code = String(value || "").trim().toLowerCase();
  if (["staff_mfa_required", "aal2_required"].includes(code)) return "MFA_REQUIRED";
  return "";
}

function asRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function invalidResponse(response) {
  return new CraftingTransportDiagnostic({
    status: Number(response?.status || 0),
    code: "INVALID_RESPONSE",
    requestId: response?.headers?.get?.("x-request-id") || "",
    retryable: true,
  });
}

async function parseJsonResponse(response) {
  const raw = await response.text();
  let payload = null;
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch (_error) {
      throw new CraftingTransportDiagnostic({
        status: Number(response.status || 0),
        code: response.ok ? "INVALID_RESPONSE" : "REQUEST_FAILED",
        requestId: response.headers?.get?.("x-request-id") || "",
        retryable: response.ok || Number(response.status || 0) >= 500,
      });
    }
  }

  if (!response.ok) {
    const retryAfter = Number(response.headers?.get?.("retry-after"));
    throw new CraftingTransportDiagnostic({
      status: Number(response.status || 0),
      code: canonicalResponseCode(payload?.code || payload?.error?.code),
      requestId: String(
        response.headers?.get?.("x-request-id")
          || payload?.requestId
          || payload?.error?.requestId
          || "",
      ),
      retryable: payload?.retryable === true || payload?.error?.retryable === true,
      retryAfterSeconds: Number.isInteger(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter, 3600)
        : null,
    });
  }
  if (!asRecord(payload)) throw invalidResponse(response);
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
    if (controller.signal.aborted) throw abortError();
    const serializedBody = body === undefined ? undefined : JSON.stringify(body);
    const response = await fetchImpl(`${ADMIN_API_BASE_PATH}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...headers,
        ...(serializedBody === undefined ? {} : { "Content-Type": "application/json" }),
      },
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
    const networkError = !timedOut
      && !controller.signal.aborted
      && !(error instanceof CraftingTransportDiagnostic);
    throw normalizeAdminError(error, {
      timedOut,
      networkError,
      code: !timedOut && controller.signal.aborted ? "REQUEST_ABORTED" : "",
    });
  } finally {
    clearTimeout(timeout);
    unlinkAbort();
  }
}

function validateOversight(payload, response) {
  const data = payload?.data;
  if (
    !asRecord(data)
    || !Array.isArray(data.jobs)
    || !Array.isArray(data.effects)
    || !Array.isArray(data.supply)
    || !asRecord(data.invariants)
  ) {
    throw invalidResponse(response);
  }
  return payload;
}

function validateMutation(payload, response) {
  if (!asRecord(payload?.data)) throw invalidResponse(response);
  return payload;
}

function safeRejection(error) {
  return Promise.reject(
    error && typeof error === "object" && "userMessage" in error
      ? error
      : normalizeAdminError(error),
  );
}

function craftingBasePath(gameId) {
  return `/games/${requireGameToken(gameId)}/crafting`;
}

function normalizedReadStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (!status) return "";
  if (!CRAFTING_STATUSES.has(status)) {
    throw new CraftingTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return status;
}

function normalizedReadLimit(value) {
  const limit = Number(value ?? 250);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 250) {
    throw new CraftingTransportDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return limit;
}

function normalizedRecoveryInput(input) {
  const outcome = String(input?.outcome || "").trim().toLowerCase();
  const reason = String(input?.reason || "").trim();
  if (!RECOVERY_OUTCOMES.has(outcome) || reason.length < 3 || reason.length > 1_000) {
    throw new CraftingTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  return { outcome, reason };
}

function normalizedSupplyInput(input) {
  const scarcityBand = String(input?.scarcityBand || "").trim().toLowerCase();
  const countryText = input?.countryCode == null ? "" : String(input.countryCode).trim().toUpperCase();
  const countryCode = countryText || null;
  const availableQuantity = input?.availableQuantity === "" || input?.availableQuantity == null
    ? null
    : Number(input.availableQuantity);
  const eventMultiplier = input?.eventMultiplier == null || input?.eventMultiplier === ""
    ? 1
    : Number(input.eventMultiplier);
  const routeMultiplier = input?.routeMultiplier == null || input?.routeMultiplier === ""
    ? 1
    : Number(input.routeMultiplier);
  const sourceEventText = input?.sourceEventKey == null ? "" : String(input.sourceEventKey).trim();
  const expiresText = input?.expiresAt == null ? "" : String(input.expiresAt).trim();

  if (
    !SCARCITY_BANDS.has(scarcityBand)
    || (countryCode !== null && !/^[A-Z]{3}$/.test(countryCode))
    || (availableQuantity !== null && (!Number.isSafeInteger(availableQuantity) || availableQuantity < 0))
    || !Number.isFinite(eventMultiplier) || eventMultiplier < 0.5 || eventMultiplier > 4
    || !Number.isFinite(routeMultiplier) || routeMultiplier < 0.5 || routeMultiplier > 4
    || (sourceEventText && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(sourceEventText))
    || (expiresText && Number.isNaN(Date.parse(expiresText)))
  ) {
    throw new CraftingTransportDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }

  return {
    countryCode,
    scarcityBand,
    availableQuantity,
    eventMultiplier,
    routeMultiplier,
    sourceEventKey: sourceEventText || null,
    expiresAt: expiresText || null,
  };
}

/** Route-local adapter for the existing Crafting Admin/BFF contracts. */
export function createCraftingApiClient({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Crafting API fetch is unavailable.");

  let activeReadController = null;

  function readCrafting({
    gameId,
    status = "",
    limit = 250,
    signal,
    timeoutMs: requestTimeoutMs,
  } = {}) {
    try {
      const query = new URLSearchParams();
      const normalizedStatus = normalizedReadStatus(status);
      if (normalizedStatus) query.set("status", normalizedStatus);
      query.set("limit", String(normalizedReadLimit(limit)));
      activeReadController?.abort();
      const controller = new AbortController();
      activeReadController = controller;
      const unlinkAbort = linkAbortSignal(signal, controller);
      const request = requestJson(
        fetchImpl,
        `${craftingBasePath(gameId)}/oversight?${query}`,
        {
          signal: controller.signal,
          timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
          validate: validateOversight,
        },
      );
      return request.finally(() => {
        unlinkAbort();
        if (activeReadController === controller) activeReadController = null;
      });
    } catch (error) {
      return safeRejection(error);
    }
  }

  function cancelCraftingRequest() {
    if (!activeReadController) return false;
    activeReadController.abort();
    activeReadController = null;
    return true;
  }

  function recoverCraftingJob({
    gameId,
    jobKey,
    outcome,
    reason,
    idempotencyKey,
    signal,
    timeoutMs: requestTimeoutMs,
  } = {}) {
    try {
      const key = requireIdempotencyKey(idempotencyKey);
      const input = normalizedRecoveryInput({ outcome, reason });
      return requestJson(
        fetchImpl,
        `${craftingBasePath(gameId)}/jobs/${requireJobKey(jobKey)}/recover`,
        {
          method: "POST",
          body: { ...input, idempotencyKey: key },
          headers: { "Idempotency-Key": key },
          signal,
          timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
          validate: validateMutation,
        },
      );
    } catch (error) {
      return safeRejection(error);
    }
  }

  function applyCraftingSupply({
    gameId,
    itemKey,
    input,
    idempotencyKey,
    signal,
    timeoutMs: requestTimeoutMs,
  } = {}) {
    try {
      const key = requireIdempotencyKey(idempotencyKey);
      const supply = normalizedSupplyInput(input);
      return requestJson(
        fetchImpl,
        `${craftingBasePath(gameId)}/supply/${requireItemKey(itemKey)}`,
        {
          method: "POST",
          body: { ...supply, idempotencyKey: key },
          headers: { "Idempotency-Key": key },
          signal,
          timeoutMs: normalizeTimeout(requestTimeoutMs, normalizeTimeout(timeoutMs)),
          validate: validateMutation,
        },
      );
    } catch (error) {
      return safeRejection(error);
    }
  }

  return Object.freeze({
    readCrafting,
    cancelCraftingRequest,
    recoverCraftingJob,
    applyCraftingSupply,
  });
}
