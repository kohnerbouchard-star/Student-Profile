import {
  ADMIN_DEFAULT_ROUTE_ID,
  getAdminNavigationRoute,
  normalizeAdminNavigationRouteId,
} from "./navigation-registry.js";

const GAME_SELECTION_PATTERN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[a-z0-9][a-z0-9._~-]{15,127})$/i;

function routeIdFromHash(hash = "") {
  const candidate = String(hash || "")
    .replace(/^#\/?/, "")
    .split(/[?&]/, 1)[0]
    .trim()
    .toLowerCase();
  return getAdminNavigationRoute(candidate)?.id || ADMIN_DEFAULT_ROUTE_ID;
}

function selectedGameFromLocation(locationLike = {}) {
  try {
    const params = new URLSearchParams(String(locationLike.search || ""));
    const selectedGame = String(params.get("game") || "").trim();
    return GAME_SELECTION_PATTERN.test(selectedGame) ? selectedGame : "";
  } catch (_error) {
    return "";
  }
}

/** Reads only the v2-owned hash route. Unknown or malformed routes fail closed to Overview. */
export function readCurrentAdminV2Route(locationLike = globalThis.location) {
  return routeIdFromHash(locationLike?.hash);
}

/**
 * Produces a same-origin relative URL for the existing Admin runtime. Only the
 * validated game selector is retained; arbitrary query parameters are not
 * reflected into the handoff URL.
 */
export function createLegacyAdminHandoffUrl(routeId, locationLike = globalThis.location) {
  const route = getAdminNavigationRoute(routeId);
  if (!route || route.migration !== "legacy" || !route.legacyDestination) return null;

  const selectedGame = selectedGameFromLocation(locationLike);
  const query = selectedGame ? `?game=${encodeURIComponent(selectedGame)}` : "";
  return `./${query}#${route.legacyDestination.fragment}`;
}

/**
 * Returns an explicit migration-boundary result without evaluating or importing
 * the legacy bundle. The composition root decides how to perform a legacy handoff.
 */
export function resolveAdminRouteBoundary({
  routeId,
  locationLike = globalThis.location,
} = {}) {
  const normalizedRouteId = routeId == null
    ? readCurrentAdminV2Route(locationLike)
    : normalizeAdminNavigationRouteId(routeId);
  const route = getAdminNavigationRoute(normalizedRouteId);

  if (route.migrated) {
    return Object.freeze({
      kind: "migrated",
      route,
      moduleKey: route.id,
    });
  }

  if (route.migration === "planned") {
    return Object.freeze({
      kind: "planned",
      route,
    });
  }

  return Object.freeze({
    kind: "legacy",
    route,
    legacySection: route.legacySection,
    href: createLegacyAdminHandoffUrl(route.id, locationLike),
  });
}

export function resolveCurrentAdminRouteBoundary(locationLike = globalThis.location) {
  return resolveAdminRouteBoundary({ locationLike });
}
