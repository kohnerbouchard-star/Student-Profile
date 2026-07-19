window.Econovaria = window.Econovaria || {};
window.Econovaria.features = window.Econovaria.features || {};
window.Econovaria.features.auth = window.Econovaria.features.auth || {};

const LOGIN_MODES = new Set(["player", "admin", "create"]);
const VALID_DIFFICULTIES = new Set(["easy", "moderate", "hard", "insane"]);
let loginMode = "player";
let loginClockTimer = null;
let playerGamePublicRealtimeSubscription = null;
let playerDashboardResyncPromise = null;

function init() {
  document.getElementById("playerForm")?.addEventListener("submit", handlePlayerLogin);
  document.getElementById("adminForm")?.addEventListener("submit", handleAdminLogin);
  document.getElementById("forgotAdminAccessCode")?.addEventListener("click", requestAdminPasswordReset);
  document.getElementById("createForm")?.addEventListener("submit", handleStaffSignup);
  document.getElementById("backToAdminLogin")?.addEventListener("click", resetAdminLoginStep);
  document.getElementById("logoutButton")?.addEventListener("click", logout);
  document.getElementById("refreshButton")?.addEventListener("click", refreshDashboard);

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  bindLoginModeToggle();
  initLoginClock();
  initLoginAudio();
  initializeGameTimeZoneOptions();
  const query = new URLSearchParams(window.location.search);
  const requestedLoginMode = query.get("mode");
  setLoginMode(LOGIN_MODES.has(requestedLoginMode) ? requestedLoginMode : "player");
  showLogin({ focus: false });

  if (query.get("passwordReset") === "success") {
    setLoginMode("admin");
    showLoginMessage(
      document.getElementById("adminMessage"),
      "Access Code updated. Sign in with your new Access Code."
    );
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function initializeGameTimeZoneOptions() {
  const select = document.getElementById("gameTimeZone");
  if (!select || typeof Intl.supportedValuesOf !== "function") return;

  const existing = new Set(
    Array.from(select.options).map((option) => option.value).filter(Boolean)
  );
  const fragment = document.createDocumentFragment();

  for (const timeZone of Intl.supportedValuesOf("timeZone")) {
    if (existing.has(timeZone)) continue;
    const option = document.createElement("option");
    option.value = timeZone;
    option.textContent = timeZone.replaceAll("_", " ");
    fragment.appendChild(option);
  }

  select.appendChild(fragment);
}

function bindLoginModeToggle() {
  document.querySelectorAll(".mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => setLoginMode(tab.dataset.mode));
  });
}

function setLoginMode(mode) {
  loginMode = LOGIN_MODES.has(mode) ? mode : "player";

  const loginScreen = document.getElementById("loginScreen");
  if (loginScreen) loginScreen.dataset.mode = loginMode;

  document.querySelectorAll(".mode-tab").forEach((tab) => {
    const isActive = tab.dataset.mode === loginMode;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  document.querySelectorAll(".mode-pane").forEach((pane) => {
    pane.classList.toggle("active", pane.id === `${loginMode}Pane`);
  });

  clearAllLoginMessages();
}

function handleLogin(event) {
  return handlePlayerLogin(event);
}

async function handlePlayerLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const gameCode = document.getElementById("gameCode")?.value.trim() || "";
  const playerId = document.getElementById("playerId")?.value.trim() || "";
  const message = document.getElementById("playerMessage");

  clearLoginMessage(message);
  if (isButtonLoading(button)) return;

  if (!gameCode || !playerId) {
    return showLoginMessage(message, "Enter the Game / Session Code and Player ID.", "bad");
  }

  setLoginFormBusy(form, true, "Opening session...");

  try {
    const result = await callPlayerLoginApi(gameCode, playerId);

    if (!result?.ok || !result.session?.token) {
      return showLoginMessage(message, cleanLoginError(result, "Player login failed."), "bad");
    }

    const bootstrap = await callPlayerBootstrapApi(result.session.token);

    if (!bootstrap?.ok) {
      return showLoginMessage(message, cleanLoginError(bootstrap, "Your player session could not be loaded."), "bad");
    }

    currentSession = {
      role: "STUDENT",
      token: result.session.token,
      authSource: "supabase-player",
      gameSessionId: bootstrap.gameSession?.id || "",
      permissions: Array.isArray(bootstrap.availableActions) ? bootstrap.availableActions : []
    };

    state = Object.assign(emptyState(), {
      profile: createPlayerProfileFromBootstrap(bootstrap)
    });

    await loadPlayerGameDashboardSnapshot({ bootstrap, subscribe: true });

    form.reset();
    document.getElementById("playerAccessCode").disabled = true;
    showLoginMessage(message, "Access granted.");
    showApp("profile");
    showGlobalStatus("ok", "Player session opened through Supabase.");
  } catch (err) {
    showLoginMessage(message, cleanErrorMessage(err.message || String(err)), "bad");
  } finally {
    setLoginFormBusy(form, false);
    document.getElementById("playerAccessCode").disabled = true;
  }
}

async function requestAdminPasswordReset() {
  const email = document.getElementById("adminEmail")?.value.trim() || "";
  const message = document.getElementById("adminMessage");
  const button = document.getElementById("forgotAdminAccessCode");

  clearLoginMessage(message);

  if (!email) {
    return showLoginMessage(message, "Enter your Admin Email first.", "bad");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showLoginMessage(message, "Enter a valid Admin Email.", "bad");
  }

  const constants = window.Econovaria?.core?.constants || {};
  const supabaseUrl = String(constants.SUPABASE_URL || "").replace(/\/+$/, "");
  const publishableKey = String(constants.SUPABASE_PUBLISHABLE_KEY || "").trim();

  if (!supabaseUrl || !publishableKey) {
    return showLoginMessage(message, "Password recovery is not configured.", "bad");
  }

  const redirectTo = new URL("auth/reset-password.html", document.baseURI).href;

  if (button) button.disabled = true;

  try {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`
        },
        body: JSON.stringify({ email })
      }
    );

    let result = {};
    try {
      result = await response.json();
    } catch (_) {}

    if (!response.ok) {
      return showLoginMessage(
        message,
        result?.msg || result?.message || result?.error_description || "The reset email could not be sent.",
        "bad"
      );
    }

    showLoginMessage(
      message,
      "If that administrator account exists, a password reset email has been sent."
    );
  } catch (_) {
    showLoginMessage(message, "Could not connect to password recovery.", "bad");
  } finally {
    if (button) button.disabled = false;
  }
}

async function handleAdminLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const email = document.getElementById("adminEmail")?.value.trim() || "";
  const accessCode = document.getElementById("adminAccessCode")?.value || "";
  const message = document.getElementById("adminMessage");

  clearLoginMessage(message);
  if (isButtonLoading(button)) return;

  if (!email || !accessCode) {
    return showLoginMessage(message, "Enter the Admin Email and Access Code.", "bad");
  }

  setLoginFormBusy(form, true, "Verifying access...");

  try {
    const signIn = await callSupabasePasswordSignIn(email, accessCode);

    if (!signIn?.ok || !signIn.accessToken) {
      return showLoginMessage(message, cleanLoginError(signIn, "Admin sign-in failed."), "bad");
    }

    const bootstrap = await bootstrapStaffAdminSession(signIn.accessToken);

    if (!bootstrap?.ok) {
      return showLoginMessage(message, cleanLoginError(bootstrap, "Admin session could not be loaded."), "bad");
    }

    currentSession.authSource = "supabase-admin";
    currentSession.refreshToken = signIn.refreshToken || "";
    currentSession.user = signIn.user || null;
    showAdminGameSelection(bootstrap.activeGameSessions || []);
  } catch (err) {
    showLoginMessage(message, cleanErrorMessage(err.message || String(err)), "bad");
  } finally {
    setLoginFormBusy(form, false);
  }
}

async function handleStaffSignup(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const licenseCode = document.getElementById("licenseCode")?.value.trim() || "";
  const email = document.getElementById("createEmail")?.value.trim() || "";
  const displayName = document.getElementById("createDisplayName")?.value.trim() || "";
  const gameName = document.getElementById("sessionName")?.value.trim() || "";
  const difficulty = document.getElementById("difficultyLevel")?.value || "";
  const timeZone = document.getElementById("gameTimeZone")?.value || "";
  const password = document.getElementById("createAccessCode")?.value || "";
  const confirmPassword = document.getElementById("confirmAccessCode")?.value || "";
  const message = document.getElementById("createMessage");

  clearLoginMessage(message);
  if (isButtonLoading(button)) return;

  if (!licenseCode || !email || !displayName || !gameName || !timeZone || !password || !confirmPassword || !VALID_DIFFICULTIES.has(difficulty)) {
    return showLoginMessage(message, "Complete every field and select a valid difficulty.", "bad");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showLoginMessage(message, "Enter a valid Teacher/Admin Email.", "bad");
  }

  if (password.length < 8) {
    return showLoginMessage(message, "Access Code must be at least 8 characters.", "bad");
  }

  if (password !== confirmPassword) {
    return showLoginMessage(message, "Access Code confirmation does not match.", "bad");
  }

  setLoginFormBusy(form, true, "Creating account...");

  try {
    const signup = await callStaffSignupApi({
      email,
      password,
      displayName,
      purchaseCode: licenseCode,
      gameName,
      difficultyPreset: difficulty,
      timeZone
    });

    if (!signup?.ok || !signup.activation?.gameSessionId) {
      return showLoginMessage(message, cleanLoginError(signup, "Staff account signup failed."), "bad");
    }

    const signIn = await callSupabasePasswordSignIn(email, password);

    if (!signIn?.ok || !signIn.accessToken) {
      return showLoginMessage(message, cleanLoginError(signIn, "Account created, but sign-in failed."), "bad");
    }

    const bootstrap = await bootstrapStaffAdminSession(signIn.accessToken);

    if (!bootstrap?.ok) {
      return showLoginMessage(message, cleanLoginError(bootstrap, "Account created, but the admin session could not be loaded."), "bad");
    }

    currentSession.authSource = "supabase-admin";
    currentSession.refreshToken = signIn.refreshToken || "";
    currentSession.user = signIn.user || null;
    const createdGame = (currentSession.staffSession?.activeGameSessions || [])
      .find((session) => session.id === signup.activation.gameSessionId);

    if (!createdGame) {
      return showLoginMessage(message, "Account created, but the first game is not available yet.", "bad");
    }

    selectAdminGameSession(createdGame.id);
    form.reset();
    showGlobalStatus("ok", "Staff account and first game created.");
  } catch (err) {
    showLoginMessage(message, cleanErrorMessage(err.message || String(err)), "bad");
  } finally {
    setLoginFormBusy(form, false);
  }
}

async function bootstrapStaffAdminSession(bearerToken) {
  const result = await callStaffBootstrapApi(bearerToken);

  if (!result?.ok) {
    return result || {
      ok: false,
      status: 0,
      code: "staff_bootstrap_failed",
      message: "Staff bootstrap failed."
    };
  }

  const staffSession = createStaffSessionFromBootstrap(result);

  currentSession = {
    role: "ADMIN",
    token: String(bearerToken || "").replace(/^Bearer\s+/i, "").trim(),
    authSource: "supabase-admin",
    permissions: PERMISSION_SETS.ADMIN.actions,
    staffSession
  };

  state = Object.assign(emptyState(), {
    staffSession,
    profile: createAdminProfileFromStaffSession(staffSession)
  });

  return {
    ok: true,
    staffSession,
    staff: result.staff,
    activeGameSessions: result.activeGameSessions || []
  };
}

function createStaffSessionFromBootstrap(result) {
  const staff = result.staff || {};
  const activeGameSessions = Array.isArray(result.activeGameSessions)
    ? result.activeGameSessions.map(normalizeStaffGameSession).filter((session) => session.id)
    : [];

  return {
    staffId: String(staff.id || ""),
    staffEmail: staff.email || "",
    staffDisplayName: staff.displayName || staff.email || "Teacher Console",
    activeGameSessions,
    selectedGameSessionId: null
  };
}

function normalizeStaffGameSession(session) {
  return {
    id: String(session?.id || ""),
    name: session?.name || "Active game session",
    status: session?.status || "active",
    createdAt: session?.createdAt || "",
    updatedAt: session?.updatedAt || ""
  };
}

function createAdminProfileFromStaffSession(staffSession) {
  const selectedSession = getSelectedStaffGameSession(staffSession);

  return {
    name: staffSession.staffDisplayName || "Teacher Console",
    grade: "Admin",
    homeroom: selectedSession?.name || "No active session"
  };
}

function getSelectedStaffGameSession(staffSession) {
  if (!staffSession?.selectedGameSessionId) return null;

  return (staffSession.activeGameSessions || [])
    .find((session) => session.id === staffSession.selectedGameSessionId) || null;
}

function showAdminGameSelection(gameSessions) {
  const loginStep = document.getElementById("adminLoginStep");
  const gamesStep = document.getElementById("adminGamesStep");
  const gameList = document.getElementById("adminGameList");
  const selectedMessage = document.getElementById("selectedGameMessage");

  if (!loginStep || !gamesStep || !gameList) return;

  gameList.replaceChildren();
  clearLoginMessage(selectedMessage);

  if (!gameSessions.length) {
    showLoginMessage(selectedMessage, "No active game sessions are available for this admin.", "bad");
  } else {
    gameSessions.forEach((session) => {
      const button = document.createElement("button");
      const name = document.createElement("strong");
      const detail = document.createElement("span");

      button.className = "game-row";
      button.type = "button";
      name.textContent = session.name;
      detail.textContent = `${session.status || "active"} session`;
      button.append(name, detail);
      button.addEventListener("click", () => selectAdminGameSession(session.id));
      gameList.appendChild(button);
    });
  }

  loginStep.classList.add("hidden");
  gamesStep.classList.remove("hidden");
}

function openAdminTerminal(gameSessionId) {
  const accessToken = String(currentSession?.token || "").trim();

  if (!accessToken) {
    showLoginMessage(
      document.getElementById("selectedGameMessage") ||
        document.getElementById("adminMessage"),
      "The administrator session is missing. Sign in again.",
      "bad"
    );
    return;
  }

  window.sessionStorage.setItem(
    "econovaria.admin.auth.v1",
    JSON.stringify({
      accessToken,
      refreshToken: currentSession?.refreshToken || "",
      csrfToken: "",
      user: currentSession?.user || null
    })
  );

  window.sessionStorage.setItem(
    "econovaria.admin.selected-game.v1",
    String(gameSessionId || "")
  );

  window.location.assign(new URL("admin/", document.baseURI).href);
}

function selectAdminGameSession(gameSessionId) {
  const staffSession = currentSession?.staffSession;
  if (!staffSession) return;

  const selected = (staffSession.activeGameSessions || [])
    .find((session) => session.id === gameSessionId);

  if (!selected) {
    return showLoginMessage(document.getElementById("selectedGameMessage"), "That session is no longer available.", "bad");
  }

  staffSession.selectedGameSessionId = selected.id;
  state.staffSession = staffSession;
  state.profile = createAdminProfileFromStaffSession(staffSession);
  openAdminTerminal(selected.id);
}

function resetAdminLoginStep() {
  stopGamePublicRealtimeSubscription();
  document.getElementById("adminGamesStep")?.classList.add("hidden");
  document.getElementById("adminLoginStep")?.classList.remove("hidden");
  document.getElementById("adminForm")?.reset();
  currentSession = null;
  state = emptyState();
  clearAllLoginMessages();
}

function createPlayerProfileFromBootstrap(bootstrap) {
  const balances = Array.isArray(bootstrap.balances) ? bootstrap.balances : [];
  const primaryBalance = balances.find((item) => String(item.accountType).toLowerCase() === "cash") || balances[0];

  return normalizeProfile({
    name: bootstrap.player?.displayName || "Player",
    grade: bootstrap.player?.rosterLabel || "Player",
    homeroom: bootstrap.gameSession?.name || "Active session",
    balance: primaryBalance?.balance || 0,
    status: bootstrap.player?.status || "active"
  });
}

async function loadPlayerGameDashboardSnapshot(options = {}) {
  const sessionToken = currentSession?.token;
  const gameSessionId = options.gameSessionId || options.bootstrap?.gameSession?.id || currentSession?.gameSessionId || "";

  if (!sessionToken || !gameSessionId) return null;

  const dashboard = await callPlayerGameDashboardApi(sessionToken, gameSessionId);

  if (!dashboard?.ok) {
    throw new Error(dashboard?.message || dashboard?.error?.message || "Your game dashboard could not be loaded.");
  }

  const snapshotApi = window.Econovaria?.core?.snapshot || {};

  if (typeof snapshotApi.mergeGameDashboardSnapshot === "function") {
    snapshotApi.mergeGameDashboardSnapshot(dashboard);
  }

  currentSession.gameSessionId = dashboard.gameSession?.id || gameSessionId;
  currentSession.gameDashboardRealtime = dashboard.realtime || null;
  currentSession.gameDashboardLoadedAt = Date.now();

  if (options.subscribe !== false) {
    startGamePublicRealtimeForDashboard(dashboard);
  }

  return dashboard;
}

function startGamePublicRealtimeForDashboard(dashboard) {
  stopGamePublicRealtimeSubscription();

  const realtimeApi = window.Econovaria?.features?.realtime;
  const client = realtimeApi?.getGamePublicRealtimeSupabaseClient?.();
  const publicChannel = dashboard?.realtime?.publicChannel || "";
  const gameSessionId = dashboard?.gameSession?.id || currentSession?.gameSessionId || "";

  if (!client || !publicChannel || !gameSessionId || typeof realtimeApi.startGamePublicRealtimeSubscription !== "function") {
    return;
  }

  playerGamePublicRealtimeSubscription = realtimeApi.startGamePublicRealtimeSubscription({
    gameSessionId,
    publicChannel,
    supabaseClient: client,
    lastSequence: dashboard?.realtime?.lastSequence,
    onStockTick: handlePublicStockTick,
    onMarketNewsPosted: handlePublicMarketNewsPosted,
    onMarketStatusChanged: handlePublicMarketStatusChanged,
    onReconnect: () => schedulePlayerDashboardResync("reconnect"),
    onResync: schedulePlayerDashboardResync
  });
}

function handlePublicStockTick(payload) {
  const realtimeApi = window.Econovaria?.features?.realtime;

  if (typeof realtimeApi?.applyStockTickToState !== "function") return;

  realtimeApi.applyStockTickToState(window.Econovaria.state, payload);

  if (["stockProfile", "trade", "portfolio"].includes(currentView())) {
    renderCurrentView();
  }
}

function handlePublicMarketNewsPosted(payload, envelope) {
  const realtimeApi = window.Econovaria?.features?.realtime;
  if (typeof realtimeApi?.applyMarketNewsPostedToState !== "function") return;

  const nextState = realtimeApi.applyMarketNewsPostedToState(
    window.Econovaria.state,
    payload,
    envelope
  );

  if (nextState) {
    renderCurrentView();
  }
}

function handlePublicMarketStatusChanged(payload, envelope) {
  const realtimeApi = window.Econovaria?.features?.realtime;
  if (typeof realtimeApi?.applyMarketStatusChangedToState !== "function") return;

  const nextState = realtimeApi.applyMarketStatusChangedToState(
    window.Econovaria.state,
    payload,
    envelope
  );

  if (nextState) {
    renderCurrentView();
  }
}

function schedulePlayerDashboardResync(reason) {
  if (playerDashboardResyncPromise || currentSession?.authSource !== "supabase-player") {
    return;
  }

  playerDashboardResyncPromise = refreshDashboard({ silent: true, reason })
    .catch((err) => {
      console.warn("[Econovaria realtime] Dashboard resync failed.", reason, err);
    })
    .finally(() => {
      playerDashboardResyncPromise = null;
    });
}

function stopGamePublicRealtimeSubscription() {
  if (!playerGamePublicRealtimeSubscription) return;

  try {
    playerGamePublicRealtimeSubscription.unsubscribe();
  } catch (err) {
    console.warn("[Econovaria realtime] Public realtime cleanup failed.", err);
  } finally {
    playerGamePublicRealtimeSubscription = null;
  }
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

  document.querySelectorAll(".nav-item").forEach((button) => {
    const view = button.dataset.view;
    button.classList.toggle("hidden", !allowedViews.includes(view));
    button.classList.remove("active");
  });
}

async function logout() {
  const button = document.getElementById("logoutButton");
  if (isButtonLoading(button)) return;

  setButtonLoading(button, true, "Logging out...");

  try {
    stopGamePublicRealtimeSubscription();

    if (currentSession?.token && !String(currentSession.authSource || "").startsWith("supabase-")) {
      await callApi({ action: "LOGOUT", token: currentSession.token });
    }

    currentSession = null;
    state = emptyState();
    hideGlobalStatus();
    setLoginMode("player");
    showLogin();
  } finally {
    setButtonLoading(button, false);
  }
}

async function refreshDashboard(options = {}) {
  const silent = options?.silent === true;
  const button = document.getElementById("refreshButton");
  if (!silent && isButtonLoading(button)) return;

  if (!currentSession?.token) {
    if (!silent) showGlobalStatus("bad", "Sign in again to refresh your dashboard.");
    return showLogin();
  }

  if (!silent) {
    setButtonLoading(button, true, "Refreshing...");
    showGlobalStatus("loading", "Refreshing your latest dashboard data...");
  }

  try {
    if (currentSession.authSource === "supabase-player") {
      const result = await callPlayerBootstrapApi(currentSession.token);
      if (!result?.ok) throw new Error(cleanLoginError(result, "Refresh failed."));
      currentSession.gameSessionId = result.gameSession?.id || currentSession.gameSessionId || "";
      if (Array.isArray(result.availableActions)) currentSession.permissions = result.availableActions;
      state.profile = createPlayerProfileFromBootstrap(result);
      await loadPlayerGameDashboardSnapshot({ bootstrap: result, subscribe: true });
    } else if (currentSession.authSource === "supabase-admin") {
      const selectedGameSessionId = currentSession.staffSession?.selectedGameSessionId || null;
      const result = await bootstrapStaffAdminSession(currentSession.token);
      if (!result?.ok) throw new Error(cleanLoginError(result, "Refresh failed."));
      currentSession.staffSession.selectedGameSessionId = selectedGameSessionId;
      state.staffSession = currentSession.staffSession;
      state.profile = createAdminProfileFromStaffSession(currentSession.staffSession);
    } else {
      const result = await callApi({ action: "GET_SNAPSHOT", token: currentSession.token });
      if (!result?.ok) throw new Error(result?.message || "Refresh failed.");
      if (result.snapshot) mergeSnapshot(result.snapshot);
    }

    renderCurrentView();
    updateIdentity();
    if (!silent) showGlobalStatus("ok", "Dashboard refreshed.");
  } catch (err) {
    if (!silent) {
      showGlobalStatus("bad", cleanErrorMessage(err.message || String(err)));
    } else {
      throw err;
    }
  } finally {
    if (!silent) setButtonLoading(button, false);
  }
}

function showLogin(options = {}) {
  const shouldFocus = options.focus !== false;
  document.getElementById("appShell").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");

  if (!shouldFocus) return;

  window.requestAnimationFrame(() => {
    const input = document.getElementById("gameCode");
    if (!input || document.activeElement === input) return;
    input.focus({ preventScroll: true });
  });
}

function setLoginFormBusy(form, isBusy, loadingText) {
  const button = form?.querySelector("button[type='submit']");

  form?.querySelectorAll("input, select, textarea").forEach((control) => {
    if (isBusy) {
      control.dataset.loginWasDisabled = String(control.disabled);
      control.disabled = true;
    } else {
      control.disabled = control.dataset.loginWasDisabled === "true";
      delete control.dataset.loginWasDisabled;
    }
  });

  setButtonLoading(button, isBusy, loadingText);
}

function showLoginMessage(node, text, kind = "ok") {
  if (!node) return;

  node.textContent = text;
  node.classList.remove("hidden", "bad");
  node.classList.toggle("bad", kind === "bad");

  const panel = document.querySelector(".login-panel");
  panel?.classList.add("is-busy");
  window.clearTimeout(window.__loginPanelBusyTimer);
  window.__loginPanelBusyTimer = window.setTimeout(() => panel?.classList.remove("is-busy"), 1100);
}

function clearLoginMessage(node) {
  if (!node) return;
  node.textContent = "";
  node.classList.add("hidden");
  node.classList.remove("bad");
}

function clearAllLoginMessages() {
  document.querySelectorAll(".login-message").forEach(clearLoginMessage);
}

function showLoginError(message) {
  showLoginMessage(document.getElementById(`${loginMode}Message`) || document.getElementById("playerMessage"), message, "bad");
}

function clearLoginError() {
  clearAllLoginMessages();
}

function cleanLoginError(result, fallback) {
  return cleanErrorMessage(result?.error?.message || result?.message || fallback);
}

function initLoginClock() {
  const update = () => {
    const now = new Date();
    const time = document.getElementById("hudTime");
    const date = document.getElementById("hudDate");
    if (time) time.textContent = now.toLocaleTimeString("en-US", { hour12: false });
    if (date) date.textContent = `YR-3 / ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}`;
  };

  update();
  window.clearInterval(loginClockTimer);
  loginClockTimer = window.setInterval(update, 1000);
}

function initLoginAudio() {
  const control = document.getElementById("audioControl");
  const audio = document.getElementById("bgMusic");
  const button = document.getElementById("musicToggle");
  const slider = document.getElementById("musicVolume");
  if (!control || !audio || !button || !slider) return;

  let requestedOn = true;
  let lastNonZeroVolume = Number(slider.value) > 0 ? Number(slider.value) : 28;
  let previousSliderValue = Number(slider.value);
  let hideTimer = null;

  const setButtonOn = (isOn) => {
    button.classList.toggle("is-on", isOn);
    button.setAttribute("aria-pressed", String(isOn));
    button.setAttribute("aria-label", isOn ? "Turn background music off" : "Turn background music on");
  };

  const applyVolume = () => {
    const raw = Number(slider.value);
    audio.volume = Math.max(0, Math.min(1, raw / 100));

    if (raw <= 0) {
      audio.muted = true;
      requestedOn = false;
      audio.pause();
      setButtonOn(false);
      return 0;
    }

    audio.muted = false;
    lastNonZeroVolume = raw;
    return audio.volume;
  };

  const playAudio = async () => {
    if (Number(slider.value) <= 0) slider.value = String(lastNonZeroVolume || 28);
    applyVolume();
    requestedOn = true;

    try {
      await audio.play();
      setButtonOn(true);
      control.classList.remove("is-autoplay-blocked");
    } catch (err) {
      requestedOn = false;
      setButtonOn(false);
      control.classList.add("is-autoplay-blocked");
    }
  };

  const stopAudio = () => {
    requestedOn = false;
    audio.pause();
    audio.muted = true;
    setButtonOn(false);
  };

  const showVolume = () => {
    window.clearTimeout(hideTimer);
    control.classList.add("is-volume-visible");
  };

  const hideVolumeSoon = () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => control.classList.remove("is-volume-visible"), 2200);
  };

  button.addEventListener("click", async () => {
    showVolume();
    if (requestedOn || !audio.paused) stopAudio();
    else await playAudio();
  });

  slider.addEventListener("input", async () => {
    showVolume();
    const currentValue = Number(slider.value);
    const movedFromZero = previousSliderValue <= 0 && currentValue > 0;
    const volume = applyVolume();

    if (volume <= 0) {
      stopAudio();
    } else if (movedFromZero || (requestedOn && audio.paused)) {
      await playAudio();
    }

    previousSliderValue = currentValue;
  });

  control.addEventListener("mouseenter", showVolume);
  control.addEventListener("mouseleave", hideVolumeSoon);
  control.addEventListener("focusin", showVolume);
  control.addEventListener("focusout", hideVolumeSoon);
  window.addEventListener("pointerdown", () => {
    if (audio.paused && Number(slider.value) > 0 && !requestedOn) playAudio();
  }, { once: true });

  applyVolume();
  setButtonOn(true);
  playAudio();
}

Object.assign(window.Econovaria.features.auth, {
  init,
  bindLoginModeToggle,
  setLoginMode,
  handleLogin,
  handlePlayerLogin,
  handleAdminLogin,
  handleCreateGame: handleStaffSignup,
  handleStaffSignup,
  showApp,
  updateNavigationForRole,
  loadPlayerGameDashboardSnapshot,
  startGamePublicRealtimeForDashboard,
  stopGamePublicRealtimeSubscription,
  logout,
  refreshDashboard,
  bootstrapStaffAdminSession,
  showLogin,
  showLoginError,
  clearLoginError
});
