window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};
window.Econovaria.core.api = window.Econovaria.core.api || {};

const ECONOVARIA_DEVICE_STORAGE_KEY = "econovaria.device.v1";
const ECONOVARIA_DEVICE_HEADER = "x-econovaria-device-id";
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ECONOVARIA_API_ADMIN_STATE_STORAGE_KEY = "econovaria.admin.auth.v1";
const ECONOVARIA_API_SELECTED_GAME_STORAGE_KEY = "econovaria.admin.selected-game.v1";
const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ADMIN_MFA_MODULE_URL = "frontend/src/core/admin-mfa.js";
let inMemoryAdminCsrfToken = "";
let adminMfaModulePromise = null;

function getApiRouteUrl(surface, path) {
  const constants = window.Econovaria?.core?.constants || {};
  const baseBySurface = {
    player: constants.PLAYER_API_URL,
    bootstrap: constants.BOOTSTRAP_API_URL,
    webSession: constants.WEB_SESSION_API_URL
  };
  const baseUrl = String(baseBySurface[surface] || "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error(`[Econovaria API] ${surface} API URL is not configured.`);
  }

  const routePath = String(path || "").startsWith("/")
    ? String(path || "")
    : `/${path || ""}`;
  return `${baseUrl}${routePath}`;
}

function getSupabaseConfig() {
  const constants = window.Econovaria?.core?.constants || {};
  const supabaseUrl = String(constants.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const publishableKey = String(constants.SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (!supabaseUrl || !publishableKey) {
    throw new Error("[Econovaria API] Supabase frontend configuration is incomplete.");
  }
  return { supabaseUrl, publishableKey };
}

function normalizeOpaqueSessionToken(value) {
  return String(value || "").trim();
}

function getOrCreateDeviceId() {
  try {
    const existing = String(
      window.localStorage.getItem(ECONOVARIA_DEVICE_STORAGE_KEY) || ""
    ).trim().toLowerCase();
    if (DEVICE_ID_PATTERN.test(existing)) return existing;

    const generated = String(window.crypto?.randomUUID?.() || "").toLowerCase();
    if (!DEVICE_ID_PATTERN.test(generated)) {
      throw new Error("Secure device identifier generation is unavailable.");
    }
    window.localStorage.setItem(ECONOVARIA_DEVICE_STORAGE_KEY, generated);
    return generated;
  } catch (_) {
    throw new Error(
      "[Econovaria API] A secure device identifier could not be initialized."
    );
  }
}

function readSafeAdminState() {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(ECONOVARIA_API_ADMIN_STATE_STORAGE_KEY) || "null"
    );
    return value && value.authenticated === true &&
        CSRF_PATTERN.test(String(value.csrfToken || ""))
      ? value
      : null;
  } catch (_) {
    return null;
  }
}

function rememberAdminCsrf(result) {
  const candidate = String(result?.csrfToken || "");
  if (CSRF_PATTERN.test(candidate)) inMemoryAdminCsrfToken = candidate;
}

function clearAdminCsrf() {
  inMemoryAdminCsrfToken = "";
}

function readAdminCsrf() {
  return CSRF_PATTERN.test(inMemoryAdminCsrfToken)
    ? inMemoryAdminCsrfToken
    : String(readSafeAdminState()?.csrfToken || "");
}

function readSelectedAdminGameId() {
  return String(
    window.sessionStorage.getItem(ECONOVARIA_API_SELECTED_GAME_STORAGE_KEY) || ""
  ).trim();
}

