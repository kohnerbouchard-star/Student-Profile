export const SHELL_REQUIRED_RESOURCES = Object.freeze(["session", "dashboard"]);
export const SHELL_OPTIONAL_RESOURCES = Object.freeze(["notifications"]);

export const ROUTE_RESOURCE_PLAN = Object.freeze({
  dashboard: Object.freeze({
    required: Object.freeze(["dashboard", "countries"]),
    optional: Object.freeze(["news", "market", "contracts", "messages", "banking", "inventory"])
  }),
  news: Object.freeze({ required: Object.freeze(["news"]), optional: Object.freeze([]) }),
  market: Object.freeze({ required: Object.freeze(["market"]), optional: Object.freeze(["news", "banking"]) }),
  portfolio: Object.freeze({ required: Object.freeze(["portfolio"]), optional: Object.freeze(["market"]) }),
  business: Object.freeze({ required: Object.freeze(["business"]), optional: Object.freeze([]) }),
  contracts: Object.freeze({ required: Object.freeze(["contracts"]), optional: Object.freeze([]) }),
  store: Object.freeze({ required: Object.freeze(["store"]), optional: Object.freeze(["banking"]) }),
  marketplace: Object.freeze({ required: Object.freeze(["marketplace"]), optional: Object.freeze(["inventory", "banking"]) }),
  inventory: Object.freeze({ required: Object.freeze(["inventory"]), optional: Object.freeze([]) }),
  crafting: Object.freeze({ required: Object.freeze(["crafting"]), optional: Object.freeze(["inventory"]) }),
  banking: Object.freeze({ required: Object.freeze(["banking"]), optional: Object.freeze([]) }),
  loans: Object.freeze({ required: Object.freeze(["loans"]), optional: Object.freeze(["banking"]) }),
  messages: Object.freeze({ required: Object.freeze(["messages"]), optional: Object.freeze([]) }),
  progression: Object.freeze({ required: Object.freeze(["progression"]), optional: Object.freeze([]) }),
  profile: Object.freeze({ required: Object.freeze(["session"]), optional: Object.freeze([]) })
});

export const WRITE_INVALIDATIONS = Object.freeze({
  businessProduction: Object.freeze(["dashboard", "business", "banking", "inventory"]),
  businessPrice: Object.freeze(["business"]),
  businessHire: Object.freeze(["dashboard", "business", "banking"]),
  marketOrder: Object.freeze(["dashboard", "market", "portfolio", "banking"]),
  marketWatchlist: Object.freeze(["market"]),
  storePurchase: Object.freeze(["dashboard", "store", "inventory", "banking"]),
  marketplacePurchase: Object.freeze(["dashboard", "marketplace", "inventory", "banking"]),
  marketplaceListing: Object.freeze(["marketplace", "inventory"]),
  marketplaceCancel: Object.freeze(["marketplace", "inventory"]),
  contractAccept: Object.freeze(["dashboard", "contracts"]),
  contractSubmit: Object.freeze(["dashboard", "contracts"]),
  inventoryUse: Object.freeze(["dashboard", "inventory"]),
  craftItem: Object.freeze(["dashboard", "crafting", "inventory", "banking"]),
  bankTransfer: Object.freeze(["dashboard", "banking"]),
  savingsTransfer: Object.freeze(["dashboard", "banking"]),
  loanApply: Object.freeze(["dashboard", "banking", "loans"]),
  loanRepay: Object.freeze(["dashboard", "banking", "loans"]),
  messageSend: Object.freeze(["dashboard", "messages"]),
  progressionUnlock: Object.freeze(["dashboard", "progression"]),
  progressionClaim: Object.freeze(["dashboard", "progression", "inventory", "banking"]),
  notificationsRead: Object.freeze(["dashboard", "notifications"])
});

export const IDEMPOTENT_WRITE_ENDPOINTS = Object.freeze(new Set(Object.keys(WRITE_INVALIDATIONS)));

export function resourcesForRoute(route) {
  return ROUTE_RESOURCE_PLAN[route] || ROUTE_RESOURCE_PLAN.dashboard;
}
