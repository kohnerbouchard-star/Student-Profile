(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const store = app.modules.store = app.modules.store || {};

  function normalizeKey(key) {
    return String(key || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function pick(row, keys) {
    if (typeof global.pick === "function") {
      return global.pick(row, keys);
    }

    if (!row) return "";

    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
        return row[key];
      }
    }

    const normalizedMap = {};
    Object.keys(row).forEach(function (key) {
      normalizedMap[normalizeKey(key)] = row[key];
    });

    for (let index = 0; index < keys.length; index += 1) {
      const normalized = normalizeKey(keys[index]);
      if (
        normalizedMap[normalized] !== undefined &&
        normalizedMap[normalized] !== null &&
        normalizedMap[normalized] !== ""
      ) {
        return normalizedMap[normalized];
      }
    }

    return "";
  }

  // display-only
  function toDisplayNumber(value) {
    if (typeof global.toNumber === "function") {
      return global.toNumber(value);
    }

    const number = Number(String(value ?? "").replace(/[$,%]/g, "").trim());
    return Number.isFinite(number) ? number : 0;
  }

  // display-only
  function normalizeStoreItem(row) {
    const source = row || {};

    return {
      raw: source,
      itemId: pick(source, ["itemId", "Item_ID", "Item ID", "id", "ID"]),
      itemName: pick(source, ["itemName", "Item_Name", "Item Name", "name", "Name"]),
      price: toDisplayNumber(pick(source, ["price", "Price"])),
      inventory: pick(source, ["inventory", "Inventory", "Stock", "stock"]),
      category: pick(source, ["category", "Category"]),
      description: pick(source, ["description", "Description", "Notes", "notes"])
    };
  }

  store.normalizerStatus = "extracted";
  store.normalizeStoreItem = normalizeStoreItem;

  app.modules.storeNormalizers = {
    status: "extracted",
    normalizeStoreItem
  };
})(window);
