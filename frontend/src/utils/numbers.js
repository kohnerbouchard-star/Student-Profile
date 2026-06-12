(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  // display-only
  function toDisplayNumber(value) {
    const number = Number(String(value ?? "").replace(/[$,%]/g, "").trim());
    return Number.isFinite(number) ? number : 0;
  }

  // display-only
  function formatNumber(value) {
    return toDisplayNumber(value).toLocaleString();
  }

  app.modules.numbers = {
    status: "inert",
    toDisplayNumber,
    formatNumber
  };
})(window);
