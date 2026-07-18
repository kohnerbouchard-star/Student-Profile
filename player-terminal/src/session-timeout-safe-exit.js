function positiveInteger(value, fallback, minimum = 0, maximum = 60000) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, Math.round(number)))
    : fallback;
}

function sessionExpiryFromState(terminal) {
  const session = terminal?.getState?.()?.data?.session;
  const value = String(session?.sessionExpiresAt || session?.expiresAt || "").trim();
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function resolvePlayerLoginUrl(config = {}, locationLike = globalThis.location) {
  const configured = String(config.sessionExitUrl || "").trim();
  if (configured) return new URL(configured, locationLike?.href || undefined).href;

  const url = new URL("../", locationLike?.href || "http://localhost/player-terminal/");
  url.searchParams.set("mode", "player");
  url.searchParams.set("reason", "session-expired");
  return url.href;
}

export function installPlayerSessionSafeExit({
  terminal,
  config,
  mount,
  runtime = globalThis
}) {
  if (!terminal || typeof terminal.getState !== "function") {
    throw new TypeError("A Player Terminal instance is required.");
  }

  const sessionInvalidEvent = String(
    config?.sessionInvalidEvent || "econovaria:player-session-invalid"
  );
  const sessionReadyEvent = String(
    config?.sessionReadyEvent || "econovaria:player-session-ready"
  );
  const exitDelayMs = positiveInteger(config?.sessionExitDelayMs, 120, 0, 2000);
  const expirySkewMs = positiveInteger(config?.sessionExpirySkewMs, 250, 0, 30000);
  const watchIntervalMs = positiveInteger(
    config?.sessionExpiryWatchIntervalMs,
    1000,
    250,
    10000
  );

  let exiting = false;
  let expiryTimer = 0;
  let watchTimer = 0;
  let redirectTimer = 0;
  let scheduledExpiry = 0;

  function clearTimer(name) {
    const timer = name === "expiry" ? expiryTimer : name === "watch" ? watchTimer : redirectTimer;
    if (!timer) return;
    if (name === "watch") runtime.clearInterval?.(timer);
    else runtime.clearTimeout?.(timer);
    if (name === "expiry") expiryTimer = 0;
    else if (name === "watch") watchTimer = 0;
    else redirectTimer = 0;
  }

  function clearSessionState() {
    config.playerSessionToken = "";
    config.playerSessionId = "";
    config.gameSessionId = "";
    config.accessToken = "";
    try {
      if (runtime.ECONOVARIA_PLAYER_SESSION) runtime.ECONOVARIA_PLAYER_SESSION = null;
      if (runtime.Econovaria?.playerSession) runtime.Econovaria.playerSession = null;
    } catch {
      // Host-owned session stores may be read-only. The redirect remains authoritative.
    }
  }

  function lockTerminal(detail) {
    if (!mount) return;
    try {
      mount.inert = true;
      mount.setAttribute?.("aria-busy", "true");
      mount.setAttribute?.("data-player-session-exiting", "true");
      mount.innerHTML = `
        <main class="player-terminal-overview player-terminal-loading-shell player-terminal-session-exit" role="alert" aria-live="assertive">
          <div class="player-terminal-loading-brand">
            <span>E</span>
            <div>
              <strong>ECONOVARIA</strong>
              <small>SESSION EXPIRED · RETURNING TO SIGN IN</small>
            </div>
          </div>
          <p>Your player session is no longer active. Unsaved submissions were not sent.</p>
        </main>`;
      if (runtime.document) runtime.document.title = "Session expired · Econovaria";
    } catch {
      // Navigation still proceeds if the shell cannot be replaced.
    }
    runtime.dispatchEvent?.(new runtime.CustomEvent("econovaria:player-session-exit-started", {
      detail
    }));
  }

  function exit(detail = {}) {
    if (exiting) return false;
    exiting = true;
    clearTimer("expiry");
    clearTimer("watch");
    clearSessionState();

    const safeDetail = {
      reason: "session-expired",
      terminal: "player",
      status: Number(detail.status || 401),
      code: String(detail.code || "SESSION_INVALID"),
      requestId: String(detail.requestId || "")
    };
    lockTerminal(safeDetail);

    const target = resolvePlayerLoginUrl(config, runtime.location);
    redirectTimer = runtime.setTimeout?.(() => {
      runtime.location?.replace?.(target);
    }, exitDelayMs) || 0;
    return true;
  }

  function notifyExpiry() {
    expiryTimer = 0;
    if (exiting) return;
    const detail = {
      reason: "invalid_player_session",
      terminal: "player",
      status: 401,
      code: "PLAYER_SESSION_EXPIRED",
      requestId: ""
    };
    try {
      if (typeof config.onSessionInvalid === "function") config.onSessionInvalid(detail);
    } catch {
      // Host callbacks cannot block the safe fallback.
    }
    if (typeof runtime.CustomEvent === "function") {
      runtime.dispatchEvent?.(new runtime.CustomEvent(sessionInvalidEvent, { detail }));
    } else {
      exit(detail);
    }
  }

  function scheduleFromState() {
    if (exiting) return;
    const expiresAt = sessionExpiryFromState(terminal);
    if (!expiresAt) return;

    const delay = expiresAt - Date.now() - expirySkewMs;
    if (delay <= 0) {
      clearTimer("expiry");
      notifyExpiry();
      return;
    }
    if (expiresAt === scheduledExpiry && expiryTimer) return;

    clearTimer("expiry");
    scheduledExpiry = expiresAt;
    expiryTimer = runtime.setTimeout?.(notifyExpiry, delay) || 0;
  }

  function handleSessionInvalid(event) {
    exit(event?.detail || {});
  }

  function handleSessionReady() {
    if (exiting) return;
    scheduledExpiry = 0;
    runtime.setTimeout?.(scheduleFromState, 0);
  }

  function handleVisibility() {
    if (!runtime.document || runtime.document.visibilityState === "visible") {
      scheduleFromState();
    }
  }

  runtime.addEventListener?.(sessionInvalidEvent, handleSessionInvalid);
  runtime.addEventListener?.(sessionReadyEvent, handleSessionReady);
  runtime.addEventListener?.("pageshow", handleVisibility);
  runtime.document?.addEventListener?.("visibilitychange", handleVisibility);
  watchTimer = runtime.setInterval?.(scheduleFromState, watchIntervalMs) || 0;
  scheduleFromState();

  return Object.freeze({
    check: scheduleFromState,
    exit,
    destroy() {
      clearTimer("expiry");
      clearTimer("watch");
      clearTimer("redirect");
      runtime.removeEventListener?.(sessionInvalidEvent, handleSessionInvalid);
      runtime.removeEventListener?.(sessionReadyEvent, handleSessionReady);
      runtime.removeEventListener?.("pageshow", handleVisibility);
      runtime.document?.removeEventListener?.("visibilitychange", handleVisibility);
    }
  });
}
