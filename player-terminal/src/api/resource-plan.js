export const SHELL_REQUIRED_RESOURCES = Object.freeze(["session", "dashboard"]);
export const SHELL_OPTIONAL_RESOURCES = Object.freeze(["notifications"]);

export const ROUTE_RESOURCE_PLAN = Object.freeze({
  dashboard: Object.freeze({
    required: Object.freeze(["dashboard", "countries"]),
    optional: Object.freeze(["news", "market", "portfolio", "contracts", "messages", "banking", "inventory"])
  }),
  world: Object.freeze({ required: Object.freeze(["countries"]), optional: Object.freeze(["worldRuntime", "storyDeliveries"]) }),
  news: Object.freeze({ required: Object.freeze(["news"]), optional: Object.freeze([]) }),
  market: Object.freeze({ required: Object.freeze(["market"]), optional: Object.freeze(["news", "banking", "bankingFx", "portfolio", "countries"]) }),
  portfolio: Object.freeze({ required: Object.freeze(["portfolio"]), optional: Object.freeze(["market"]) }),
  business: Object.freeze({
    required: Object.freeze(["business", "countries"]),
    optional: Object.freeze(["businessWorkforce", "store"]),
    dependent: Object.freeze(["businessTreasury", "businessStockroom", "businessRecipes", "businessEquipment"]),
  }),
  contracts: Object.freeze({ required: Object.freeze(["contracts"]), optional: Object.freeze([]) }),
  store: Object.freeze({ required: Object.freeze(["store"]), optional: Object.freeze(["banking", "bankingFx", "inventory"]) }),
  marketplace: Object.freeze({ required: Object.freeze(["marketplace"]), optional: Object.freeze(["inventory", "banking", "bankingFx"]) }),
  inventory: Object.freeze({ required: Object.freeze(["inventory"]), optional: Object.freeze([]) }),
  crafting: Object.freeze({ required: Object.freeze(["crafting"]), optional: Object.freeze(["inventory"]) }),
  banking: Object.freeze({ required: Object.freeze(["banking"]), optional: Object.freeze(["bankingFx"]) }),
  loans: Object.freeze({ required: Object.freeze(["loans"]), optional: Object.freeze(["banking"]) }),
  messages: Object.freeze({ required: Object.freeze(["messages"]), optional: Object.freeze([]) }),
  progression: Object.freeze({ required: Object.freeze(["progression"]), optional: Object.freeze([]) }),
  profile: Object.freeze({ required: Object.freeze(["session"]), optional: Object.freeze([]) })
});

