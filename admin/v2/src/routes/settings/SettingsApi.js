import { normalizeAdminError } from "../../core/error-envelope.js";

const ADMIN_API_BASE_PATH = "/api/admin";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_GAME_PATTERN = /^[a-z0-9][a-z0-9._~-]{15,127}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const DEFAULT_TIMEOUT_MS = 15_000;
const SETTINGS_UPDATE_FIELDS = Object.freeze([
  "difficultyPreset",
  "priceMultiplier",
  "incomeMultiplier",
  "shockFrequency",
  "shockSeverity",
  "recoverySupport",
  "tradeMultiplier",
  "attendanceWindow",
]);

class SettingsApiDiagnostic extends Error {
  constructor({ status = 0, code = "REQUEST_FAILED", requestId = "", retryable = false, fieldErrors = {} } = {}) {
    super("Admin Settings request failed.");
    this.name = "SettingsApiDiagnostic";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryable = retryable;
    this.fieldErrors = fieldErrors;
  }
}

function requireGameToken(value) {
  const token = String(value || "").trim();
  if (!UUID_PATTERN.test(token) && !OPAQUE_GAME_PATTERN.test(token)) {
    throw new SettingsApiDiagnostic({ status: 400, code: "GAME_CONTEXT_REQUIRED" });
  }
  return encodeURIComponent(token);
}

function requireIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new SettingsApiDiagnostic({ status: 400, code: "INVALID_REQUEST" });
  }
  return key;
}

function canonicalCode(value) {
  const code = String(value || "REQUEST_FAILED").trim();
  return ["staff_mfa_required", "aal2_required"].includes(code.toLowerCase()) ? "MFA_REQUIRED" : code;
}

function diagnosticFromResponse(payload, response) {
  const bodyError = payload?.error && typeof payload.error === "object" ? payload.error : {};
  return new SettingsApiDiagnostic({
    status: Number(response.status || 0),
    code: canonicalCode(bodyError.code || payload?.code),
    requestId: String(response.headers?.get?.("x-request-id") || bodyError.requestId || payload?.requestId || ""),
    retryable: bodyError.retryable === true || payload?.retryable === true || Number(response.status || 0) >= 500,
    fieldErrors: bodyError.fieldErrors || payload?.fieldErrors || {},
  });
}

async function parseResponse(response) {
  const text = await response.text();
  let payload = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      throw new SettingsApiDiagnostic({
        status: Number(response.status || 0),
        code: response.ok ? "INVALID_RESPONSE" : "REQUEST_FAILED",
        requestId: response.headers?.get?.("x-request-id") || "",
        retryable: true,
      });
    }
  }
  if (!response.ok) throw diagnosticFromResponse(payload, response);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new SettingsApiDiagnostic({ status: Number(response.status || 0), code: "INVALID_RESPONSE", retryable: true });
  }
  return payload;
}

function settingsReadPayload(payload) {
  const data = payload?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new SettingsApiDiagnostic({ status: 200, code: "INVALID_RESPONSE", retryable: true });
  }
  return payload;
}

function settingsMutationBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SettingsApiDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  const body = {};
  SETTINGS_UPDATE_FIELDS.forEach((field) => {
    if (Object.hasOwn(value, field) && value[field] !== undefined) body[field] = value[field];
  });
  if (Object.keys(body).length === 0) {
    throw new SettingsApiDiagnostic({ status: 422, code: "VALIDATION_FAILED" });
  }
  return body;
}

function settingsMutationPayload(payload) {
  if (payload?.ok !== true || !payload.settings || typeof payload.settings !== "object" || Array.isArray(payload.settings)) {
    throw new SettingsApiDiagnostic({ status: 200, code: "INVALID_RESPONSE", retryable: true });
  }
  return payload;
}

function asSafeError(error, options = {}) {
  return error && typeof error === "object" && "userMessage" in error
    ? error
    : normalizeAdminError(error, options);
}

export function createSettingsApi({ fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Settings API transport is unavailable.");
  let activeController = null;

  async function request(path, { method = "GET", body, idempotencyKey, signal, validate } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) controller.abort(signal.reason);
    else signal?.addEventListener?.("abort", abort, { once: true });
    try {
      const headers = { Accept: "application/json" };
      if (method !== "GET" && method !== "HEAD") {
        headers["Content-Type"] = "application/json";
        headers["Idempotency-Key"] = requireIdempotencyKey(idempotencyKey);
      }
      const response = await fetchImpl(`${ADMIN_API_BASE_PATH}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      const payload = await parseResponse(response);
      return validate(payload);
    } catch (error) {
      if (controller.signal.aborted && !signal?.aborted) {
        throw normalizeAdminError(error, { timedOut: true });
      }
      throw asSafeError(error, { fieldErrors: error?.fieldErrors });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener?.("abort", abort);
    }
  }

  async function readSettings({ gameId, signal } = {}) {
    try {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      const abort = () => controller.abort(signal?.reason);
      if (signal?.aborted) controller.abort(signal.reason);
      else signal?.addEventListener?.("abort", abort, { once: true });
      try {
        return await request(`/games/${requireGameToken(gameId)}/settings`, {
          signal: controller.signal,
          validate: settingsReadPayload,
        });
      } finally {
        signal?.removeEventListener?.("abort", abort);
        if (activeController === controller) activeController = null;
      }
    } catch (error) {
      throw asSafeError(error);
    }
  }

  function updateSettings({ gameId, settings, idempotencyKey, signal } = {}) {
    try {
      const body = settingsMutationBody(settings);
      return request(`/games/${requireGameToken(gameId)}/settings`, {
        method: "PATCH",
        body: { settings: body },
        idempotencyKey,
        signal,
        validate: settingsMutationPayload,
      });
    } catch (error) {
      return Promise.reject(asSafeError(error));
    }
  }

  return Object.freeze({
    readSettings,
    updateSettings,
    cancelSettingsRequest() {
      if (!activeController) return false;
      activeController.abort();
      activeController = null;
      return true;
    },
  });
}
