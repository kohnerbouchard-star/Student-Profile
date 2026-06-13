(function (global) {
  global.ECONOVARIA_FRONTEND_CONFIG = global.ECONOVARIA_FRONTEND_CONFIG || {};

  // Controlled QA: enable every extracted frontend runtime module.
  // Runtime consistency gates must prevent unsafe renderer replacement.
  global.ECONOVARIA_FRONTEND_CONFIG.FEATURE_FLAGS = {
    useFrontendMarketNewsModule: true,
    useFrontendMarketProfileModule: true,
    useFrontendApiRetryModule: true,
    useFrontendSnapshotStoreModule: true,
    useFrontendTradingModule: true,
    useFrontendStoreModule: true,
    useFrontendInventoryModule: true,
    useFrontendDashboardModule: true,
    useFrontendProfileModule: true,
    useFrontendAuthModule: true,
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
  };
})(window);
