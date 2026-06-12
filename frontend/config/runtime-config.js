(function (global) {
  global.ECONOVARIA_FRONTEND_CONFIG = global.ECONOVARIA_FRONTEND_CONFIG || {};

  // Controlled QA: add exactly one new frontend runtime module at a time.
  // Market News passed browser QA; Market Profile is now under live review.
  global.ECONOVARIA_FRONTEND_CONFIG.FEATURE_FLAGS = {
    useFrontendMarketNewsModule: true,
    useFrontendMarketProfileModule: true,
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
  };
})(window);
