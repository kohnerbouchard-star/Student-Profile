(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  app.modules.legacyGlobals = {
    status: "inert",
    description: "Future compatibility helpers for root script-tag globals."
  };
})(window);
