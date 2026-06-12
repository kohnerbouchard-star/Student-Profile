(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const store = app.modules.store = app.modules.store || {};

  function testStoreModule(sourceState) {
    const state = sourceState || global.state || {};
    const rows = typeof store.getStoreItems === "function" ? store.getStoreItems(state) : [];
    const html = typeof store.renderStorePanel === "function" ? store.renderStorePanel({ state }) : "";
    const required = [
      "normalizeStoreItem",
      "getStoreItems",
      "filterStoreItems",
      "sortStoreItems",
      "renderStorePanel",
      "renderStoreItemCard",
      "renderStoreItemList",
      "getStoreItemStatusClass",
      "formatStorePrice"
    ];
    const missing = required.filter(function (name) {
      return typeof store[name] !== "function";
    });

    return {
      ok: missing.length === 0,
      missing,
      rawStoreCount: Array.isArray(state.store) ? state.store.length : 0,
      normalizedStoreCount: rows.length,
      renderedPanelHasForm: html.includes("storeForm"),
      renderedPanelHasList: html.includes("Shop Items")
    };
  }

  store.controllerStatus = "extracted";
  store.testStoreModule = testStoreModule;

  app.modules.storeController = {
    status: "extracted",
    testStoreModule
  };
})(window);
