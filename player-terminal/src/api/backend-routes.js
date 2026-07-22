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

export const PLAYER_BACKEND_ROUTE_KEYS = Object.freeze([
  ...CORE_PLAYER_BACKEND_ROUTE_KEYS,
  ...CRAFTING_BACKEND_ROUTE_KEYS.filter((key) => !CORE_PLAYER_BACKEND_ROUTE_KEYS.includes(key)),
]);

export function hasPlayerBackendRoute(endpointKey) {
  return hasCorePlayerBackendRoute(endpointKey) || hasCraftingBackendRoute(endpointKey);
}

export function resolvePlayerBackendRequest(input) {
  return hasCraftingBackendRoute(input.endpointKey)
    ? resolveCraftingBackendRequest(input)
    : resolveCorePlayerBackendRequest(input);
}
