(function initEconovariaSettingsSaveErrorBridge() {
  "use strict";

  const SELECTOR = '[data-admin-terminal-action="save-settings"]';
  const PAGE_SELECTOR = ".admin-terminal-settings-page";
  const DISCLOSURE_SELECTOR = "[data-settings-custom-toggle]";
  const STYLE_ID = "econovaria-settings-final-polish-style";
  let queued = false;
  let observedPage = null;
  let disclosureOpen = false;
  let disclosureGameId = "";

  function text(value) {
    return String(value ?? "").trim();
  }

  function selectedGameId() {
    const model = window.Econovaria?.features?.adminOverviewTerminal?.currentModel || {};
    return text(
      model.gameId || model.activeGameId || model.selectedGameSessionId ||
      model.activeGame?.id || model.selectedGame?.id ||
      window.sessionStorage.getItem("econovaria.admin.selected-game.v1"),
    );
  }

  function ensureStylesheet() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    link.href = "./css/settings-final-polish.css";
    document.head.append(link);
  }

  function applyDisclosureState(page) {
    if (!(page instanceof HTMLElement) || !disclosureOpen) return;
    page.dataset.settingsDisclosureInitialized = "true";
    page.classList.add("is-custom-settings-open");
    const toggle = page.querySelector(DISCLOSURE_SELECTOR);
    if (toggle instanceof HTMLButtonElement) {
      toggle.setAttribute("aria-expanded", "true");
      toggle.textContent = "Hide custom settings";
    }
  }

  function reconcileDisclosure() {
    const gameId = selectedGameId();
    if (gameId !== disclosureGameId) {
      disclosureGameId = gameId;
      disclosureOpen = false;
      observedPage = null;
    }

    const page = document.querySelector(PAGE_SELECTOR);
    if (!(page instanceof HTMLElement)) {
      observedPage = null;
      return;
    }
    if (page === observedPage) return;

    observedPage = page;
    applyDisclosureState(page);
    if (disclosureOpen) {
      window.requestAnimationFrame(() => {
        if (page === observedPage && page.isConnected) applyDisclosureState(page);
      });
    }
  }

  function reconcileSaveError() {
    const button = document.querySelector(SELECTOR);
    if (!(button instanceof HTMLButtonElement)) return;

    const attendanceError = text(button.dataset.attendanceRewardError);
    const currentState = button.getAttribute("data-admin-terminal-api-state") || "";
    let changed = false;

    if (attendanceError && currentState !== "error") {
      button.setAttribute("data-admin-terminal-api-state", "error");
      changed = true;
    } else if (!attendanceError && currentState === "error") {
      button.removeAttribute("data-admin-terminal-api-state");
      changed = true;
    }

    if (changed) window.EconovariaSimplifiedSettings?.reconcile?.();
  }

  function reconcile() {
    ensureStylesheet();
    reconcileDisclosure();
    reconcileSaveError();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      reconcile();
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const toggle = target?.closest(DISCLOSURE_SELECTOR);
    if (!(toggle instanceof HTMLButtonElement)) return;

    window.queueMicrotask(() => {
      const page = toggle.closest(PAGE_SELECTOR) || document.querySelector(PAGE_SELECTOR);
      if (!(page instanceof HTMLElement)) return;
      observedPage = page;
      disclosureOpen = page.classList.contains("is-custom-settings-open");
    });
  });

  const root = document.body || document.documentElement;
  if (root && typeof MutationObserver === "function") {
    new MutationObserver(schedule).observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-attendance-reward-error"],
    });
  }

  document.addEventListener("econovaria:attendance-reward-saved", schedule);
  window.addEventListener("load", schedule, { once: true });
  schedule();
})();