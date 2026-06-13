(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const inventory = app.modules.inventory = app.modules.inventory || {};

  function getState(sourceState) {
    return sourceState || global.state || {};
  }

  function normalizeItem(row) {
    return typeof inventory.normalizeInventoryItem === "function"
      ? inventory.normalizeInventoryItem(row)
      : row || {};
  }

  // display-only
  function getInventoryItems(sourceState) {
    const rows = getState(sourceState).inventory;
    return (Array.isArray(rows) ? rows : []).map(normalizeItem);
  }

  // display-only
  function getUsableInventoryItems(sourceState) {
    return getInventoryItems(sourceState).filter(function (item) {
      const quantity = Number(item.quantityPurchased || 0);
      const hasName = String(item.itemName || item.itemId || "").trim() !== "";
      return hasName && quantity > 0;
    });
  }

  // display-only
  function filterInventoryItems(items, filters) {
    const config = filters || {};
    const search = String(config.search || "").trim().toLowerCase();
    const onlyUsable = config.onlyUsable === true;

    return (Array.isArray(items) ? items : []).filter(function (item) {
      const matchesSearch = !search || [
        item.itemName,
        item.itemId,
        item.category
      ].some(function (value) {
        return String(value || "").toLowerCase().includes(search);
      });
      const matchesUsable = !onlyUsable || Number(item.quantityPurchased || 0) > 0;

      return matchesSearch && matchesUsable;
    });
  }

  // display-only
  function sortInventoryItems(items, sortKey) {
    const key = sortKey || "name";

    return (Array.isArray(items) ? items : []).slice().sort(function (a, b) {
      if (key === "quantity") {
        return Number(b.quantityPurchased || 0) - Number(a.quantityPurchased || 0);
      }

      if (key === "recent") {
        return Date.parse(b.lastPurchased || "") - Date.parse(a.lastPurchased || "");
      }

      return String(a.itemName || a.itemId || "").localeCompare(String(b.itemName || b.itemId || ""));
    });
  }

  // display-only
  function getInventoryItemStatusClass(item) {
    const quantity = Number(item && item.quantityPurchased || 0);

    if (quantity <= 0) return "empty";
    if (quantity === 1) return "low";
    return "available";
  }

  inventory.selectorStatus = "extracted";
  inventory.getInventoryItems = getInventoryItems;
  inventory.getUsableInventoryItems = getUsableInventoryItems;
  inventory.filterInventoryItems = filterInventoryItems;
  inventory.sortInventoryItems = sortInventoryItems;
  inventory.getInventoryItemStatusClass = getInventoryItemStatusClass;

  app.modules.inventorySelectors = {
    status: "extracted",
    getInventoryItems,
    getUsableInventoryItems,
    filterInventoryItems,
    sortInventoryItems,
    getInventoryItemStatusClass
  };
})(window);
