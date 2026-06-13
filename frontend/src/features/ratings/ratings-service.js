(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  app.modules.ratingsService = {
    status: "inert",
    description: "Future ratings coordinator. Backend SUBMIT_RATING remains authoritative."
  };
})(window);
