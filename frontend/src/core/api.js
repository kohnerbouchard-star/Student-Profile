window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};
window.Econovaria.core.api = window.Econovaria.core.api || {};

function getApiRouteUrl(path) {
  const baseUrl = String(
    window.Econovaria?.core?.constants?.CLASSROOM_API_URL || ""
  ).trim().replace(/\/+$/, "");

  if (!baseUrl) {
    throw new Error("[Econovaria API] Supabase classroom API URL is not configured.");
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

function normalizeBearerToken(value) {
  return String(value || "").replace(/^Bearer\s+/i, "").trim();
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

function normalizeEdgeRouteError(
  result,
  status,
  fallbackCode = "request_failed",
  fallbackMessage = "The request could not be completed."
) {
  const error = result && typeof result === "object" ? result.error : null;
  return {
    ok: false,
    status,
    code: error?.code || result?.code || fallbackCode,
    message: error?.message || result?.message || fallbackMessage,
    error: error || null
  };
}

async function callSupabaseJsonRoute(path, options = {}) {
  const { publishableKey } = getSupabaseConfig();
  const token = normalizeBearerToken(options.token);
  const playerSessionToken = normalizeBearerToken(options.playerSessionToken);

  if (!token) {
    return {
      ok: false,
      status: 401,
      code: options.fallbackCode || "missing_auth_token",
      message: "A valid session token is required."
    };
  }

  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      apikey: publishableKey
    };

    if (playerSessionToken) {
      headers["x-player-session-token"] = playerSessionToken;
    }

    const requestOptions = {
      method: options.method || "GET",
      headers,
      cache: "no-store"
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(getApiRouteUrl(path), requestOptions);
    const result = await readJsonResponse(response);

    if (response.ok && result?.ok === true) {
      return { status: response.status, ...result };
    }

    return normalizeEdgeRouteError(
      result,
      response.status,
      options.fallbackCode,
      options.fallbackMessage
    );
  } catch (_) {
    return {
      ok: false,
      status: 0,
      code: `${options.fallbackCode || "supabase_request"}_network_failed`,
      message: "Could not connect to Econovaria. Check your connection and try again."
    };
  }
}

function callPlayerLoginApi(gameCode, playerIdentifier, accessCode) {
  const { publishableKey } = getSupabaseConfig();
  return callSupabaseJsonRoute("/players/login", {
    method: "POST",
    token: publishableKey,
    body: {
      gameJoinCode: String(gameCode || "").trim(),
      playerIdentifier: String(playerIdentifier || "").trim(),
      accessCode: String(accessCode || "").trim()
    },
    fallbackCode: "player_login_failed",
    fallbackMessage: "Player login failed. Check the Game Code, Player ID, and Access Code."
  });
}

function callPlayerBootstrapApi(sessionToken) {
  const { publishableKey } = getSupabaseConfig();
  return callSupabaseJsonRoute("/players/me", {
    method: "GET",
    token: publishableKey,
    playerSessionToken: sessionToken,
    fallbackCode: "player_session_bootstrap_failed",
    fallbackMessage: "Your player session could not be loaded."
  });
}

function callPlayerGameDashboardApi(sessionToken) {
  const { publishableKey } = getSupabaseConfig();
  return callSupabaseJsonRoute("/players/me/game/dashboard", {
    method: "GET",
    token: publishableKey,
    playerSessionToken: sessionToken,
    fallbackCode: "player_game_dashboard_failed",
    fallbackMessage: "Your game dashboard could not be loaded."
  });
}

async function callSupabasePasswordSignIn(email, password) {
  const { supabaseUrl, publishableKey } = getSupabaseConfig();

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`
      },
      body: JSON.stringify({
        email: String(email || "").trim(),
        password: String(password || "")
      }),
      cache: "no-store"
    });
    const result = await readJsonResponse(response);

    if (response.ok && result?.access_token) {
      return {
        ok: true,
        status: response.status,
        accessToken: result.access_token,
        refreshToken: result.refresh_token || "",
        user: result.user || null
      };
    }

    return {
      ok: false,
      status: response.status,
      code: result?.error_code || result?.code || "admin_login_failed",
      message: result?.msg || result?.message || result?.error_description ||
        "Admin email or Access Code is invalid."
    };
  } catch (_) {
    return {
      ok: false,
      status: 0,
      code: "admin_login_network_failed",
      message: "Could not connect to admin sign-in. Check your connection and try again."
    };
  }
}

function callStaffSignupApi(input) {
  const { publishableKey } = getSupabaseConfig();
  return callSupabaseJsonRoute("/staff/signup", {
    method: "POST",
    token: publishableKey,
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

function callLicensingActivationApi(bearerToken, input) {
  return callSupabaseJsonRoute("/licensing/activate", {
    method: "POST",
    token: bearerToken,
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

function callStaffBootstrapApi(bearerToken) {
  return callSupabaseJsonRoute("/staff/bootstrap", {
    method: "GET",
    token: bearerToken,
    fallbackCode: "staff_bootstrap_failed",
    fallbackMessage: "The administrator session could not be loaded."
  });
}

Object.assign(window.Econovaria.core.api, {
  callPlayerLoginApi,
  callPlayerBootstrapApi,
  callPlayerGameDashboardApi,
  callSupabasePasswordSignIn,
  callStaffSignupApi,
  callLicensingActivationApi,
  callStaffBootstrapApi
});

Object.assign(window.Econovaria.core, {
  callPlayerLoginApi,
  callPlayerBootstrapApi,
  callPlayerGameDashboardApi,
  callSupabasePasswordSignIn,
  callStaffSignupApi,
  callLicensingActivationApi,
  callStaffBootstrapApi
});
