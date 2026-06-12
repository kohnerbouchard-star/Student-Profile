(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  app.modules.itemUseService = {
    status: "inert",
    description: "Future item-use coordinator. Backend USE_ITEM remains authoritative."
  };
})(window);
