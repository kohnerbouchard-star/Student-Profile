(function initEconovariaAdminAuthSessionManager() {
  "use strict";

  const runtimeConfig = window.EconovariaRuntimeConfig;
  if (!runtimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }

  const WEB_SESSION_API = String(runtimeConfig.webSessionApiUrl || "").replace(/\/+$/, "");
  const PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const DEVICE_KEY = "econovaria.device.v1";
  const DEVICE_HEADER = "x-econovaria-device-id";
  const DEFAULT_EXPIRY_SKEW_MS = 30000;
  const DEVICE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const nativeFetch = window.fetch.bind(window);
  let statusPromise = null;

  function deviceId() {
    const existing = String(window.localStorage.getItem(DEVICE_KEY) || "")
      .trim()
      .toLowerCase();
    if (DEVICE_PATTERN.test(existing)) return existing;
    const generated = String(window.crypto?.randomUUID?.() || "").toLowerCase();
    if (!DEVICE_PATTERN.test(generated)) {
      throw new Error("Secure device identifier generation is unavailable.");
    }
    window.localStorage.setItem(DEVICE_KEY, generated);
    return generated;
  }

  function read() {
    try {
      const value = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null");
      return value && value.authenticated === true && typeof value.csrfToken === "string"
        ? value
        : null;
    } catch (_) {
      return null;
    }
  }

  function store(result) {
    const record = {
      authenticated: result?.session?.authenticated === true,
      expiresAt: String(result?.session?.expiresAt || ""),
      absoluteExpiresAt: String(result?.session?.absoluteExpiresAt || ""),
      assuranceLevel: String(result?.session?.assuranceLevel || "aal1"),
      mfaRequired: result?.session?.mfaRequired !== false,
      user: result?.user || null,
      csrfToken: String(result?.csrfToken || ""),
      activeGameSessions: Array.isArray(result?.activeGameSessions)
        ? result.activeGameSessions
        : [],
      refreshedAt: new Date().toISOString()
    };
    if (!record.authenticated || !/^[A-Za-z0-9_-]{43}$/.test(record.csrfToken)) {
      throw new Error("Administrator web-session response is invalid.");
    }
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(record));
    window.dispatchEvent(new CustomEvent("econovaria:admin-session-refreshed", {
      detail: { refreshedAt: record.refreshedAt }
    }));
    return record;
  }

  function isExpired(session, skewMs = DEFAULT_EXPIRY_SKEW_MS) {
    const expiry = Math.min(
      Date.parse(String(session?.expiresAt || "")) || 0,
      Date.parse(String(session?.absoluteExpiresAt || "")) || 0
    );
    return !expiry || expiry <= Date.now() + Math.max(0, Number(skewMs) || 0);
  }

  function clear({ includeSelectedGame = true } = {}) {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
      if (includeSelectedGame) window.sessionStorage.removeItem(SELECTED_GAME_KEY);
    } catch (_) {}
  }

  async function requestStatus() {
    const response = await nativeFetch(`${WEB_SESSION_API}/status`, {
      method: "GET",
      headers: {
        apikey: PUBLISHABLE_KEY,
        [DEVICE_HEADER]: deviceId()
      },
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer"
    });
    if (!response.ok) {
      clear();
      return null;
    }
    try {
      return store(await response.json());
    } catch (_) {
      clear();
      return null;
    }
  }

  function refresh() {
    if (!statusPromise) {
      statusPromise = requestStatus().finally(() => {
        statusPromise = null;
      });
    }
    return statusPromise;
  }

  async function getUsableSession({ minimumValidityMs = DEFAULT_EXPIRY_SKEW_MS } = {}) {
    const cached = read();
    if (cached && !isExpired(cached, minimumValidityMs)) return cached;
    return refresh();
  }

  async function signOut() {
    try {
      await nativeFetch(`${WEB_SESSION_API}/logout`, {
        method: "POST",
        headers: {
          apikey: PUBLISHABLE_KEY,
          [DEVICE_HEADER]: deviceId()
        },
        body: "{}",
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer"
      });
    } finally {
      clear();
    }
  }

  window.EconovariaAdminAuthSession = Object.freeze({
    read,
    store,
    clear,
    isExpired,
    refresh,
    getUsableSession,
    signOut
  });
})();
