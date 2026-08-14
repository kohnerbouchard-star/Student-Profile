const MIGRATION_STATUSES = new Set(["v2", "legacy", "planned"]);
const ROUTE_MODES = new Set(["manage", "operate", "moderate", "monitor", "review", "readonly"]);

function freezePermissions(...allOf) {
  return Object.freeze({
    allOf: Object.freeze(allOf),
    anyOf: Object.freeze([]),
  });
}

function freezeLegacyDestination(destination) {
  if (!destination) return null;
  return Object.freeze({
    section: destination.section,
    fragment: destination.fragment,
  });
}

function defineRoute({
  id,
  label,
  groupId,
  icon,
  permission,
  migration,
  mode = "manage",
  legacyDestination = null,
}) {
  if (!MIGRATION_STATUSES.has(migration)) {
    throw new TypeError(`Admin route ${id} has an invalid migration status.`);
  }
  if (!ROUTE_MODES.has(mode)) {
    throw new TypeError(`Admin route ${id} has an invalid interaction mode.`);
  }
  const migrated = migration === "v2";
  const legacy = migration === "legacy";
  if (legacy !== Boolean(legacyDestination?.section && legacyDestination?.fragment)) {
    throw new TypeError(`Admin route ${id} has an invalid legacy destination.`);
  }
  const destination = freezeLegacyDestination(legacyDestination);
  return Object.freeze({
    id,
    label,
    groupId,
    icon,
    permission: freezePermissions(permission),
    migration,
    mode,
    modeLabel: mode === "readonly" ? "Read only" : mode === "monitor" ? "Monitor" : null,
    migrated,
    href: `#${id}`,
    legacyDestination: destination,
    legacySection: destination?.section || null,
    legacyHref: destination ? `./#${destination.fragment}` : null,
  });
}

const ROUTES = Object.freeze([
  defineRoute({ id: "overview", label: "Overview", groupId: "overview", icon: "overview", permission: "game.read", migration: "v2", mode: "monitor" }),
  defineRoute({ id: "players", label: "Players", groupId: "operations", icon: "players", permission: "players.manage", migration: "v2", mode: "manage" }),
  defineRoute({ id: "attendance", label: "Attendance", groupId: "operations", icon: "attendance", permission: "attendance.manage", migration: "v2", mode: "operate" }),
  defineRoute({ id: "market", label: "Market Monitor", groupId: "finance", icon: "market", permission: "market.manage", migration: "v2", mode: "monitor" }),
  defineRoute({ id: "banking", label: "Banking", groupId: "finance", icon: "banking", permission: "economy.adjust", migration: "v2", mode: "operate" }),
  defineRoute({ id: "loans", label: "Loans", groupId: "finance", icon: "loans", permission: "economy.adjust", migration: "v2", mode: "manage" }),
  defineRoute({ id: "contracts", label: "Contracts", groupId: "work", icon: "contracts", permission: "contracts.manage", migration: "v2", mode: "manage" }),
  defineRoute({ id: "business", label: "Business Oversight", groupId: "work", icon: "business", permission: "business.manage", migration: "v2", mode: "review" }),
  defineRoute({ id: "crafting", label: "Crafting Operations", groupId: "work", icon: "crafting", permission: "inventory.redeem", migration: "v2", mode: "operate" }),
  defineRoute({ id: "store", label: "Store", groupId: "trade", icon: "store", permission: "store.manage", migration: "v2", mode: "manage" }),
  defineRoute({ id: "marketplace", label: "Marketplace", groupId: "trade", icon: "marketplace", permission: "marketplace.moderate", migration: "v2", mode: "moderate" }),
  defineRoute({ id: "inventory", label: "Inventory", groupId: "trade", icon: "inventory", permission: "inventory.redeem", migration: "v2", mode: "review" }),
  defineRoute({ id: "world-management", label: "World Management", groupId: "world", icon: "world", permission: "world.manage", migration: "v2", mode: "operate" }),
  defineRoute({ id: "news-events", label: "News & Event Monitor", groupId: "world", icon: "news", permission: "world.manage", migration: "v2", mode: "monitor" }),
  defineRoute({ id: "messages", label: "Messages", groupId: "engagement", icon: "messages", permission: "messaging.moderate", migration: "v2", mode: "moderate" }),
  defineRoute({ id: "progression", label: "Progression", groupId: "engagement", icon: "progression", permission: "progression.review", migration: "v2", mode: "review" }),
  defineRoute({ id: "settings", label: "Settings", groupId: "system", icon: "settings", permission: "settings.manage", migration: "v2", mode: "manage" }),
  defineRoute({ id: "logs", label: "Logs", groupId: "system", icon: "logs", permission: "audit.read", migration: "v2", mode: "readonly" }),
]);

const ROUTES_BY_ID = Object.freeze(Object.fromEntries(ROUTES.map((route) => [route.id, route])));

function defineGroup(id, label) {
  return Object.freeze({
    id,
    label,
    routes: Object.freeze(ROUTES.filter((route) => route.groupId === id)),
  });
}

/** Canonical Admin v2 left-navigation taxonomy, interaction mode, and order. */
export const ADMIN_NAVIGATION_GROUPS = Object.freeze([
  defineGroup("overview", "Overview"),
  defineGroup("operations", "Operations"),
  defineGroup("finance", "Finance"),
  defineGroup("work", "Work"),
  defineGroup("trade", "Trade"),
  defineGroup("world", "World"),
  defineGroup("engagement", "Engagement"),
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
