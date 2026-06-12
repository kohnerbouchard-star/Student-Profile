(function (global) {
  global.ECONOVARIA_FRONTEND_CONFIG = global.ECONOVARIA_FRONTEND_CONFIG || {};

  global.ECONOVARIA_FRONTEND_CONFIG.FEATURE_FLAGS = Object.assign({
    useFrontendMarketNewsModule: false,
    enableFrontendShadowChecks: false
  }, global.ECONOVARIA_FRONTEND_CONFIG.FEATURE_FLAGS || {});
})(window);
