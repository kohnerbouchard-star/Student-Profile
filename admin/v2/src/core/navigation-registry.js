function freezePermissions(...allOf) {
  return Object.freeze({
    allOf: Object.freeze(allOf),
    anyOf: Object.freeze([]),
  });
}

function defineRoute({
  id,
  label,
  groupId,
  icon,
  permission,
  migration = "legacy",
  legacySection = null,
}) {
  const migrated = migration === "v2";
  return Object.freeze({
    id,
    label,
    groupId,
    icon,
    permission: freezePermissions(permission),
    migration,
    migrated,
    href: `#${id}`,
    legacySection: migrated ? null : legacySection,
    legacyHref: migrated ? null : `./#${id}`,
  });
}

const ROUTES = Object.freeze([
  defineRoute({
    id: "overview",
    label: "Overview",
    groupId: "overview",
    icon: "overview",
    permission: "game.read",
    migration: "v2",
  }),
  defineRoute({
    id: "players",
    label: "Players",
    groupId: "operations",
    icon: "players",
    permission: "players.manage",
    legacySection: "Players",
  }),
  defineRoute({
    id: "attendance",
    label: "Attendance",
    groupId: "operations",
    icon: "attendance",
    permission: "attendance.manage",
    legacySection: "Attendance",
  }),
  defineRoute({
    id: "contracts",
    label: "Contracts",
    groupId: "operations",
    icon: "contracts",
    permission: "contracts.manage",
    legacySection: "Assignments",
  }),
  defineRoute({
    id: "store",
    label: "Store",
    groupId: "economy",
    icon: "store",
    permission: "store.manage",
    legacySection: "Store",
  }),
  defineRoute({
    id: "marketplace",
    label: "Marketplace",
    groupId: "economy",
    icon: "marketplace",
    permission: "market.manage",
    legacySection: "Market",
  }),
  defineRoute({
    id: "world-management",
    label: "World Management",
    groupId: "world",
    icon: "world",
    permission: "world.manage",
    legacySection: "World Management",
  }),
  defineRoute({
    id: "settings",
    label: "Settings",
    groupId: "system",
    icon: "settings",
    permission: "settings.manage",
    legacySection: "Settings",
  }),
  defineRoute({
    id: "logs",
    label: "Logs",
    groupId: "system",
    icon: "logs",
    permission: "audit.read",
    legacySection: "Logs",
  }),
]);

const ROUTES_BY_ID = Object.freeze(Object.fromEntries(ROUTES.map((route) => [route.id, route])));

function defineGroup(id, label) {
  return Object.freeze({
    id,
    label,
    routes: Object.freeze(ROUTES.filter((route) => route.groupId === id)),
  });
}

/**
 * Canonical Admin left-navigation order. The first group intentionally has no
 * visible heading so Overview remains the primary destination above Operations.
 */
export const ADMIN_NAVIGATION_GROUPS = Object.freeze([
  defineGroup("overview", null),
  defineGroup("operations", "Operations"),
  defineGroup("economy", "Economy"),
  defineGroup("world", "World"),
  defineGroup("system", "System"),
]);

export const ADMIN_NAVIGATION_ROUTES = ROUTES;
export const ADMIN_NAVIGATION_ROUTE_IDS = Object.freeze(ROUTES.map((route) => route.id));
export const ADMIN_DEFAULT_ROUTE_ID = "overview";

export function getAdminNavigationRoute(routeId) {
  const normalized = String(routeId || "").trim().toLowerCase();
  return ROUTES_BY_ID[normalized] || null;
}

export function normalizeAdminNavigationRouteId(routeId) {
  return getAdminNavigationRoute(routeId)?.id || ADMIN_DEFAULT_ROUTE_ID;
}

export function isMigratedAdminRoute(routeId) {
  return getAdminNavigationRoute(routeId)?.migrated === true;
}
