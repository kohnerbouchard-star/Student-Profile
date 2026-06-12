(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  app.modules.marketService = {
    status: "inert",
    description: "Future market data coordinator. Official prices and news remain backend data."
  };
})(window);
