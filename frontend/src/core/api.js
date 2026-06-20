window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};
window.Econovaria.core.api = window.Econovaria.core.api || {};

function getApiState() {
  const stateApi = window.Econovaria?.state;

  if (
    !stateApi ||
    typeof stateApi.requirePermission !== "function" ||
    typeof stateApi.getCurrentSession !== "function"
  ) {
    throw new Error("[Econovaria API] State helpers are not available.");
  }

  return stateApi;
}

function getApiUrl() {
  const apiUrl = window.Econovaria?.core?.constants?.API_URL;

  if (!apiUrl) {
    throw new Error("[Econovaria API] API URL is not configured.");
  }

  return apiUrl;
}

function getApiRouteUrl(path) {
  const baseUrl = getApiUrl().replace(/\/+$/, "");
  const routePath = String(path || "").startsWith("/") ? String(path || "") : `/${path || ""}`;

  return `${baseUrl}${routePath}`;
}

function getSnapshotMerger() {
  const mergeSnapshot = window.Econovaria?.core?.snapshot?.mergeSnapshot ||
    window.Econovaria?.core?.mergeSnapshot;

  if (typeof mergeSnapshot !== "function") {
    throw new Error("[Econovaria API] Snapshot merge helper is not available.");
  }

  return mergeSnapshot;
}

async function submitAction(action, payload) {
  const stateApi = getApiState();
  stateApi.requirePermission(action);

  const session = stateApi.getCurrentSession();

  if (!session || !session.token) {
    throw new Error("Sign in again before submitting.");
  }

  const result = await callApi({
    action,
    token: session.token,
    payload
  });

  if (!result || result.ok !== true) {
    throw new Error(result && result.message ? result.message : "That did not go through. Try again.");
  }

  if (result.snapshot) {
    getSnapshotMerger()(result.snapshot);
  }

  return result;
}

const API_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 450,
  maxDelayMs: 1800
};

async function callApi(body) {
  let lastResult = null;
  let lastError = null;

  for (let attempt = 0; attempt <= API_RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const result = await callApiOnce(body);
      lastResult = result;

      if (!isRetryableApiResult(result)) {
        return result;
      }

      if (attempt >= API_RETRY_CONFIG.maxRetries) {
        return result;
      }

      showApiRetryNotice(attempt + 1, API_RETRY_CONFIG.maxRetries, result.message);
      await sleep(getApiRetryDelay(attempt));

    } catch (err) {
      lastError = err;

      if (!isRetryableApiError(err) || attempt >= API_RETRY_CONFIG.maxRetries) {
        throw err;
      }

      showApiRetryNotice(attempt + 1, API_RETRY_CONFIG.maxRetries, err.message);
      await sleep(getApiRetryDelay(attempt));
    }
  }

  if (lastError) {
    throw lastError;
  }

  return lastResult;
}

async function callApiOnce(body) {
  try {
    const response = await fetch(getApiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    let result;

    try {
      result = await response.json();
    } catch (err) {
      return {
        ok: false,
        message: "The dashboard received an unreadable response. Try refreshing."
      };
    }

    if (!result) {
      return {
        ok: false,
        message: "No response came back. Try again."
      };
    }

    return result;

  } catch (err) {
    return {
      ok: false,
      message: "Could not connect. Check your internet and try again."
    };
  }
}

async function callStaffBootstrapApi(bearerToken) {
  const token = normalizeBearerToken(bearerToken);

  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "missing_staff_auth_user",
      message: "A staff sign-in token is required."
    };
  }

  try {
    const response = await fetch(getApiRouteUrl("/staff/bootstrap"), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    let result;

    try {
      result = await response.json();
    } catch (err) {
      return {
        ok: false,
        status: response.status,
        code: "staff_bootstrap_unreadable_response",
        message: "The admin console received an unreadable staff bootstrap response."
      };
    }

    if (response.ok && result && result.ok === true) {
      return result;
    }

    return normalizeEdgeRouteError(result, response.status);

  } catch (err) {
    return {
      ok: false,
      status: 0,
      code: "staff_bootstrap_network_failed",
      message: "Could not connect to staff bootstrap. Check your connection and try again."
    };
  }
}

