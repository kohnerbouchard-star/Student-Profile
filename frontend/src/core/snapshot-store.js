(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  app.modules.snapshotStore = {
    status: "inert",
    description: "Future snapshot merge module. Backend snapshots remain the source of truth."
  };
})(window);
