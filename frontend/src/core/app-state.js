(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  app.modules.appState = {
    status: "inert",
    description: "Future state coordination module. Selectors must not mutate source state."
  };
})(window);
