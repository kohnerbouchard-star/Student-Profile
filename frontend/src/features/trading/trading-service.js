(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  app.modules.tradingService = {
    status: "inert",
    description: "Future trade coordinator. Backend STOCK_TRADE remains authoritative."
  };
})(window);
