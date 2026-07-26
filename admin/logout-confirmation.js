(function initEconovariaAdminLogoutConfirmation() {
  "use strict";

  const SESSION_KEY = "econovaria.admin.auth.v1";
  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const CSRF_TOKEN_KEY = "econovaria.admin.csrf.v1";
  const DEVICE_KEY = "econovaria.device.v1";
  const DEVICE_HEADER = "x-econovaria-device-id";
  const LOGOUT_ACTIONS = new Set([
    "sign-out",
    "signout",
    "log-out",
    "logout",
    "admin-sign-out",
    "admin-logout",
  ]);
  let surface = null;
  let opener = null;
  let priorBodyOverflow = "";
  let signOutPromise = null;

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function storedSession() {
    try {
      return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null") || {};
    } catch (_) {
      return {};
    }
  }

  function selectedGameId() {
    return text(
      window.EconovariaAdminAuth?.getSelectedGameId?.() ||
      window.sessionStorage.getItem(SELECTED_GAME_KEY) ||
      "",
    );
  }

  function accountEmail() {
    const session = window.EconovariaAdminAuthSession?.read?.() || storedSession();
    const model = window.Econovaria?.features?.adminOverviewTerminal?.currentModel || {};
    return text(
      session?.user?.email ||
      session?.email ||
      model?.admin?.email ||
      model?.account?.email ||
      model?.staff?.email ||
      storedSession()?.user?.email ||
      "Administrator",
    );
  }

  function gameContext() {
    const controller = window.EconovariaAdminGameSessionControls?.selectedGameContext?.() || {};
    const card = document.querySelector("[data-econovaria-game-session-card]");
    const model = window.Econovaria?.features?.adminOverviewTerminal?.currentModel || {};
    const gameName = text(
      controller.gameName ||
      card?.querySelector("[data-econovaria-selected-game-name]")?.textContent ||
      model?.selectedGame?.name ||
      model?.activeGame?.name ||
      model?.gameName ||
      "Current game",
    );
    const gameCode = text(
      controller.gameCode ||
      card?.dataset?.gameCode ||
      card?.querySelector("[data-econovaria-selected-game-code]")?.textContent ||
      model?.selectedGame?.joinCode ||
      model?.selectedGame?.gameCode ||
      model?.activeGame?.joinCode ||
      model?.activeGame?.gameCode ||
      model?.joinCode ||
      model?.gameCode ||
      "",
    );
    return {
      gameName,
      gameCode: /^(?:code hidden|unavailable|—|-)$/i.test(gameCode) ? "" : gameCode,
    };
  }

  function isLogoutTrigger(node) {
    if (!(node instanceof Element)) return false;
    if (node.closest("[data-econovaria-admin-logout-confirmation]")) return false;
    if (node.matches("[data-econovaria-admin-logout]")) return true;
    const action = text(node.getAttribute("data-admin-terminal-action")).toLowerCase();
    if (LOGOUT_ACTIONS.has(action)) return true;
    const id = text(node.id).toLowerCase();
    if (/^(?:admin-?)?(?:sign-?out|log-?out|logout)$/.test(id)) return true;
    const label = text(
      node.getAttribute("aria-label") ||
      node.getAttribute("title") ||
      node.textContent,
    ).toLowerCase();
    return /^(?:sign out|log out|logout)$/.test(label);
  }

  function loginUrl() {
    const url = new URL("../", window.location.href);
    url.searchParams.set("mode", "admin");
    url.searchParams.set("reason", "signed-out");
    return url.href;
  }

  function clearLocalStateAndRedirect() {
    try {
      window.EconovariaAdminAuthSession?.clear?.();
      window.sessionStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(SELECTED_GAME_KEY);
      window.sessionStorage.removeItem(CSRF_TOKEN_KEY);
    } catch (_) {}
    window.ECONOVARIA_CSRF_TOKEN = "";
    window.currentSession = null;
    if (window.state) window.state.staffSession = null;
    window.location.replace(loginUrl());
  }

  async function revokeWebSession() {
    const config = window.EconovariaRuntimeConfig || {};
    const webSessionApiUrl = text(config.webSessionApiUrl).replace(/\/+$/, "");
    const publishableKey = text(config.supabasePublishableKey);
    if (!webSessionApiUrl || !publishableKey) return false;

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      apikey: publishableKey,
    };
    const deviceId = text(window.localStorage.getItem(DEVICE_KEY));
    if (deviceId) headers[DEVICE_HEADER] = deviceId;

    try {
      const response = await window.fetch(`${webSessionApiUrl}/logout`, {
        method: "POST",
        headers,
        body: "{}",
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        keepalive: true,
      });
      return response.ok;
    } catch (_) {
      return false;
    }
  }

  function closeConfirmation({ restoreFocus = true } = {}) {
    if (!surface) return;
    const returnTarget = opener;
    surface.remove();
    surface = null;
    opener = null;
    document.body.classList.remove("econovaria-admin-logout-confirmation-open");
    document.body.style.overflow = priorBodyOverflow;
    if (restoreFocus && returnTarget instanceof HTMLElement && returnTarget.isConnected) {
      returnTarget.focus({ preventScroll: true });
    }
  }

  function focusableControls() {
    if (!surface) return [];
    return [...surface.querySelectorAll("button:not([disabled]), [href], input:not([disabled])")]
      .filter((node) => node instanceof HTMLElement && !node.hidden && node.offsetParent !== null);
  }

  async function confirmSignOut(button) {
    if (!(button instanceof HTMLButtonElement) || button.disabled || signOutPromise) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Signing out…";

    signOutPromise = (async () => {
      const controller = window.EconovariaAdminLogoutController;
      if (typeof controller?.beginLogout === "function") {
        await controller.beginLogout(button);
        return;
      }
      // The confirmation can be available before the dynamically loaded owner.
      // Its fallback must use the same cookie-backed boundary, never legacy
      // browser bearer or direct Admin/Auth routes.
      await revokeWebSession();
      clearLocalStateAndRedirect();
    })().finally(() => {
      signOutPromise = null;
    });
    return signOutPromise;
  }

  function openConfirmation(trigger) {
    closeConfirmation({ restoreFocus: false });
    opener = trigger instanceof HTMLElement ? trigger : null;
    const account = accountEmail();
    const context = gameContext();
    priorBodyOverflow = document.body.style.overflow;

    const backdrop = document.createElement("div");
    backdrop.className = "econovaria-admin-logout-confirmation";
    backdrop.dataset.econovariaAdminLogoutConfirmation = "true";
    backdrop.innerHTML = `
      <section class="econovaria-admin-logout-confirmation__dialog"
        role="dialog" aria-modal="true"
        aria-labelledby="econovariaAdminLogoutTitle"
        aria-describedby="econovariaAdminLogoutDescription">
        <header class="econovaria-admin-logout-confirmation__header">
          <div>
            <span>Confirm sign out</span>
            <h2 id="econovariaAdminLogoutTitle">Sign out of Admin?</h2>
          </div>
          <button type="button" class="econovaria-admin-logout-confirmation__close"
            data-econovaria-logout-cancel aria-label="Close sign-out confirmation">×</button>
        </header>
        <p id="econovariaAdminLogoutDescription" class="econovaria-admin-logout-confirmation__description">
          This ends the administrator session on this device. The current game remains available to connected players.
        </p>
        <div class="econovaria-admin-logout-confirmation__context" role="list">
          <div role="listitem"><span>Account</span><strong data-econovaria-logout-account></strong></div>
          <div role="listitem"><span>Current game</span><strong data-econovaria-logout-game></strong></div>
          <div role="listitem"><span>Game Code</span><strong data-econovaria-logout-code></strong></div>
        </div>
        <footer class="econovaria-admin-logout-confirmation__actions">
          <button type="button" class="is-secondary" data-econovaria-logout-cancel>Cancel</button>
          <button type="button" class="is-danger" data-econovaria-logout-confirm>Sign out now</button>
        </footer>
      </section>`;

    backdrop.querySelector("[data-econovaria-logout-account]").textContent = account;
    backdrop.querySelector("[data-econovaria-logout-game]").textContent = context.gameName;
    backdrop.querySelector("[data-econovaria-logout-code]").textContent = context.gameCode || "Not available";

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.closest("[data-econovaria-logout-cancel]")) {
        event.preventDefault();
        closeConfirmation();
        return;
      }
      const confirm = event.target.closest("[data-econovaria-logout-confirm]");
      if (confirm) {
        event.preventDefault();
        void confirmSignOut(confirm);
      }
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeConfirmation();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusableControls();
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    document.body.append(backdrop);
    document.body.classList.add("econovaria-admin-logout-confirmation-open");
    document.body.style.overflow = "hidden";
    surface = backdrop;
    backdrop.querySelector("[data-econovaria-logout-cancel]")?.focus({ preventScroll: true });
  }

  window.addEventListener("click", (event) => {
    const control = event.target?.closest?.("button, [role='button'], a, [data-admin-terminal-action]");
    if (!isLogoutTrigger(control)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openConfirmation(control);
  }, true);

  window.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    const control = event.target;
    if (control instanceof HTMLButtonElement || !isLogoutTrigger(control)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openConfirmation(control);
  }, true);

  window.EconovariaAdminLogoutConfirmation = Object.freeze({
    open: openConfirmation,
    close: closeConfirmation,
  });
})();
