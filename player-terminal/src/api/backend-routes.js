import {
  hasPlayerBackendRoute as hasCorePlayerBackendRoute,
  PLAYER_BACKEND_ROUTE_KEYS as CORE_PLAYER_BACKEND_ROUTE_KEYS,
  resolvePlayerBackendRequest as resolveCorePlayerBackendRequest,
} from "./backend-routes-core.js";
import {
  CRAFTING_BACKEND_ROUTE_KEYS,
  hasCraftingBackendRoute,
  resolveCraftingBackendRequest,
} from "./crafting-backend-routes.js";
import {
  MESSAGING_BACKEND_ROUTE_KEYS,
  hasMessagingBackendRoute,
  resolveMessagingBackendRequest,
} from "./messaging-backend-routes.js";
import {
  PROGRESSION_BACKEND_ROUTE_KEYS,
  hasProgressionBackendRoute,
  resolveProgressionBackendRequest,
} from "./progression-backend-routes.js";
import {
  BANKING_FX_BACKEND_ROUTE_KEYS,
  hasBankingFxBackendRoute,
  resolveBankingFxBackendRequest,
} from "./banking-fx-backend-routes.js";

// These operations are implemented by the Business/Banking adapter, while the
// core route-key list predates their public endpoint identities. Keep the
// bridge exact and bounded until Business owns a composed backend-route module.
const BUSINESS_ADAPTER_BACKEND_ROUTE_KEYS = Object.freeze([
  "businessStockroom",
  "businessRecipes",
  "businessEquipment",
  "businessFormationPropose",
  "businessFormationRespond",
  "businessFormationActivate",
  "businessManufacturingJobs",
  "businessManufacturingStart",
  "businessManufacturingCancel",
]);

export const PLAYER_BACKEND_ROUTE_KEYS = Object.freeze([
  ...CORE_PLAYER_BACKEND_ROUTE_KEYS,
  ...BUSINESS_ADAPTER_BACKEND_ROUTE_KEYS.filter((key) =>
    !CORE_PLAYER_BACKEND_ROUTE_KEYS.includes(key)
  ),
  ...CRAFTING_BACKEND_ROUTE_KEYS.filter((key) =>
    !CORE_PLAYER_BACKEND_ROUTE_KEYS.includes(key) &&
    !BUSINESS_ADAPTER_BACKEND_ROUTE_KEYS.includes(key)
  ),
  ...MESSAGING_BACKEND_ROUTE_KEYS.filter((key) =>
    !CORE_PLAYER_BACKEND_ROUTE_KEYS.includes(key) &&
    !BUSINESS_ADAPTER_BACKEND_ROUTE_KEYS.includes(key) &&
    !CRAFTING_BACKEND_ROUTE_KEYS.includes(key)
  ),
  ...PROGRESSION_BACKEND_ROUTE_KEYS.filter((key) =>
    !CORE_PLAYER_BACKEND_ROUTE_KEYS.includes(key) &&
    !BUSINESS_ADAPTER_BACKEND_ROUTE_KEYS.includes(key) &&
    !CRAFTING_BACKEND_ROUTE_KEYS.includes(key) &&
    !MESSAGING_BACKEND_ROUTE_KEYS.includes(key)
  ),
  ...BANKING_FX_BACKEND_ROUTE_KEYS.filter((key) =>
    !CORE_PLAYER_BACKEND_ROUTE_KEYS.includes(key) &&
    !BUSINESS_ADAPTER_BACKEND_ROUTE_KEYS.includes(key) &&
    !CRAFTING_BACKEND_ROUTE_KEYS.includes(key) &&
    !MESSAGING_BACKEND_ROUTE_KEYS.includes(key) &&
    !PROGRESSION_BACKEND_ROUTE_KEYS.includes(key)
  ),
]);

export function hasPlayerBackendRoute(endpointKey) {
  return hasCorePlayerBackendRoute(endpointKey) ||
    BUSINESS_ADAPTER_BACKEND_ROUTE_KEYS.includes(endpointKey) ||
    hasCraftingBackendRoute(endpointKey) ||
    hasMessagingBackendRoute(endpointKey) ||
    hasProgressionBackendRoute(endpointKey) ||
    hasBankingFxBackendRoute(endpointKey);
}

export function resolvePlayerBackendRequest(input) {
  if (hasBankingFxBackendRoute(input.endpointKey)) {
    return resolveBankingFxBackendRequest(input);
  }
  if (hasProgressionBackendRoute(input.endpointKey)) {
    return resolveProgressionBackendRequest(input);
  }
  if (hasMessagingBackendRoute(input.endpointKey)) {
    return resolveMessagingBackendRequest(input);
  }
  if (hasCraftingBackendRoute(input.endpointKey)) {
    return resolveCraftingBackendRequest(input);
  }
  // The core resolver delegates Business/Banking adapter keys after its own
  // route lookup, preserving one request-normalization path.
  return resolveCorePlayerBackendRequest(input);
}
