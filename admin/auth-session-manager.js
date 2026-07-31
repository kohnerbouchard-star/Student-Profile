(function initEconovariaAdminAuthSessionManager() {
  "use strict";

  const runtimeConfig = window.EconovariaRuntimeConfig;
  if (!runtimeConfig) {
    throw new Error("ECONOVARIA_RUNTIME_CONFIG_NOT_INITIALIZED");
  }

  const WEB_SESSION_API = String(runtimeConfig.webSessionApiUrl || "").replace(/\/+$/, "");
  const ADMIN_LOGOUT_API = String(
    runtimeConfig.adminLogoutApiUrl || `${WEB_SESSION_API}/logout`
  ).replace(/\/+$/, "");
  const ADMIN_BFF_API = String(runtimeConfig.adminBffApiUrl || "").replace(/\/+$/, "");
  const PUBLISHABLE_KEY = runtimeConfig.supabasePublishableKey;
  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const DEVICE_KEY = "econovaria.device.v1";
  const DEVICE_HEADER = "x-econovaria-device-id";
  const GAME_HEADER = "x-econovaria-game-id";
  const CSRF_HEADER = "x-econovaria-csrf-token";
  const DEFAULT_EXPIRY_SKEW_MS = 30000;
  const DEVICE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
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

  class AdminSessionRequestError extends Error {
    constructor(code, message, options = {}) {
      super(message);
      this.name = "AdminSessionRequestError";
      this.code = String(code || "admin_session_request_failed");
      this.status = Number(options.status || 0);
      this.retryable = options.retryable === true;
      this.terminal = options.terminal === true;
    }
  }

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
      !CSRF_PATTERN.test(record.csrfToken) ||
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

  function normalizeAuthorizationSummary(data) {
    if (!data || typeof data !== "object") return null;
    const admin = data.admin && typeof data.admin === "object"
      ? data.admin
      : {};
    const rawRoles = Array.isArray(data.roles) ? data.roles : admin.roles;
    const roles = normalizeRoles(rawRoles, admin);
    if (!roles.includes("game_admin")) return null;

    const rawPermissions = Array.isArray(data.permissions)
      ? data.permissions
      : admin.permissions;
    const permissions = Array.isArray(rawPermissions) && rawPermissions.includes("*")
      ? [...ADMIN_PERMISSION_SET].sort()
      : normalizePermissions(rawPermissions);

    return permissions.length
      ? { permissions, roles, adminRole: "game_admin" }
      : null;
  }

  function failureCode(payload, fallbackCode) {
    return String(
      payload?.error?.code || payload?.code || fallbackCode ||
        "admin_session_request_failed"
    );
  }

  function failureMessage(payload, fallbackMessage) {
    return String(
      payload?.error?.message || payload?.message || fallbackMessage ||
        "Administrator session verification failed."
    );
  }

  function retryableStatus(status) {
    const value = Number(status || 0);
    return value === 0 || value === 408 || value === 425 || value === 429 ||
      value >= 500;
  }

  function responseFailure(response, payload, fallbackCode, fallbackMessage) {
    const status = Number(response?.status || 0);
    return new AdminSessionRequestError(
      failureCode(payload, fallbackCode),
      failureMessage(payload, fallbackMessage),
      {
        status,
        retryable: retryableStatus(status),
        terminal: status === 401
      }
    );
  }

  function networkFailure(code, message) {
    return new AdminSessionRequestError(code, message, {
      status: 0,
      retryable: true,
      terminal: false
    });
  }

  function describeFailure(error) {
    if (!error || typeof error !== "object") return null;
    return {
      code: String(error.code || "admin_session_request_failed"),
      message: String(error.message || "Administrator session verification failed."),
      status: Number(error.status || 0),
      retryable: error.retryable === true,
      terminal: error.terminal === true
    };
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

    let response;
    try {
      response = await nativeFetch(`${ADMIN_BFF_API}/session/bootstrap`, {
        method: "GET",
        headers,
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer"
      });
    } catch (_) {
      throw networkFailure(
        "admin_bootstrap_unavailable",
        "The administrator authorization service is temporarily unavailable."
      );
    }
    if (signingOut) return null;
    if (!response.ok) {
      const payload = await readResponseJson(response);
      throw responseFailure(
        response,
        payload,
        "admin_bootstrap_failed",
        "Administrator authorization could not be verified."
      );
    }

    const payload = await readResponseJson(response);
    const authorization = normalizeAuthorizationSummary(payload?.data);
    if (!authorization) {
      throw new AdminSessionRequestError(
        "admin_bootstrap_contract_invalid",
        "Administrator authorization returned an invalid response.",
        { status: 502, retryable: true, terminal: false }
      );
    }
    return authorization;
  }

  async function requestStatus() {
    if (signingOut) return null;
    const requestGeneration = sessionGeneration;
    let response;
    try {
      response = await nativeFetch(`${WEB_SESSION_API}/status`, {
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
    } catch (_) {
      throw networkFailure(
        "admin_session_status_unavailable",
        "The administrator session service is temporarily unavailable."
      );
    }

    if (signingOut || requestGeneration !== sessionGeneration) return null;
    if (!response.ok) {
      const payload = await readResponseJson(response);
      const failure = responseFailure(
        response,
        payload,
        "admin_session_status_failed",
        "Administrator session status could not be verified."
      );
      if (failure.terminal) {
        clear();
        return null;
      }
      throw failure;
    }

    const status = await readResponseJson(response);
    if (signingOut || requestGeneration !== sessionGeneration) return null;
    if (!status?.ok) {
      clear();
      return null;
    }

    let authorization;
    try {
      authorization = await requestAuthorizationSummary();
    } catch (error) {
      const failure = describeFailure(error);
      if (failure?.terminal) {
        clear();
        return null;
      }
      throw error;
    }
    if (signingOut || requestGeneration !== sessionGeneration) return null;
    if (!authorization) return null;

    try {
      return store({ ...status, ...authorization });
    } catch (_) {
      throw new AdminSessionRequestError(
        "admin_session_contract_invalid",
        "Administrator session state could not be rebuilt safely.",
        { status: 502, retryable: true, terminal: false }
      );
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
    if (signingOut) return { ok: false, code: "staff_logout_in_progress" };
    const cached = read();
    signingOut = true;
    let result = { ok: false, code: "staff_logout_revocation_failed" };
    try {
      const headers = {
        apikey: PUBLISHABLE_KEY,
        [DEVICE_HEADER]: deviceId()
      };
      if (CSRF_PATTERN.test(String(cached?.csrfToken || ""))) {
        headers[CSRF_HEADER] = cached.csrfToken;
      }
      const response = await nativeFetch(ADMIN_LOGOUT_API, {
        method: "POST",
        headers,
        body: "{}",
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        keepalive: true
      }).catch(() => null);
      const body = response ? await readResponseJson(response) : null;
      result = response?.ok
        ? { ok: true, code: "staff_session_revoked" }
        : {
          ok: false,
          code: String(body?.error?.code || "staff_logout_revocation_failed"),
          status: Number(response?.status || 0)
        };
    } finally {
      clear();
    }
    return result;
  }

  window.EconovariaAdminAuthSession = Object.freeze({
    read,
    store,
    clear,
    isExpired,
    refresh,
    getUsableSession,
    describeFailure,
    signOut
  });
})();