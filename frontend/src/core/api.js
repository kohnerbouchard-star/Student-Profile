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

Object.assign(window.Econovaria.core.api, { submitAction, callApi });
Object.assign(window.Econovaria.core, { submitAction, callApi });
