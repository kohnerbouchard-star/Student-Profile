(function (global) {
  global.ECONOVARIA_FRONTEND_CONFIG = global.ECONOVARIA_FRONTEND_CONFIG || {};

  // Controlled QA: Market News and Auth passed browser QA.
  // Market Profile is disabled after backend market data did not load correctly.
  // Store is disabled after backend item data did not load correctly.
  // Inventory is disabled after duplicate item blocks and unsafe use-item behavior.
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
