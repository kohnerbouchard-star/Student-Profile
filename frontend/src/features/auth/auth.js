window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.auth = window.Econovaria.features.auth || {};

const ADMIN_DEMO_CODE = "1234";
// Temporarily disabled while licensed teacher/admin auth is redesigned.
const ADMIN_LOGIN_ENABLED = false;
let loginMode = "student";

function init() {
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("logoutButton").addEventListener("click", logout);
  document.getElementById("refreshButton").addEventListener("click", refreshDashboard);

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  bindLoginModeToggle();
  setLoginMode("student");
  showLogin({ focus: false });
}

function bindLoginModeToggle() {
  const button = document.getElementById("loginModeToggle");
  if (!button) return;

  if (!ADMIN_LOGIN_ENABLED) {
    button.classList.add("hidden");
    button.hidden = true;
    button.disabled = true;
    button.setAttribute("aria-hidden", "true");
    button.setAttribute("tabindex", "-1");
    return;
  }

  button.addEventListener("click", () => {
    setLoginMode(loginMode === "admin" ? "student" : "admin");
  });
}

function setLoginMode(mode) {
  loginMode = ADMIN_LOGIN_ENABLED && mode === "admin" ? "admin" : "student";

  const isAdmin = loginMode === "admin";
  const loginScreen = document.getElementById("loginScreen");
  const toggle = document.getElementById("loginModeToggle");
  const eyebrow = document.getElementById("loginAccessEyebrow");
  const title = document.getElementById("loginTitle");
  const copy = document.getElementById("loginCopy");
  const label = document.getElementById("loginFieldLabel");
  const input = document.getElementById("loginCardId");
  const submit = document.getElementById("loginSubmitButton");

  if (loginScreen) loginScreen.dataset.loginMode = loginMode;
  if (toggle) {
    toggle.textContent = isAdmin ? "Student sign in" : "Admin sign in";
    toggle.setAttribute("aria-pressed", String(isAdmin));
    toggle.classList.toggle("hidden", !ADMIN_LOGIN_ENABLED);
    toggle.hidden = !ADMIN_LOGIN_ENABLED;
    toggle.disabled = !ADMIN_LOGIN_ENABLED;
    toggle.setAttribute("aria-hidden", String(!ADMIN_LOGIN_ENABLED));
  }
  if (eyebrow) eyebrow.textContent = isAdmin ? "Teacher access" : "Secure access";
  if (title) title.textContent = isAdmin ? "Open admin console" : "Open your account";
  if (copy) {
    copy.textContent = isAdmin
      ? "Enter the temporary teacher code to preview the admin console. Backend admin permissions are not wired yet."
      : "Enter or scan your student code to open your market simulation account.";
  }
  if (label) label.textContent = isAdmin ? "Teacher Code" : "Student Code";
  if (input) {
    input.value = "";
    input.placeholder = isAdmin ? "Enter teacher code" : "Enter or scan student code";
    input.autocomplete = isAdmin ? "off" : "one-time-code";
  }
  if (submit) submit.textContent = isAdmin ? "Open Admin Console" : "Open Account";

  clearLoginError();
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
    return showLoginError(loginMode === "admin" ? "Enter your teacher code first." : "Enter your student code first.");
  }

  if (!ADMIN_LOGIN_ENABLED && loginMode === "admin") {
    setLoginMode("student");
    return showLoginError("Admin sign-in is temporarily disabled.");
  }

  setButtonLoading(button, true, loginMode === "admin" ? "Opening admin console..." : "Opening dashboard...");
  setControlsDisabled(form, true, [button]);

  try {
    if (loginMode === "admin") {
      return openAdminPrototype(accessCode, input);
    }

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
      role: result.role || "STUDENT",
      token: result.token || result.sessionToken || "",
      permissions: result.permissions || PERMISSION_SETS[result.role || "STUDENT"]?.actions || PERMISSION_SETS.STUDENT.actions
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

function openAdminPrototype(accessCode, input) {
  if (!ADMIN_LOGIN_ENABLED) {
    setLoginMode("student");
    return showLoginError("Admin sign-in is temporarily disabled.");
  }

  if (accessCode !== ADMIN_DEMO_CODE) {
    return showLoginError("Admin prototype code is incorrect.");
  }

  if (input) input.value = "";

  currentSession = {
    role: "ADMIN",
    token: "frontend-admin-demo",
    permissions: PERMISSION_SETS.ADMIN.actions
  };

  state = Object.assign(emptyState(), {
    profile: {
      name: "Teacher Console",
      grade: "Admin",
      homeroom: "Prototype"
    }
  });

  showApp("admin");
  showGlobalStatus("ok", "Admin prototype opened. Backend admin actions are not wired yet.");
}

function showApp(defaultView = "profile") {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  updateNavigationForRole();
  updateIdentity();
  switchView(defaultView);
}

function updateNavigationForRole() {
  const role = currentSession?.role || "STUDENT";
  const allowedViews = PERMISSION_SETS[role]?.views || [];

  document.querySelectorAll(".nav-item").forEach((btn) => {
    const view = btn.dataset.view;
    btn.classList.toggle("hidden", !allowedViews.includes(view));
    btn.classList.toggle("active", false);
  });
}

async function logout() {
  const button = document.getElementById("logoutButton");

  if (isButtonLoading(button)) return;

  setButtonLoading(button, true, "Logging out...");

  try {
    if (currentSession && currentSession.token && currentSession.token !== "frontend-admin-demo") {
      await callApi({
        action: "LOGOUT",
        token: currentSession.token
      });
    }

    currentSession = null;
    state = emptyState();
    hideGlobalStatus();
    setLoginMode("student");
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
    if (currentSession.role === "ADMIN") {
      renderCurrentView();
      updateIdentity();
      showGlobalStatus("ok", "Admin prototype refreshed locally.");
      return;
    }

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

function showLogin(options = {}) {
  const shouldFocus = options.focus !== false;

  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");

  if (!shouldFocus) return;

  window.requestAnimationFrame(() => {
    const input = document.getElementById("loginCardId");
    if (!input || document.activeElement === input) return;

    try {
      input.focus({ preventScroll: true });
    } catch (_) {
      input.focus();
    }
  });
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
  bindLoginModeToggle,
  setLoginMode,
  handleLogin,
  openAdminPrototype,
  showApp,
  updateNavigationForRole,
  logout,
  refreshDashboard,
  showLogin,
  showLoginError,
  clearLoginError
});