(function initEconovariaSettingsSaveErrorBridge() {
  "use strict";

  const SELECTOR = '[data-admin-terminal-action="save-settings"]';
  const PAGE_SELECTOR = ".admin-terminal-settings-page";
  const DISCLOSURE_SELECTOR = "[data-settings-custom-toggle]";
  const SAVE_PANEL_SELECTOR = ".admin-terminal-settings-save-bar";
  const SAVE_STATUS_SELECTOR = "[data-settings-save-status]";
  const NUMERIC_EDITOR_SELECTOR =
    `${PAGE_SELECTOR}.is-custom-settings-open ` +
    ".admin-terminal-settings-tuning-grid input[type=\"number\"]";
  const STYLE_ID = "econovaria-settings-final-polish-style";
  let queued = false;
  let observedPage = null;
  let disclosureOpen = false;
  let disclosureGameId = "";
  let numericDraftPending = false;
  const deferredNumericControls = new WeakSet();

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
      numericDraftPending = false;
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

  function settingsDirty() {
    return numericDraftPending ||
      window.EconovariaSimplifiedSettings?.isDirty?.() === true ||
      window.EconovariaAttendanceRewardSettings?.isDirty?.() === true;
  }

  function reconcilePersistentSave() {
    const page = document.querySelector(PAGE_SELECTOR);
    const panel = page?.querySelector(SAVE_PANEL_SELECTOR);
    const button = panel?.querySelector(SELECTOR);
    const status = panel?.querySelector(SAVE_STATUS_SELECTOR);
    if (!(page instanceof HTMLElement) || !(panel instanceof HTMLElement) ||
        !(button instanceof HTMLButtonElement)) {
      return;
    }

    const open = page.classList.contains("is-custom-settings-open");
    const dirty = settingsDirty();
    const busy = button.hasAttribute("aria-busy");
    const failed = button.getAttribute("data-admin-terminal-api-state") === "error";
    const saved = /settings saved/i.test(text(status?.textContent));

    panel.hidden = !(open || dirty || busy || failed || saved);
    button.disabled = !dirty || busy;

    if (numericDraftPending && !busy && !failed && status instanceof HTMLElement) {
      status.textContent = "Unsaved changes";
    } else if (open && !dirty && !busy && !failed && !saved && status instanceof HTMLElement) {
      status.textContent = "No unsaved changes";
    }
  }

  function reconcile() {
    ensureStylesheet();
    reconcileDisclosure();
    reconcileSaveError();
    reconcilePersistentSave();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      reconcile();
    });
  }

  function isActiveNumericEditor(target) {
    return target instanceof HTMLInputElement &&
      target.matches(NUMERIC_EDITOR_SELECTOR) &&
      document.activeElement === target;
  }

  function deferNumericEvent(event) {
    const target = event.target;
    if (!isActiveNumericEditor(target)) return;
    deferredNumericControls.add(target);
    numericDraftPending = true;
    event.stopImmediatePropagation();
    reconcilePersistentSave();
  }

  window.addEventListener("input", deferNumericEvent, true);
  window.addEventListener("change", deferNumericEvent, true);

  window.addEventListener("focusout", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !deferredNumericControls.has(target)) return;
    deferredNumericControls.delete(target);
    window.queueMicrotask(() => {
      if (!target.isConnected) return;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      numericDraftPending = false;
      schedule();
    });
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const toggle = target?.closest(DISCLOSURE_SELECTOR);
    if (!(toggle instanceof HTMLButtonElement)) return;

    window.queueMicrotask(() => {
      const page = toggle.closest(PAGE_SELECTOR) || document.querySelector(PAGE_SELECTOR);
      if (!(page instanceof HTMLElement)) return;
      observedPage = page;
      disclosureOpen = page.classList.contains("is-custom-settings-open");
      reconcilePersistentSave();
    });
  });

  const root = document.body || document.documentElement;
  if (root && typeof MutationObserver === "function") {
    new MutationObserver(schedule).observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-attendance-reward-error",
        "data-admin-terminal-api-state",
        "aria-busy",
      ],
    });
  }

  document.addEventListener("econovaria:attendance-reward-saved", schedule);
  window.addEventListener("load", schedule, { once: true });
  schedule();
})();
