(function initEconovariaAdminGameSessionControls() {
  "use strict";

  const SELECTED_GAME_KEY = "econovaria.admin.selected-game.v1";
  const SESSION_KEY = "econovaria.admin.auth.v1";
  const CSRF_TOKEN_KEY = "econovaria.admin.csrf.v1";
  const GAME_CODE_CACHE_PREFIX = "econovaria.admin.game-code.v1:";
  const SHARE_ACTIONS = new Set(["share-current-game", "share-game-code"]);
  const LOGOUT_ACTIONS = new Set([
    "sign-out",
    "signout",
    "log-out",
    "logout",
    "admin-sign-out",
    "admin-logout",
  ]);
  const EMPTY_CODES = new Set(["", "—", "-", "undefined", "null"]);
  let reconcileQueued = false;
  let signOutPromise = null;
  let fallbackShareSurface = null;

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function selectedGameId() {
    return text(
      window.EconovariaAdminAuth?.getSelectedGameId?.() ||
        window.sessionStorage.getItem(SELECTED_GAME_KEY) ||
        "",
    );
  }

  function feature() {
    return window.Econovaria?.features?.adminOverviewTerminal || null;
  }

  function normalizeCode(value) {
    const code = text(value).toUpperCase();
    if (EMPTY_CODES.has(code.toLowerCase())) return "";
    return /^[A-Z0-9-]{4,64}$/.test(code) ? code : "";
  }

  function cachedCode(gameId) {
    if (!gameId) return "";
    try {
      return normalizeCode(
        window.sessionStorage.getItem(`${GAME_CODE_CACHE_PREFIX}${gameId}`) || "",
      );
    } catch (_) {
      return "";
    }
  }

  function gameCandidates(model, gameId) {
    return [
      model?.selectedGame,
      model?.activeGame,
      ...(Array.isArray(model?.games) ? model.games : []),
      ...(Array.isArray(model?.activeGameSessions)
        ? model.activeGameSessions
        : []),
    ].filter((candidate) => {
      const candidateId = text(candidate?.id || candidate?.gameId);
      return candidate && (!gameId || !candidateId || candidateId === gameId);
    });
  }

  function selectedGameContext() {
    const gameId = selectedGameId();
    const model = feature()?.currentModel || {};
    const candidate = gameCandidates(model, gameId)[0] || {};
    const gameName = text(
      candidate.name ||
        candidate.gameName ||
        model.gameName ||
        model.selectedGameName ||
        "Current game",
    );
    const gameCode = normalizeCode(
      candidate.joinCode ||
        candidate.gameCode ||
        model.joinCode ||
        model.gameCode ||
        cachedCode(gameId),
    );
    return Object.freeze({ gameId, gameName, gameCode });
  }

  function playerAppUrl(gameCode) {
    if (!gameCode) return "";
    const configured = text(
      window.ECONOVARIA_PLAYER_APP_URL ||
        document.querySelector('meta[name="econovaria-player-app-url"]')?.content ||
        "../",
    );
    try {
      const url = new URL(configured || "../", window.location.href);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
        return "";
      }
      url.search = "";
      url.hash = "";
      url.searchParams.set("mode", "player");
      url.searchParams.set("gameCode", gameCode);
      return url.toString();
    } catch (_) {
      return "";
    }
  }

  function findSidebarHost() {
    const legacy = document.querySelector([
      ".admin-terminal-side-code-expanded",
      ".admin-terminal-side-code-compact",
      "[data-admin-terminal-share-button]",
    ].join(", "));
    if (legacy) {
      return legacy.closest(
        ".admin-terminal-sidebar-footer, .admin-terminal-side-footer, .admin-terminal-sidebar, aside",
      ) || legacy.parentElement;
    }
    return document.querySelector(
      "#adminPreview aside, #adminPreview [class*='sidebar'], #adminPreview [class*='side-nav']",
    );
  }

  function createSessionCard() {
    const section = document.createElement("section");
    section.className = "econovaria-admin-game-session-card";
    section.dataset.econovariaGameSessionCard = "true";
    section.innerHTML = `
      <div class="econovaria-admin-game-session-card__heading">
        <span>Current multiplayer game</span>
        <i aria-hidden="true"></i>
      </div>
      <strong data-econovaria-selected-game-name>Current game</strong>
      <div class="econovaria-admin-game-session-card__code-row">
        <div>
          <small>Game Code</small>
          <b data-econovaria-selected-game-code>Code hidden</b>
        </div>
        <button type="button"
          data-admin-terminal-action="share-current-game"
          data-admin-terminal-share-button
          data-econovaria-share-game
          aria-label="Share access to the current game">
          Share
        </button>
      </div>
      <p data-econovaria-game-target-copy>
        Players using this code join this game instance.
      </p>
      <button type="button"
        class="econovaria-admin-logout-button"
        data-admin-terminal-action="sign-out"
        data-econovaria-admin-logout="true">
        Log out
      </button>
    `;
    return section;
  }

  function repairSidebar() {
    const host = findSidebarHost();
    if (!(host instanceof Element)) return;
    host.classList.add("econovaria-admin-game-session-controls-host");

    let card = host.querySelector("[data-econovaria-game-session-card]");
    if (!card) {
      card = createSessionCard();
      host.append(card);
    }

    const context = selectedGameContext();
    card.dataset.gameId = context.gameId;
    card.dataset.gameCode = context.gameCode;
    const name = card.querySelector("[data-econovaria-selected-game-name]");
    const code = card.querySelector("[data-econovaria-selected-game-code]");
    const copy = card.querySelector("[data-econovaria-game-target-copy]");
    const share = card.querySelector("[data-econovaria-share-game]");
    if (name) name.textContent = context.gameName;
    if (code) code.textContent = context.gameCode || "Code hidden";
    if (copy) {
      copy.textContent = context.gameCode
        ? `Players using ${context.gameCode} join ${context.gameName}.`
        : `Open Share to generate or reveal access for ${context.gameName}.`;
    }
    if (share) {
      share.dataset.gameId = context.gameId;
      share.dataset.gameCode = context.gameCode;
      share.setAttribute(
        "aria-label",
        context.gameCode
          ? `Share game code ${context.gameCode} for ${context.gameName}`
          : `Share access for ${context.gameName}`,
      );
    }

    host.querySelectorAll([
      ".admin-terminal-side-code-expanded",
      ".admin-terminal-side-code-compact",
      "[data-admin-terminal-share-button]:not([data-econovaria-share-game])",
    ].join(", ")).forEach((node) => {
      node.classList.add("econovaria-admin-legacy-game-code-control");
      node.setAttribute("aria-hidden", "true");
      if (node instanceof HTMLElement) node.tabIndex = -1;
    });
  }

  function isLogoutControl(node) {
    if (!(node instanceof Element)) return false;
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

  function repairLogoutControls() {
    document.querySelectorAll("button, [role='button'], a").forEach((node) => {
      if (!isLogoutControl(node)) return;
      node.setAttribute("data-econovaria-admin-logout", "true");
      node.setAttribute("role", "button");
      if (node instanceof HTMLElement && node.tabIndex < 0) node.tabIndex = 0;
      if (!node.getAttribute("aria-label")) node.setAttribute("aria-label", "Log out");
    });
  }

  function setShareContext(modal, context) {
    if (!(modal instanceof Element)) return;
    modal.classList.add("econovaria-admin-share-game-access");
    modal.dataset.gameId = context.gameId;
    modal.dataset.gameCode = context.gameCode;

    const dialog = modal.querySelector('[role="dialog"]') || modal;
    if (!dialog.querySelector("[data-econovaria-share-game-context]")) {
      const note = document.createElement("p");
      note.dataset.econovariaShareGameContext = "true";
      note.className = "econovaria-admin-share-game-context";
      const heading = dialog.querySelector("h1, h2, h3, header");
      if (heading?.parentElement) heading.insertAdjacentElement("afterend", note);
      else dialog.prepend(note);
    }
    const note = dialog.querySelector("[data-econovaria-share-game-context]");
    if (note) {
      note.textContent = context.gameCode
        ? `Players using ${context.gameCode} will join ${context.gameName}.`
        : `Create or reset the access code for ${context.gameName}.`;
    }

    dialog.querySelectorAll("input[id*='share-admin-link']").forEach((input) => {
      const field = input.closest("label, .admin-terminal-field, .admin-terminal-share-field");
      if (field) field.hidden = true;
    });

    const playerLink = playerAppUrl(context.gameCode);
    const playerInput = dialog.querySelector(
      "input[id*='share-student-link'], input[id*='share-player-link']",
    );
    if (playerInput && playerLink) playerInput.value = playerLink;
    const invite = dialog.querySelector("textarea[id*='share-invite']");
    if (invite) {
      invite.value = context.gameCode
        ? `Join ${context.gameName}\n\nGame Code: ${context.gameCode}\nPlayer login: ${playerLink || "Open Econovaria Player Login"}`
        : `Join ${context.gameName}\n\nOpen the Share panel to generate a Game Code.`;
    }
    const codeNode = dialog.querySelector(".admin-terminal-share-modal-code strong");
    if (codeNode) codeNode.textContent = context.gameCode || "Code hidden";
  }

  function visibleShareModal() {
    return [...document.querySelectorAll('[data-modal-id="share-game-access"]')]
      .reverse()
      .find((node) => !node.hidden && node.getAttribute("aria-hidden") !== "true") || null;
  }

  async function copyText(value, button) {
    const copy = text(value);
    if (!copy) return false;
    try {
      await navigator.clipboard.writeText(copy);
    } catch (_) {
      const helper = document.createElement("textarea");
      helper.value = copy;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      if (!copied) return false;
    }
    if (button instanceof HTMLButtonElement) {
      const prior = button.textContent;
      button.textContent = "Copied";
      window.setTimeout(() => {
        if (button.isConnected) button.textContent = prior;
      }, 1200);
    }
    return true;
  }

  function createFallbackShareSurface(context, opener) {
    fallbackShareSurface?.remove();
    const backdrop = document.createElement("div");
    backdrop.className =
      "admin-terminal-modal-backdrop econovaria-admin-share-fallback";
    backdrop.dataset.modalId = "share-game-access";
    backdrop.dataset.adminTerminalModalBackdrop = "true";
    backdrop.innerHTML = `
      <section class="admin-terminal-modal econovaria-admin-share-fallback__dialog"
        role="dialog" aria-modal="true" aria-labelledby="econovariaShareTitle">
        <header>
          <div>
            <small>Multiplayer access</small>
            <h2 id="econovariaShareTitle">Share ${context.gameName}</h2>
          </div>
          <button type="button" data-econovaria-close-share aria-label="Close share panel">×</button>
        </header>
        <p data-econovaria-share-game-context></p>
        <div class="admin-terminal-share-modal-code">
          <div><small>Game Code</small><strong>${context.gameCode || "Code hidden"}</strong></div>
          <button type="button" data-econovaria-copy-code ${context.gameCode ? "" : "disabled"}>Copy code</button>
        </div>
        <label>
          <span>Player link</span>
          <input readonly value="${playerAppUrl(context.gameCode)}" data-econovaria-player-link />
        </label>
        <label>
          <span>Invite message</span>
          <textarea readonly data-econovaria-invite></textarea>
        </label>
        <footer>
          <button type="button" data-econovaria-copy-link>Copy player link</button>
          <button type="button" data-econovaria-copy-invite>Copy invite</button>
        </footer>
      </section>
    `;
    document.body.append(backdrop);
    fallbackShareSurface = backdrop;
    setShareContext(backdrop, context);
    const close = () => {
      backdrop.remove();
      fallbackShareSurface = null;
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.closest("[data-econovaria-close-share]")) {
        close();
        return;
      }
      const button = event.target.closest("button");
      if (!button) return;
      if (button.matches("[data-econovaria-copy-code]")) {
        void copyText(context.gameCode, button);
      } else if (button.matches("[data-econovaria-copy-link]")) {
        void copyText(backdrop.querySelector("[data-econovaria-player-link]")?.value, button);
      } else if (button.matches("[data-econovaria-copy-invite]")) {
        void copyText(backdrop.querySelector("[data-econovaria-invite]")?.value, button);
      }
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    backdrop.querySelector("[data-econovaria-close-share]")?.focus({ preventScroll: true });
  }

  function scheduleShareRepair(opener) {
    const context = selectedGameContext();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const modal = visibleShareModal();
        if (modal) {
          setShareContext(modal, context);
          return;
        }
        window.setTimeout(() => {
          const delayed = visibleShareModal();
          if (delayed) setShareContext(delayed, selectedGameContext());
          else createFallbackShareSurface(selectedGameContext(), opener);
        }, 120);
      });
    });
  }

  function clearLocalAdminState() {
    try {
      window.EconovariaAdminAuthSession?.clear?.();
      window.sessionStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(SELECTED_GAME_KEY);
      window.sessionStorage.removeItem(CSRF_TOKEN_KEY);
    } catch (_) {}
    window.ECONOVARIA_CSRF_TOKEN = "";
    window.currentSession = null;
    if (window.state) window.state.staffSession = null;
  }

  function loginUrl() {
    const url = new URL("../", window.location.href);
    url.searchParams.set("mode", "admin");
    url.searchParams.set("reason", "signed-out");
    return url.href;
  }

  async function signOut(button) {
    if (signOutPromise) return signOutPromise;
    const controls = [...document.querySelectorAll("[data-econovaria-admin-logout]")];
    controls.forEach((control) => {
      control.setAttribute("aria-busy", "true");
      if (control instanceof HTMLButtonElement) control.disabled = true;
    });
    if (button instanceof HTMLElement) button.dataset.logoutState = "pending";

    signOutPromise = (async () => {
      let signedOut = false;
      try {
        const response = await window.fetch("/api/admin/auth/sign-out", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: "{}",
          credentials: "same-origin",
          cache: "no-store",
        });
        signedOut = response.ok;
      } catch (_) {}

      if (!signedOut) {
        const session = window.EconovariaAdminAuthSession?.read?.();
        const token = text(session?.accessToken);
        const config = window.EconovariaRuntimeConfig;
        if (token && config?.supabaseUrl && config?.supabasePublishableKey) {
          try {
            await window.fetch(`${config.supabaseUrl}/auth/v1/logout`, {
              method: "POST",
              headers: {
                apikey: config.supabasePublishableKey,
                Authorization: `Bearer ${token}`,
              },
              credentials: "omit",
              cache: "no-store",
            });
          } catch (_) {}
        }
      }

      clearLocalAdminState();
      window.location.replace(loginUrl());
    })().finally(() => {
      signOutPromise = null;
    });

    return signOutPromise;
  }

  function actionName(node) {
    return text(node?.getAttribute?.("data-admin-terminal-action")).toLowerCase();
  }

  document.addEventListener("click", (event) => {
    const action = event.target?.closest?.(
      "button, [role='button'], a, [data-admin-terminal-action]",
    );
    if (!action) return;

    if (isLogoutControl(action)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void signOut(action);
      return;
    }

    if (
      SHARE_ACTIONS.has(actionName(action)) ||
      action.matches?.("[data-admin-terminal-share-button]")
    ) {
      scheduleShareRepair(action);
      return;
    }

    if (actionName(action) === "copy-game-code") {
      const context = selectedGameContext();
      if (context.gameCode) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void copyText(context.gameCode, action);
      }
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const target = event.target;
    if (!isLogoutControl(target) || target instanceof HTMLButtonElement) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void signOut(target);
  }, true);

  function reconcile() {
    repairSidebar();
    repairLogoutControls();
    const modal = visibleShareModal();
    if (modal) setShareContext(modal, selectedGameContext());
  }

  function scheduleReconcile() {
    if (reconcileQueued) return;
    reconcileQueued = true;
    window.requestAnimationFrame(() => {
      reconcileQueued = false;
      reconcile();
    });
  }

  const root = document.body || document.documentElement;
  if (root && typeof MutationObserver === "function") {
    const observer = new MutationObserver(scheduleReconcile);
    observer.observe(root, { childList: true, subtree: true });
  }

  window.addEventListener("econovaria:admin-bootstrap-complete", scheduleReconcile);
  window.addEventListener("econovaria:admin-session-refreshed", scheduleReconcile);
  window.addEventListener("storage", scheduleReconcile);
  window.addEventListener("load", scheduleReconcile, { once: true });

  window.EconovariaAdminGameSessionControls = Object.freeze({
    reconcile,
    selectedGameContext,
    signOut,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleReconcile, { once: true });
  } else {
    scheduleReconcile();
  }
})();
