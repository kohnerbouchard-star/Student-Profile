import { abortPlayerApiSessionRequests } from "../api/player-api.js";
import { createRequestId } from "../api/request-context.js";

const DEFAULT_LOGOUT_EVENT = "econovaria:player-logout-requested";
const LOGOUT_COMPLETED_EVENT = "econovaria:player-logout-completed";
const DEVICE_STORAGE_KEY = "econovaria.device.v1";
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const RETRYABLE_STATUSES = new Set([409, 429, 502, 503]);
const RETRYABLE_CODES = new Set([
  "NETWORK_ERROR",
  "OFFLINE",
  "REQUEST_TIMEOUT",
  "PLAYER_LOGOUT_CONFLICT",
  "PLAYER_LOGOUT_SERVICE_UNAVAILABLE",
  "PLAYER_SESSION_REVOCATION_FAILED"
]);

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, Math.round(number)))
    : fallback;
}

function safeCode(error, fallback = "PLAYER_LOGOUT_FAILED") {
  return String(error?.code || error?.body?.code || error?.body?.error?.code || fallback)
    .trim()
    .toUpperCase();
}

function isRetryable(error) {
  return RETRYABLE_STATUSES.has(Number(error?.status || 0)) || RETRYABLE_CODES.has(safeCode(error));
}

function wait(runtime, delayMs) {
  return new Promise((resolve) => runtime.setTimeout?.(resolve, delayMs));
}

function deviceId(config, runtime) {
  const configured = String(config?.deviceId || "").trim().toLowerCase();
  if (DEVICE_ID_PATTERN.test(configured)) return configured;
  try {
    const existing = String(runtime.localStorage?.getItem(DEVICE_STORAGE_KEY) || "")
      .trim()
      .toLowerCase();
    if (DEVICE_ID_PATTERN.test(existing)) return existing;
    const generated = String(runtime.crypto?.randomUUID?.() || "").toLowerCase();
    if (!DEVICE_ID_PATTERN.test(generated)) return "";
    runtime.localStorage?.setItem(DEVICE_STORAGE_KEY, generated);
    return generated;
  } catch {
    return "";
  }
}

async function currentSession(config) {
  if (typeof config?.sessionProvider === "function") {
    try {
      return await config.sessionProvider();
    } catch {
      return null;
    }
  }
  return config?.authenticated === true ? config : null;
}

function clearSessionState(config, runtime) {
  config.authenticated = false;
  config.csrfToken = "";
  config.sessionExpiresAt = "";
  config.gameSessionId = "";
  delete config.playerSessionToken;
  delete config.playerSessionId;
  delete config.accessToken;
  try {
    if (runtime.ECONOVARIA_PLAYER_SESSION) runtime.ECONOVARIA_PLAYER_SESSION = null;
    if (runtime.Econovaria?.playerSession) runtime.Econovaria.playerSession = null;
  } catch {
    // Host-owned session stores may be read-only. Navigation remains authoritative.
  }
}

function logoutAdvertised(terminal, config) {
  if (config?.usePreviewData === true) return false;
  const state = terminal?.getState?.();
  return state?.data?.capabilities?.actions?.logout === true;
}

function prepareTerminalForSessionExit(terminal, config) {
  terminal?.prepareForSessionExit?.();
  abortPlayerApiSessionRequests(config);
}

function lockTerminal(mount, runtime) {
  if (!mount) return;
  try {
    mount.inert = true;
    mount.setAttribute?.("aria-busy", "true");
    mount.setAttribute?.("data-player-session-exiting", "true");
    mount.innerHTML = `
      <main class="player-terminal-overview player-terminal-loading-shell player-terminal-session-exit" role="status" aria-live="polite">
        <div class="player-terminal-loading-brand">
          <span>E</span>
          <div>
            <strong>ECONOVARIA</strong>
            <small>SIGNING OUT · REVOKING PLAYER SESSION</small>
          </div>
        </div>
        <p>Your terminal is being secured before returning to sign in.</p>
      </main>`;
    if (runtime.document) runtime.document.title = "Signing out · Econovaria";
  } catch {
    // The revocation request and navigation still proceed if the shell cannot be replaced.
  }
}

function dispatchCompletion(runtime, detail) {
  if (typeof runtime.CustomEvent !== "function") return;
  runtime.dispatchEvent?.(new runtime.CustomEvent(LOGOUT_COMPLETED_EVENT, { detail }));
}

export function resolvePlayerLogoutUrl(config = {}, locationLike = globalThis.location) {
  const configuredLogout = String(config.logoutExitUrl || "").trim();
  if (configuredLogout) return new URL(configuredLogout, locationLike?.href || undefined).href;

  const configuredSession = String(config.sessionExitUrl || "").trim();
  if (configuredSession) return new URL(configuredSession, locationLike?.href || undefined).href;

  const url = new URL("../", locationLike?.href || "http://localhost/player-terminal/");
  url.searchParams.set("mode", "player");
  url.searchParams.set("reason", "logged-out");
  return url.href;
}

