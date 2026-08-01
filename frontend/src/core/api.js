window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};
window.Econovaria.core.api = window.Econovaria.core.api || {};

const ECONOVARIA_DEVICE_STORAGE_KEY = "econovaria.device.v1";
const ECONOVARIA_DEVICE_HEADER = "x-econovaria-device-id";
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ECONOVARIA_API_PLAYER_STATE_STORAGE_KEY = "econovaria.player.auth.v1";
const ECONOVARIA_API_ADMIN_STATE_STORAGE_KEY = "econovaria.admin.auth.v1";
const ECONOVARIA_API_SELECTED_GAME_STORAGE_KEY = "econovaria.admin.selected-game.v1";
const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
let inMemoryPlayerCsrfToken = "";
let inMemoryAdminCsrfToken = "";

function getApiRouteUrl(surface, path) {
  const constants = window.Econovaria?.core?.constants || {};
  const baseBySurface = {
    player: constants.PLAYER_API_URL,
    playerWebSession: constants.PLAYER_WEB_SESSION_API_URL,
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

function readSafeSessionState(storageKey) {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(storageKey) || "null");
    return value && value.authenticated === true &&
        CSRF_PATTERN.test(String(value.csrfToken || ""))
      ? value
      : null;
  } catch (_) {
    return null;
  }
}

function readSafePlayerState() {
  return readSafeSessionState(ECONOVARIA_API_PLAYER_STATE_STORAGE_KEY);
}

function readSafeAdminState() {
  return readSafeSessionState(ECONOVARIA_API_ADMIN_STATE_STORAGE_KEY);
}

function rememberPlayerCsrf(result) {
  const candidate = String(result?.csrfToken || "");
  if (CSRF_PATTERN.test(candidate)) inMemoryPlayerCsrfToken = candidate;
}

function clearPlayerCsrf() {
  inMemoryPlayerCsrfToken = "";
}

function readPlayerCsrf() {
  return CSRF_PATTERN.test(inMemoryPlayerCsrfToken)
    ? inMemoryPlayerCsrfToken
    : String(readSafePlayerState()?.csrfToken || "");
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
    window.EconovariaAdminGameSelection?.read?.() || ""
  ).trim();
}

