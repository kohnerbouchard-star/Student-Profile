(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const inventory = app.modules.inventory = app.modules.inventory || {};

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
  function normalizeInventoryItem(row) {
    const source = row || {};

    return {
      raw: source,
      itemId: pick(source, ["itemId", "Item_ID", "Item ID", "id", "ID"]),
      itemName: pick(source, ["itemName", "Item_Name", "Item Name", "Name", "name"]),
      category: pick(source, ["category", "Category"]),
      quantityPurchased: toDisplayNumber(pick(source, ["quantityPurchased", "Quantity_Purchased", "Quantity Purchased", "Qty", "qty", "Quantity", "quantity"])),
      totalSpent: toDisplayNumber(pick(source, ["totalSpent", "Total_Spent", "Total Spent", "Amount", "amount"])),
      lastPurchased: pick(source, ["lastPurchased", "Last_Purchased", "Last Purchased", "Last_Updated", "Last Updated", "Timestamp", "timestamp"])
    };
  }

  inventory.normalizerStatus = "extracted";
  inventory.normalizeInventoryItem = normalizeInventoryItem;

  app.modules.inventoryNormalizers = {
    status: "extracted",
    normalizeInventoryItem
  };
})(window);
