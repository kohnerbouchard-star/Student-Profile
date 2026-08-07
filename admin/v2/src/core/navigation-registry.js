const MIGRATION_STATUSES = new Set(["v2", "legacy", "planned"]);

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
  legacyDestination = null,
}) {
  if (!MIGRATION_STATUSES.has(migration)) {
    throw new TypeError(`Admin route ${id} has an invalid migration status.`);
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
    migrated,
    href: `#${id}`,
    legacyDestination: destination,
    legacySection: destination?.section || null,
    legacyHref: destination ? `./#${destination.fragment}` : null,
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
    migration: "legacy",
    legacyDestination: { section: "Players", fragment: "players" },
  }),
  defineRoute({
    id: "attendance",
    label: "Attendance",
    groupId: "operations",
    icon: "attendance",
    permission: "attendance.manage",
    migration: "legacy",
    legacyDestination: { section: "Attendance", fragment: "attendance" },
  }),
  defineRoute({
    id: "market",
    label: "Market",
    groupId: "finance",
    icon: "market",
    permission: "market.manage",
    migration: "v2",
  }),
  defineRoute({
    id: "banking",
    label: "Banking",
    groupId: "finance",
    icon: "banking",
    permission: "economy.adjust",
    migration: "planned",
  }),
  defineRoute({
    id: "loans",
    label: "Loans",
    groupId: "finance",
    icon: "loans",
    permission: "economy.adjust",
    migration: "planned",
  }),
  defineRoute({
    id: "contracts",
    label: "Contracts",
    groupId: "work",
    icon: "contracts",
    permission: "contracts.manage",
    migration: "legacy",
    legacyDestination: { section: "Assignments", fragment: "contracts" },
  }),
  defineRoute({
    id: "business",
    label: "Business",
    groupId: "work",
    icon: "business",
    permission: "business.manage",
    migration: "planned",
  }),
  defineRoute({
    id: "crafting",
    label: "Crafting",
    groupId: "work",
    icon: "crafting",
    permission: "inventory.redeem",
    migration: "planned",
  }),
  defineRoute({
    id: "store",
    label: "Store",
    groupId: "trade",
    icon: "store",
    permission: "store.manage",
    migration: "v2",
  }),
  defineRoute({
    id: "marketplace",
    label: "Marketplace",
    groupId: "trade",
    icon: "marketplace",
    permission: "marketplace.moderate",
    migration: "planned",
  }),
  defineRoute({
    id: "inventory",
    label: "Inventory",
    groupId: "trade",
    icon: "inventory",
    permission: "inventory.redeem",
    migration: "planned",
  }),
  defineRoute({
    id: "world-management",
    label: "World Management",
    groupId: "world",
    icon: "world",
    permission: "world.manage",
    migration: "planned",
  }),
  defineRoute({
    id: "news-events",
    label: "News & Events",
    groupId: "world",
    icon: "news",
    permission: "world.manage",
    migration: "planned",
  }),
  defineRoute({
    id: "messages",
    label: "Messages",
    groupId: "engagement",
    icon: "messages",
    permission: "messaging.moderate",
    migration: "planned",
  }),
  defineRoute({
    id: "progression",
    label: "Progression",
    groupId: "engagement",
    icon: "progression",
    permission: "progression.review",
    migration: "planned",
  }),
  defineRoute({
    id: "settings",
    label: "Settings",
    groupId: "system",
    icon: "settings",
    permission: "settings.manage",
    migration: "legacy",
    legacyDestination: { section: "Settings", fragment: "settings" },
  }),
  defineRoute({
    id: "logs",
    label: "Logs",
    groupId: "system",
    icon: "logs",
    permission: "audit.read",
    migration: "legacy",
    legacyDestination: { section: "Logs", fragment: "logs" },
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

/** Canonical Admin v2 left-navigation taxonomy and order. */
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
