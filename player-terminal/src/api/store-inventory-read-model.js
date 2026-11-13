import { list, object, text, number } from "./read-model-values.js";

function categoryImage(item) {
  const itemKey = text(item?.itemKey).toLowerCase();
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
  const category = text(item?.category, "custom").toLowerCase();
  const fallback = category.startsWith("equipment")
    ? "equipment"
    : category.startsWith("material")
      ? "material"
      : category.startsWith("consumable")
        ? "consumable"
        : "custom";
  return `./assets/store-items/store-item-${fallback}.svg`;
}

function inventoryQuantity(inventoryByItem, itemKey, catalogItemKey = "") {
  const holding = inventoryByItem.get(itemKey) || inventoryByItem.get(catalogItemKey) || {};
  return number(holding.quantityOwned ?? holding.quantity);
}

function publicSellerOffer(value) {
  const offer = object(value);
  const sellerKind = text(offer.sellerKind).toLowerCase();
  return {
    offerKey: text(offer.offerKey),
    sellerKey: text(offer.sellerPartyKey || offer.sellerKey),
    sellerPartyKey: text(offer.sellerPartyKey || offer.sellerKey),
    sellerKind,
    sellerName: text(offer.sellerName, sellerKind === "business" ? "Player Business" : "Econovaria Store"),
    businessKey: offer.businessKey === null ? null : text(offer.businessKey) || null,
    businessName: offer.businessName === null ? null : text(offer.businessName) || null,
    unitPrice: number(offer.unitPrice),
    currencyCode: text(offer.currencyCode).toUpperCase(),
    availableQuantity: Math.max(0, Math.trunc(number(offer.availableQuantity))),
    status: text(offer.status, "active").toLowerCase(),
    purchasability: text(offer.purchasability),
    purchasable: offer.purchasable === true,
    version: Math.max(1, Math.trunc(number(offer.version, 1))),
  };
}

function normalizedSeededStoreItem(item, inventoryByItem) {
  const itemKey = text(item.itemKey || item.id || item.itemId);
  return {
    id: itemKey,
    itemKey,
    catalogItemKey: "",
    canonicalItemKey: itemKey,
    storeItemKey: itemKey,
    name: text(item.name, "Unnamed item"),
    category: text(item.category, "Other"),
    price: number(item.price),
    bestOfferKey: null,
    bestUnitPrice: null,
    stock: 0,
    totalAvailableQuantity: 0,
    sellerCount: 0,
    offerCount: 0,
    offers: [],
    currencyCode: text(item.currencyCode).toUpperCase(),
    owned: inventoryQuantity(inventoryByItem, itemKey),
    image: text(item.image, categoryImage(item)),
    description: text(item.description, "No description is available."),
    updatedAt: text(item.updatedAt)
  };
}

function normalizedCatalogProduct(product, seededItem, inventoryByItem) {
  const itemKey = text(product.storeItemKey || seededItem?.itemKey || seededItem?.id);
  const catalogItemKey = text(product.catalogItemKey);
  const offers = list(product.offers).map(publicSellerOffer);
  const activeOffers = offers.filter((offer) => offer.status === "active" && offer.purchasable === true && offer.availableQuantity > 0);
  const activeCurrencies = new Set(activeOffers.map((offer) => offer.currencyCode));
  const comparablePrices = activeCurrencies.size <= 1;
  const prices = activeOffers.map((offer) => offer.unitPrice).filter((price) => Number.isFinite(price) && price >= 0);
  const totalAvailableQuantity = activeOffers.reduce((sum, offer) => sum + offer.availableQuantity, 0);
  const bestUnitPrice = comparablePrices && prices.length ? Math.min(...prices) : null;
  const bestOfferKey = activeOffers.find((offer) => offer.unitPrice === bestUnitPrice)?.offerKey ?? null;
  const currencyCode = text(product.currencyCode || seededItem?.currencyCode).toUpperCase();
  return {
    id: itemKey,
    itemKey,
    catalogItemKey,
    canonicalItemKey: text(product.canonicalItemKey, itemKey),
    storeItemKey: itemKey,
    name: text(product.name || seededItem?.name, "Unnamed item"),
    category: text(product.category || seededItem?.category, "Other"),
    price: bestUnitPrice ?? number(seededItem?.price),
    bestOfferKey,
    bestUnitPrice,
    stock: totalAvailableQuantity,
    totalAvailableQuantity,
    sellerCount: new Set(activeOffers.map((offer) => offer.sellerKey)).size,
    offerCount: offers.length,
    offers,
    currencyCode,
    owned: inventoryQuantity(inventoryByItem, itemKey, catalogItemKey),
    image: text(seededItem?.image, categoryImage({ ...product, itemKey })),
    description: text(product.description || seededItem?.description, "No description is available."),
    updatedAt: text(product.updatedAt || seededItem?.updatedAt)
  };
}

