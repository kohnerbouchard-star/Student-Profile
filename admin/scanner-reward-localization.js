(function initEconovariaScannerRewardLocalization() {
  "use strict";


  function text(value) {
    return String(value ?? "").trim();
  }

  function amount(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function presentReward(payload, expectedElement) {
    const source = payload && typeof payload === "object" ? payload : {};
    const reward = source.reward || source.data?.reward;
    const attendance = source.attendance || source.data?.attendance;
    if (!reward || typeof reward !== "object") return;

    window.setTimeout(() => {
      const element = document.querySelector("[data-admin-terminal-last-scan-reward]");
      if (!element || element !== expectedElement) return;
      const rewardAmount = amount(reward.amount);
      const currencyCode = (text(reward.currencyCode || reward.currency_code) || "ECO").toUpperCase();
      const wasCreated = attendance?.wasCreated ?? attendance?.was_created;
      const ledgerEntryId = text(reward.ledgerEntryId || reward.ledger_entry_id);

      if (wasCreated === false || (!ledgerEntryId && rewardAmount === 0)) {
        element.textContent = "Already recorded";
        element.classList.add("is-neutral");
      } else if (rewardAmount > 0) {
        element.textContent = `+${rewardAmount.toFixed(2)} ${currencyCode}`;
        element.classList.remove("is-neutral");
      } else {
        element.textContent = `0.00 ${currencyCode}`;
        element.classList.add("is-neutral");
      }

      const base = amount(reward.configuredBaseAmount ?? reward.configured_base_amount);
      const baseCode = (text(reward.baseCurrencyCode || reward.base_currency_code) || "ECO").toUpperCase();
      const income = amount(reward.incomeModifier ?? reward.income_modifier) || 1;
      const exchange = amount(reward.exchangeRateIndex ?? reward.exchange_rate_index) || 1;
      const country = text(reward.countryCode || reward.country_code);
      element.title = country
        ? `${base.toFixed(2)} ${baseCode} × ${income.toFixed(2)} difficulty × ${exchange.toFixed(2)} ${country} exchange`
        : `${base.toFixed(2)} ${baseCode} × ${income.toFixed(2)} difficulty`;
      element.dataset.adminScannerRewardCurrency = currencyCode;
    }, 0);
  }

  window.EconovariaClassroomWriteFallback.observeAttendanceResponses(() => {
    const element = document.querySelector("[data-admin-terminal-last-scan-reward]");
    return element ? (payload) => presentReward(payload, element) : null;
  });
})();
