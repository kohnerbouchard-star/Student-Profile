(function (global) {
  global.ECONOVARIA_FRONTEND_CONFIG = global.ECONOVARIA_FRONTEND_CONFIG || {};

  global.ECONOVARIA_FRONTEND_CONFIG.FEATURE_FLAGS = Object.assign({
    useFrontendMarketNewsModule: false,
    useFrontendMarketProfileModule: false,
    useFrontendApiRetryModule: false,
    useFrontendSnapshotStoreModule: false,
    useFrontendTradingModule: false,
    enableFrontendShadowChecks: false
  }, global.ECONOVARIA_FRONTEND_CONFIG.FEATURE_FLAGS || {});
})(window);
