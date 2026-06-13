window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};

async function submitAction(action, payload) {
  requirePermission(action);

  if (!currentSession || !currentSession.token) {
    throw new Error("Sign in again before submitting.");
  }

  const result = await callApi({
    action,
    token: currentSession.token,
    payload
  });

  if (!result || result.ok !== true) {
    throw new Error(result && result.message ? result.message : "That did not go through. Try again.");
  }

  if (result.snapshot) {
    mergeSnapshot(result.snapshot);
  }

  return result;
}

async function callApi(body) {
  try {
    const response = await fetch(API_URL, {
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

Object.assign(window.Econovaria.core, { submitAction, callApi });