function listAdminStoreItems(gameSessionId, bearerToken) {
  return callAdminStoreCatalogRoute(
    "GET",
    `/games/${encodeURIComponent(gameSessionId || "")}/store/items`,
    bearerToken
  );
}

function createAdminStoreItem(gameSessionId, bearerToken, body) {
  return callAdminStoreCatalogRoute(
    "POST",
    `/games/${encodeURIComponent(gameSessionId || "")}/store/items`,
    bearerToken,
    body
  );
}

function updateAdminStoreItem(gameSessionId, itemId, bearerToken, body) {
  return callAdminStoreCatalogRoute(
    "PATCH",
    `/games/${encodeURIComponent(gameSessionId || "")}/store/items/${encodeURIComponent(itemId || "")}`,
    bearerToken,
    body
  );
}

async function callAdminStoreCatalogRoute(method, path, bearerToken, body) {
  const token = normalizeBearerToken(bearerToken);

  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "missing_staff_auth_user",
      message: "A staff sign-in token is required to manage store items."
    };
  }

  try {
    const headers = {
      "Authorization": `Bearer ${token}`
    };
    const options = {
      method,
      headers
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const response = await fetch(getApiRouteUrl(path), options);
    let result;

    try {
      result = await response.json();
    } catch (err) {
      return {
        ok: false,
        status: response.status,
        code: "store_catalog_unreadable_response",
        message: "The admin console received an unreadable store catalog response."
      };
    }

    if (response.ok && result && result.ok === true) {
      return {
        status: response.status,
        ...result
      };
    }

    return normalizeEdgeRouteError(result, response.status, "store_catalog_request_failed", "Store catalog request failed.");

  } catch (err) {
    return {
      ok: false,
      status: 0,
      code: "store_catalog_network_failed",
      message: "Could not connect to store catalog. Check your connection and try again."
    };
  }
}

function normalizeBearerToken(value) {
  return String(value || "").replace(/^Bearer\s+/i, "").trim();
}

function normalizeEdgeRouteError(result, status, fallbackCode = "staff_bootstrap_failed", fallbackMessage = "Staff bootstrap failed.") {
  const error = result && typeof result === "object" ? result.error : null;
  const code = error?.code || result?.code || fallbackCode;
  const message = error?.message || result?.message || fallbackMessage;

  return {
    ok: false,
    status,
    code,
    message,
    error: error || null
  };
}

function isRetryableApiResult(result) {
  if (!result || result.ok === true) {
    return false;
  }

  return isRetryableBusyMessage(result.message);
}

function isRetryableApiError(err) {
  if (!err) {
    return false;
  }

  return isRetryableBusyMessage(err.message || String(err));
}

function isRetryableBusyMessage(message) {
  const text = String(message || "").toLowerCase();

  return (
    text.includes("system is busy") ||
    (text.includes("try again") && text.includes("busy")) ||
    (text.includes("lock") && text.includes("busy")) ||
    text.includes("temporarily unavailable") ||
    text.includes("service unavailable") ||
    text.includes("network error") ||
    text.includes("failed to fetch") ||
    text.includes("could not connect")
  );
}

function getApiRetryDelay(attempt) {
  const exponential = API_RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 250);

  return Math.min(API_RETRY_CONFIG.maxDelayMs, exponential + jitter);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showApiRetryNotice(attemptNumber, maxRetries, message) {
  const text = `System is busy. Retrying ${attemptNumber}/${maxRetries}...`;

  try {
    if (typeof showGlobalStatus === "function") {
      showGlobalStatus("warn", text);
      return;
    }
  } catch (err) {}

  console.warn(text, message || "");
}

Object.assign(window.Econovaria.core.api, {
  submitAction,
  callApi,
  callStaffBootstrapApi,
  listAdminStoreItems,
  createAdminStoreItem,
  updateAdminStoreItem
});
Object.assign(window.Econovaria.core, {
  submitAction,
  callApi,
  callStaffBootstrapApi,
  listAdminStoreItems,
  createAdminStoreItem,
  updateAdminStoreItem
});
