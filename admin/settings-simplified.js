(function initEconovariaSimplifiedSettings() {
  "use strict";

  const STYLE_ID = "econovaria-settings-simplified-style";
  let reconcileQueued = false;

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
    return document.querySelector(".admin-terminal-settings-page");
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

    if (difficulty instanceof HTMLSelectElement) difficulty.value = "true";
    if (currency instanceof HTMLSelectElement) currency.value = "player_country";

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
    const incomeText = Number.isFinite(income) ? `${income.toFixed(2)}×` : "1.00×";
    const presentText = Number.isFinite(present) ? present.toFixed(2) : "0.00";
    const lateText = Number.isFinite(late) ? late.toFixed(2) : "0.00";
    return `${presentText} present · ${lateText} late · ${incomeText} Income Modifier → player country currency`;
  }

  function ensureEconomyGroup(page) {
    const grid = page.querySelector(".admin-terminal-settings-tuning-grid");
    const money = grid?.querySelector(".admin-terminal-settings-tuning-card.is-money");
    const attendance = page.querySelector("[data-admin-attendance-reward-settings]");
    if (!(grid instanceof HTMLElement) || !(money instanceof HTMLElement) || !(attendance instanceof HTMLElement)) {
      return;
    }

    let group = grid.querySelector("[data-settings-economy-group]");
    if (!(group instanceof HTMLElement)) {
      group = document.createElement("section");
      group.className = "admin-terminal-settings-economy-group";
      group.dataset.settingsEconomyGroup = "true";
      group.innerHTML = `
        <header class="admin-terminal-settings-group-header">
          <div><span>Economy & rewards</span><strong>Prices, income, tax, and attendance</strong></div>
          <small>One income rule applies consistently across every player reward.</small>
        </header>
        <div class="admin-terminal-settings-economy-grid"></div>`;
      grid.insertBefore(group, money);
    }

    const groupGrid = group.querySelector(".admin-terminal-settings-economy-grid");
    if (!(groupGrid instanceof HTMLElement)) return;
    if (money.parentElement !== groupGrid) groupGrid.append(money);
    if (attendance.parentElement !== groupGrid) groupGrid.append(attendance);

    money.classList.add("is-settings-economy-core");
    attendance.classList.add("is-settings-attendance-base");
    money.querySelector(".admin-terminal-settings-change-list")?.classList.add("is-economy-controls");

    setText(money.querySelector(":scope > header > span"), "Economy controls");
    setText(money.querySelector(":scope > header > strong"), "Prices · income · tax");
    setText(attendance.querySelector(":scope > header > span"), "Attendance");
    setText(attendance.querySelector(":scope > header > strong"), "Base rewards");

    const presentHelp = attendance.querySelector(
      '[data-attendance-reward-field="presentRewardAmount"]',
    )?.closest("label")?.querySelector("small");
    const lateHelp = attendance.querySelector(
      '[data-attendance-reward-field="lateRewardAmount"]',
    )?.closest("label")?.querySelector("small");
    setText(presentHelp, "Base amount before the global Income Modifier is applied.");
    setText(lateHelp, "Use 0.00 when late arrivals should not earn a reward.");

    forceAutomaticAttendancePolicy(attendance);

    const formula = attendance.querySelector("[data-attendance-reward-formula]");
    setText(formula?.querySelector("strong"), "Automatic payout rule");
    setText(formula?.querySelector("span"), attendanceRuleText(page));
  }

  function rewritePageCopy(page) {
    const strip = page.querySelector(".admin-terminal-settings-control-strip");
    setText(strip?.querySelector(":scope > div > span"), "Difficulty presets");
    setText(strip?.querySelector(":scope > div > strong"), "Choose a starting point");
    setText(
      strip?.querySelector(":scope > div > small"),
      "A preset configures the whole simulation. Adjust any field below to create a Custom setup.",
    );

    const mainHeader = page.querySelector(".admin-terminal-settings-main-panel > header");
    setText(mainHeader?.querySelector("div > span"), "Manual controls");
    setText(mainHeader?.querySelector("div > h3"), "Fine-tune the game");
    setText(
      mainHeader?.querySelector("div > p"),
      "Change only what you need. Global rules are reused instead of duplicated in each feature.",
    );
    setText(mainHeader?.querySelector(":scope > strong"), "Custom setup");

    const events = page.querySelector(".admin-terminal-settings-tuning-card.is-events");
    setText(events?.querySelector(":scope > header > span"), "Events");
    setText(events?.querySelector(":scope > header > strong"), "Frequency · severity · direction");

    const safety = page.querySelector(".admin-terminal-settings-tuning-card.is-safety");
    setText(safety?.querySelector(":scope > header > span"), "Recovery & rollout");
    setText(safety?.querySelector(":scope > header > strong"), "Support · pacing");
  }

  function simplifySaveArea(page) {
    const detail = page.querySelector(".admin-terminal-settings-detail-panel");
    const panel = detail?.querySelector(".admin-terminal-settings-save-panel-v543") ||
      page.querySelector(".admin-terminal-settings-save-panel-v543");
    if (!(panel instanceof HTMLElement)) return;

    panel.classList.add("admin-terminal-settings-save-bar");
    if (panel.parentElement !== page) page.append(panel);
    setText(
      panel.querySelector("small"),
      "Save the selected preset, manual adjustments, and attendance base rewards for this game.",
    );
    if (detail instanceof HTMLElement) detail.hidden = true;
  }

  function reconcile() {
    ensureStylesheet();
    const page = settingsPage();
    if (!(page instanceof HTMLElement)) return;

    page.classList.add("is-settings-simplified");
    rewritePageCopy(page);
    configureModifierLabels(page);
    ensureEconomyGroup(page);
    simplifySaveArea(page);
    page.dataset.settingsSimplifiedReady = "true";
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
    new MutationObserver(scheduleReconcile).observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-attendance-reward-loaded", "data-admin-terminal-api-state"],
    });
  }

  document.addEventListener("input", scheduleReconcile, true);
  document.addEventListener("change", scheduleReconcile, true);
  window.addEventListener("load", scheduleReconcile, { once: true });
  scheduleReconcile();

  window.EconovariaSimplifiedSettings = { reconcile };
})();