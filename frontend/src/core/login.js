window.Econovaria = window.Econovaria || {};
window.Econovaria.login = window.Econovaria.login || {};

(function installEconovariaLogin(runtime) {
  "use strict";

  const LOGIN_MODES = new Set(["player", "admin", "create"]);
  const VALID_DIFFICULTIES = new Set(["easy", "moderate", "hard", "insane"]);
  let loginMode = "player";
  let clockTimer = 0;

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
    return String(
      result?.error?.message || result?.message || fallback || "The request could not be completed."
    );
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
  }

  function playerStorageKey() {
    return constants().PLAYER_SESSION_STORAGE_KEY || "econovaria.player.auth.v1";
  }

  function adminStorageKey() {
    return constants().ADMIN_SESSION_STORAGE_KEY || "econovaria.admin.auth.v1";
  }

  function selectedGameStorageKey() {
    return constants().ADMIN_SELECTED_GAME_STORAGE_KEY || "econovaria.admin.selected-game.v1";
  }

  function persistPlayerSession(loginResult, bootstrap) {
    const record = {
      playerSessionToken: String(loginResult?.session?.token || ""),
      sessionExpiresAt: String(loginResult?.session?.expiresAt || bootstrap?.session?.expiresAt || ""),
      apiBaseUrl: String(constants().CLASSROOM_API_URL || ""),
      player: bootstrap?.player || loginResult?.player || null,
      gameSession: bootstrap?.gameSession || loginResult?.gameSession || null,
      storedAt: new Date().toISOString()
    };

    runtime.sessionStorage.setItem(playerStorageKey(), JSON.stringify(record));
    return record;
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
      const login = await api().callPlayerLoginApi?.(gameCode, playerIdentifier, accessCode);
      if (!login?.ok || !login.session?.token) {
        showMessage(node, errorMessage(login, "Player login failed."), "bad");
        return;
      }

      const bootstrap = await api().callPlayerBootstrapApi?.(login.session.token);
      if (!bootstrap?.ok) {
        showMessage(node, errorMessage(bootstrap, "Your player session could not be loaded."), "bad");
        return;
      }

      persistPlayerSession(login, bootstrap);
      form.reset();
      showMessage(node, "Access granted.");
      openPlayerTerminal();
    } catch (error) {
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
    const accessCode = String(runtime.document.getElementById("adminAccessCode")?.value || "");

    clearMessage(node);
    if (!email || !accessCode) {
      showMessage(node, "Enter the Admin Email and Access Code.", "bad");
      return;
    }

    setFormBusy(form, true, "Verifying access...");
    try {
      const signIn = await api().callSupabasePasswordSignIn?.(email, accessCode);
      if (!signIn?.ok || !signIn.accessToken) {
        showMessage(node, errorMessage(signIn, "Admin sign-in failed."), "bad");
        return;
      }

      const bootstrap = await api().callStaffBootstrapApi?.(signIn.accessToken);
      if (!bootstrap?.ok) {
        showMessage(node, errorMessage(bootstrap, "The administrator session could not be loaded."), "bad");
        return;
      }

      runtime.sessionStorage.setItem(adminStorageKey(), JSON.stringify({
        accessToken: signIn.accessToken,
        refreshToken: signIn.refreshToken || "",
        csrfToken: "",
        user: signIn.user || null
      }));
      renderGameSelection(bootstrap.activeGameSessions || []);
    } catch (error) {
      showMessage(node, errorMessage(error, "Admin sign-in failed."), "bad");
    } finally {
      setFormBusy(form, false);
    }
  }

  function normalizedGameSession(value) {
    return {
      id: String(value?.id || ""),
      name: String(value?.name || "Active game session"),
      status: String(value?.status || "active")
    };
  }

  function renderGameSelection(gameSessions) {
    const loginStep = runtime.document.getElementById("adminLoginStep");
    const gamesStep = runtime.document.getElementById("adminGamesStep");
    const list = runtime.document.getElementById("adminGameList");
    const node = runtime.document.getElementById("selectedGameMessage");
    if (!loginStep || !gamesStep || !list) return;

    list.replaceChildren();
    clearMessage(node);
    const sessions = Array.isArray(gameSessions)
      ? gameSessions.map(normalizedGameSession).filter((session) => session.id)
      : [];

    if (!sessions.length) {
      showMessage(node, "No active game sessions are available for this administrator.", "bad");
    } else {
      sessions.forEach((session) => {
        const button = runtime.document.createElement("button");
        const name = runtime.document.createElement("strong");
        const detail = runtime.document.createElement("span");
        button.type = "button";
        button.className = "game-row";
        name.textContent = session.name;
        detail.textContent = `${session.status} session`;
        button.append(name, detail);
        button.addEventListener("click", () => openAdminTerminal(session.id));
        list.append(button);
      });
    }

    loginStep.classList.add("hidden");
    gamesStep.classList.remove("hidden");
  }

  function openAdminTerminal(gameSessionId) {
    const id = String(gameSessionId || "").trim();
    if (!id) return;
    runtime.sessionStorage.setItem(selectedGameStorageKey(), id);
    runtime.location.assign(new URL("admin/", runtime.document.baseURI).href);
  }

  function resetAdminLogin() {
    runtime.document.getElementById("adminGamesStep")?.classList.add("hidden");
    runtime.document.getElementById("adminLoginStep")?.classList.remove("hidden");
    runtime.document.getElementById("adminForm")?.reset();
    runtime.sessionStorage.removeItem(adminStorageKey());
    runtime.sessionStorage.removeItem(selectedGameStorageKey());
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
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
          },
          body: JSON.stringify({ email }),
          cache: "no-store"
        }
      );
      showMessage(
        node,
        response.ok
          ? "If that administrator account exists, a password reset email has been sent."
          : "The reset email could not be sent.",
        response.ok ? "ok" : "bad"
      );
    } catch (_) {
      showMessage(node, "Could not connect to password recovery.", "bad");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function handleCreateGame(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const node = runtime.document.getElementById("createMessage");
    const input = {
      purchaseCode: text("licenseCode"),
      email: text("createEmail"),
      displayName: text("createDisplayName"),
      gameName: text("sessionName"),
      timeZone: text("gameTimeZone"),
      difficultyPreset: text("difficultyLevel"),
      password: String(runtime.document.getElementById("createAccessCode")?.value || ""),
      confirmation: String(runtime.document.getElementById("confirmAccessCode")?.value || "")
    };

    clearMessage(node);
    if (
      !input.purchaseCode || !input.email || !input.displayName || !input.gameName ||
      !input.timeZone || !VALID_DIFFICULTIES.has(input.difficultyPreset) ||
      !input.password || !input.confirmation
    ) {
      showMessage(node, "Complete every field and select a valid difficulty.", "bad");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      showMessage(node, "Enter a valid Teacher/Admin Email.", "bad");
      return;
    }
    if (input.password.length < 8) {
      showMessage(node, "Access Code must be at least 8 characters.", "bad");
      return;
    }
    if (input.password !== input.confirmation) {
      showMessage(node, "Access Code confirmation does not match.", "bad");
      return;
    }

    setFormBusy(form, true, "Creating account...");
    try {
      const signup = await api().callStaffSignupApi?.(input);
      if (!signup?.ok) {
        showMessage(node, errorMessage(signup, "Staff account signup failed."), "bad");
        return;
      }
      const signIn = await api().callSupabasePasswordSignIn?.(input.email, input.password);
      if (!signIn?.ok || !signIn.accessToken) {
        showMessage(node, errorMessage(signIn, "Account created, but sign-in failed."), "bad");
        return;
      }
      const bootstrap = await api().callStaffBootstrapApi?.(signIn.accessToken);
      if (!bootstrap?.ok) {
        showMessage(node, errorMessage(bootstrap, "Account created, but its game could not be loaded."), "bad");
        return;
      }

      runtime.sessionStorage.setItem(adminStorageKey(), JSON.stringify({
        accessToken: signIn.accessToken,
        refreshToken: signIn.refreshToken || "",
        csrfToken: "",
        user: signIn.user || null
      }));

      const createdId = String(signup?.activation?.gameSessionId || "");
      const sessions = Array.isArray(bootstrap.activeGameSessions) ? bootstrap.activeGameSessions : [];
      const selected = sessions.find((session) => String(session?.id || "") === createdId) || sessions[0];
      if (!selected?.id) {
        showMessage(node, "Account created, but the first game is not available yet.", "bad");
        return;
      }
      form.reset();
      openAdminTerminal(selected.id);
    } catch (error) {
      showMessage(node, errorMessage(error, "The game could not be created."), "bad");
    } finally {
      setFormBusy(form, false);
    }
  }

  function initializeTimeZones() {
    const select = runtime.document.getElementById("gameTimeZone");
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

  function initializeClock() {
    const update = () => {
      const now = new Date();
      const time = runtime.document.getElementById("hudTime");
      const date = runtime.document.getElementById("hudDate");
      if (time) time.textContent = now.toLocaleTimeString("en-US", { hour12: false });
      if (date) date.textContent = now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
      }).toUpperCase();
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
      if (audio.paused) {
        try { await audio.play(); } catch (_) {}
      } else {
        audio.pause();
      }
      apply();
    });
    slider.addEventListener("input", async () => {
      apply();
      if (!audio.muted && audio.paused) {
        try { await audio.play(); } catch (_) {}
        apply();
      }
    });
    apply();
  }

  function initializeReasonMessage() {
    const params = new URLSearchParams(runtime.location.search);
    const reason = params.get("reason");
    if (reason === "logged-out") {
      runtime.sessionStorage.removeItem(playerStorageKey());
      showMessage(messageNode("player"), "You have been signed out securely.");
    } else if (reason === "session-expired" || reason === "session-invalid") {
      runtime.sessionStorage.removeItem(playerStorageKey());
      showMessage(messageNode("player"), "Your Player session ended. Sign in again.", "bad");
    }
  }

  function init() {
    runtime.document.getElementById("playerForm")?.addEventListener("submit", handlePlayerLogin);
    runtime.document.getElementById("adminForm")?.addEventListener("submit", handleAdminLogin);
    runtime.document.getElementById("createForm")?.addEventListener("submit", handleCreateGame);
    runtime.document.getElementById("forgotAdminAccessCode")?.addEventListener("click", requestAdminPasswordReset);
    runtime.document.getElementById("backToAdminLogin")?.addEventListener("click", resetAdminLogin);
    runtime.document.querySelectorAll(".mode-tab").forEach((tab) => {
      tab.addEventListener("click", () => setMode(tab.dataset.mode));
    });

    initializeTimeZones();
    initializeClock();
    initializeAudio();
    const requested = new URLSearchParams(runtime.location.search).get("mode");
    setMode(LOGIN_MODES.has(requested) ? requested : "player");
    initializeReasonMessage();
    runtime.document.documentElement.classList.remove("preload");
  }

  Object.assign(runtime.Econovaria.login, {
    init,
    setMode,
    handlePlayerLogin,
    handleAdminLogin,
    handleCreateGame,
    openPlayerTerminal,
    openAdminTerminal
  });

  if (runtime.document.readyState === "loading") {
    runtime.document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(window);
