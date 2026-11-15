window.createSettingsCopy = function createSettingsCopy(ownerScope) {
  "use strict";

  const { setText } = ownerScope;


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

  return {
    configureModifierLabels, concealAutomaticAttendancePolicyControls, attendanceRuleText,
    rewritePageCopy, rewriteSection,
  };
};
