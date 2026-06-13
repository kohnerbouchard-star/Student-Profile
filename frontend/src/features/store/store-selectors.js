(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const store = app.modules.store = app.modules.store || {};

  function getState(sourceState) {
    return sourceState || global.state || {};
  }

  function normalizeItem(row) {
    return typeof store.normalizeStoreItem === "function"
      ? store.normalizeStoreItem(row)
      : row || {};
  }

  // display-only
  function getStoreItems(sourceState) {
    const rows = getState(sourceState).store;
    return (Array.isArray(rows) ? rows : []).map(normalizeItem);
  }

  // display-only
  function filterStoreItems(items, filters) {
    const config = filters || {};
    const search = String(config.search || "").trim().toLowerCase();
    const category = String(config.category || "").trim().toLowerCase();

    return (Array.isArray(items) ? items : []).filter(function (item) {
      const matchesSearch = !search || [
        item.itemName,
        item.itemId,
        item.description,
        item.category
      ].some(function (value) {
        return String(value || "").toLowerCase().includes(search);
      });
      const matchesCategory = !category || String(item.category || "").trim().toLowerCase() === category;

      return matchesSearch && matchesCategory;
    });
  }

  // display-only
  function sortStoreItems(items, sortKey) {
    const key = sortKey || "name";

    return (Array.isArray(items) ? items : []).slice().sort(function (a, b) {
      if (key === "price") {
        return Number(a.price || 0) - Number(b.price || 0);
      }

      if (key === "category") {
        return String(a.category || "").localeCompare(String(b.category || "")) ||
          String(a.itemName || "").localeCompare(String(b.itemName || ""));
      }

      return String(a.itemName || a.itemId || "").localeCompare(String(b.itemName || b.itemId || ""));
    });
  }

  // display-only
  function getStoreItemStatusClass(item) {
    const inventory = String((item && item.inventory) ?? "").trim();
    const quantity = Number(inventory);

    if (inventory === "") return "unknown";
    if (Number.isFinite(quantity) && quantity <= 0) return "empty";
    if (Number.isFinite(quantity) && quantity <= 3) return "low";
    return "available";
  }

  store.selectorStatus = "extracted";
  store.getStoreItems = getStoreItems;
  store.filterStoreItems = filterStoreItems;
  store.sortStoreItems = sortStoreItems;
  store.getStoreItemStatusClass = getStoreItemStatusClass;

  app.modules.storeSelectors = {
    status: "extracted",
    getStoreItems,
    filterStoreItems,
    sortStoreItems,
    getStoreItemStatusClass
  };
})(window);
