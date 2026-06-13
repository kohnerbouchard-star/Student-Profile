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

async function callApi(body) {
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

Object.assign(window.Econovaria.core.api, { submitAction, callApi });
Object.assign(window.Econovaria.core, { submitAction, callApi });
