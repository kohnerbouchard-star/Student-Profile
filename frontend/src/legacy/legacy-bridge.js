(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  app.modules.legacyBridge = {
    status: "inert",
    description: "Future guarded bridge. No legacy runtime functions are patched here yet."
  };
})(window);
