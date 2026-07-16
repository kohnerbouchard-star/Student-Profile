(function initEconovariaSimplifiedSettings() {
  "use strict";

  const STYLE_ID = "econovaria-settings-simplified-style";
  const PAGE_SELECTOR = ".admin-terminal-settings-page";
  const CONTROL_SELECTOR = "[data-game-setting-key], [data-attendance-reward-field]";
  const state = {
    page: null,
    gameId: "",
    baseline: "",
    baselineValues: new Map(),
    reconcileQueued: false,
    savedTimer: 0,
    savedUntil: 0,
  };

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
    const incomeHelp = income?.closest("label")?.querySelector("small");
    setText(incomeHelp, "Applies to salaries, contracts, attendance, and other player earnings.");
  }

  function forceAutomaticAttendancePolicy(attendanceCard) {
    const difficulty = attendanceCard.querySelector(
      '[data-attendance-reward-field="applyDifficultyIncomeModifier"]',
    );
    const currency = attendanceCard.querySelector('[data-attendance-reward-field="currencyMode"]');

    if (difficulty instanceof HTMLSelectElement && difficulty.value !== "true") {
      difficulty.value = "true";
    }
    if (currency instanceof HTMLSelectElement && currency.value !== "player_country") {
      currency.value = "player_country";
    }

    for (const control of [difficulty, currency]) {
      const tile = control?.closest(".admin-terminal-settings-change-tile");
      if (tile instanceof HTMLElement) {
        tile.hidden = true;
        tile.dataset.settingsAutomaticPolicy = "true";
      }
    }
  }

  function attendanceRuleText(page) {
    const income = Number(
      page.querySelector('[data-game-setting-key="incomeMultiplier"]')?.value || 1,
    );
    const present = Number(
      page.querySelector('[data-attendance-reward-field="presentRewardAmount"]')?.value || 0,
    );
    const late = Number(
      page.querySelector('[data-attendance-reward-field="lateRewardAmount"]')?.value || 0,
    );
    const incomeText = Number.isFinite(income) ? income.toFixed(2) : "1.00";
    const presentText = Number.isFinite(present) ? present.toFixed(2) : "0.00";
    const lateText = Number.isFinite(late) ? late.toFixed(2) : "0.00";
    const presentPayout = Number.isFinite(present * income)
      ? (present * income).toFixed(2)
      : "0.00";
    const latePayout = Number.isFinite(late * income)
      ? (late * income).toFixed(2)
      : "0.00";
    return `Present ${presentText} × ${incomeText} = ${presentPayout}; late ${lateText} × ${incomeText} = ${latePayout}, before the player-country exchange rate.`;
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

    const group = page.querySelector("[data-settings-economy-group]");
    const desired = [money, attendance, events, safety];
    for (const card of desired) {
      if (card.parentElement !== grid) grid.append(card);
    }
    group?.remove();

    let reference = grid.firstElementChild;
    for (const card of desired) {
      if (card !== reference) grid.insertBefore(card, reference);
      reference = card.nextElementSibling;
    }

    rewriteSection(money, "Economy", "Prices, earnings, and taxation");
    rewriteSection(
      attendance,
      "Attendance rewards",
      "Base amounts using the global Income Modifier and each player's country currency",
    );
    rewriteSection(events, "Simulation events", "Frequency, severity, and direction");
    rewriteSection(safety, "Recovery and rollout", "Support strength and change pacing");

    const presentHelp = attendance.querySelector(
      '[data-attendance-reward-field="presentRewardAmount"]',
    )?.closest("label")?.querySelector("small");
    const lateHelp = attendance.querySelector(
      '[data-attendance-reward-field="lateRewardAmount"]',
    )?.closest("label")?.querySelector("small");
    setText(presentHelp, "Base amount awarded for an on-time attendance scan.");
    setText(lateHelp, "Set this to 0.00 when late arrivals should not receive a reward.");

    forceAutomaticAttendancePolicy(attendance);
    const formula = attendance.querySelector("[data-attendance-reward-formula]");
    setText(formula?.querySelector("strong"), "Example payout");
    setText(formula?.querySelector("span"), attendanceRuleText(page));

    return { grid, money, attendance, events, safety };
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
        const tile = field.closest(".admin-terminal-settings-change-tile");
        if (tile?.hidden) return null;
        const label = text(field.querySelector(":scope > span")?.textContent);
        const control = field.querySelector("input, select");
        const value = controlValue(control);
        return label && value ? `${label} ${value}` : null;
      })
      .filter(Boolean);
  }

  function ensureConfigurationSummary(page, cards) {
    const strip = page.querySelector(".admin-terminal-settings-control-strip");
    if (!(strip instanceof HTMLElement) || !cards) return;

    let summary = strip.querySelector("[data-settings-config-summary]");
    if (!(summary instanceof HTMLElement)) {
      summary = document.createElement("section");
      summary.className = "admin-terminal-settings-config-summary";
      summary.dataset.settingsConfigSummary = "true";
      summary.setAttribute("aria-live", "polite");
      strip.append(summary);
    }

    const groups = [
      ["Economy", cardSummary(cards.money)],
      ["Attendance", cardSummary(cards.attendance)],
      ["Events", cardSummary(cards.events)],
      ["Recovery", cardSummary(cards.safety)],
    ];
    const markup = `
      <header>
        <div><span>Current configuration</span><strong>Review the active rules before editing</strong></div>
        <small>Preset values update immediately; they are not permanent until saved.</small>
      </header>
      <div class="admin-terminal-settings-summary-list">
        ${groups.map(([label, values]) => `
          <div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(values.join(" · ") || "—")}</span></div>`).join("")}
      </div>`;
    if (summary.dataset.summaryMarkup !== markup) {
      summary.innerHTML = markup;
      summary.dataset.summaryMarkup = markup;
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
          scheduleReconcile();
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
        const expanded = page.classList.toggle("is-custom-settings-open");
        button.setAttribute("aria-expanded", String(expanded));
        setText(button, expanded ? "Hide custom settings" : "Edit custom settings");
        if (expanded) cards.grid.querySelector("input, select, button")?.focus({ preventScroll: true });
      });
      header.append(button);
    }

    if (!page.dataset.settingsDisclosureInitialized) {
      page.dataset.settingsDisclosureInitialized = "true";
      page.classList.remove("is-custom-settings-open");
    }
    const expanded = page.classList.contains("is-custom-settings-open");
    button.setAttribute("aria-expanded", String(expanded));
    button.setAttribute("aria-controls", "econovaria-custom-settings-grid");
    cards.grid.id = "econovaria-custom-settings-grid";
    setText(button, expanded ? "Hide custom settings" : "Edit custom settings");
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

  function valuesSignature(page) {
    return JSON.stringify(currentValues(page));
  }

  function captureBaseline(page) {
    if (!(page instanceof HTMLElement)) return;
    state.baseline = valuesSignature(page);
    state.baselineValues = new Map(currentValues(page));
    page.dataset.settingsUxBaselineReady = "true";
  }

  function changedCount(page) {
    if (!state.baseline) return 0;
    let count = 0;
    for (const [key, value] of currentValues(page)) {
      if (state.baselineValues.get(key) !== value) count += 1;
    }
    return count;
  }

  function ensureSaveBar(page) {
    const detail = page.querySelector(".admin-terminal-settings-detail-panel");
    const panel = detail?.querySelector(".admin-terminal-settings-save-panel-v543") ||
      page.querySelector(".admin-terminal-settings-save-panel-v543");
    if (!(panel instanceof HTMLElement)) return null;

    panel.classList.add("admin-terminal-settings-save-bar");
    if (panel.parentElement !== page) page.append(panel);
    if (detail instanceof HTMLElement) detail.hidden = true;

    const button = panel.querySelector('[data-admin-terminal-action="save-settings"]');
    if (button instanceof HTMLButtonElement) setText(button, "Save changes");

    let status = panel.querySelector("[data-settings-save-status]");
    if (!(status instanceof HTMLElement)) {
      status = panel.querySelector("small") || document.createElement("small");
      status.dataset.settingsSaveStatus = "true";
      if (!status.parentElement) panel.prepend(status);
    }
    return { panel, button, status };
  }

  function attendanceDirty() {
    return window.EconovariaAttendanceRewardSettings?.isDirty?.() === true;
  }

  function renderSaveState(page, saveArea) {
    if (!saveArea || !(saveArea.panel instanceof HTMLElement)) return;
    const { panel, button, status } = saveArea;
    const baselineReady = Boolean(state.baseline);
    const count = baselineReady ? changedCount(page) : 0;
    const dirty = baselineReady && (count > 0 || attendanceDirty());
    const busy = button?.hasAttribute("aria-busy") === true;
    const failed = button?.getAttribute("data-admin-terminal-api-state") === "error";
    const saved = Date.now() < state.savedUntil;

    page.classList.toggle("has-unsaved-settings", dirty);
    panel.classList.toggle("is-saved", saved && !dirty);
    panel.classList.toggle("is-error", failed && dirty);
    panel.hidden = !dirty && !saved;

    if (button instanceof HTMLButtonElement) button.disabled = !dirty || busy;
    if (busy) setText(status, "Saving changes…");
    else if (failed && dirty) setText(status, "Settings were not saved. Review the error and try again.");
    else if (dirty) setText(status, `${Math.max(count, 1)} unsaved ${Math.max(count, 1) === 1 ? "change" : "changes"}`);
    else if (saved) setText(status, "Settings saved");
    else setText(status, "No unsaved changes");
  }

  function initializeBaseline(page) {
    const attendance = page.querySelector('[data-admin-attendance-reward-settings][data-attendance-reward-loaded="true"]');
    if (!attendance || state.baseline || attendanceDirty()) return;
    captureBaseline(page);
  }

  function resetForPage(page) {
    const gameId = selectedGameId();
    if (state.page === page && state.gameId === gameId) return;
    state.page = page;
    state.gameId = gameId;
    state.baseline = "";
    state.baselineValues = new Map();
    state.savedUntil = 0;
    page.removeAttribute("data-settings-ux-baseline-ready");
    window.clearTimeout(state.savedTimer);
  }

  function reconcile() {
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
    const saveArea = ensureSaveBar(page);
    initializeBaseline(page);
    renderSaveState(page, saveArea);

    page.dataset.settingsSimplifiedReady = "true";
    page.dataset.settingsUxReady = "true";
  }

  function scheduleReconcile() {
    if (state.reconcileQueued) return;
    state.reconcileQueued = true;
    window.requestAnimationFrame(() => {
      state.reconcileQueued = false;
      reconcile();
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const save = target?.closest('[data-admin-terminal-action="save-settings"]');
    if (save) scheduleReconcile();
  }, true);

  document.addEventListener("input", scheduleReconcile, true);
  document.addEventListener("change", scheduleReconcile, true);

  document.addEventListener("econovaria:attendance-reward-saved", () => {
    window.setTimeout(() => {
      const page = settingsPage();
      if (!(page instanceof HTMLElement)) return;
      captureBaseline(page);
      state.savedUntil = Date.now() + 1800;
      window.clearTimeout(state.savedTimer);
      state.savedTimer = window.setTimeout(scheduleReconcile, 1850);
      scheduleReconcile();
    }, 0);
  });

  const root = document.body || document.documentElement;
  if (root && typeof MutationObserver === "function") {
    new MutationObserver(scheduleReconcile).observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-attendance-reward-loaded",
        "data-attendance-reward-dirty",
        "data-admin-terminal-api-state",
        "aria-busy",
        "aria-pressed",
        "class",
      ],
    });
  }

  window.addEventListener("load", scheduleReconcile, { once: true });
  scheduleReconcile();

  window.EconovariaSimplifiedSettings = {
    reconcile,
    isDirty: () => {
      const page = settingsPage();
      return Boolean(page && state.baseline && (changedCount(page) > 0 || attendanceDirty()));
    },
  };
})();