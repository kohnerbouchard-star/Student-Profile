(function (global) {
  global.ECONOVARIA_FRONTEND_CONFIG = global.ECONOVARIA_FRONTEND_CONFIG || {};

  global.ECONOVARIA_FRONTEND_CONFIG.FEATURE_FLAGS = Object.assign({
    useFrontendMarketNewsModule: false,
    useFrontendMarketProfileModule: false,
    useFrontendApiRetryModule: false,
    useFrontendSnapshotStoreModule: false,
    useFrontendTradingModule: false,
    useFrontendStoreModule: false,
    useFrontendInventoryModule: false,
    enableFrontendShadowChecks: false,
    enableFrontendStoreShadowChecks: false,
    enableFrontendInventoryShadowChecks: false
  }, global.ECONOVARIA_FRONTEND_CONFIG.FEATURE_FLAGS || {});
})(window);
