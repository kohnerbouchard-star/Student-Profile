(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  // display-only
  function parseCurrencyInput(value) {
    if (value === undefined || value === null || value === "") return 0;
    const number = Number(String(value).replace(/[$,]/g, "").trim());
    return Number.isFinite(number) ? number : 0;
  }

  // display-only
  function roundCurrency(value) {
    return Math.round(parseCurrencyInput(value) * 100) / 100;
  }

  // display-only
  function formatCurrency(value) {
    return roundCurrency(value).toLocaleString(undefined, {
      style: "currency",
      currency: "USD"
    });
  }

  // display-only
  function formatSignedCurrency(value) {
    const rounded = roundCurrency(value);
    const formatted = formatCurrency(Math.abs(rounded));
    return `${rounded >= 0 ? "+" : "-"}${formatted}`;
  }

  app.modules.currency = {
    status: "inert",
    formatCurrency,
    formatSignedCurrency,
    parseCurrencyInput,
    roundCurrency
  };
})(window);
