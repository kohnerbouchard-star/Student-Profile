(function installPlayerTerminalHostRuntime(runtime) {
  "use strict";

  const runtimeConfig = runtime.EconovariaRuntimeConfig;
  if (!runtimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }
  const STORAGE_KEY = "econovaria.player.auth.v1";
  const PLAYER_API_URL = runtimeConfig.playerApiUrl;
  const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
  const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
  const SESSION_INVALID_EVENT = "econovaria:player-session-invalid";
  const SESSION_REQUIRED_EVENT = "econovaria:player-session-required";
  const LOGOUT_COMPLETED_EVENT = "econovaria:player-logout-completed";

  function readStoredSession() {
    try {
      const raw = runtime.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (
        value?.authenticated !== true ||
        !CSRF_PATTERN.test(String(value?.csrfToken || ""))
      ) {
        runtime.sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }

      const expiresAt = String(
        value?.absoluteExpiresAt || value?.sessionExpiresAt || ""
      ).trim();
      if (expiresAt) {
        const expiry = Date.parse(expiresAt);
        if (Number.isFinite(expiry) && expiry <= Date.now()) {
          runtime.sessionStorage.removeItem(STORAGE_KEY);
          return null;
        }
      }

      const safe = {
        authenticated: true,
        sessionExpiresAt: String(value?.sessionExpiresAt || ""),
        absoluteExpiresAt: String(value?.absoluteExpiresAt || ""),
        csrfToken: String(value.csrfToken),
        player: value?.player && typeof value.player === "object"
          ? value.player
          : null,
        gameSession: value?.gameSession && typeof value.gameSession === "object"
          ? value.gameSession
          : null,
        storedAt: String(value?.storedAt || new Date().toISOString())
      };
      runtime.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
      return safe;
    } catch (_) {
      runtime.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function clearStoredSession() {
    try {
      runtime.sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  function loginUrl(reason) {
    const url = new URL("../", runtime.location.href);
    url.searchParams.set("mode", "player");
    if (reason) url.searchParams.set("reason", reason);
    return url.href;
  }

  function redirectToLogin(reason) {
    runtime.location.replace(loginUrl(reason));
  }

  const development = runtimeConfig.environment === "development";
  const session = readStoredSession();
  const requestedPreviewWrites =
    runtime.ECONOVARIA_PLAYER_TERMINAL_CONFIG?.simulatePreviewWrites === true;

  // This global contains only safe display state and CSRF material. The opaque
  // Player credential is sealed in an HttpOnly cookie and never reaches JS.
  runtime.ECONOVARIA_PLAYER_SESSION = session;
  runtime.ECONOVARIA_PLAYER_TERMINAL_CONFIG = {
    ...(runtime.ECONOVARIA_PLAYER_TERMINAL_CONFIG || {}),
    environment: runtimeConfig.environment,
    allowPreviewMode: development,
    usePreviewData: development && !session,
    simulatePreviewWrites: development && !session && requestedPreviewWrites,
    studentProfileMode: true,
    studentProfileApiBaseUrl: PLAYER_API_URL,
    apiBaseUrl: PLAYER_API_URL,
    publishableKey: SUPABASE_PUBLISHABLE_KEY,
    csrfToken: session?.csrfToken || "",
    sessionProvider: () => readStoredSession(),
    sessionExitUrl: loginUrl("session-invalid"),
    logoutExitUrl: loginUrl("logged-out"),
    onSessionRequired: () => {
      if (!development) redirectToLogin("session-invalid");
    },
    onSessionInvalid: () => {
      clearStoredSession();
    }
  };

  runtime.addEventListener(LOGOUT_COMPLETED_EVENT, clearStoredSession);
  runtime.addEventListener(SESSION_INVALID_EVENT, clearStoredSession);
  runtime.addEventListener(SESSION_REQUIRED_EVENT, () => {
    if (!development && !readStoredSession()) redirectToLogin("session-invalid");
  });

  runtime.Econovaria = runtime.Econovaria || {};
  runtime.Econovaria.playerHostRuntime = Object.freeze({
    storageKey: STORAGE_KEY,
    readStoredSession,
    clearStoredSession,
    loginUrl
  });
})(window);
