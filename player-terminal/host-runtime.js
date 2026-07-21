(function installPlayerTerminalHostRuntime(runtime) {
  "use strict";

  const runtimeConfig = runtime.EconovariaRuntimeConfig;
  if (!runtimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }
  const STORAGE_KEY = "econovaria.player.auth.v1";
  const CLASSROOM_API_URL = runtimeConfig.classroomApiUrl;
  const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
  const SESSION_INVALID_EVENT = "econovaria:player-session-invalid";
  const SESSION_REQUIRED_EVENT = "econovaria:player-session-required";
  const LOGOUT_COMPLETED_EVENT = "econovaria:player-logout-completed";

  function readStoredSession() {
    try {
      const raw = runtime.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      const playerSessionToken = String(value?.playerSessionToken || "").trim();
      if (!playerSessionToken) return null;

      const expiresAt = String(value?.sessionExpiresAt || "").trim();
      if (expiresAt) {
        const expiry = Date.parse(expiresAt);
        if (Number.isFinite(expiry) && expiry <= Date.now()) {
          runtime.sessionStorage.removeItem(STORAGE_KEY);
          return null;
        }
      }

      runtime.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        playerSessionToken,
        sessionExpiresAt: expiresAt,
        storedAt: String(value?.storedAt || new Date().toISOString())
      }));

      return {
        playerSessionToken,
        sessionExpiresAt: expiresAt,
        accessToken: SUPABASE_PUBLISHABLE_KEY
      };
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

  runtime.ECONOVARIA_PLAYER_SESSION = session;
  runtime.ECONOVARIA_PLAYER_TERMINAL_CONFIG = {
    ...(runtime.ECONOVARIA_PLAYER_TERMINAL_CONFIG || {}),
    environment: runtimeConfig.environment,
    allowPreviewMode: development,
    usePreviewData: development && !session,
    simulatePreviewWrites: development && !session && requestedPreviewWrites,
    studentProfileMode: true,
    studentProfileApiBaseUrl: CLASSROOM_API_URL,
    apiBaseUrl: CLASSROOM_API_URL,
    accessToken: SUPABASE_PUBLISHABLE_KEY,
    playerSessionToken: session?.playerSessionToken || "",
    sessionProvider: () => readStoredSession(),
    sessionExitUrl: loginUrl("logged-out"),
    onSessionRequired: () => {
      if (!development) redirectToLogin("session-invalid");
    },
    onSessionInvalid: () => {
      clearStoredSession();
      redirectToLogin("session-invalid");
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
