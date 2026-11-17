(function initEconovariaSimplifiedSettings() {
  "use strict";

  const STYLE_ID = "econovaria-settings-simplified-style";
  const PAGE_SELECTOR = ".admin-terminal-settings-page";
  const CONTROL_SELECTOR = "[data-game-setting-key], [data-attendance-reward-field]";
  const SAVE_SELECTOR = '[data-admin-terminal-action="save-settings"]';
  const state = {
    page: null,
    gameId: "",
    baselineValues: new Map(),
    structureQueued: false,
    presentationQueued: false,
    savedTimer: 0,
    savedUntil: 0,
    disclosureOpen: false,
  };

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function ensureStylesheet(id = STYLE_ID, href = "./css/settings-simplified.css") {
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    insertSettingsStylesheet(link, id);
  }

  function settingsPage() {
    return document.querySelector(PAGE_SELECTOR);
  }

  function selectedGameId() {
    const model = window.Econovaria?.features?.adminOverviewTerminal?.currentModel || {};
    return text(
      model.gameId || model.activeGameId || model.selectedGameSessionId ||
      model.activeGame?.id || model.selectedGame?.id ||
      window.EconovariaAdminGameSelection?.read?.(),
    );
  }

  const {
    configureModifierLabels, concealAutomaticAttendancePolicyControls, attendanceRuleText,
    rewritePageCopy, rewriteSection,
  } = window.createSettingsCopy({
    setText,
  });

  function ensureAttendanceExample(grid, attendance, page) {
    const legacyFormula = attendance.querySelector("[data-attendance-reward-formula]");
    if (legacyFormula instanceof HTMLElement) {
      legacyFormula.removeAttribute("data-attendance-reward-formula");
      legacyFormula.dataset.settingsLegacyAttendanceFormula = "true";
      legacyFormula.hidden = true;
      legacyFormula.style.display = "none";
    }

    let formula = grid.querySelector("[data-settings-attendance-example]");
    if (!(formula instanceof HTMLElement)) {
      formula = document.createElement("footer");
      formula.className =
        "admin-terminal-attendance-reward-formula admin-terminal-settings-attendance-example";
      formula.dataset.attendanceRewardFormula = "";
      formula.dataset.settingsAttendanceExample = "true";
      formula.setAttribute("role", "status");
      formula.setAttribute("aria-atomic", "true");
      formula.innerHTML = "<strong>Example payout</strong><span></span>";
    }

    setText(formula.querySelector("strong"), "Example payout");
    setText(formula.querySelector("span"), attendanceRuleText(page));
    return formula;
  }

  const {
    placeInStableOrder, putCardsInLinearOrder, controlValue, cardSummary, ensureConfigurationSummary,
    updateConfigurationSummary, ensureSegmentedControl, enhanceDiscreteControls, ensureCustomDisclosure,
    applyDisclosureState,
  } = window.createSettingsPresentation({
    rewriteSection,
    setText,
    concealAutomaticAttendancePolicyControls,
    ensureAttendanceExample,
    text,
    state,
    schedulePresentation,
  });

  function controlKey(control, index) {
    return text(control.getAttribute("data-game-setting-key")) ||
      text(control.getAttribute("data-attendance-reward-field")) ||
      `${control.tagName.toLowerCase()}-${index}`;
  }

  function currentValues(page) {
    const entries = [...page.querySelectorAll(CONTROL_SELECTOR)].map((control, index) => [
      controlKey(control, index),
      "value" in control ? String(control.value) : "",
    ]);
    entries.sort(([left], [right]) => left.localeCompare(right));
    return entries;
  }

  function captureBaseline(page) {
    if (!(page instanceof HTMLElement)) return;
    state.baselineValues = new Map(currentValues(page));
    page.dataset.settingsUxBaselineReady = "true";
  }

  function changedCount(page) {
    if (!state.baselineValues.size) return 0;
    let count = 0;
    for (const [key, value] of currentValues(page)) {
      if (state.baselineValues.get(key) !== value) count += 1;
    }
    return count;
  }

  function attendanceDirty() {
    return window.EconovariaAttendanceRewardSettings?.isDirty?.() === true;
  }

  function ensureSaveBar(page) {
    const detail = page.querySelector(".admin-terminal-settings-detail-panel");
    const panel = detail?.querySelector(".admin-terminal-settings-save-panel-v543") ||
      page.querySelector(".admin-terminal-settings-save-panel-v543");
    if (!(panel instanceof HTMLElement)) return null;

    panel.classList.add("admin-terminal-settings-save-bar");
    if (panel.parentElement !== page) page.append(panel);
    if (detail instanceof HTMLElement) detail.hidden = true;

    const button = panel.querySelector(SAVE_SELECTOR);
    if (button instanceof HTMLButtonElement) setText(button, "Save changes");

    let status = panel.querySelector("[data-settings-save-status]");
    if (status instanceof HTMLElement && status.tagName === "SMALL") {
      const replacement = document.createElement("span");
      replacement.dataset.settingsSaveStatus = "true";
      replacement.textContent = text(status.textContent) || "No unsaved changes";
      status.replaceWith(replacement);
      status = replacement;
    }
    for (const legacy of panel.querySelectorAll(":scope > small")) legacy.remove();
    if (!(status instanceof HTMLElement)) {
      status = document.createElement("span");
      status.dataset.settingsSaveStatus = "true";
      panel.prepend(status);
    }
    status.setAttribute("role", "status");
    status.setAttribute("aria-atomic", "true");
    return { panel, button, status };
  }

  function renderSaveState(page, saveArea) {
    if (!saveArea || !(saveArea.panel instanceof HTMLElement)) return;
    const { panel, button, status } = saveArea;
    const baselineReady = state.baselineValues.size > 0;
    const count = baselineReady ? changedCount(page) : 0;
    const dirty = baselineReady && (count > 0 || attendanceDirty());
    const busy = button?.hasAttribute("aria-busy") === true;
    const failed = !busy && (Boolean(text(button?.dataset.attendanceRewardError)) ||
      button?.getAttribute("data-admin-terminal-api-state") === "error");
    const saved = Date.now() < state.savedUntil;

    page.classList.toggle("has-unsaved-settings", dirty);
    panel.classList.toggle("is-saved", saved && !dirty && !failed && !busy);
    panel.classList.toggle("is-error", failed);
    panel.hidden = !(state.disclosureOpen || dirty || busy || failed || saved);

    if (button instanceof HTMLButtonElement) button.disabled = !dirty || busy;
    if (busy) setText(status, "Saving changes…");
    else if (failed) setText(status, "Settings were not saved. Review the error and try again.");
    else if (dirty) {
      const total = Math.max(count, 1);
      setText(status, `${total} unsaved ${total === 1 ? "change" : "changes"}`);
    } else if (saved) setText(status, "Settings saved");
    else setText(status, "No unsaved changes");
  }

  function initializeBaseline(page) {
    const attendanceApi = window.EconovariaAttendanceRewardSettings;
    if (!attendanceApi || state.baselineValues.size || attendanceApi.isDirty?.() === true) return;
    if (attendanceApi.getGameId?.() !== state.gameId || attendanceApi.isLoaded?.() !== true) return;
    if (!page.querySelector('[data-admin-attendance-reward-settings][data-attendance-reward-loaded="true"]')) return;
    captureBaseline(page);
  }

  function resetForPage(page) {
    const gameId = selectedGameId();
    if (state.page === page && state.gameId === gameId) return;
    const pageChanged = state.page !== page;
    const previousGameId = state.gameId;
    const gameChanged = previousGameId && previousGameId !== gameId;
    state.page = page;
    state.gameId = gameId;
    state.baselineValues = new Map();
    state.savedUntil = 0;
    if (gameChanged) {
      state.disclosureOpen = false;
      window.queueMicrotask(() => {
        document.dispatchEvent(new CustomEvent("econovaria:settings-context-changed", {
          detail: { previousGameId, gameId },
        }));
      });
    }
    page.removeAttribute("data-settings-ux-baseline-ready");
    window.clearTimeout(state.savedTimer);
    if (pageChanged && !gameChanged && page.isConnected && page === settingsPage()) {
      window.EconovariaSettingsLifecycleBridge?.reconcile?.("page-replacement");
    }
  }

  function cardsForPage(page) {
    const grid = page.querySelector(".admin-terminal-settings-tuning-grid");
    const money = page.querySelector(".admin-terminal-settings-tuning-card.is-money");
    const attendance = page.querySelector("[data-admin-attendance-reward-settings]");
    const events = page.querySelector(".admin-terminal-settings-tuning-card.is-events");
    const safety = page.querySelector(".admin-terminal-settings-tuning-card.is-safety");
    if (!(grid instanceof HTMLElement) || !(money instanceof HTMLElement) ||
        !(attendance instanceof HTMLElement) || !(events instanceof HTMLElement) ||
        !(safety instanceof HTMLElement)) return null;
    return { grid, money, attendance, events, safety };
  }

  function renderPresentation() {
    const page = settingsPage();
    if (!(page instanceof HTMLElement)) return;
    resetForPage(page);
    const cards = cardsForPage(page);
    if (cards) {
      const formula = page.querySelector("[data-settings-attendance-example]");
      setText(formula?.querySelector("span"), attendanceRuleText(page));
      updateConfigurationSummary(page.querySelector("[data-settings-config-summary]"), cards);
      for (const select of [...cards.events.querySelectorAll("select"), ...cards.safety.querySelectorAll("select")]) {
        const group = select.closest(".admin-terminal-settings-field")
          ?.querySelector(":scope > [data-settings-segmented]");
        if (!(group instanceof HTMLElement)) continue;
        for (const button of group.querySelectorAll("[data-settings-segment-value]")) {
          const active = button.dataset.settingsSegmentValue === select.value;
          button.classList.toggle("is-selected", active);
          button.setAttribute("aria-checked", String(active));
          button.tabIndex = active ? 0 : -1;
        }
      }
    }
    initializeBaseline(page);
    renderSaveState(page, ensureSaveBar(page));
  }

  function acknowledgeSaved(detail) {
    const gameId = text(detail?.gameId);
    if (gameId && gameId !== state.gameId) return;
    const page = settingsPage();
    const selected = window.EconovariaAdminGameSelection?.read?.();
    if (!(page instanceof HTMLElement) || page !== state.page ||
        (selected && gameId && selected !== gameId)) return;
    captureBaseline(page);
    state.savedUntil = Date.now() + 1800;
    window.clearTimeout(state.savedTimer);
    state.savedTimer = window.setTimeout(schedulePresentation, 1850);
    renderPresentation();
  }

  function reconcileStructure() {
    ensureStylesheet();
    const page = settingsPage();
    if (!(page instanceof HTMLElement)) return;
    resetForPage(page);

    page.classList.add("is-settings-simplified", "is-settings-preset-first");
    rewritePageCopy(page);
    configureModifierLabels(page);
    const cards = putCardsInLinearOrder(page);
    enhanceDiscreteControls(cards);
    ensureConfigurationSummary(page, cards);
    ensureCustomDisclosure(page, cards);
    ensureSaveBar(page);
    initializeBaseline(page);
    renderPresentation();

    page.dataset.settingsSimplifiedReady = "true";
    page.dataset.settingsUxReady = "true";
  }

  function scheduleStructure() {
    if (state.structureQueued) return;
    state.structureQueued = true;
    window.requestAnimationFrame(() => {
      state.structureQueued = false;
      reconcileStructure();
    });
  }

  function schedulePresentation() {
    if (state.presentationQueued) return;
    state.presentationQueued = true;
    window.requestAnimationFrame(() => {
      state.presentationQueued = false;
      renderPresentation();
    });
  }

  document.addEventListener("input", (event) => {
    if (event.target instanceof Element && event.target.matches(CONTROL_SELECTOR)) {
      schedulePresentation();
    }
  }, true);

  document.addEventListener("change", (event) => {
    if (event.target instanceof Element && event.target.matches(CONTROL_SELECTOR)) {
      schedulePresentation();
      scheduleStructure();
    }
  }, true);

  document.addEventListener("focusout", (event) => {
    if (event.target instanceof Element && event.target.matches(CONTROL_SELECTOR)) {
      scheduleStructure();
    }
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(SAVE_SELECTOR)) schedulePresentation();
  }, true);

  document.addEventListener("econovaria:attendance-reward-saved", (event) => {
    acknowledgeSaved(event instanceof CustomEvent ? event.detail : null);
  });

  const root = document.body || document.documentElement;
  if (root && typeof MutationObserver === "function") {
    const observer = new MutationObserver((mutations) => {
      let structure = false;
      let presentation = false;
      for (const mutation of mutations) {
        if (mutation.type === "childList" && [...mutation.addedNodes, ...mutation.removedNodes]
          .some((node) => node instanceof Element)) {
          structure = true;
          break;
        }
        if (mutation.type === "attributes") {
          if (mutation.attributeName === "data-attendance-reward-loaded") structure = true;
          else presentation = true;
        }
      }
      if (structure) scheduleStructure();
      else if (presentation) schedulePresentation();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-attendance-reward-loaded",
        "data-attendance-reward-dirty",
        "data-admin-terminal-api-state",
        "aria-busy",
        "aria-pressed",
      ],
    });
  }

  window.addEventListener("load", scheduleStructure, { once: true });
  scheduleStructure();

  window.EconovariaSimplifiedSettings = {
    ensureFinalPolishStylesheet: () => ensureStylesheet(
      "econovaria-settings-final-polish-style", "./css/settings-final-polish.css",
    ),
    reconcile: reconcileStructure,
    refresh: renderPresentation,
    acknowledgeSaved,
    isDirty: () => {
      const page = settingsPage();
      return Boolean(page && state.baselineValues.size && (changedCount(page) > 0 || attendanceDirty()));
    },
  };

  function insertSettingsStylesheet(link, id) {
    const anchor = id === STYLE_ID
      ? document.getElementById("econovaria-settings-final-polish-style") : null;
    if (anchor?.parentNode === document.head) document.head.insertBefore(link, anchor);
    else document.head.append(link);
  }
})();
