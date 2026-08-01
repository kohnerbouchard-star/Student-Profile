window.Econovaria = window.Econovaria || {};
window.Econovaria.login = window.Econovaria.login || {};

(function installEconovariaLogin(runtime) {
  "use strict";

  const LOGIN_MODES = new Set(["player", "admin", "create"]);
  const VALID_DIFFICULTIES = new Set(["easy", "moderate", "hard", "insane"]);
  const STAFF_PASSWORD_MIN_LENGTH = 15;
  const STAFF_PASSWORD_MAX_LENGTH = 128;
  const SAFE_CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
  const CONTINUATION_HANDLE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
  const SIGNUP_PENDING_KEY = "econovaria.staff.signup.pending.v1";
  const GAME_PAGE_SIZE = 3;
  let loginMode = "player";
  let clockTimer = 0;
  let adminGames = [];
  let adminGamePage = 0;
  let pendingGameIdempotencyKey = "";

  function constants() {
    return runtime.Econovaria?.core?.constants || {};
  }

  function api() {
    return runtime.Econovaria?.core?.api || {};
  }

  function text(id) {
    return String(runtime.document.getElementById(id)?.value || "").trim();
  }

  function messageNode(mode = loginMode) {
    return runtime.document.getElementById(`${mode}Message`) ||
      runtime.document.getElementById("playerMessage");
  }

  function clearMessage(node) {
    if (!node) return;
    node.textContent = "";
    node.classList.add("hidden");
    node.classList.remove("bad");
  }

  function showMessage(node, message, kind = "ok") {
    if (!node) return;
    node.textContent = String(message || "");
    node.classList.remove("hidden", "bad");
    node.classList.toggle("bad", kind === "bad");
  }

  function errorMessage(result, fallback) {
    const base = String(
      result?.error?.message || result?.message || fallback ||
        "The request could not be completed."
    );
    const retryAfter = Number(result?.retryAfterSeconds || 0);
    if (!Number.isFinite(retryAfter) || retryAfter <= 0) return base;
    return `${base} Try again in ${Math.ceil(retryAfter)} seconds.`;
  }

  function validateStaffPassword(password) {
    if (password.length < STAFF_PASSWORD_MIN_LENGTH) return `Password must be at least ${STAFF_PASSWORD_MIN_LENGTH} characters.`;
    if (password.length > STAFF_PASSWORD_MAX_LENGTH) return `Password must be no more than ${STAFF_PASSWORD_MAX_LENGTH} characters.`;
    if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
    if (!/[a-z]/.test(password)) return "Password must include a lowercase letter.";
    if (!/[0-9]/.test(password)) return "Password must include a number.";
    if (!/[^A-Za-z0-9\s]/.test(password)) return "Password must include a symbol.";
    if (/[\u0000-\u001f\u007f]/.test(password)) return "Password cannot contain control characters.";
    return "";
  }

  function setFormBusy(form, busy, label) {
    if (!form) return;
    const button = form.querySelector("button[type='submit']");
    form.querySelectorAll("input, select, textarea, button").forEach((control) => {
      if (busy) {
        control.dataset.loginWasDisabled = String(control.disabled);
        control.disabled = true;
      } else {
        control.disabled = control.dataset.loginWasDisabled === "true";
        delete control.dataset.loginWasDisabled;
      }
    });
    if (!button) return;
    if (busy) {
      button.dataset.loginIdleLabel = button.textContent || "Continue";
      button.textContent = label || "Working...";
      button.setAttribute("aria-busy", "true");
    } else {
      button.textContent = button.dataset.loginIdleLabel || button.textContent;
      delete button.dataset.loginIdleLabel;
      button.removeAttribute("aria-busy");
    }
  }

  function setMode(mode) {
    loginMode = LOGIN_MODES.has(mode) ? mode : "player";
    const screen = runtime.document.getElementById("loginScreen");
    if (screen) screen.dataset.mode = loginMode;
    runtime.document.querySelectorAll(".mode-tab").forEach((tab) => {
      const active = tab.dataset.mode === loginMode;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    runtime.document.querySelectorAll(".mode-pane").forEach((pane) => {
      pane.classList.toggle("active", pane.id === `${loginMode}Pane`);
    });
    runtime.document.querySelectorAll(".login-message").forEach(clearMessage);
    if (loginMode === "create") restorePendingSignupView();
  }

  function playerStorageKey() {
    return constants().PLAYER_SESSION_STORAGE_KEY || "econovaria.player.auth.v1";
  }

  function adminStateKey() {
    return constants().ADMIN_SESSION_STORAGE_KEY || "econovaria.admin.auth.v1";
  }

  function selectedGameStorageKey() {
    return constants().ADMIN_SELECTED_GAME_STORAGE_KEY || "econovaria.admin.selected-game.v1";
  }

  function persistPlayerSession(status) {
    const csrfToken = String(status?.csrfToken || "");
    if (status?.session?.authenticated !== true || !SAFE_CSRF_PATTERN.test(csrfToken)) {
      throw new Error("Player status response is invalid.");
    }
    const record = {
      authenticated: true,
      sessionExpiresAt: String(status.session.expiresAt || ""),
      absoluteExpiresAt: String(status.session.absoluteExpiresAt || ""),
      csrfToken,
      player: status.player || null,
      gameSession: status.gameSession || null,
      storedAt: new Date().toISOString()
    };
    runtime.sessionStorage.setItem(playerStorageKey(), JSON.stringify(record));
    return record;
  }

  function normalizedGameSession(value) {
    return {
      id: String(value?.id || value?.gameId || ""),
      name: String(value?.name || "Game session"),
      status: String(value?.status || value?.lifecycleState || "active")
    };
  }

  function persistSafeAdminStatus(status) {
    const csrfToken = String(status?.csrfToken || "");
    if (status?.session?.authenticated !== true || !SAFE_CSRF_PATTERN.test(csrfToken)) {
      throw new Error("Administrator status response is invalid.");
    }
    const user = status?.user && typeof status.user === "object"
      ? {
        id: String(status.user.id || ""),
        email: String(status.user.email || ""),
        displayName: String(status.user.displayName || ""),
        role: String(status.user.role || "game_admin"),
        permissionVersion: Number(status.user.permissionVersion || 0),
        securityVersion: Number(status.user.securityVersion || 0)
      }
      : null;
    const record = {
      authenticated: true,
      expiresAt: String(status.session.expiresAt || ""),
      absoluteExpiresAt: String(status.session.absoluteExpiresAt || ""),
      assuranceLevel: String(status.session.assuranceLevel || "aal1"),
      mfaRequired: status.session.mfaRequired !== false,
      user,
      csrfToken,
      activeGameSessions: Array.isArray(status.activeGameSessions)
        ? status.activeGameSessions.map(normalizedGameSession).filter((session) => session.id)
        : [],
      storedAt: new Date().toISOString()
    };
    runtime.sessionStorage.setItem(adminStateKey(), JSON.stringify(record));
    return record;
  }

  function clearAdminState() {
    runtime.sessionStorage.removeItem(adminStateKey());
    runtime.EconovariaAdminGameSelection?.clear?.();
  }

  function openPlayerTerminal() {
    runtime.location.assign(new URL("player-terminal/", runtime.document.baseURI).href);
  }

  async function handlePlayerLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const node = runtime.document.getElementById("playerMessage");
    const gameCode = text("gameCode");
    const playerIdentifier = text("playerId");
    const accessCode = text("playerAccessCode");
    clearMessage(node);
    if (!gameCode || !playerIdentifier || !accessCode) {
      showMessage(node, "Enter the Game Code, Player ID, and Access Code.", "bad");
      return;
    }
    setFormBusy(form, true, "Opening session...");
    try {
      runtime.sessionStorage.removeItem(playerStorageKey());
      const login = await api().callPlayerLoginApi?.(gameCode, playerIdentifier, accessCode);
      if (!login?.ok || login.session?.authenticated !== true) {
        showMessage(node, errorMessage(login, "Player login failed."), "bad");
        return;
      }
      const status = await api().callPlayerBootstrapApi?.();
      if (!status?.ok || status.session?.authenticated !== true) {
        await api().callPlayerLogoutApi?.().catch?.(() => {});
        showMessage(node, errorMessage(status, "Your Player session could not be loaded."), "bad");
        return;
      }
      persistPlayerSession(status);
      form.reset();
      showMessage(node, "Access granted.");
      openPlayerTerminal();
    } catch (error) {
      runtime.sessionStorage.removeItem(playerStorageKey());
      showMessage(node, errorMessage(error, "Player login failed."), "bad");
    } finally {
      setFormBusy(form, false);
    }
  }

  async function handleAdminLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const node = runtime.document.getElementById("adminMessage");
    const email = text("adminEmail");
    const password = String(runtime.document.getElementById("adminAccessCode")?.value || "");
    clearMessage(node);
    if (!email || !password) {
      showMessage(node, "Enter the Admin Email and Password.", "bad");
      return;
    }
    setFormBusy(form, true, "Verifying access...");
    try {
      const signIn = await api().callSupabasePasswordSignIn?.(email, password);
      if (!signIn?.ok || signIn.session?.authenticated !== true) {
        showMessage(node, errorMessage(signIn, "Admin sign-in failed."), "bad");
        return;
      }
      clearAdminState();
      persistSafeAdminStatus(signIn);
      renderGameSelection(signIn.activeGameSessions || []);
    } catch (error) {
      showMessage(node, errorMessage(error, "Admin sign-in failed."), "bad");
    } finally {
      setFormBusy(form, false);
    }
  }

  function renderGameSelection(gameSessions, notice = "") {
    const loginStep = runtime.document.getElementById("adminLoginStep");
    const gamesStep = runtime.document.getElementById("adminGamesStep");
    const createStep = runtime.document.getElementById("adminCreateGameStep");
    const list = runtime.document.getElementById("adminGameList");
    const node = runtime.document.getElementById("selectedGameMessage");
    if (!loginStep || !gamesStep || !list) return;

    adminGames = Array.isArray(gameSessions)
      ? gameSessions.map(normalizedGameSession).filter((session) => session.id)
      : [];
    const pageCount = Math.max(1, Math.ceil(adminGames.length / GAME_PAGE_SIZE));
    adminGamePage = Math.min(adminGamePage, pageCount - 1);
    list.replaceChildren();
    clearMessage(node);

    if (!adminGames.length) {
      showMessage(node, "You do not have an active game yet. Create your first game to continue.");
    } else {
      const start = adminGamePage * GAME_PAGE_SIZE;
      adminGames.slice(start, start + GAME_PAGE_SIZE).forEach((session) => {
        const button = runtime.document.createElement("button");
        const name = runtime.document.createElement("strong");
        const detail = runtime.document.createElement("span");
        button.type = "button";
        button.className = "game-row";
        button.dataset.gameId = session.id;
        name.textContent = session.name;
        detail.textContent = `${session.status} session`;
        button.append(name, detail);
        button.addEventListener("click", () => openAdminTerminal(session.id));
        list.append(button);
      });
      if (notice) showMessage(node, notice);
    }

    const pagination = runtime.document.getElementById("adminGamePagination");
    const pageLabel = runtime.document.getElementById("adminGamePageLabel");
    const previous = runtime.document.getElementById("previousAdminGames");
    const next = runtime.document.getElementById("nextAdminGames");
    pagination?.classList.toggle("hidden", pageCount <= 1);
    if (pageLabel) pageLabel.textContent = `${adminGamePage + 1} / ${pageCount}`;
    if (previous) previous.disabled = adminGamePage <= 0;
    if (next) next.disabled = adminGamePage >= pageCount - 1;

    loginStep.classList.add("hidden");
    createStep?.classList.add("hidden");
    gamesStep.classList.remove("hidden");
  }

  function openAdminTerminal(gameSessionId) {
    const id = String(gameSessionId || "").trim();
    if (!id) return;
    const destination = new URL("admin/", runtime.document.baseURI).href;
    const scopedDestination = runtime.EconovariaAdminGameSelection?.urlFor?.(
      id,
      destination,
    );
    if (!scopedDestination) {
      throw new Error("The administrator game route could not be created.");
    }
    runtime.location.assign(scopedDestination);
  }

  function showAdminGameCreation() {
    runtime.document.getElementById("adminGamesStep")?.classList.add("hidden");
    runtime.document.getElementById("adminCreateGameStep")?.classList.remove("hidden");
    clearMessage(runtime.document.getElementById("adminNewGameMessage"));
    runtime.document.getElementById("adminNewLicenseCode")?.focus();
  }

  function cancelAdminGameCreation() {
    pendingGameIdempotencyKey = "";
    runtime.document.getElementById("adminCreateGameForm")?.reset();
    renderGameSelection(adminGames);
  }

  function newGameIdempotencyKey() {
    const uuid = String(runtime.crypto?.randomUUID?.() || "");
    if (!uuid) throw new Error("A secure game request identifier could not be generated.");
    return `game:${uuid}`;
  }

  async function handleAdminCreateGame(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const node = runtime.document.getElementById("adminNewGameMessage");
    const input = {
      licenseCode: text("adminNewLicenseCode"),
      sessionName: text("adminNewGameName"),
      timeZone: text("adminNewGameTimeZone"),
      difficulty: text("adminNewGameDifficulty")
    };
    clearMessage(node);
    if (!input.licenseCode || !input.sessionName || !input.timeZone || !VALID_DIFFICULTIES.has(input.difficulty)) {
      showMessage(node, "Complete every game field and select a valid difficulty.", "bad");
      return;
    }
    if (!pendingGameIdempotencyKey) pendingGameIdempotencyKey = newGameIdempotencyKey();
    setFormBusy(form, true, "Creating game...");
    try {
      const result = await api().callLicensingActivationApi?.(null, {
        ...input,
        idempotencyKey: pendingGameIdempotencyKey
      });
      if (!result?.ok) {
        showMessage(node, errorMessage(result, "The game could not be created."), "bad");
        if (result?.status && result.status < 500) pendingGameIdempotencyKey = "";
        return;
      }
      const createdId = String(
        result?.activation?.gameSessionId || result?.data?.game?.id || ""
      );
      pendingGameIdempotencyKey = "";
      form.reset();
      const status = await api().callAdminWebSessionStatus?.();
      if (!status?.ok || status.session?.authenticated !== true) {
        showMessage(node, "The game was created, but the game list could not be refreshed. Sign in again.", "bad");
        return;
      }
      persistSafeAdminStatus(status);
      adminGamePage = 0;
      renderGameSelection(
        status.activeGameSessions || [],
        createdId ? "Game created. Select it to open the Admin Console." : "Game created."
      );
    } catch (error) {
      showMessage(node, errorMessage(error, "The game could not be created."), "bad");
    } finally {
      setFormBusy(form, false);
    }
  }

  async function resetAdminLogin() {
    runtime.document.getElementById("adminGamesStep")?.classList.add("hidden");
    runtime.document.getElementById("adminCreateGameStep")?.classList.add("hidden");
    runtime.document.getElementById("adminLoginStep")?.classList.remove("hidden");
    runtime.document.getElementById("adminForm")?.reset();
    await api().callAdminWebSessionLogout?.().catch?.(() => {});
    clearAdminState();
    adminGames = [];
    adminGamePage = 0;
    pendingGameIdempotencyKey = "";
    runtime.document.querySelectorAll(".login-message").forEach(clearMessage);
  }

  async function requestAdminPasswordReset() {
    const email = text("adminEmail");
    const node = runtime.document.getElementById("adminMessage");
    const button = runtime.document.getElementById("forgotAdminAccessCode");
    clearMessage(node);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showMessage(node, "Enter a valid Admin Email first.", "bad");
      return;
    }
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = constants();
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      showMessage(node, "Password recovery is not configured.", "bad");
      return;
    }
    if (button) button.disabled = true;
    try {
      const redirectTo = new URL("auth/reset-password.html", runtime.document.baseURI).href;
      const response = await runtime.fetch(
        `${String(SUPABASE_URL).replace(/\/+$/, "")}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ email }),
          cache: "no-store"
        }
      );
      showMessage(node, response.ok
        ? "If that administrator account exists, a password reset email has been sent."
        : "The reset email could not be sent.", response.ok ? "ok" : "bad");
    } catch (_) {
      showMessage(node, "Could not connect to password recovery.", "bad");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function readPendingSignup() {
    try {
      const value = JSON.parse(runtime.sessionStorage.getItem(SIGNUP_PENDING_KEY) || "null");
      return value && CONTINUATION_HANDLE_PATTERN.test(String(value.handle || ""))
        ? value
        : null;
    } catch (_) {
      return null;
    }
  }

  function savePendingSignup(verification) {
    const handle = String(verification?.continuationHandle || "");
    if (!CONTINUATION_HANDLE_PATTERN.test(handle)) return null;
    const record = {
      handle,
      maskedEmail: String(verification?.maskedEmail || "your email address").slice(0, 400),
      expiresAt: String(verification?.expiresAt || ""),
      storedAt: new Date().toISOString()
    };
    runtime.sessionStorage.setItem(SIGNUP_PENDING_KEY, JSON.stringify(record));
    return record;
  }

  function showVerificationFace(record) {
    runtime.document.getElementById("createAccountStep")?.classList.add("hidden");
    runtime.document.getElementById("createVerificationStep")?.classList.remove("hidden");
    const email = runtime.document.getElementById("createVerificationEmail");
    if (email) email.textContent = String(record?.maskedEmail || "your email address");
  }

  function restorePendingSignupView() {
    const record = readPendingSignup();
    if (record) showVerificationFace(record);
    else {
      runtime.document.getElementById("createVerificationStep")?.classList.add("hidden");
      runtime.document.getElementById("createAccountStep")?.classList.remove("hidden");
    }
  }

  async function handleCreateAccount(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const node = runtime.document.getElementById("createMessage");
    const input = {
      email: text("createEmail"),
      displayName: text("createDisplayName"),
      password: String(runtime.document.getElementById("createAccessCode")?.value || ""),
      confirmation: String(runtime.document.getElementById("confirmAccessCode")?.value || "")
    };
    clearMessage(node);
    if (!input.email || !input.displayName || !input.password || !input.confirmation) {
      showMessage(node, "Complete every account field.", "bad");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      showMessage(node, "Enter a valid Teacher/Admin Email.", "bad");
      return;
    }
    const passwordError = validateStaffPassword(input.password);
    if (passwordError) {
      showMessage(node, passwordError, "bad");
      return;
    }
    if (input.password !== input.confirmation) {
      showMessage(node, "Password confirmation does not match.", "bad");
      return;
    }
    setFormBusy(form, true, "Creating account...");
    try {
      const signup = await api().callStaffSignupApi?.(input);
      if (!signup?.ok) {
        showMessage(node, errorMessage(signup, "Staff account signup failed."), "bad");
        return;
      }
      const record = savePendingSignup(signup.verification);
      form.reset();
      showVerificationFace(record || { maskedEmail: input.email });
      showMessage(
        runtime.document.getElementById("verificationMessage"),
        String(signup.message || "Check your email. If you already have an account, sign in instead.")
      );
    } catch (error) {
      showMessage(node, errorMessage(error, "The account could not be created."), "bad");
    } finally {
      setFormBusy(form, false);
    }
  }

  async function resendCreateVerification() {
    const record = readPendingSignup();
    const node = runtime.document.getElementById("verificationMessage");
    if (!record) {
      showMessage(node, "Start account creation again to request verification.", "bad");
      return;
    }
    const button = runtime.document.getElementById("resendCreateVerification");
    if (button) button.disabled = true;
    try {
      const result = await api().callStaffSignupResendApi?.(record.handle);
      showMessage(node, result?.ok
        ? String(result.message || "If verification is pending, a new email will be sent when allowed.")
        : errorMessage(result, "The verification email could not be requested."), result?.ok ? "ok" : "bad");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function cancelCreateVerification() {
    const record = readPendingSignup();
    if (record) await api().callStaffSignupCancelApi?.(record.handle).catch?.(() => null);
    runtime.sessionStorage.removeItem(SIGNUP_PENDING_KEY);
    restorePendingSignupView();
    runtime.document.getElementById("createForm")?.reset();
  }

  function backFromCreateVerification() {
    setMode("admin");
    showMessage(runtime.document.getElementById("adminMessage"), "Sign in after confirming your email address.");
  }

  async function resumeAdminSession() {
    const requested = new URLSearchParams(runtime.location.search).get("mode");
    if (requested !== "admin") return;
    const status = await api().callAdminWebSessionStatus?.().catch?.(() => null);
    if (!status?.ok || status.session?.authenticated !== true) {
      clearAdminState();
      return;
    }
    persistSafeAdminStatus(status);
    renderGameSelection(status.activeGameSessions || []);
  }

  function initializeStaffPasswordFields() {
    const adminPassword = runtime.document.getElementById("adminAccessCode");
    const createPassword = runtime.document.getElementById("createAccessCode");
    const confirmPassword = runtime.document.getElementById("confirmAccessCode");
    if (adminPassword) {
      adminPassword.maxLength = STAFF_PASSWORD_MAX_LENGTH;
      adminPassword.placeholder = "Enter Password";
      const label = adminPassword.closest("label")?.querySelector("span");
      if (label) label.textContent = "Password";
    }
    [createPassword, confirmPassword].forEach((input) => {
      if (!input) return;
      input.minLength = STAFF_PASSWORD_MIN_LENGTH;
      input.maxLength = STAFF_PASSWORD_MAX_LENGTH;
    });
  }

  function populateTimeZoneSelect(select) {
    if (!select || typeof Intl.supportedValuesOf !== "function") return;
    const existing = new Set(Array.from(select.options).map((option) => option.value).filter(Boolean));
    const fragment = runtime.document.createDocumentFragment();
    Intl.supportedValuesOf("timeZone").forEach((timeZone) => {
      if (existing.has(timeZone)) return;
      const option = runtime.document.createElement("option");
      option.value = timeZone;
      option.textContent = timeZone.replaceAll("_", " ");
      fragment.append(option);
    });
    select.append(fragment);
  }

  function initializeTimeZones() {
    populateTimeZoneSelect(runtime.document.getElementById("adminNewGameTimeZone"));
  }

  function initializeClock() {
    const update = () => {
      const now = new Date();
      const time = runtime.document.getElementById("hudTime");
      const date = runtime.document.getElementById("hudDate");
      if (time) time.textContent = now.toLocaleTimeString("en-US", { hour12: false });
      if (date) date.textContent = now.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }).toUpperCase();
    };
    update();
    runtime.clearInterval(clockTimer);
    clockTimer = runtime.setInterval(update, 1000);
  }

  function initializeAudio() {
    const audio = runtime.document.getElementById("bgMusic");
    const button = runtime.document.getElementById("musicToggle");
    const slider = runtime.document.getElementById("musicVolume");
    if (!audio || !button || !slider) return;
    const apply = () => {
      const volume = Math.max(0, Math.min(1, Number(slider.value || 0) / 100));
      audio.volume = volume;
      audio.muted = volume === 0;
      button.classList.toggle("is-on", volume > 0 && !audio.paused);
      button.setAttribute("aria-pressed", String(volume > 0 && !audio.paused));
    };
    button.addEventListener("click", async () => {
      if (audio.paused) { try { await audio.play(); } catch (_) {} } else audio.pause();
      apply();
    });
    slider.addEventListener("input", async () => {
      apply();
      if (!audio.muted && audio.paused) { try { await audio.play(); } catch (_) {} apply(); }
    });
    apply();
  }

  function initializeReasonMessage() {
    const params = new URLSearchParams(runtime.location.search);
    const reason = params.get("reason");
    if (reason === "logged-out" || reason === "signed-out") {
      runtime.sessionStorage.removeItem(playerStorageKey());
      clearAdminState();
      showMessage(messageNode("player"), "You have been signed out securely.");
    } else if (reason === "session-expired" || reason === "session-invalid") {
      runtime.sessionStorage.removeItem(playerStorageKey());
      clearAdminState();
      showMessage(messageNode("player"), "Your session ended. Sign in again.", "bad");
    } else if (reason === "email-verified") {
      runtime.sessionStorage.removeItem(SIGNUP_PENDING_KEY);
      setMode("admin");
      showMessage(runtime.document.getElementById("adminMessage"), "Email verified. Sign in to set up your authenticator and create a game.");
    }
  }

  function init() {
    runtime.document.getElementById("playerForm")?.addEventListener("submit", handlePlayerLogin);
    runtime.document.getElementById("adminForm")?.addEventListener("submit", handleAdminLogin);
    runtime.document.getElementById("createForm")?.addEventListener("submit", handleCreateAccount);
    runtime.document.getElementById("adminCreateGameForm")?.addEventListener("submit", handleAdminCreateGame);
    runtime.document.getElementById("forgotAdminAccessCode")?.addEventListener("click", requestAdminPasswordReset);
    runtime.document.getElementById("backToAdminLogin")?.addEventListener("click", () => void resetAdminLogin());
    runtime.document.getElementById("createNewAdminGame")?.addEventListener("click", showAdminGameCreation);
    runtime.document.getElementById("cancelAdminGameCreation")?.addEventListener("click", cancelAdminGameCreation);
    runtime.document.getElementById("previousAdminGames")?.addEventListener("click", () => {
      adminGamePage = Math.max(0, adminGamePage - 1);
      renderGameSelection(adminGames);
    });
    runtime.document.getElementById("nextAdminGames")?.addEventListener("click", () => {
      adminGamePage = Math.min(Math.max(0, Math.ceil(adminGames.length / GAME_PAGE_SIZE) - 1), adminGamePage + 1);
      renderGameSelection(adminGames);
    });
    runtime.document.getElementById("resendCreateVerification")?.addEventListener("click", () => void resendCreateVerification());
    runtime.document.getElementById("cancelCreateVerification")?.addEventListener("click", () => void cancelCreateVerification());
    runtime.document.getElementById("backFromCreateVerification")?.addEventListener("click", backFromCreateVerification);
    runtime.document.getElementById("adminCreateGameForm")?.addEventListener("input", () => { pendingGameIdempotencyKey = ""; });
    runtime.document.querySelectorAll(".mode-tab").forEach((tab) => {
      tab.addEventListener("click", () => setMode(tab.dataset.mode));
    });

    initializeStaffPasswordFields();
    initializeTimeZones();
    initializeClock();
    initializeAudio();
    const requested = new URLSearchParams(runtime.location.search).get("mode");
    setMode(LOGIN_MODES.has(requested) ? requested : "player");
    initializeReasonMessage();
    void resumeAdminSession();
    runtime.document.documentElement.classList.remove("preload");
  }

  Object.assign(runtime.Econovaria.login, {
    init,
    setMode,
    handlePlayerLogin,
    handleAdminLogin,
    handleCreateAccount,
    handleAdminCreateGame,
    openPlayerTerminal,
    openAdminTerminal,
    validateStaffPassword
  });

  if (runtime.document.readyState === "loading") {
    runtime.document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(window);