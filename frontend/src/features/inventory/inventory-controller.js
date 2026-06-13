(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const inventory = app.modules.inventory = app.modules.inventory || {};

  function testInventoryModule(sourceState) {
    const state = sourceState || global.state || {};
    const rows = typeof inventory.getInventoryItems === "function" ? inventory.getInventoryItems(state) : [];
    const usableRows = typeof inventory.getUsableInventoryItems === "function" ? inventory.getUsableInventoryItems(state) : [];
    const html = typeof inventory.renderInventoryPanel === "function" ? inventory.renderInventoryPanel({ state }) : "";
    const required = [
      "normalizeInventoryItem",
      "getInventoryItems",
      "filterInventoryItems",
      "sortInventoryItems",
      "renderInventoryPanel",
      "renderInventoryItemRow",
      "renderInventoryEmptyState",
      "getInventoryItemStatusClass",
      "formatInventoryQuantity",
      "getUsableInventoryItems",
      "getItemUsePreview",
      "renderItemUseControls",
      "renderItemUseStatus",
      "classifyItemUsePermission"
    ];
    const missing = required.filter(function (name) {
      return typeof inventory[name] !== "function";
    });

    return {
      ok: missing.length === 0,
      missing,
      rawInventoryCount: Array.isArray(state.inventory) ? state.inventory.length : 0,
      normalizedInventoryCount: rows.length,
      usableInventoryCount: usableRows.length,
      renderedPanelHasUseControls: html.includes("useItemForm"),
      renderedPanelHasItems: html.includes("My Items")
    };
  }

  inventory.controllerStatus = "extracted";
  inventory.testInventoryModule = testInventoryModule;

  app.modules.inventoryController = {
    status: "extracted",
    testInventoryModule
  };
})(window);
