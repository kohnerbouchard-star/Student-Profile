(function (global) {
  global.ECONOVARIA_FRONTEND_CONFIG = global.ECONOVARIA_FRONTEND_CONFIG || {};

  global.ECONOVARIA_FRONTEND_CONFIG.FEATURE_FLAGS = Object.assign({
    useFrontendMarketNewsModule: true,
    useFrontendMarketProfileModule: false,
    useFrontendApiRetryModule: false,
    useFrontendSnapshotStoreModule: false,
    useFrontendTradingModule: false,
    useFrontendStoreModule: false,
    useFrontendInventoryModule: false,
    useFrontendDashboardModule: false,
    useFrontendProfileModule: false,
    useFrontendAuthModule: false,
    enableFrontendShadowChecks: false,
    enableFrontendMarketNewsShadowChecks: false,
    enableFrontendMarketProfileShadowChecks: false,
    enableFrontendApiRetryShadowChecks: false,
    enableFrontendSnapshotStoreShadowChecks: false,
    enableFrontendTradingShadowChecks: false,
    enableFrontendStoreShadowChecks: false,
    enableFrontendInventoryShadowChecks: false,
    enableFrontendDashboardShadowChecks: false,
    enableFrontendProfileShadowChecks: false,
    enableFrontendAuthShadowChecks: false
  }, global.ECONOVARIA_FRONTEND_CONFIG.FEATURE_FLAGS || {});
})(window);
