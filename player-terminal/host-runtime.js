(function installPlayerTerminalHostRuntime(runtime) {
  "use strict";

  const STORAGE_KEY = "econovaria.player.auth.v1";
  const CLASSROOM_API_URL = "https://cgiukdjwicykrmtkhudh.supabase.co/functions/v1/classroom-api";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_zkbXiJ1_zlmQIBMky6oi5w_4A24T1iV";
  const SESSION_INVALID_EVENT = "econovaria:player-session-invalid";
  const SESSION_REQUIRED_EVENT = "econovaria:player-session-required";
  const LOGOUT_COMPLETED_EVENT = "econovaria:player-logout-completed";
  const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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

  const hostname = String(runtime.location.hostname || "").toLowerCase();
  const development = !hostname || LOCAL_HOSTS.has(hostname);
  const session = readStoredSession();

  runtime.ECONOVARIA_PLAYER_SESSION = session;
  runtime.ECONOVARIA_PLAYER_TERMINAL_CONFIG = {
    ...(runtime.ECONOVARIA_PLAYER_TERMINAL_CONFIG || {}),
    environment: development ? "development" : "production",
    allowPreviewMode: development,
    usePreviewData: development && !session,
    simulatePreviewWrites: false,
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
