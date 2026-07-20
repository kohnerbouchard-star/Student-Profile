(function initEconovariaAdminAuthSessionManager() {
  "use strict";

  const runtimeConfig = window.EconovariaRuntimeConfig;
  if (!runtimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }
  const SUPABASE_URL = runtimeConfig.supabaseUrl;
  const SUPABASE_PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const DEFAULT_EXPIRY_SKEW_MS = 30000;
  const nativeFetch = window.fetch.bind(window);
  let refreshPromise = null;

  function read() {
    try {
      const value = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null");
      return value && typeof value.accessToken === "string" && value.accessToken.trim()
        ? value
        : null;
    } catch (_) {
      return null;
    }
  }

  function parseJwt(token) {
    try {
      const payload = String(token || "").split(".")[1] || "";
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      return JSON.parse(atob(padded));
    } catch (_) {
      return {};
    }
  }

  function isExpired(session, skewMs = DEFAULT_EXPIRY_SKEW_MS) {
    const expiresAt = Number(parseJwt(session?.accessToken || "").exp || 0) * 1000;
    return Boolean(expiresAt && expiresAt <= Date.now() + Math.max(0, Number(skewMs) || 0));
  }

  function storeTokenResponse(payload, previousSession) {
    const accessToken = String(payload?.access_token || "").trim();
    if (!accessToken) throw new Error("Refresh response did not contain an access token.");

    const session = {
      ...(previousSession || {}),
      accessToken,
      refreshToken: String(payload?.refresh_token || previousSession?.refreshToken || "").trim(),
      user: payload?.user || previousSession?.user || null,
      refreshedAt: new Date().toISOString()
    };
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent("econovaria:admin-session-refreshed", {
      detail: { refreshedAt: session.refreshedAt }
    }));
    return session;
  }

  function clear({ includeSelectedGame = true } = {}) {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
      if (includeSelectedGame) window.sessionStorage.removeItem(SELECTED_GAME_KEY);
    } catch (_) {}
  }

  async function performRefresh() {
    const previousSession = read();
    const refreshToken = String(previousSession?.refreshToken || "").trim();
    if (!previousSession || !refreshToken) {
      clear();
      throw new Error("Administrator refresh token is unavailable.");
    }

    let response;
    try {
      response = await nativeFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer"
      });
    } catch (error) {
      throw new Error("Administrator session refresh could not reach the identity service.", {
        cause: error
      });
    }

    if (!response.ok) {
      clear();
      throw new Error(`Administrator session refresh was rejected (${response.status}).`);
    }

    try {
      return storeTokenResponse(await response.json(), previousSession);
    } catch (error) {
      clear();
      throw new Error("Administrator session refresh returned an invalid response.", {
        cause: error
      });
    }
  }

  function refresh() {
    if (!refreshPromise) {
      refreshPromise = performRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  async function getUsableSession({ minimumValidityMs = DEFAULT_EXPIRY_SKEW_MS } = {}) {
    const session = read();
    if (!session) return null;
    if (!isExpired(session, minimumValidityMs)) return session;
    return refresh();
  }

  window.EconovariaAdminAuthSession = Object.freeze({
    read,
    clear,
    parseJwt,
    isExpired,
    refresh,
    getUsableSession
  });
})();