export function installPlayerLogoutController({
  terminal,
  config,
  mount,
  runtime = globalThis,
  maxAttempts = 2,
  retryDelayMs = 150
}) {
  if (!terminal || typeof terminal.getState !== "function") {
    throw new TypeError("A Player Terminal instance is required.");
  }
  if (!config || typeof config !== "object") {
    throw new TypeError("A Player Terminal configuration object is required.");
  }

  const logoutEvent = String(config.logoutRequestedEvent || DEFAULT_LOGOUT_EVENT);
  const attempts = boundedInteger(maxAttempts, 2, 1, 3);
  const retryDelay = boundedInteger(retryDelayMs, 150, 0, 2000);
  const exitDelay = boundedInteger(config.sessionExitDelayMs, 120, 0, 2000);
  let pending = null;
  let redirectTimer = 0;
  let destroyed = false;

  async function revoke() {
    const session = await currentSession(config);
    const csrfToken = String(session?.csrfToken || config.csrfToken || "");
    if (session?.authenticated !== true || !CSRF_PATTERN.test(csrfToken)) {
      return {
        revoked: false,
        alreadyLoggedOut: true,
        localOnly: false,
        status: 401,
        code: "LOCAL_SESSION_MISSING",
        requestId: ""
      };
    }
    const baseUrl = String(config.playerSessionApiBaseUrl || "").trim().replace(/\/+$/, "");
    if (!logoutAdvertised(terminal, config) || !baseUrl || typeof runtime.fetch !== "function") {
      return {
        revoked: false,
        alreadyLoggedOut: false,
        localOnly: true,
        status: 0,
        code: "LOGOUT_REVOCATION_UNAVAILABLE",
        requestId: ""
      };
    }

    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const requestId = createRequestId();
      try {
        const headers = {
          "content-type": "application/json",
          "x-econovaria-csrf-token": csrfToken,
          "x-request-id": requestId
        };
        const publishableKey = String(config.publishableKey || "").trim();
        if (publishableKey) headers.apikey = publishableKey;
        const currentDeviceId = deviceId(config, runtime);
        if (currentDeviceId) headers["x-econovaria-device-id"] = currentDeviceId;

        const response = await runtime.fetch(`${baseUrl}/logout`, {
          method: "POST",
          headers,
          body: "{}",
          credentials: "include",
          cache: "no-store",
          redirect: "manual"
        });
        const body = await response.json?.().catch?.(() => ({})) || {};
        if (response.ok) {
          return {
            revoked: true,
            alreadyLoggedOut: false,
            localOnly: false,
            status: response.status,
            code: "PLAYER_SESSION_REVOKED",
            requestId
          };
        }
        if (response.status === 401) {
          return {
            revoked: false,
            alreadyLoggedOut: true,
            localOnly: false,
            status: 401,
            code: safeCode({ body }, "INVALID_PLAYER_SESSION"),
            requestId
          };
        }
        const error = {
          status: response.status,
          code: safeCode({ body }),
          body,
          retryAfterMs: Number(response.headers?.get?.("retry-after") || 0) * 1000,
          requestId
        };
        throw error;
      } catch (error) {
        lastError = error;
        if (attempt >= attempts || !isRetryable(error)) break;
        const requestedDelay = boundedInteger(error?.retryAfterMs, retryDelay, 0, 2000);
        await wait(runtime, requestedDelay || retryDelay);
      }
    }

    return {
      revoked: false,
      alreadyLoggedOut: false,
      localOnly: true,
      status: Number(lastError?.status || 0),
      code: safeCode(lastError),
      requestId: String(lastError?.requestId || "")
    };
  }

  async function logout(detail = {}) {
    if (pending) return pending;
    pending = (async () => {
      prepareTerminalForSessionExit(terminal, config);
      lockTerminal(mount, runtime);
      const result = await revoke();
      abortPlayerApiSessionRequests(config);
      clearSessionState(config, runtime);

      const completion = Object.freeze({
        reason: "player_requested",
        terminal: "player",
        revoked: result.revoked,
        alreadyLoggedOut: result.alreadyLoggedOut,
        localOnly: result.localOnly,
        status: result.status,
        code: result.code,
        requestId: result.requestId
      });
      dispatchCompletion(runtime, completion);

      if (!destroyed) {
        const target = resolvePlayerLogoutUrl(config, runtime.location);
        redirectTimer = runtime.setTimeout?.(() => runtime.location?.replace?.(target), exitDelay) || 0;
      }
      return completion;
    })();
    return pending;
  }

  function handleLogoutRequested(event) {
    void logout(event?.detail || {});
  }

  runtime.addEventListener?.(logoutEvent, handleLogoutRequested);

  return Object.freeze({
    logout,
    destroy() {
      destroyed = true;
      if (redirectTimer) runtime.clearTimeout?.(redirectTimer);
      runtime.removeEventListener?.(logoutEvent, handleLogoutRequested);
    }
  });
}

export const PLAYER_LOGOUT_COMPLETED_EVENT = LOGOUT_COMPLETED_EVENT;
