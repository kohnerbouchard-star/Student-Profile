(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  // display-only
  function parseDateValue(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();

    const parsed = Date.parse(String(value).trim().replace(/\./g, "-").replace(" ", "T"));
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  // display-only
  function formatDateTime(value) {
    const parsed = parseDateValue(value);
    if (!parsed) return "Unavailable";

    return new Date(parsed).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  app.modules.dates = {
    status: "inert",
    parseDateValue,
    formatDateTime
  };
})(window);
