(function initEconovariaAdminAuthSessionManager() {
  "use strict";

  const runtimeConfig = window.EconovariaRuntimeConfig;
  if (!runtimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }

  const WEB_SESSION_API = String(runtimeConfig.webSessionApiUrl || "").replace(/\/+$/, "");
  const ADMIN_BFF_API = String(runtimeConfig.adminBffApiUrl || "").replace(/\/+$/, "");
  const PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const DEVICE_KEY = "econovaria.device.v1";
  const DEVICE_HEADER = "x-econovaria-device-id";
  const GAME_HEADER = "x-econovaria-game-id";
  const DEFAULT_EXPIRY_SKEW_MS = 30000;
  const DEVICE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ADMIN_PERMISSION_SET = new Set([
    "account.read",
    "audit.read",
    "attendance.manage",
    "business.manage",
    "contracts.manage",
    "economy.adjust",
    "game.create",
    "game.read",
    "game.switch",
    "game.update",
    "inventory.redeem",
    "market.manage",
    "marketplace.moderate",
    "messaging.moderate",
    "players.manage",
    "progression.review",
    "settings.manage",
    "store.manage",
    "world.manage"
  ]);
  const nativeFetch = window.fetch.bind(window);
  let statusPromise = null;
  let sessionGeneration = 0;
  let signingOut = false;

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

  function normalizePermissions(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value
      .map((permission) => String(permission || "").trim())
      .filter((permission) => ADMIN_PERMISSION_SET.has(permission)))]
      .sort();
  }

  function normalizeRoles(value, user) {
    const roles = Array.isArray(value)
      ? value.map((role) => String(role || "").trim()).filter(Boolean)
      : [];
    const userRole = String(user?.role || "").trim();
    if (userRole) roles.push(userRole);
    return [...new Set(roles.filter((role) => role === "game_admin"))];
  }

  function read() {
    try {
      const value = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null");
      return value && value.authenticated === true &&
          typeof value.csrfToken === "string"
        ? value
        : null;
    } catch (_) {
      return null;
    }
  }

  function store(result) {
    if (signingOut) {
      throw new Error("Administrator sign-out is in progress.");
    }
    const user = result?.user || null;
    const permissions = normalizePermissions(
      result?.permissions || result?.data?.permissions
    );
    const roles = normalizeRoles(result?.roles || result?.data?.roles, user);
    const record = {
      authenticated: result?.session?.authenticated === true,
      expiresAt: String(result?.session?.expiresAt || ""),
      absoluteExpiresAt: String(result?.session?.absoluteExpiresAt || ""),
      assuranceLevel: String(result?.session?.assuranceLevel || "aal1"),
      mfaRequired: result?.session?.mfaRequired !== false,
      user,
      csrfToken: String(result?.csrfToken || ""),
      activeGameSessions: Array.isArray(result?.activeGameSessions)
        ? result.activeGameSessions
        : [],
      permissions,
      roles,
      adminRole: roles.includes("game_admin") ? "game_admin" : "",
      refreshedAt: new Date().toISOString()
    };
    if (
      !record.authenticated ||
      !/^[A-Za-z0-9_-]{43}$/.test(record.csrfToken) ||
      !record.permissions.length ||
      record.adminRole !== "game_admin"
    ) {
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

  function hasAuthorization(session) {
    return normalizePermissions(session?.permissions).length > 0 &&
      normalizeRoles(session?.roles, session?.user).includes("game_admin");
  }

  function clear({ includeSelectedGame = true } = {}) {
    sessionGeneration += 1;
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
      if (includeSelectedGame) window.sessionStorage.removeItem(SELECTED_GAME_KEY);
    } catch (_) {}
  }

  async function readResponseJson(response) {
    try {
      return await response.json();
    } catch (_) {
      return null;
    }
  }

  async function requestAuthorizationSummary() {
    if (signingOut) return null;
    const headers = {
      apikey: PUBLISHABLE_KEY,
      [DEVICE_HEADER]: deviceId()
    };
    const selectedGameId = String(
      window.sessionStorage.getItem(SELECTED_GAME_KEY) || ""
    ).trim();
    if (selectedGameId) headers[GAME_HEADER] = selectedGameId;

    const response = await nativeFetch(`${ADMIN_BFF_API}/session/bootstrap`, {
      method: "GET",
      headers,
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer"
    });
    if (!response.ok || signingOut) return null;
    const payload = await readResponseJson(response);
    const data = payload?.data;
    if (!data || typeof data !== "object") return null;
    const permissions = normalizePermissions(data.permissions);
    const roles = normalizeRoles(data.roles, data.admin);
    return permissions.length && roles.includes("game_admin")
      ? {
        permissions,
        roles,
        adminRole: "game_admin"
      }
      : null;
  }

  async function requestStatus() {
    if (signingOut) return null;
    const requestGeneration = sessionGeneration;
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
    if (signingOut || requestGeneration !== sessionGeneration) return null;
    if (!response.ok) {
      clear();
      return null;
    }
    try {
      const status = await readResponseJson(response);
      if (signingOut || requestGeneration !== sessionGeneration) return null;
      const authorization = await requestAuthorizationSummary();
      if (signingOut || requestGeneration !== sessionGeneration) return null;
      if (!status?.ok || !authorization) {
        clear();
        return null;
      }
      return store({ ...status, ...authorization });
    } catch (_) {
      if (!signingOut && requestGeneration === sessionGeneration) clear();
      return null;
    }
  }

  function refresh() {
    if (signingOut) return Promise.resolve(null);
    if (!statusPromise) {
      statusPromise = requestStatus().finally(() => {
        statusPromise = null;
      });
    }
    return statusPromise;
  }

  async function getUsableSession({ minimumValidityMs = DEFAULT_EXPIRY_SKEW_MS } = {}) {
    if (signingOut) return null;
    const cached = read();
    if (
      cached &&
      !isExpired(cached, minimumValidityMs) &&
      hasAuthorization(cached)
    ) {
      return cached;
    }
    return refresh();
  }

  async function signOut() {
    if (signingOut) return;
    signingOut = true;
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
        referrerPolicy: "no-referrer",
        keepalive: true
      }).catch(() => null);
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
