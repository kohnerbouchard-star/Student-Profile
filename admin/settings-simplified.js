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

  function ensureStylesheet() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    link.href = "./css/settings-simplified.css";
    document.head.append(link);
  }

  function settingsPage() {
    return document.querySelector(PAGE_SELECTOR);
  }

  function selectedGameId() {
    const model = window.Econovaria?.features?.adminOverviewTerminal?.currentModel || {};
    return text(
      model.gameId || model.activeGameId || model.selectedGameSessionId ||
      model.activeGame?.id || model.selectedGame?.id ||
      window.sessionStorage.getItem("econovaria.admin.selected-game.v1"),
    );
  }

  function configureModifierLabels(page) {
    for (const key of ["priceMultiplier", "incomeMultiplier"]) {
      const select = page.querySelector(`[data-game-setting-key="${key}"]`);
      if (!(select instanceof HTMLSelectElement)) continue;
      for (const option of select.options) {
        const value = Number(option.value);
        if (Number.isFinite(value)) option.textContent = `${value.toFixed(2)}×`;
      }
    }

    const income = page.querySelector('[data-game-setting-key="incomeMultiplier"]');
    setText(
      income?.closest("label")?.querySelector("small"),
      "Applies to salaries, contracts, attendance, and other player earnings.",
    );
  }

  function concealAutomaticAttendancePolicyControls(attendanceCard) {
    const controls = [
      attendanceCard.querySelector('[data-attendance-reward-field="applyDifficultyIncomeModifier"]'),
      attendanceCard.querySelector('[data-attendance-reward-field="currencyMode"]'),
    ];
    for (const control of controls) {
      const tile = control?.closest(".admin-terminal-settings-change-tile");
      if (tile instanceof HTMLElement) {
        tile.hidden = true;
        tile.dataset.settingsAutomaticPolicy = "true";
      }
    }
  }

  function attendanceRuleText(page) {
    const income = Number(page.querySelector('[data-game-setting-key="incomeMultiplier"]')?.value || 1);
    const present = Number(
      page.querySelector('[data-attendance-reward-field="presentRewardAmount"]')?.value || 0,
    );
    const late = Number(
      page.querySelector('[data-attendance-reward-field="lateRewardAmount"]')?.value || 0,
    );
    const safeIncome = Number.isFinite(income) ? income : 1;
    const safePresent = Number.isFinite(present) ? present : 0;
    const safeLate = Number.isFinite(late) ? late : 0;
    return `Present ${safePresent.toFixed(2)} × ${safeIncome.toFixed(2)} = ${(safePresent * safeIncome).toFixed(2)}; ` +
      `late ${safeLate.toFixed(2)} × ${safeIncome.toFixed(2)} = ${(safeLate * safeIncome).toFixed(2)}, ` +
      "before the player-country exchange rate.";
  }

  function rewritePageCopy(page) {
    const strip = page.querySelector(".admin-terminal-settings-control-strip");
    setText(strip?.querySelector(":scope > div:first-child > span"), "Difficulty preset");
    setText(strip?.querySelector(":scope > div:first-child > strong"), "Choose how demanding the game should be");
    setText(
      strip?.querySelector(":scope > div:first-child > small"),
      "Start with a balanced preset. Open custom settings only when this game needs different rules.",
    );

    const mainHeader = page.querySelector(".admin-terminal-settings-main-panel > header");
    setText(mainHeader?.querySelector("div > span"), "Custom settings");
    setText(mainHeader?.querySelector("div > h3"), "Adjust individual rules");
    setText(
      mainHeader?.querySelector("div > p"),
      "The selected preset remains the baseline. Changes below create a custom configuration for this game.",
    );
  }

  function rewriteSection(card, title, description) {
    if (!(card instanceof HTMLElement)) return;
    card.classList.add("is-settings-section");
    setText(card.querySelector(":scope > header > span"), title);
    setText(card.querySelector(":scope > header > strong"), description);
  }

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

  function placeInStableOrder(parent, nodes) {
    let cursor = parent.firstElementChild;
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.parentElement !== parent || node !== cursor) parent.insertBefore(node, cursor);
      cursor = node.nextElementSibling;
    }
  }

  function putCardsInLinearOrder(page) {
    const grid = page.querySelector(".admin-terminal-settings-tuning-grid");
    const money = page.querySelector(".admin-terminal-settings-tuning-card.is-money");
    const attendance = page.querySelector("[data-admin-attendance-reward-settings]");
    const events = page.querySelector(".admin-terminal-settings-tuning-card.is-events");
    const safety = page.querySelector(".admin-terminal-settings-tuning-card.is-safety");
    if (!(grid instanceof HTMLElement) || !(money instanceof HTMLElement) ||
        !(attendance instanceof HTMLElement) || !(events instanceof HTMLElement) ||
        !(safety instanceof HTMLElement)) {
      return null;
    }

    rewriteSection(money, "Economy", "Prices, earnings, and taxation");
    rewriteSection(
      attendance,
      "Attendance rewards",
      "Base amounts using the global Income Modifier and each player's country currency",
    );
    rewriteSection(events, "Simulation events", "Frequency, severity, and direction");
    rewriteSection(safety, "Recovery and rollout", "Support strength and change pacing");

    setText(
      attendance.querySelector('[data-attendance-reward-field="presentRewardAmount"]')
        ?.closest("label")?.querySelector("small"),
      "Base amount awarded for an on-time attendance scan.",
    );
    setText(
      attendance.querySelector('[data-attendance-reward-field="lateRewardAmount"]')
        ?.closest("label")?.querySelector("small"),
      "Set this to 0.00 when late arrivals should not receive a reward.",
    );

    concealAutomaticAttendancePolicyControls(attendance);
    const formula = ensureAttendanceExample(grid, attendance, page);
    placeInStableOrder(grid, [money, attendance, formula, events, safety]);

    const group = page.querySelector("[data-settings-economy-group]");
    if (group instanceof HTMLElement && !group.contains(money) && !group.contains(attendance)) {
      group.remove();
    }

    return { grid, money, attendance, events, safety, formula };
  }

  function controlValue(control) {
    if (control instanceof HTMLSelectElement) {
      return text(control.selectedOptions[0]?.textContent || control.value);
    }
    if (control instanceof HTMLInputElement) {
      const numeric = Number(control.value);
      if (control.type === "number" && Number.isFinite(numeric)) return numeric.toFixed(2);
      return text(control.value);
    }
    return "";
  }

  function cardSummary(card) {
    if (!(card instanceof HTMLElement)) return [];
    return [...card.querySelectorAll(".admin-terminal-settings-field")]
      .map((field) => {
        if (field.closest(".admin-terminal-settings-change-tile")?.hidden) return null;
        const label = text(field.querySelector(":scope > span")?.textContent);
        const value = controlValue(field.querySelector("input, select"));
        return label && value ? `${label} ${value}` : null;
      })
      .filter(Boolean);
  }

  function ensureConfigurationSummary(page, cards) {
    const strip = page.querySelector(".admin-terminal-settings-control-strip");
    if (!(strip instanceof HTMLElement) || !cards) return null;

    let summary = strip.querySelector("[data-settings-config-summary]");
    if (!(summary instanceof HTMLElement)) {
      summary = document.createElement("section");
      summary.className = "admin-terminal-settings-config-summary";
      summary.dataset.settingsConfigSummary = "true";
      summary.setAttribute("role", "status");
      summary.setAttribute("aria-atomic", "true");
      summary.innerHTML = `
        <header>
          <div><span>Current configuration</span><strong>Review the active rules before editing</strong></div>
          <small>Preset values update immediately; they are not permanent until saved.</small>
        </header>
        <div class="admin-terminal-settings-summary-list">
          <div data-settings-summary="economy"><strong>Economy</strong><span>—</span></div>
          <div data-settings-summary="attendance"><strong>Attendance</strong><span>—</span></div>
          <div data-settings-summary="events"><strong>Events</strong><span>—</span></div>
          <div data-settings-summary="recovery"><strong>Recovery</strong><span>—</span></div>
        </div>`;
      strip.append(summary);
    }
    updateConfigurationSummary(summary, cards);
    return summary;
  }

  function updateConfigurationSummary(summary, cards) {
    if (!(summary instanceof HTMLElement) || !cards) return;
    const values = {
      economy: cardSummary(cards.money),
      attendance: cardSummary(cards.attendance),
      events: cardSummary(cards.events),
      recovery: cardSummary(cards.safety),
    };
    for (const [key, items] of Object.entries(values)) {
      setText(summary.querySelector(`[data-settings-summary="${key}"] > span`), items.join(" · ") || "—");
    }
  }

  function ensureSegmentedControl(select) {
    if (!(select instanceof HTMLSelectElement)) return;
    const options = [...select.options].filter((option) => !option.disabled && text(option.value));
    if (options.length < 2 || options.length > 4) return;

    const field = select.closest(".admin-terminal-settings-field");
    if (!(field instanceof HTMLElement)) return;
    let group = field.querySelector(":scope > [data-settings-segmented]");
    if (!(group instanceof HTMLElement)) {
      group = document.createElement("div");
      group.className = "admin-terminal-settings-segmented";
      group.dataset.settingsSegmented = "true";
      group.setAttribute("role", "radiogroup");
      group.setAttribute("aria-label", text(field.querySelector(":scope > span")?.textContent) || "Setting");
      group.style.setProperty("--settings-segment-count", String(options.length));
      select.classList.add("is-settings-native-select");
      select.tabIndex = -1;
      select.setAttribute("aria-hidden", "true");
      select.insertAdjacentElement("afterend", group);
    }

    const signature = options.map((option) => `${option.value}:${text(option.textContent)}`).join("|");
    if (group.dataset.optionSignature !== signature) {
      group.replaceChildren();
      for (const option of options) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.settingsSegmentValue = option.value;
        button.setAttribute("role", "radio");
        button.textContent = text(option.textContent);
        button.addEventListener("click", () => {
          if (select.value === option.value) return;
          select.value = option.value;
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        group.append(button);
      }
      group.dataset.optionSignature = signature;
    }

    for (const button of group.querySelectorAll("[data-settings-segment-value]")) {
      const active = button.dataset.settingsSegmentValue === select.value;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-checked", String(active));
      button.tabIndex = active ? 0 : -1;
    }
  }

  function enhanceDiscreteControls(cards) {
    if (!cards) return;
    for (const select of cards.events.querySelectorAll("select")) ensureSegmentedControl(select);
    for (const select of cards.safety.querySelectorAll("select")) ensureSegmentedControl(select);
  }

  function ensureCustomDisclosure(page, cards) {
    const panel = page.querySelector(".admin-terminal-settings-main-panel");
    const header = panel?.querySelector(":scope > header");
    if (!(panel instanceof HTMLElement) || !(header instanceof HTMLElement) || !cards) return;

    const badge = header.querySelector(":scope > strong");
    if (badge instanceof HTMLElement) badge.hidden = true;

    let button = header.querySelector("[data-settings-custom-toggle]");
    if (!(button instanceof HTMLButtonElement)) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "admin-terminal-settings-custom-toggle";
      button.dataset.settingsCustomToggle = "true";
      button.addEventListener("click", () => {
        state.disclosureOpen = !page.classList.contains("is-custom-settings-open");
        applyDisclosureState(page, button, cards.grid);
        schedulePresentation();
        if (state.disclosureOpen) cards.grid.querySelector("input, select, button")?.focus({ preventScroll: true });
      });
      header.append(button);
    }

    applyDisclosureState(page, button, cards.grid);
  }

  function applyDisclosureState(page, button, grid) {
    page.dataset.settingsDisclosureInitialized = "true";
    page.classList.toggle("is-custom-settings-open", state.disclosureOpen);
    button.setAttribute("aria-expanded", String(state.disclosureOpen));
    button.setAttribute("aria-controls", "econovaria-custom-settings-grid");
    grid.id = "econovaria-custom-settings-grid";
    setText(button, state.disclosureOpen ? "Hide custom settings" : "Edit custom settings");
  }

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
    const failed = button?.getAttribute("data-admin-terminal-api-state") === "error";
    const saved = Date.now() < state.savedUntil;

    page.classList.toggle("has-unsaved-settings", dirty);
    panel.classList.toggle("is-saved", saved && !dirty);
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
    if (!(page instanceof HTMLElement)) return;
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
    reconcile: reconcileStructure,
    refresh: renderPresentation,
    acknowledgeSaved,
    isDirty: () => {
      const page = settingsPage();
      return Boolean(page && state.baselineValues.size && (changedCount(page) > 0 || attendanceDirty()));
    },
  };
})();
