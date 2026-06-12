(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  // display-only
  function formatPercent(value) {
    if (value === undefined || value === null || value === "") return "Unavailable";

    const raw = String(value).trim();
    const number = Number(raw.replace("%", ""));
    if (!Number.isFinite(number)) return raw;

    const normalized = raw.includes("%") || Math.abs(number) > 1 ? number : number * 100;
    return `${normalized.toFixed(2)}%`;
  }

  app.modules.formatters = {
    status: "inert",
    formatPercent
  };
})(window);
