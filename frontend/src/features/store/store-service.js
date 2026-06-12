(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const store = app.modules.store = app.modules.store || {};

  function getState(sourceState) {
    return sourceState || global.state || {};
  }

  // validation-preview-only
  function getStorePurchasePreview(root) {
    const documentRoot = root || global.document;
    const itemInput = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("storeItem")
      : null;
    const quantityInput = documentRoot && documentRoot.getElementById
      ? documentRoot.getElementById("storeQty")
      : null;
    const quantity = Number(quantityInput && quantityInput.value || 1);

    return {
      itemId: itemInput && itemInput.value || "",
      quantity,
      isQuantityPreviewValid: Number.isFinite(quantity) && quantity >= 1
    };
  }

  // display-only
  function getStorePurchaseRows(sourceState, limit) {
    const state = getState(sourceState);
    const rows = Array.isArray(state.transactions) ? state.transactions : [];
    const maxRows = Number.isFinite(Number(limit)) ? Number(limit) : 12;

    return rows
      .filter(function (row) {
        return String(row && row.mode || "").toUpperCase() === "STORE_PURCHASE";
      })
      .slice(0, Math.max(0, maxRows));
  }

  store.serviceStatus = "extracted";
  store.getStorePurchasePreview = getStorePurchasePreview;
  store.getStorePurchaseRows = getStorePurchaseRows;

  app.modules.storeService = {
    status: "extracted",
    description: "Store display and preview helpers. Backend STORE_PURCHASE remains authoritative.",
    getStorePurchasePreview,
    getStorePurchaseRows
  };
})(window);
