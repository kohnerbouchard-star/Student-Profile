(function (global) {
  global.ECONOVARIA_FRONTEND_CONFIG = global.ECONOVARIA_FRONTEND_CONFIG || {};

  // Stable QA baseline: keep helper modules that passed browser QA.
  // Full-page renderer modules stay disabled until their copy and legacy-slot behavior match the backend-fed UI.
  global.ECONOVARIA_FRONTEND_CONFIG.FEATURE_FLAGS = {
    useFrontendMarketNewsModule: true,
    useFrontendMarketProfileModule: false,
    useFrontendApiRetryModule: false,
    useFrontendSnapshotStoreModule: false,
    useFrontendTradingModule: false,
    useFrontendStoreModule: false,
    useFrontendInventoryModule: false,
    useFrontendDashboardModule: false,
    useFrontendProfileModule: false,
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
