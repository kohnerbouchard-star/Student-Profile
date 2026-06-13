window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.auth = window.Econovaria.features.auth || {};

function init() {
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("logoutButton").addEventListener("click", logout);
  document.getElementById("refreshButton").addEventListener("click", refreshDashboard);

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  showLogin();
}

async function handleLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const input = document.getElementById("loginCardId");
  const accessCode = normalizeCardId(input.value);

  clearLoginError();

  if (isButtonLoading(button)) return;

  if (!accessCode) {
    return showLoginError("Enter your student code first.");
  }

  setButtonLoading(button, true, "Opening dashboard...");
  setControlsDisabled(form, true, [button]);

  try {
    const result = await callApi({
      action: "LOGIN",
      accessCode,
      code: accessCode,
      cardId: accessCode
    });

    input.value = "";

    if (!result || result.ok !== true) {
      return showLoginError(cleanErrorMessage(result && result.message ? result.message : "Login failed. Try scanning your code again."));
    }

    currentSession = {
      role: "STUDENT",
      token: result.token || result.sessionToken || "",
      permissions: result.permissions || PERMISSION_SETS.STUDENT.actions
    };

    mergeSnapshot(result.snapshot || {});

    if (result.profile) {
      state.profile = normalizeProfile(result.profile);
    }

    showApp();
    showGlobalStatus("ok", "Dashboard opened. Your latest account data is loaded.");

  } catch (err) {
    showLoginError(cleanErrorMessage(err.message || String(err)));
  } finally {
    setControlsDisabled(form, false, [button]);
    setButtonLoading(button, false);
  }
}

function showApp() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  updateIdentity();
  switchView("profile");
}

async function logout() {
  const button = document.getElementById("logoutButton");

  if (isButtonLoading(button)) return;

  setButtonLoading(button, true, "Logging out...");

  try {
    if (currentSession && currentSession.token) {
      await callApi({
        action: "LOGOUT",
        token: currentSession.token
      });
    }

    currentSession = null;
    state = emptyState();
    hideGlobalStatus();
    showLogin();

  } finally {
    setButtonLoading(button, false);
  }
}

async function refreshDashboard() {
  const button = document.getElementById("refreshButton");

  if (isButtonLoading(button)) return;

  if (!currentSession || !currentSession.token) {
    showGlobalStatus("bad", "Sign in again to refresh your dashboard.");
    return showLogin();
  }

  setButtonLoading(button, true, "Refreshing...");
  showGlobalStatus("loading", "Refreshing your latest dashboard data...");

  try {
    const result = await callApi({
      action: "GET_SNAPSHOT",
      token: currentSession.token
    });

    if (!result || result.ok !== true) {
      throw new Error(result && result.message ? result.message : "Refresh failed.");
    }

    if (result.snapshot) mergeSnapshot(result.snapshot);
    renderCurrentView();
    updateIdentity();
    showGlobalStatus("ok", "Dashboard refreshed.");

  } catch (err) {
    showGlobalStatus("bad", cleanErrorMessage(err.message || String(err)));
  } finally {
    setButtonLoading(button, false);
  }
}

function showLogin() {
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
  setTimeout(() => document.getElementById("loginCardId").focus(), 0);
}

function showLoginError(message) {
  const el = document.getElementById("loginError");
  el.textContent = message;
  el.classList.remove("hidden");
}

function clearLoginError() {
  const el = document.getElementById("loginError");
  el.textContent = "";
  el.classList.add("hidden");
}

Object.assign(window.Econovaria.features.auth, {
  init,
  handleLogin,
  showApp,
  logout,
  refreshDashboard,
  showLogin,
  showLoginError,
  clearLoginError
});
