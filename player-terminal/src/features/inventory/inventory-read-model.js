function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function titleCase(value, fallback = "") {
  return text(value, fallback)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function categoryImage(item) {
  const itemKey = text(item.itemKey).toLowerCase();
  const knownAssets = new Set([
    "advanced-fabricator",
    "data-chip",
    "energy-cell-pack",
    "emergency-repair-kit",
    "field-permit",
    "logistics-scanner",
    "market-lens",
    "priority-processing-token",
    "refined-alloy-bundle",
    "teacher-bonus-coupon",
    "workshop-access-pass"
  ]);
  if (knownAssets.has(itemKey)) return `./assets/store-items/${itemKey}.svg`;
  const category = text(item.category, "custom").toLowerCase();
  const fallback = category.startsWith("equipment")
    ? "equipment"
    : category.startsWith("material")
      ? "material"
      : category.startsWith("consumable")
        ? "consumable"
        : "custom";
  return `./assets/store-items/store-item-${fallback}.svg`;
}

function inventoryState(item) {
  const itemStatus = text(item.itemStatus, "active").toLowerCase();
  if (itemStatus !== "active") return titleCase(itemStatus, "Unavailable");
  const owned = number(item.quantityOwned);
  const reserved = number(item.quantityReserved);
  const available = number(item.quantityAvailable, Math.max(0, owned - reserved));
  if (owned > 0 && reserved >= owned) return "Reserved";
  if (reserved > 0) return "Partially Reserved";
  if (available > 0) return "Available";
  return "Unavailable";
}

export function normalizePlayerInventory(response) {
  const body = object(response);
  const items = list(body.items).map((value) => {
    const item = object(value);
    const quantityOwned = number(item.quantityOwned);
    const quantityReserved = number(item.quantityReserved);
    const quantityAvailable = number(item.quantityAvailable, Math.max(0, quantityOwned - quantityReserved));
    const unitValue = number(item.unitValue);
    const totalOwnedValue = number(item.totalOwnedValue, unitValue * quantityOwned);
    return {
      id: text(item.id),
      storeItemId: text(item.storeItemId),
      itemKey: text(item.itemKey),
      name: text(item.name, "Unnamed item"),
      description: text(item.description, "Inventory item"),
      category: titleCase(item.category, "Other"),
      quantity: quantityOwned,
      quantityOwned,
      quantityReserved,
      quantityAvailable,
      unitValue,
      value: totalOwnedValue,
      totalOwnedValue,
      currencyCode: text(item.currencyCode),
      itemStatus: text(item.itemStatus, "active"),
      itemVisibility: text(item.itemVisibility, "player"),
      state: inventoryState(item),
      availableActions: [...new Set(list(item.availableActions).map((action) => text(action).toLowerCase()).filter(Boolean))],
      image: categoryImage(item),
      createdAt: text(item.createdAt),
      updatedAt: text(item.updatedAt)
    };
  });

  const summary = object(body.summary);
  const capacity = body.capacity && typeof body.capacity === "object" ? object(body.capacity) : null;
  const categories = list(body.categories).map((category) => titleCase(category)).filter(Boolean);
  return {
    capacity,
    capacityUsed: capacity ? number(capacity.used) : null,
    capacityMax: capacity ? number(capacity.max) : null,
    categories: categories.length ? ["All", ...categories.filter((category) => category !== "All")] : ["All", ...new Set(items.map((item) => item.category))],
    summary: {
      itemTypes: number(summary.itemTypes, items.length),
      quantityOwned: number(summary.quantityOwned, items.reduce((total, item) => total + item.quantityOwned, 0)),
      quantityReserved: number(summary.quantityReserved, items.reduce((total, item) => total + item.quantityReserved, 0)),
      quantityAvailable: number(summary.quantityAvailable, items.reduce((total, item) => total + item.quantityAvailable, 0)),
      values: list(summary.values).map((value) => ({
        currencyCode: text(object(value).currencyCode),
        totalOwnedValue: number(object(value).totalOwnedValue)
      }))
    },
    items
  };
}