function normalizedStoreItems(response, inventoryRows = []) {
  const body = object(response);
  const inventoryByItem = new Map();
  for (const holding of list(inventoryRows)) {
    for (const key of [holding.itemId, holding.storeItemId, holding.itemKey, holding.catalogItemKey]) {
      if (text(key)) inventoryByItem.set(text(key), holding);
    }
  }
  const seededItems = list(body.items || body.listings);
  const seededByKey = new Map(seededItems.map((item) => [
    text(item.itemKey || item.id || item.itemId),
    item
  ]).filter(([key]) => key));
  const usedSeededKeys = new Set();
  const products = list(body.products).map((product) => {
    const key = text(product.storeItemKey);
    const seededItem = seededByKey.get(key);
    if (seededItem) usedSeededKeys.add(key);
    return normalizedCatalogProduct(product, seededItem, inventoryByItem);
  });
  for (const [key, item] of seededByKey) {
    if (!usedSeededKeys.has(key)) products.push(normalizedSeededStoreItem(item, inventoryByItem));
  }
  return products;
}

function storeItemsFromSnapshot(snapshot) {
  const store = object(object(snapshot.me).store);
  return normalizedStoreItems(
    { items: list(store.listings), products: list(store.products) },
    list(store.inventory),
  );
}

export function normalizeStore(snapshot) {
  const items = storeItemsFromSnapshot(snapshot);
  return {
    categories: ["All", ...new Set(items.map((item) => item.category).filter(Boolean))],
    items
  };
}

export function normalizeInventory(snapshot) {
  const store = object(object(snapshot.me).store);
  const catalogById = new Map(list(store.listings).map((item) => [item.id || item.itemId, item]));
  const items = list(store.inventory).map((holding) => {
    const catalogItem = catalogById.get(holding.itemId) || {};
    const quantity = number(holding.quantityOwned);
    return {
      id: text(holding.inventoryId),
      storeItemId: text(holding.itemId),
      name: text(holding.itemName || catalogItem.name, "Unnamed item"),
      category: text(catalogItem.category, "Other"),
      quantity,
      value: number(catalogItem.price) * quantity,
      state: number(holding.quantityReserved) > 0 ? "Reserved" : "Stored",
      image: categoryImage(catalogItem),
      description: text(catalogItem.description, "Inventory item"),
      availableActions: []
    };
  });
  return {
    capacity: null,
    capacityUsed: null,
    capacityMax: null,
    categories: ["All", ...new Set(items.map((item) => item.category).filter(Boolean))],
    items
  };
}

export function normalizeInventoryRead(response) {
  const body = object(response);
  const items = list(body.items).map((item) => ({
    id: text(item.id),
    storeItemId: text(item.storeItemId),
    name: text(item.name, "Unnamed item"),
    category: text(item.category, "Other"),
    quantity: number(item.quantityOwned),
    quantityReserved: number(item.quantityReserved),
    quantityAvailable: number(item.quantityAvailable),
    value: number(item.totalOwnedValue),
    unitValue: number(item.unitValue),
    currencyCode: text(item.currencyCode),
    state: number(item.quantityReserved) > 0 ? "Reserved" : "Stored",
    image: categoryImage(item),
    description: text(item.description, "Inventory item"),
    availableActions: list(item.availableActions)
  }));
  const capacity = body.capacity && typeof body.capacity === "object" ? body.capacity : null;
  return {
    capacity,
    capacityUsed: capacity ? number(capacity.used) : null,
    capacityMax: capacity ? number(capacity.max) : null,
    categories: list(body.categories).length
      ? list(body.categories)
      : ["All", ...new Set(items.map((item) => item.category).filter(Boolean))],
    summary: object(body.summary),
    items
  };
}
