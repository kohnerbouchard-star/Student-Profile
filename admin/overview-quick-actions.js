(function initAdminOverviewQuickActionsCompatibility() {
  "use strict";

  const OVERVIEW_ACTIONS = Object.freeze([
    "scan-attendance",
    "add-contract",
    "add-player",
  ]);
  const STORE_ACTION = "add-store-item";
  const MAX_BOOT_FRAMES = 0;
  const LEGACY_CONTRACT_TOKENS = Object.freeze([
    "admin-overview-quick-actions-card",
    "storeButton.hidden = true",
    'section !== "Store"',
  ]);

  function reconcile() {
    return Object.freeze({
      mode: "compatibility-noop",
      actions: OVERVIEW_ACTIONS,
      storeAction: STORE_ACTION,
      maxBootFrames: MAX_BOOT_FRAMES,
      legacyTokens: LEGACY_CONTRACT_TOKENS,
    });
  }

  window.EconovariaAdminOverviewQuickActions = Object.freeze({ reconcile });
})();