export const WRITE_INVALIDATIONS = Object.freeze({
  arrivalClass: Object.freeze(["worldRuntime", "dashboard"]),
  travelQuote: Object.freeze([]),
  travelExecute: Object.freeze(["worldRuntime", "dashboard", "banking"]),
  travelComplete: Object.freeze(["worldRuntime", "dashboard"]),
  residencyRequest: Object.freeze(["worldRuntime", "dashboard"]),
  businessCreate: Object.freeze(["dashboard", "business", "banking", "businessTreasury"]),
  businessProductCreate: Object.freeze(["business"]),
  businessProduction: Object.freeze(["dashboard", "business", "banking", "inventory"]),
  businessManufacturingStart: Object.freeze(["dashboard", "business", "businessStockroom", "businessEquipment", "inventory"]),
  businessManufacturingCancel: Object.freeze(["dashboard", "business", "businessStockroom", "businessEquipment", "inventory"]),
  businessPrice: Object.freeze(["business"]),
  businessCandidateHire: Object.freeze(["dashboard", "business", "businessWorkforce", "banking"]),
  businessTerminate: Object.freeze(["dashboard", "business", "banking"]),
  businessStatus: Object.freeze(["dashboard", "business", "banking"]),
  businessTreasuryAccountOpen: Object.freeze(["businessTreasury"]),
  businessTreasuryFxQuote: Object.freeze([]),
  businessTreasuryFxStandard: Object.freeze(["businessTreasury"]),
  businessTreasuryFxInstant: Object.freeze(["businessTreasury"]),
  businessTreasuryFxCancel: Object.freeze(["businessTreasury"]),
  businessStoreQuote: Object.freeze([]),
  businessStorePurchase: Object.freeze([
    "dashboard",
    "business",
    "businessStockroom",
    "businessTreasury",
    "store",
    "inventory",
  ]),
  marketOrder: Object.freeze(["dashboard", "market", "portfolio", "banking", "bankingFx"]),
  marketWatchlist: Object.freeze(["market"]),
  storePurchase: Object.freeze(["dashboard", "store", "inventory", "banking", "bankingFx"]),
  storeOfferPurchase: Object.freeze(["dashboard", "store", "inventory", "banking", "bankingFx"]),
  marketplaceActivate: Object.freeze(["marketplace", "inventory"]),
  marketplacePurchase: Object.freeze([]),
  marketplaceSettlement: Object.freeze(["dashboard", "marketplace", "inventory", "banking", "bankingFx"]),
  marketplaceListing: Object.freeze(["marketplace", "inventory"]),
  marketplaceCancel: Object.freeze(["marketplace", "inventory"]),
  marketplaceDispute: Object.freeze(["marketplace"]),
  contractAccept: Object.freeze(["dashboard", "contracts"]),
  contractSubmit: Object.freeze(["dashboard", "contracts"]),
  inventoryUse: Object.freeze(["dashboard", "inventory"]),
  craftItem: Object.freeze(["dashboard", "crafting", "inventory", "banking"]),
  craftCancel: Object.freeze(["crafting", "inventory"]),
  craftClaim: Object.freeze(["dashboard", "crafting", "inventory"]),
  itemEffectUse: Object.freeze(["dashboard", "crafting", "inventory"]),
  equipmentEquip: Object.freeze(["crafting", "inventory"]),
  itemSalvage: Object.freeze(["crafting", "inventory"]),
  bankTransfer: Object.freeze(["dashboard", "banking"]),
  savingsTransfer: Object.freeze(["dashboard", "banking"]),
  bankingFxQuote: Object.freeze([]),
  bankingFxStandard: Object.freeze(["dashboard", "banking", "bankingFx"]),
  bankingFxInstant: Object.freeze(["dashboard", "banking", "bankingFx"]),
  bankingFxCancel: Object.freeze(["banking", "bankingFx"]),
  loanApply: Object.freeze(["dashboard", "banking", "loans"]),
  loanRepay: Object.freeze(["dashboard", "banking", "loans"]),
  messageThreadCreate: Object.freeze(["dashboard", "messages", "notifications"]),
  messageSend: Object.freeze(["dashboard", "messages", "notifications"]),
  messageRead: Object.freeze(["dashboard", "messages", "notifications"]),
  progressionUnlock: Object.freeze(["dashboard", "progression"]),
  progressionClaim: Object.freeze(["dashboard", "progression", "inventory", "banking"]),
  notificationsRead: Object.freeze(["dashboard", "notifications"]),
  storyDeliveryState: Object.freeze(["storyDeliveries"])
});

export const IDEMPOTENT_WRITE_ENDPOINTS = Object.freeze(new Set([
  ...Object.keys(WRITE_INVALIDATIONS),
  "storeQuote",
  "storeOfferQuote",
]));

export function resourcesForRoute(route) {
  return ROUTE_RESOURCE_PLAN[route] || ROUTE_RESOURCE_PLAN.dashboard;
}

export function dependentResourcesForRoute(route, data = {}) {
  const plan = resourcesForRoute(route);
  const dependent = Array.isArray(plan.dependent) ? plan.dependent : [];
  if (!dependent.length) return [];
  if (route === "business" && data?.business?.configured === true) return [...dependent];
  return [];
}