function loadAdminMfaModule() {
  if (window.Econovaria?.adminMfa?.ensureAal2) {
    return Promise.resolve(window.Econovaria.adminMfa);
  }
  if (adminMfaModulePromise) return adminMfaModulePromise;

  adminMfaModulePromise = new Promise((resolve, reject) => {
    const script = window.document.createElement("script");
    script.src = new URL(ADMIN_MFA_MODULE_URL, window.document.baseURI).href;
    script.async = true;
    script.dataset.econovariaAdminMfaModule = "true";
    script.addEventListener("load", () => {
      const module = window.Econovaria?.adminMfa;
      if (module?.ensureAal2) resolve(module);
      else reject(new Error("Administrator MFA module did not initialize."));
    }, { once: true });
    script.addEventListener("error", () => {
      reject(new Error("Administrator MFA module could not be loaded."));
    }, { once: true });
    window.document.head.append(script);
  }).catch((error) => {
    adminMfaModulePromise = null;
    throw error;
  });
  return adminMfaModulePromise;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

function readRetryAfterSeconds(response) {
  const value = String(response?.headers?.get?.("retry-after") || "").trim();
  if (!/^\d{1,8}$/.test(value)) return 0;
  return Math.max(0, Math.min(86400, Number(value)));
}

function normalizeEdgeRouteError(
  result,
  status,
  fallbackCode = "request_failed",
  fallbackMessage = "The request could not be completed.",
  retryAfterSeconds = 0
) {
  const error = result && typeof result === "object" ? result.error : null;
  return {
    ok: false,
    status,
    code: error?.code || result?.code || fallbackCode,
    message: error?.message || result?.message || fallbackMessage,
    retryAfterSeconds,
    error: error || null
  };
}

async function callSupabaseJsonRoute(surface, path, options = {}) {
  const { publishableKey } = getSupabaseConfig();
  const playerSessionToken = normalizeOpaqueSessionToken(
    options.playerSessionToken
  );
  const method = String(options.method || "GET").toUpperCase();

  try {
    const headers = {
      apikey: publishableKey,
      [ECONOVARIA_DEVICE_HEADER]: getOrCreateDeviceId()
    };
    if (playerSessionToken) {
      headers["x-player-session-token"] = playerSessionToken;
    }
    if (options.requireCsrf === true) {
      const csrfToken = readAdminCsrf();
      if (!CSRF_PATTERN.test(csrfToken)) {
        return {
          ok: false,
          status: 401,
          code: "staff_session_invalid",
          message: "Administrator sign-in is required.",
          retryAfterSeconds: 0
        };
      }
      headers["x-econovaria-csrf-token"] = csrfToken;
    }

    const requestOptions = {
      method,
      headers,
      cache: "no-store",
      credentials: options.credentials || "omit"
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(getApiRouteUrl(surface, path), requestOptions);
    const result = await readJsonResponse(response);
    if (response.ok && result?.ok === true) {
      rememberAdminCsrf(result);
      return { status: response.status, ...result };
    }

    return normalizeEdgeRouteError(
      result,
      response.status,
      options.fallbackCode,
      options.fallbackMessage,
      readRetryAfterSeconds(response)
    );
  } catch (_) {
    return {
      ok: false,
      status: 0,
      code: `${options.fallbackCode || "supabase_request"}_network_failed`,
      message: "Could not connect to Econovaria. Check your connection and try again.",
      retryAfterSeconds: 0
    };
  }
}

async function callAdminBffJsonRoute(path, options = {}) {
  const constants = window.Econovaria?.core?.constants || {};
  const baseUrl = String(constants.ADMIN_BFF_API_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const state = readSafeAdminState();
  if (!baseUrl || !state) {
    return {
      ok: false,
      status: 401,
      code: "staff_session_invalid",
      message: "Administrator sign-in is required.",
      retryAfterSeconds: 0
    };
  }

  try {
    const method = String(options.method || "GET").toUpperCase();
    const headers = {
      apikey: getSupabaseConfig().publishableKey,
      [ECONOVARIA_DEVICE_HEADER]: getOrCreateDeviceId()
    };
    const selectedGameId = readSelectedAdminGameId();
    if (selectedGameId) headers["x-econovaria-game-id"] = selectedGameId;
    if (!["GET", "HEAD"].includes(method)) {
      headers["x-econovaria-csrf-token"] = state.csrfToken;
    }
    const requestOptions = {
      method,
      headers,
      credentials: "include",
      cache: "no-store"
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestOptions.body = JSON.stringify(options.body);
    }

    const route = String(path || "").startsWith("/") ? path : `/${path}`;
    const response = await fetch(`${baseUrl}${route}`, requestOptions);
    const result = await readJsonResponse(response);
    return response.ok
      ? { status: response.status, ...result }
      : normalizeEdgeRouteError(
        result,
        response.status,
        options.fallbackCode,
        options.fallbackMessage,
        readRetryAfterSeconds(response)
      );
  } catch (_) {
    return {
      ok: false,
      status: 0,
      code: `${options.fallbackCode || "admin_request"}_network_failed`,
      message: "Could not connect to the administrator service.",
      retryAfterSeconds: 0
    };
  }
}

function callPlayerLoginApi(gameCode, playerIdentifier, accessCode) {
  return callSupabaseJsonRoute("player", "/players/login", {
    method: "POST",
    body: {
      gameJoinCode: String(gameCode || "").trim(),
      playerIdentifier: String(playerIdentifier || "").trim(),
      accessCode: String(accessCode || "").trim()
    },
    fallbackCode: "player_login_failed",
    fallbackMessage:
      "Player login failed. Check the Game Code, Player ID, and Access Code."
  });
}

function callPlayerBootstrapApi(sessionToken) {
  return callSupabaseJsonRoute("player", "/players/me", {
    method: "GET",
    playerSessionToken: sessionToken,
    fallbackCode: "player_session_bootstrap_failed",
    fallbackMessage: "Your player session could not be loaded."
  });
}

function callPlayerLogoutApi(sessionToken) {
  return callSupabaseJsonRoute("player", "/players/me/session/logout", {
    method: "POST",
    playerSessionToken: sessionToken,
    body: {},
    fallbackCode: "player_logout_failed",
    fallbackMessage: "The Player session could not be revoked."
  });
}

function callPlayerGameDashboardApi(sessionToken) {
  return callSupabaseJsonRoute("player", "/players/me/game/dashboard", {
    method: "GET",
    playerSessionToken: sessionToken,
    fallbackCode: "player_game_dashboard_failed",
    fallbackMessage: "Your game dashboard could not be loaded."
  });
}

async function callSupabasePasswordSignIn(email, password) {
  const signIn = await callSupabaseJsonRoute("webSession", "/login", {
    method: "POST",
    credentials: "include",
    body: {
      email: String(email || "").trim(),
      password: String(password || "")
    },
    fallbackCode: "admin_login_failed",
    fallbackMessage: "Admin email or password is invalid."
  });
  if (!signIn?.ok) return signIn;

  const status = await callAdminWebSessionStatus();
  if (!status?.ok) return status;
  try {
    const mfa = await loadAdminMfaModule();
    const elevated = await mfa.ensureAal2(status);
    rememberAdminCsrf(elevated);
    return elevated;
  } catch (error) {
    clearAdminCsrf();
    return {
      ok: false,
      status: 401,
      code: "staff_mfa_required",
      message: String(error?.message || "Administrator MFA verification is required."),
      retryAfterSeconds: 0
    };
  }
}

async function callAdminWebSessionStatus() {
  const result = await callSupabaseJsonRoute("webSession", "/status", {
    method: "GET",
    credentials: "include",
    fallbackCode: "staff_session_invalid",
    fallbackMessage: "The administrator session could not be loaded."
  });
  if (result?.ok) rememberAdminCsrf(result);
  return result;
}

async function callAdminWebSessionLogout() {
  const result = await callSupabaseJsonRoute("webSession", "/logout", {
    method: "POST",
    credentials: "include",
    body: {},
    fallbackCode: "staff_logout_failed",
    fallbackMessage: "The administrator session could not be closed."
  });
  clearAdminCsrf();
  return result;
}

function callAdminMfaStatus() {
  return callSupabaseJsonRoute("webSession", "/mfa", {
    method: "GET",
    credentials: "include",
    fallbackCode: "staff_mfa_status_failed",
    fallbackMessage: "Administrator MFA status could not be loaded."
  });
}

function callAdminMfaEnroll(friendlyName) {
  return callSupabaseJsonRoute("webSession", "/mfa/enroll", {
    method: "POST",
    credentials: "include",
    requireCsrf: true,
    body: {
      friendlyName: String(friendlyName || "Econovaria Admin").trim()
    },
    fallbackCode: "staff_mfa_enrollment_failed",
    fallbackMessage: "Authenticator enrollment could not be started."
  });
}

async function callAdminMfaVerify(factorHandle, code) {
  const result = await callSupabaseJsonRoute("webSession", "/mfa/verify", {
    method: "POST",
    credentials: "include",
    requireCsrf: true,
    body: {
      factorHandle: String(factorHandle || "").trim(),
      code: String(code || "").replace(/\s+/g, "")
    },
    fallbackCode: "staff_mfa_verification_failed",
    fallbackMessage: "The authenticator code is invalid or expired."
  });
  if (result?.ok) rememberAdminCsrf(result);
  return result;
}

function callStaffSignupApi(input) {
  return callSupabaseJsonRoute("bootstrap", "/staff/signup", {
    method: "POST",
    body: {
      email: String(input?.email || "").trim(),
      password: String(input?.password || ""),
      displayName: String(input?.displayName || "").trim(),
      purchaseCode: String(input?.purchaseCode || "").trim(),
      gameName: String(input?.gameName || "").trim(),
      difficultyPreset: String(input?.difficultyPreset || "").trim(),
      stockMarketWindow: {
        timezone: String(input?.timeZone || "").trim()
      }
    },
    fallbackCode: "staff_signup_failed",
    fallbackMessage: "Staff account signup failed."
  });
}

function callLicensingActivationApi(_unusedCredential, input) {
  return callAdminBffJsonRoute("/games/provision", {
    method: "POST",
    body: {
      purchaseCode: String(input?.licenseCode || "").trim(),
      gameName: String(input?.sessionName || "").trim(),
      difficultyPreset: String(input?.difficulty || "").trim(),
      stockMarketWindow: {
        timezone: String(input?.timeZone || "").trim()
      }
    },
    fallbackCode: "licensing_activation_failed",
    fallbackMessage: "The game could not be created."
  });
}

function callStaffBootstrapApi() {
  return callAdminWebSessionStatus();
}

Object.assign(window.Econovaria.core.api, {
  callPlayerLoginApi,
  callPlayerBootstrapApi,
  callPlayerLogoutApi,
  callPlayerGameDashboardApi,
  callSupabasePasswordSignIn,
  callAdminWebSessionStatus,
  callAdminWebSessionLogout,
  callAdminMfaStatus,
  callAdminMfaEnroll,
  callAdminMfaVerify,
  callStaffSignupApi,
  callLicensingActivationApi,
  callStaffBootstrapApi,
  getOrCreateDeviceId
});

Object.assign(window.Econovaria.core, {
  callPlayerLoginApi,
  callPlayerBootstrapApi,
  callPlayerLogoutApi,
  callPlayerGameDashboardApi,
  callSupabasePasswordSignIn,
  callAdminWebSessionStatus,
  callAdminWebSessionLogout,
  callAdminMfaStatus,
  callAdminMfaEnroll,
  callAdminMfaVerify,
  callStaffSignupApi,
  callLicensingActivationApi,
  callStaffBootstrapApi,
  getOrCreateDeviceId
});
