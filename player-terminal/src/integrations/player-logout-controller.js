import { createRequestId } from "../api/request-context.js";

const DEFAULT_LOGOUT_EVENT = "econovaria:player-logout-requested";
const LOGOUT_COMPLETED_EVENT = "econovaria:player-logout-completed";
const RETRYABLE_STATUSES = new Set([409, 429, 503]);
const RETRYABLE_CODES = new Set([
  "NETWORK_ERROR",
  "OFFLINE",
  "REQUEST_TIMEOUT",
  "PLAYER_LOGOUT_CONFLICT",
  "PLAYER_LOGOUT_SERVICE_UNAVAILABLE"
]);

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, Math.round(number)))
    : fallback;
}

function safeCode(error, fallback = "PLAYER_LOGOUT_FAILED") {
  return String(error?.code || error?.body?.code || fallback).trim().toUpperCase();
}

function isRetryable(error) {
  return RETRYABLE_STATUSES.has(Number(error?.status || 0)) || RETRYABLE_CODES.has(safeCode(error));
}

function wait(runtime, delayMs) {
  return new Promise((resolve) => runtime.setTimeout?.(resolve, delayMs));
}

function sessionToken(config) {
  return String(config?.playerSessionToken || "").trim();
}

function clearSessionState(config, runtime) {
  config.playerSessionToken = "";
  config.playerSessionId = "";
  config.gameSessionId = "";
  config.accessToken = "";
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
    const token = sessionToken(config);
    if (!token) {
      return {
        revoked: false,
        alreadyLoggedOut: true,
        localOnly: false,
        status: 401,
        code: "LOCAL_SESSION_MISSING",
        requestId: ""
      };
    }
    if (!logoutAdvertised(terminal, config) || typeof config.apiCall !== "function") {
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
        const response = await config.apiCall({
          endpointKey: "logout",
          method: "POST",
          path: "/session/logout",
          payload: undefined,
          params: {},
          session: { playerSessionToken: token },
          config,
          requestId,
          signal: null
        });
        return {
          revoked: true,
          alreadyLoggedOut: response?.alreadyLoggedOut === true,
          localOnly: false,
          status: 200,
          code: "PLAYER_SESSION_REVOKED",
          requestId
        };
      } catch (error) {
        lastError = error;
        if (Number(error?.status || 0) === 401) {
          return {
            revoked: false,
            alreadyLoggedOut: true,
            localOnly: false,
            status: 401,
            code: safeCode(error, "INVALID_PLAYER_SESSION"),
            requestId
          };
        }
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
      lockTerminal(mount, runtime);
      const result = await revoke();
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
