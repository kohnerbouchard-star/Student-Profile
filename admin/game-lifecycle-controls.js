(function initEconovariaAdminGameLifecycleControls() {
  "use strict";

  const ACCOUNT_PAGE_SELECTOR = ".admin-terminal-account-page";
  const ROOT_ATTRIBUTE = "data-admin-game-lifecycle";
  const ACTIONS = Object.freeze({
    start: { label: "Start game", confirm: "Start this game and allow Player activity?" },
    pause: { label: "Pause mutations", confirm: "Pause all game-scoped mutations? Players will be unable to perform game actions until you resume." },
    resume: { label: "Resume game", confirm: "Resume game mutations and Player activity?" },
    end: { label: "End game", confirm: "End this game, revoke active Player sessions, and revoke the current join code?", phrase: "END" },
    archive: { label: "Archive game", confirm: "Archive this ended game? Archived games cannot return to active play.", phrase: "ARCHIVE" },
    revoke_sessions: { label: "Revoke Player sessions", confirm: "Revoke every active Player session for this game? Players must sign in again.", phrase: "REVOKE" },
  });
  const STATE_LABELS = Object.freeze({
    draft: "Not started",
    active: "Active",
    paused: "Paused",
    ended: "Ended",
    archived: "Archived",
  });

  let activeRoot = null;
  let activeLifecycle = null;
  let activeRequest = null;
  let mountGeneration = 0;

  function visible(element) {
    if (!(element instanceof HTMLElement) || element.hidden) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 1 && rect.height > 1;
  }

  function accountGamesSurface() {
    return [...document.querySelectorAll(ACCOUNT_PAGE_SELECTOR)].find((surface) => {
      if (!visible(surface)) return false;
      const heading = surface.querySelector("h1, h2, h3")?.textContent || "";
      return /games|game sessions/i.test(heading);
    }) || null;
  }

  function selectedGameId() {
    return String(window.EconovariaAdminAuth?.getSelectedGameId?.() || "").trim();
  }

  function selectedGameName() {
    const feature = window.Econovaria?.features?.adminOverviewTerminal;
    const model = feature?.currentModel && typeof feature.currentModel === "object"
      ? feature.currentModel
      : {};
    const gameId = selectedGameId();
    const games = Array.isArray(model.games) ? model.games : [];
    const game = games.find((item) => String(item?.id || item?.gameId || item?.gameSessionId || "") === gameId) ||
      model.activeGame || model.game || null;
    return String(game?.name || game?.title || "Selected game").trim() || "Selected game";
  }

  function createRoot(surface) {
    const existing = surface.querySelector(`[${ROOT_ATTRIBUTE}]`);
    if (existing instanceof HTMLElement) return existing;
    const root = document.createElement("section");
    root.setAttribute(ROOT_ATTRIBUTE, "");
    root.className = "admin-game-lifecycle";
    root.setAttribute("aria-labelledby", "adminGameLifecycleTitle");
    surface.append(root);
    return root;
  }

  function renderLoading(root) {
    root.setAttribute("aria-busy", "true");
    root.innerHTML = "";
    const header = document.createElement("header");
    const title = document.createElement("h2");
    title.id = "adminGameLifecycleTitle";
    title.textContent = "Game lifecycle";
    const copy = document.createElement("p");
    copy.textContent = "Loading authoritative game state…";
    header.append(title, copy);
    root.append(header);
  }

  function renderFailure(root, message) {
    root.removeAttribute("aria-busy");
    root.innerHTML = "";
    const header = document.createElement("header");
    const title = document.createElement("h2");
    title.id = "adminGameLifecycleTitle";
    title.textContent = "Game lifecycle";
    const copy = document.createElement("p");
    copy.textContent = message || "Game lifecycle could not be loaded.";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "admin-game-lifecycle__button";
    retry.dataset.adminGameLifecycleReload = "";
    retry.textContent = "Retry";
    header.append(title, copy, retry);
    root.append(header);
  }

  function renderLifecycle(root, lifecycle, announcement = "") {
    root.removeAttribute("aria-busy");
    root.innerHTML = "";

    const header = document.createElement("header");
    header.className = "admin-game-lifecycle__header";
    const headingWrap = document.createElement("div");
    const eyebrow = document.createElement("small");
    eyebrow.textContent = "EMERGENCY GAME CONTROL";
    const title = document.createElement("h2");
    title.id = "adminGameLifecycleTitle";
    title.textContent = "Game lifecycle";
    const description = document.createElement("p");
    description.textContent = "Pause or close the simulation without changing the accepted Admin navigation or deleting game data.";
    headingWrap.append(eyebrow, title, description);

    const status = document.createElement("span");
    status.className = `admin-game-lifecycle__status is-${lifecycle.state}`;
    status.textContent = STATE_LABELS[lifecycle.state] || "Unavailable";
    header.append(headingWrap, status);

    const facts = document.createElement("dl");
    facts.className = "admin-game-lifecycle__facts";
    addFact(facts, "Game", selectedGameName());
    addFact(facts, "Mutation state", lifecycle.operationalStatus === "active" ? "Allowed" : "Blocked");
    addFact(facts, "Join code", titleCase(lifecycle.joinCodeStatus));
    addFact(facts, "Active Player sessions", String(lifecycle.activePlayerSessions ?? 0));
    addFact(facts, "Lifecycle version", String(lifecycle.version));

    const controls = document.createElement("div");
    controls.className = "admin-game-lifecycle__controls";
    const allowed = Array.isArray(lifecycle.allowedActions) ? lifecycle.allowedActions : [];
    for (const action of allowed) {
      const definition = ACTIONS[action];
      if (!definition) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-game-lifecycle__button";
      if (["end", "archive", "revoke_sessions"].includes(action)) {
        button.classList.add("is-danger");
      } else if (action === "pause") {
        button.classList.add("is-warning");
      }
      button.dataset.adminGameLifecycleAction = action;
      button.textContent = definition.label;
      controls.append(button);
    }

    const reload = document.createElement("button");
    reload.type = "button";
    reload.className = "admin-game-lifecycle__button is-secondary";
    reload.dataset.adminGameLifecycleReload = "";
    reload.textContent = "Refresh state";
    controls.append(reload);

    const live = document.createElement("p");
    live.className = "admin-game-lifecycle__live";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    live.textContent = announcement;

    root.append(header, facts, controls, live);
  }

  function addFact(list, label, value) {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    wrapper.append(term, detail);
    list.append(wrapper);
  }

  async function loadLifecycle(root, generation = mountGeneration) {
    const gameId = selectedGameId();
    if (!gameId) {
      renderFailure(root, "Select a game before using lifecycle controls.");
      return;
    }
    activeRequest?.abort?.();
    const controller = new AbortController();
    activeRequest = controller;
    renderLoading(root);
    try {
      const response = await fetch(`/api/admin/games/${encodeURIComponent(gameId)}/lifecycle`, {
        method: "GET",
        headers: { "x-econovaria-admin-read": "game-lifecycle" },
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || payload?.message || "Game lifecycle could not be loaded.");
      if (generation !== mountGeneration || !root.isConnected) return;
      activeLifecycle = normalizeLifecycle(payload?.data?.lifecycle);
      renderLifecycle(root, activeLifecycle);
    } catch (error) {
      if (controller.signal.aborted || generation !== mountGeneration || !root.isConnected) return;
      renderFailure(root, error?.message || "Game lifecycle could not be loaded.");
    } finally {
      if (activeRequest === controller) activeRequest = null;
    }
  }

  function normalizeLifecycle(value) {
    const lifecycle = value && typeof value === "object" ? value : {};
    const state = String(lifecycle.state || "").trim().toLowerCase();
    const operationalStatus = String(lifecycle.operationalStatus || "").trim().toLowerCase();
    const version = Number(lifecycle.version);
    const joinCodeStatus = String(lifecycle.joinCodeStatus || "").trim().toLowerCase();
    const allowedActions = Array.isArray(lifecycle.allowedActions)
      ? lifecycle.allowedActions.map((action) => String(action || "").trim().toLowerCase()).filter((action) => ACTIONS[action])
      : [];
    if (!STATE_LABELS[state] || !["active", "disabled", "archived"].includes(operationalStatus) || !Number.isSafeInteger(version) || version < 1) {
      throw new Error("Game lifecycle response was invalid.");
    }
    return {
      state,
      operationalStatus,
      version,
      joinCodeStatus: ["pending", "active", "revoked"].includes(joinCodeStatus) ? joinCodeStatus : "unknown",
      allowedActions,
      activePlayerSessions: safeCount(lifecycle.activePlayerSessions),
      sessionsRevoked: safeCount(lifecycle.sessionsRevoked),
      startedAt: lifecycle.startedAt || null,
      pausedAt: lifecycle.pausedAt || null,
      resumedAt: lifecycle.resumedAt || null,
      endedAt: lifecycle.endedAt || null,
      archivedAt: lifecycle.archivedAt || null,
      updatedAt: lifecycle.updatedAt || null,
    };
  }

  function safeCount(value) {
    const number = Number(value ?? 0);
    return Number.isSafeInteger(number) && number >= 0 ? number : 0;
  }

  function openConfirmation(action, opener) {
    const definition = ACTIONS[action];
    if (!definition || !activeLifecycle || !activeRoot?.isConnected) return;

    const backdrop = document.createElement("div");
    backdrop.className = "admin-game-lifecycle-modal-backdrop";
    backdrop.setAttribute("data-admin-terminal-modal-backdrop", "");
    const dialog = document.createElement("section");
    dialog.className = "admin-game-lifecycle-modal";
    dialog.setAttribute("aria-labelledby", "adminGameLifecycleConfirmTitle");
    dialog.setAttribute("aria-describedby", "adminGameLifecycleConfirmDescription");

    const heading = document.createElement("h2");
    heading.id = "adminGameLifecycleConfirmTitle";
    heading.textContent = definition.label;
    const description = document.createElement("p");
    description.id = "adminGameLifecycleConfirmDescription";
    description.textContent = definition.confirm;
    dialog.append(heading, description);

    let phraseInput = null;
    if (definition.phrase) {
      const label = document.createElement("label");
      label.textContent = `Type ${definition.phrase} to confirm`;
      phraseInput = document.createElement("input");
      phraseInput.type = "text";
      phraseInput.autocomplete = "off";
      phraseInput.spellcheck = false;
      phraseInput.dataset.adminGameLifecyclePhrase = definition.phrase;
      label.append(phraseInput);
      dialog.append(label);
    }

    const live = document.createElement("p");
    live.className = "admin-game-lifecycle-modal__live";
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    const actions = document.createElement("div");
    actions.className = "admin-game-lifecycle-modal__actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.className = "admin-game-lifecycle__button is-secondary";
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = definition.label;
    confirm.className = "admin-game-lifecycle__button";
    if (["end", "archive", "revoke_sessions"].includes(action)) confirm.classList.add("is-danger");
    else if (action === "pause") confirm.classList.add("is-warning");
    confirm.disabled = Boolean(definition.phrase);
    actions.append(cancel, confirm);
    dialog.append(live, actions);
    backdrop.append(dialog);
    document.body.append(backdrop);

    const modal = window.EconovariaAdminModalAccessibility?.activate({
      backdrop,
      dialog,
      opener,
      initialFocus: phraseInput || cancel,
      dismissOnBackdrop: false,
      dismissOnEscape: true,
      onClose() {
        backdrop.remove();
      },
    });

    phraseInput?.addEventListener("input", () => {
      confirm.disabled = phraseInput.value.trim().toUpperCase() !== definition.phrase;
    });
    cancel.addEventListener("click", () => modal?.close?.("cancel"));
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      cancel.disabled = true;
      live.textContent = "Applying authoritative lifecycle change…";
      try {
        const result = await applyAction(action);
        activeLifecycle = result.lifecycle;
        modal?.close?.("completed");
        renderLifecycle(
          activeRoot,
          activeLifecycle,
          action === "revoke_sessions"
            ? `${activeLifecycle.sessionsRevoked || 0} Player session(s) revoked.`
            : `${definition.label} completed.`,
        );
        syncCurrentModel(activeLifecycle);
        document.dispatchEvent(new CustomEvent("econovaria:admin-game-lifecycle-changed", {
          detail: { action, outcome: result.outcome, lifecycle: activeLifecycle },
        }));
      } catch (error) {
        live.textContent = error?.message || "Lifecycle action failed.";
        confirm.disabled = Boolean(definition.phrase && phraseInput?.value.trim().toUpperCase() !== definition.phrase);
        cancel.disabled = false;
      }
    });
  }

  async function applyAction(action) {
    const gameId = selectedGameId();
    if (!gameId || !activeLifecycle) throw new Error("Game lifecycle is unavailable.");
    const idempotencyKey = `admin.lifecycle.${action}.${crypto.randomUUID()}`;
    const suffix = action === "revoke_sessions"
      ? "sessions/revoke"
      : `lifecycle/${action}`;
    const response = await fetch(`/api/admin/games/${encodeURIComponent(gameId)}/${suffix}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        idempotencyKey,
        expectedVersion: activeLifecycle.version,
      }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (payload?.error?.code === "game_lifecycle_version_conflict") {
        void loadLifecycle(activeRoot);
      }
      throw new Error(payload?.error?.message || payload?.message || "Lifecycle action failed.");
    }
    return {
      outcome: String(payload?.data?.outcome || "applied"),
      lifecycle: normalizeLifecycle(payload?.data?.lifecycle),
    };
  }

  function syncCurrentModel(lifecycle) {
    const feature = window.Econovaria?.features?.adminOverviewTerminal;
    const model = feature?.currentModel;
    if (!feature || !model || typeof model !== "object") return;
    const gameId = selectedGameId();
    const patch = (game) => {
      if (!game || String(game.id || game.gameId || game.gameSessionId || "") !== gameId) return game;
      return {
        ...game,
        status: lifecycle.operationalStatus,
        lifecycleState: lifecycle.state,
        lifecycleVersion: lifecycle.version,
      };
    };
    feature.currentModel = {
      ...model,
      game: patch(model.game),
      activeGame: patch(model.activeGame),
      games: Array.isArray(model.games) ? model.games.map(patch) : model.games,
    };
  }

  function mountGamesLifecycle() {
    const surface = accountGamesSurface();
    if (!surface) return;
    const generation = ++mountGeneration;
    activeRoot = createRoot(surface);
    activeLifecycle = null;
    void loadLifecycle(activeRoot, generation);
  }

  function titleCase(value) {
    const text = String(value || "unknown");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  document.addEventListener("econovaria:admin-account-surface-ready", (event) => {
    if (event.detail?.route === "account-games") mountGamesLifecycle();
  });

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const reload = target.closest("[data-admin-game-lifecycle-reload]");
    if (reload && activeRoot?.isConnected) {
      void loadLifecycle(activeRoot);
      return;
    }
    const actionButton = target.closest("[data-admin-game-lifecycle-action]");
    if (actionButton instanceof HTMLElement) {
      openConfirmation(actionButton.dataset.adminGameLifecycleAction, actionButton);
      return;
    }
    if (target.closest('[data-admin-terminal-action="open-admin-games"]')) {
      const token = ++mountGeneration;
      window.setTimeout(() => {
        if (token === mountGeneration) mountGamesLifecycle();
      }, 900);
    }
  }, true);
})();