function loadAdminMfaModule() {
  const module = window.Econovaria?.adminMfa;
  return module?.ensureAal2
    ? Promise.resolve(module)
    : Promise.reject(new Error("Administrator MFA module did not initialize."));
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
  const method = String(options.method || "GET").toUpperCase();
  try {
    const headers = {
      apikey: publishableKey,
      [ECONOVARIA_DEVICE_HEADER]: getOrCreateDeviceId()
    };
    if (options.requirePlayerCsrf === true) {
      const csrfToken = readPlayerCsrf();
      if (!CSRF_PATTERN.test(csrfToken)) {
        return { ok: false, status: 401, code: "player_session_invalid", message: "Player sign-in is required.", retryAfterSeconds: 0 };
      }
      headers["x-econovaria-csrf-token"] = csrfToken;
    }
    if (options.requireCsrf === true) {
      const csrfToken = readAdminCsrf();
      if (!CSRF_PATTERN.test(csrfToken)) {
        return { ok: false, status: 401, code: "staff_session_invalid", message: "Administrator sign-in is required.", retryAfterSeconds: 0 };
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
      if (surface === "player" || surface === "playerWebSession") {
        rememberPlayerCsrf(result);
      } else if (surface === "webSession") {
        rememberAdminCsrf(result);
      }
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
  const baseUrl = String(constants.ADMIN_BFF_API_URL || "").trim().replace(/\/+$/, "");
  const state = readSafeAdminState();
  if (!baseUrl || !state) {
    return { ok: false, status: 401, code: "staff_session_invalid", message: "Administrator sign-in is required.", retryAfterSeconds: 0 };
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
    const idempotencyKey = String(options.idempotencyKey || "").trim();
    if (idempotencyKey) {
      if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
        return { ok: false, status: 400, code: "invalid_idempotency_key", message: "The request identifier is invalid.", retryAfterSeconds: 0 };
      }
      headers["x-idempotency-key"] = idempotencyKey;
    }
    const requestOptions = { method, headers, credentials: "include", cache: "no-store" };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestOptions.body = JSON.stringify(options.body);
    }
    const route = String(path || "").startsWith("/") ? path : `/${path}`;
    const response = await fetch(`${baseUrl}${route}`, requestOptions);
    const result = await readJsonResponse(response);
    return response.ok
      ? { status: response.status, ...result }
      : normalizeEdgeRouteError(result, response.status, options.fallbackCode, options.fallbackMessage, readRetryAfterSeconds(response));
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
  return callSupabaseJsonRoute("playerWebSession", "/login", {
    method: "POST",
    credentials: "include",
    body: {
      gameJoinCode: String(gameCode || "").trim(),
      playerIdentifier: String(playerIdentifier || "").trim(),
      accessCode: String(accessCode || "").trim()
    },
    fallbackCode: "player_login_failed",
    fallbackMessage: "Player login failed. Check the Game Code, Player ID, and Access Code."
  });
}

function callPlayerBootstrapApi() {
  return callSupabaseJsonRoute("playerWebSession", "/status", {
    method: "GET",
    credentials: "include",
    fallbackCode: "player_session_bootstrap_failed",
    fallbackMessage: "Your Player session could not be loaded."
  });
}

async function callPlayerLogoutApi() {
  const result = await callSupabaseJsonRoute("playerWebSession", "/logout", {
    method: "POST",
    credentials: "include",
    requirePlayerCsrf: true,
    body: {},
    fallbackCode: "player_logout_failed",
    fallbackMessage: "The Player session could not be revoked."
  });
  clearPlayerCsrf();
  return result;
}

function callPlayerGameDashboardApi() {
  return callSupabaseJsonRoute("player", "/players/me/game/dashboard", {
    method: "GET",
    credentials: "include",
    fallbackCode: "player_game_dashboard_failed",
    fallbackMessage: "Your game dashboard could not be loaded."
  });
}

async function ensureAdminAal2(status) {
  if (!status?.ok || status?.session?.mfaRequired === false || status?.session?.assuranceLevel === "aal2") return status;
  const mfa = await loadAdminMfaModule();
  const elevated = await mfa.ensureAal2(status);
  rememberAdminCsrf(elevated);
  return elevated;
}

async function callSupabasePasswordSignIn(email, password) {
  const signIn = await callSupabaseJsonRoute("webSession", "/login", {
    method: "POST",
    credentials: "include",
    body: { email: String(email || "").trim(), password: String(password || "") },
    fallbackCode: "admin_login_failed",
    fallbackMessage: "Admin email or password is invalid."
  });
  if (!signIn?.ok) return signIn;
  return callAdminWebSessionStatus();
}

async function readAdminWebSessionStatus() {
  const result = await callSupabaseJsonRoute("webSession", "/status", {
    method: "GET",
    credentials: "include",
    fallbackCode: "staff_session_invalid",
    fallbackMessage: "The administrator session could not be loaded."
  });
  if (result?.ok) rememberAdminCsrf(result);
  return result;
}

async function callAdminWebSessionStatus(options = {}) {
  const status = await readAdminWebSessionStatus();
  if (!status?.ok || options.requireAal2 === false) return status;
  try {
    return await ensureAdminAal2(status);
  } catch (error) {
    clearAdminCsrf();
    return { ok: false, status: 401, code: "staff_mfa_required", message: String(error?.message || "Administrator MFA verification is required."), retryAfterSeconds: 0 };
  }
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
    body: { friendlyName: String(friendlyName || "Econovaria Admin").trim() },
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
      displayName: String(input?.displayName || "").trim()
    },
    fallbackCode: "staff_signup_failed",
    fallbackMessage: "Staff account signup failed."
  });
}

function callStaffSignupResendApi(continuationHandle) {
  return callSupabaseJsonRoute("bootstrap", "/staff/signup/resend", {
    method: "POST",
    body: { continuationHandle: String(continuationHandle || "").trim() },
    fallbackCode: "staff_signup_verification_failed",
    fallbackMessage: "The verification email could not be requested."
  });
}

function callStaffSignupCancelApi(continuationHandle) {
  return callSupabaseJsonRoute("bootstrap", "/staff/signup/cancel", {
    method: "POST",
    body: { continuationHandle: String(continuationHandle || "").trim() },
    fallbackCode: "staff_signup_cancellation_failed",
    fallbackMessage: "The pending account request could not be cleared."
  });
}

function callLicensingActivationApi(_unusedCredential, input) {
  return callAdminBffJsonRoute("/games", {
    method: "POST",
    idempotencyKey: String(input?.idempotencyKey || "").trim(),
    body: {
      purchaseCode: String(input?.licenseCode || "").trim(),
      gameName: String(input?.sessionName || "").trim(),
      difficultyPreset: String(input?.difficulty || "").trim(),
      stockMarketWindow: { timezone: String(input?.timeZone || "").trim() }
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
  callStaffSignupResendApi,
  callStaffSignupCancelApi,
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
  callStaffSignupResendApi,
  callStaffSignupCancelApi,
  callLicensingActivationApi,
  callStaffBootstrapApi,
  getOrCreateDeviceId
});
