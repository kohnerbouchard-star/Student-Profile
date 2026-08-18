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

// Phase 0 formation operations are already implemented by the Business/Banking
// backend-route adapter, but the legacy core route-key list predates them. Keep
// this bounded compatibility bridge until Phase 1 extracts Business into its own
// composed backend-route module.
const BUSINESS_FORMATION_BACKEND_ROUTE_KEYS = Object.freeze([
  "businessFormationPropose",
  "businessFormationRespond",
  "businessFormationActivate",
]);

export const PLAYER_BACKEND_ROUTE_KEYS = Object.freeze([
  ...CORE_PLAYER_BACKEND_ROUTE_KEYS,
  ...BUSINESS_FORMATION_BACKEND_ROUTE_KEYS.filter((key) =>
    !CORE_PLAYER_BACKEND_ROUTE_KEYS.includes(key)
  ),
  ...CRAFTING_BACKEND_ROUTE_KEYS.filter((key) =>
    !CORE_PLAYER_BACKEND_ROUTE_KEYS.includes(key) &&
    !BUSINESS_FORMATION_BACKEND_ROUTE_KEYS.includes(key)
  ),
  ...MESSAGING_BACKEND_ROUTE_KEYS.filter((key) =>
    !CORE_PLAYER_BACKEND_ROUTE_KEYS.includes(key) &&
    !BUSINESS_FORMATION_BACKEND_ROUTE_KEYS.includes(key) &&
    !CRAFTING_BACKEND_ROUTE_KEYS.includes(key)
  ),
  ...PROGRESSION_BACKEND_ROUTE_KEYS.filter((key) =>
    !CORE_PLAYER_BACKEND_ROUTE_KEYS.includes(key) &&
    !BUSINESS_FORMATION_BACKEND_ROUTE_KEYS.includes(key) &&
    !CRAFTING_BACKEND_ROUTE_KEYS.includes(key) &&
    !MESSAGING_BACKEND_ROUTE_KEYS.includes(key)
  ),
]);

export function hasPlayerBackendRoute(endpointKey) {
  return hasCorePlayerBackendRoute(endpointKey) ||
    BUSINESS_FORMATION_BACKEND_ROUTE_KEYS.includes(endpointKey) ||
    hasCraftingBackendRoute(endpointKey) ||
    hasMessagingBackendRoute(endpointKey) ||
    hasProgressionBackendRoute(endpointKey);
}

export function resolvePlayerBackendRequest(input) {
  if (hasProgressionBackendRoute(input.endpointKey)) {
    return resolveProgressionBackendRequest(input);
  }
  if (hasMessagingBackendRoute(input.endpointKey)) {
    return resolveMessagingBackendRequest(input);
  }
  if (hasCraftingBackendRoute(input.endpointKey)) {
    return resolveCraftingBackendRequest(input);
  }
  // The core resolver delegates unknown core keys to the existing
  // Business/Banking adapter, so formation operations remain on the reviewed
  // same-origin transport while Phase 1 performs the domain extraction.
  return resolveCorePlayerBackendRequest(input);
}
