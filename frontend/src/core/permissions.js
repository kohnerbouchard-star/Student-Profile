(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  app.modules.permissions = {
    status: "inert",
    description: "Future permission display helpers. Backend authorization remains authoritative."
  };
})(window);
