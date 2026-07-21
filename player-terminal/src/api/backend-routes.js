import {
  PLAYER_BACKEND_ROUTE_KEYS as CORE_BACKEND_ROUTE_KEYS,
  hasPlayerBackendRoute as hasCoreBackendRoute,
  resolvePlayerBackendRequest as resolveCoreBackendRequest,
} from "./backend-routes-core.js";
import {
  MESSAGING_BACKEND_ROUTE_KEYS,
  hasMessagingBackendRoute,
  resolveMessagingBackendRequest,
} from "./messaging-backend-routes.js";

export const PLAYER_BACKEND_ROUTE_KEYS = Object.freeze([
  ...CORE_BACKEND_ROUTE_KEYS,
  ...MESSAGING_BACKEND_ROUTE_KEYS.filter((key) => !CORE_BACKEND_ROUTE_KEYS.includes(key)),
]);

export function hasPlayerBackendRoute(endpointKey) {
  return hasMessagingBackendRoute(endpointKey) || hasCoreBackendRoute(endpointKey);
}

export function resolvePlayerBackendRequest(context) {
  if (hasMessagingBackendRoute(context.endpointKey)) {
    const resolved = resolveMessagingBackendRequest(context);
    if (!resolved) return null;
    return {
      endpointKey: context.endpointKey,
      method: resolved.method,
      path: resolved.path,
      payload: Object.hasOwn(resolved, "payload") ? resolved.payload : undefined,
      provisional: {
        method: context.method,
        path: context.path,
        payload: context.payload,
      },
    };
  }
  return resolveCoreBackendRequest(context);
}
