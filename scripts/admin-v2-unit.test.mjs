import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_OVERVIEW_RESOURCE_KEYS,
  createAdminApiClient,
} from "../admin/v2/src/api/admin-api-client.js";
import {
  normalizeOverviewReadModel,
  sanitizeOverviewDisplayValue,
} from "../admin/v2/src/api/overview-read-model.js";
import {
  ADMIN_DATA_STATES,
  beginAdminDataLoad,
  createAdminDataState,
  rejectAdminDataLoad,
  resolveAdminDataLoad,
} from "../admin/v2/src/core/data-state.js";
import {
  isAdminErrorEnvelope,
  normalizeAdminError,
} from "../admin/v2/src/core/error-envelope.js";
import {
  ADMIN_NAVIGATION_GROUPS,
  ADMIN_NAVIGATION_ROUTE_IDS,
  ADMIN_NAVIGATION_ROUTES,
  getAdminNavigationRoute,
  isMigratedAdminRoute,
  normalizeAdminNavigationRouteId,
} from "../admin/v2/src/core/navigation-registry.js";
import {
  createLegacyAdminHandoffUrl,
  readCurrentAdminV2Route,
  resolveAdminRouteBoundary,
} from "../admin/v2/src/core/route-boundary.js";
import { ADMIN_ICON_NAMES } from "../admin/v2/src/components/AdminIcon.js";

const GAME_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_INTERNAL_ID = "20000000-0000-4000-8000-000000000002";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function fulfilled(value) {
  return Object.freeze({ status: "fulfilled", value });
}

test("Admin v2 navigation is canonical, unique, permission-bound, and migrates Overview, Players, Attendance, Contracts, Store, and Market", () => {
  const expectedRouteIds = [
    "overview",
    "players",
    "attendance",
    "market",
    "banking",
    "loans",
    "contracts",
    "business",
    "crafting",
    "store",
    "marketplace",
    "inventory",
    "world-management",
    "news-events",
    "messages",
    "progression",
    "settings",
    "logs",
  ];
  assert.deepEqual(
    ADMIN_NAVIGATION_GROUPS.map(({ id, label }) => ({ id, label })),
    [
      { id: "overview", label: "Overview" },
      { id: "operations", label: "Operations" },
      { id: "finance", label: "Finance" },
      { id: "work", label: "Work" },
      { id: "trade", label: "Trade" },
      { id: "world", label: "World" },
      { id: "engagement", label: "Engagement" },
      { id: "system", label: "System" },
    ],
  );
  assert.deepEqual(ADMIN_NAVIGATION_ROUTE_IDS, expectedRouteIds);
  assert.deepEqual(ADMIN_NAVIGATION_ROUTES.map((route) => route.id), expectedRouteIds);
  assert.deepEqual(
    ADMIN_NAVIGATION_ROUTES.map(({ id, label }) => [id, label]),
    [
      ["overview", "Overview"],
      ["players", "Players"],
      ["attendance", "Attendance"],
      ["market", "Market"],
      ["banking", "Banking"],
      ["loans", "Loans"],
      ["contracts", "Contracts"],
      ["business", "Business"],
      ["crafting", "Crafting"],
      ["store", "Store"],
      ["marketplace", "Marketplace"],
      ["inventory", "Inventory"],
      ["world-management", "World Management"],
      ["news-events", "News & Events"],
      ["messages", "Messages"],
      ["progression", "Progression"],
      ["settings", "Settings"],
      ["logs", "Logs"],
    ],
  );
  assert.deepEqual(
    ADMIN_NAVIGATION_ROUTES.map((route) => [route.id, route.permission.allOf[0]]),
    [
      ["overview", "game.read"],
      ["players", "players.manage"],
      ["attendance", "attendance.manage"],
      ["market", "market.manage"],
      ["banking", "economy.adjust"],
      ["loans", "economy.adjust"],
      ["contracts", "contracts.manage"],
      ["business", "business.manage"],
      ["crafting", "inventory.redeem"],
      ["store", "store.manage"],
      ["marketplace", "marketplace.moderate"],
      ["inventory", "inventory.redeem"],
      ["world-management", "world.manage"],
      ["news-events", "world.manage"],
      ["messages", "messaging.moderate"],
      ["progression", "progression.review"],
      ["settings", "settings.manage"],
      ["logs", "audit.read"],
    ],
  );

  const migratedRoutes = ADMIN_NAVIGATION_ROUTES.filter((route) => route.migrated);
  assert.deepEqual(migratedRoutes.map((route) => route.id), ["overview", "players", "attendance", "market", "contracts", "store"]);
  assert.deepEqual(
    ADMIN_NAVIGATION_ROUTES.filter((route) => route.migration === "legacy").map((route) => route.id),
    ["settings", "logs"],
  );
  assert.deepEqual(
    ADMIN_NAVIGATION_ROUTES.filter((route) => route.migration === "planned").map((route) => route.id),
    ["banking", "loans", "business", "crafting", "marketplace", "inventory", "world-management", "news-events", "messages", "progression"],
  );
  assert.equal(isMigratedAdminRoute("overview"), true);
  assert.equal(isMigratedAdminRoute("players"), true);
  assert.equal(isMigratedAdminRoute("attendance"), true);
  assert.equal(isMigratedAdminRoute("contracts"), true);
  assert.equal(isMigratedAdminRoute("store"), true);
  assert.equal(isMigratedAdminRoute("market"), true);
  assert.equal(isMigratedAdminRoute("world-management"), false);

  const market = getAdminNavigationRoute("market");
  const marketplace = getAdminNavigationRoute("marketplace");
  assert.notEqual(market.id, marketplace.id);
  assert.notEqual(market.href, marketplace.href);
  assert.deepEqual(market.permission.allOf, ["market.manage"]);
  assert.deepEqual(marketplace.permission.allOf, ["marketplace.moderate"]);
  assert.equal(market.migration, "v2");
  assert.equal(market.legacyDestination, null);
  assert.equal(marketplace.migration, "planned");
  assert.equal(marketplace.legacyDestination, null);

  const world = getAdminNavigationRoute("world-management");
  assert.equal(world.label, "World Management");
  assert.equal(world.groupId, "world");
  assert.deepEqual(world.permission.allOf, ["world.manage"]);
  assert.equal(world.migration, "planned");
  assert.equal(world.legacySection, null);

  const routeIds = ADMIN_NAVIGATION_ROUTES.map((route) => route.id);
  const routeHrefs = ADMIN_NAVIGATION_ROUTES.map((route) => route.href);
  const legacyFragments = ADMIN_NAVIGATION_ROUTES
    .map((route) => route.legacyDestination?.fragment)
    .filter(Boolean);
  assert.equal(new Set(routeIds).size, routeIds.length);
  assert.equal(new Set(routeHrefs).size, routeHrefs.length);
  assert.equal(new Set(legacyFragments).size, legacyFragments.length);
  assert.equal(routeIds.includes("portfolio"), false);
  assert.equal(routeIds.includes("account"), false);

  const groupedRoutes = ADMIN_NAVIGATION_GROUPS.flatMap((group) => group.routes);
  assert.deepEqual(groupedRoutes.map((route) => route.id), expectedRouteIds);
  for (const route of ADMIN_NAVIGATION_ROUTES) {
    assert.equal(
      ADMIN_NAVIGATION_GROUPS.filter((group) => group.routes.includes(route)).length,
      1,
      `${route.id} does not belong to exactly one navigation group`,
    );
    assert.equal(route.permission.allOf.length, 1, `${route.id} has no explicit permission`);
    assert.equal(route.permission.anyOf.length, 0);
    assert.ok(ADMIN_ICON_NAMES.includes(route.icon), `${route.id} references a missing icon`);
    if (route.migration === "legacy") {
      assert.ok(route.legacyDestination?.section);
      assert.ok(route.legacyDestination?.fragment);
      assert.ok(route.legacyHref);
    } else {
      assert.equal(route.legacyDestination, null);
      assert.equal(route.legacyHref, null);
    }
  }

  assert.equal(normalizeAdminNavigationRouteId("unknown-or-injected"), "overview");
  assert.ok(Object.isFrozen(ADMIN_NAVIGATION_GROUPS));
  assert.ok(ADMIN_NAVIGATION_ROUTES.every((route) => Object.isFrozen(route)));
  assert.ok(ADMIN_NAVIGATION_ROUTES.every((route) => Object.isFrozen(route.permission)));
});

test("Admin v2 route resolution fails closed and preserves only a validated game selector", () => {
  const locationLike = {
    hash: "#/players?untrusted=true",
    search: `?game=${GAME_ID}&returnTo=https://attacker.invalid&debug=1`,
  };

  assert.equal(readCurrentAdminV2Route(locationLike), "players");
  assert.equal(createLegacyAdminHandoffUrl("players", locationLike), null);
  assert.equal(createLegacyAdminHandoffUrl("attendance", locationLike), null);
  assert.equal(createLegacyAdminHandoffUrl("contracts", locationLike), null);
  assert.equal(createLegacyAdminHandoffUrl("market", locationLike), null);
  assert.equal(createLegacyAdminHandoffUrl("overview", locationLike), null);
  assert.equal(createLegacyAdminHandoffUrl("marketplace", locationLike), null);
  assert.equal(createLegacyAdminHandoffUrl("world-management", locationLike), null);
  assert.deepEqual(
    resolveAdminRouteBoundary({ routeId: "players", locationLike }),
    {
      kind: "migrated",
      route: getAdminNavigationRoute("players"),
      moduleKey: "players",
    },
  );
  assert.equal(
    createLegacyAdminHandoffUrl("players", { search: "?game=../../etc/passwd" }),
    null,
  );
  assert.deepEqual(
    resolveAdminRouteBoundary({ routeId: "marketplace", locationLike }),
    {
      kind: "planned",
      route: getAdminNavigationRoute("marketplace"),
    },
  );
  assert.deepEqual(
    resolveAdminRouteBoundary({ routeId: "world-management", locationLike }),
    {
      kind: "planned",
      route: getAdminNavigationRoute("world-management"),
    },
  );
  assert.equal(readCurrentAdminV2Route({ hash: "#<script>" }), "overview");
  assert.equal(resolveAdminRouteBoundary({ routeId: "overview" }).kind, "migrated");
  assert.equal(resolveAdminRouteBoundary({ routeId: "players" }).kind, "migrated");
  assert.equal(resolveAdminRouteBoundary({ routeId: "attendance" }).kind, "migrated");
  assert.equal(resolveAdminRouteBoundary({ routeId: "contracts" }).kind, "migrated");
  assert.equal(resolveAdminRouteBoundary({ routeId: "store" }).kind, "migrated");
  assert.equal(resolveAdminRouteBoundary({ routeId: "market" }).kind, "migrated");
});

test("Admin data states retain resolved content for refresh failures and ignore old responses", () => {
  let state = createAdminDataState();
  assert.equal(state.status, ADMIN_DATA_STATES.INITIAL_LOADING);
  assert.ok(Object.isFrozen(state));

  state = beginAdminDataLoad(state, { requestVersion: 1 });
  assert.equal(state.status, ADMIN_DATA_STATES.INITIAL_LOADING);

  const firstModel = Object.freeze({ game: { name: "Northreach" } });
  state = resolveAdminDataLoad(state, firstModel, {
    requestVersion: 1,
    updatedAt: 100,
  });
  assert.equal(state.status, ADMIN_DATA_STATES.READY);
  assert.equal(state.data, firstModel);
  assert.equal(state.hasResolved, true);

  state = beginAdminDataLoad(state, { requestVersion: 2 });
  assert.equal(state.status, ADMIN_DATA_STATES.REFRESHING);
  assert.equal(state.data, firstModel);

  const safeError = normalizeAdminError({ status: 503 });
  state = rejectAdminDataLoad(state, safeError, { requestVersion: 2 });
  assert.equal(state.status, ADMIN_DATA_STATES.STALE);
  assert.equal(state.data, firstModel);
  assert.equal(state.error, safeError);
  assert.equal(state.updatedAt, 100);

  const ignored = resolveAdminDataLoad(state, { game: { name: "Old response" } }, {
    requestVersion: 1,
  });
  assert.equal(ignored, state);
  assert.equal(ignored.data, firstModel);

  const empty = resolveAdminDataLoad(beginAdminDataLoad(state, { requestVersion: 3 }), {}, {
    requestVersion: 3,
    empty: true,
  });
  assert.equal(empty.status, ADMIN_DATA_STATES.EMPTY);
});

test("Admin errors expose only the safe envelope and suppress backend diagnostics", () => {
  const rawFailure = {
    status: 500,
    code: "postgres_query_failed",
    message: "SELECT * FROM private.staff_users using service_role",
    stack: "Error at backend/supabase/functions/admin-api/index.ts:99",
    body: {
      requestId: "req-safe_42",
      details: "SUPABASE_SERVICE_ROLE_KEY=never-render-this",
      fieldErrors: {
        name: "duplicate key value violates unique constraint",
        internalUuid: OTHER_INTERNAL_ID,
      },
    },
  };
  const envelope = normalizeAdminError(rawFailure, {
    fieldErrors: rawFailure.body.fieldErrors,
  });

  assert.deepEqual(Object.keys(envelope), [
    "code",
    "userMessage",
    "fieldErrors",
    "retryable",
    "requestId",
    "retryAfterSeconds",
  ]);
  assert.equal(envelope.code, "SERVICE_UNAVAILABLE");
  assert.equal(envelope.userMessage, "The administrator service is temporarily unavailable. Try again shortly.");
  assert.deepEqual(envelope.fieldErrors, { name: "Review this field and try again." });
  assert.equal(envelope.retryable, true);
  assert.equal(envelope.requestId, "req-safe_42");
  assert.equal(envelope.retryAfterSeconds, null);
  assert.equal(isAdminErrorEnvelope(envelope), true);

  const serialized = JSON.stringify(envelope);
  for (const forbidden of [
    "SELECT *",
    "service_role",
    "SUPABASE_SERVICE_ROLE_KEY",
    "backend/supabase",
    OTHER_INTERNAL_ID,
    "unique constraint",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }

  assert.equal(normalizeAdminError({ status: 403, message: "owner mismatch" }).code, "PERMISSION_DENIED");
  const rateLimited = normalizeAdminError({
    status: 429,
    retryAfterSeconds: 7,
    message: rawFailure.message,
  });
  assert.equal(rateLimited.code, "RATE_LIMITED");
  assert.equal(rateLimited.retryable, true);
  assert.equal(rateLimited.retryAfterSeconds, 7);
  assert.equal(JSON.stringify(rateLimited).includes(rawFailure.message), false);
  assert.equal(normalizeAdminError(new TypeError("Failed to fetch"), { networkError: true }).code, "NETWORK_ERROR");
  assert.equal(normalizeAdminError(new DOMException("cancelled", "AbortError")).code, "REQUEST_ABORTED");
});

test("Overview display normalization strips ownership identifiers and preserves authoritative emptiness", () => {
  const displayValue = sanitizeOverviewDisplayValue({
    title: "Public reward",
    ownerId: OTHER_INTERNAL_ID,
    player_id: OTHER_INTERNAL_ID,
    nested: {
      uuid: OTHER_INTERNAL_ID,
      amount: 25,
      note: OTHER_INTERNAL_ID,
      diagnostic: `Internal reference ${OTHER_INTERNAL_ID} must not render`,
    },
  });
  assert.deepEqual(displayValue, {
    title: "Public reward",
    nested: { amount: 25 },
  });

  const model = normalizeOverviewReadModel({
    panels: {
      dashboard: fulfilled({
        data: {
          game: {
            id: GAME_ID,
            ownerId: OTHER_INTERNAL_ID,
            name: "Northreach Classroom Economy",
            status: "active",
            gameCode: "NORTH7",
          },
          totalPlayers: 1,
          attendance: [{
            id: OTHER_INTERNAL_ID,
            playerId: OTHER_INTERNAL_ID,
            displayName: "Alex Morgan",
            status: "present",
          }],
          leaderboard: [{
            id: OTHER_INTERNAL_ID,
            playerId: OTHER_INTERNAL_ID,
            displayName: "Alex Morgan",
            rank: 1,
            netWorth: 250,
          }],
          contracts: [{
            id: OTHER_INTERNAL_ID,
            title: "Supply briefing",
            status: "active",
            targeting: { playerId: OTHER_INTERNAL_ID, cohort: "All players" },
          }],
        },
        error: null,
        meta: { requestId: "req-dashboard" },
      }),
      games: fulfilled({
        data: { games: [{ id: GAME_ID, name: "Northreach Classroom Economy" }] },
        error: null,
        meta: {},
      }),
      notifications: fulfilled({
        data: { notifications: [], notificationCount: 0 },
        error: null,
        meta: {},
      }),
      store: fulfilled({
        data: { items: [] },
        error: null,
        meta: {},
      }),
    },
  });

  assert.equal(model.game.name, "Northreach Classroom Economy");
  assert.equal(model.leaderboard[0].displayName, "Alex Morgan");
  assert.deepEqual(model.contracts[0].targeting, { cohort: "All players" });
  assert.deepEqual(model.notifications, []);
  assert.deepEqual(model.storeItems, []);
  assert.equal(model.emptyPanels.notifications, true);
  assert.equal(model.emptyPanels.store, true);
  assert.equal(model.isEmpty, false);
  assert.equal(JSON.stringify(model).includes(GAME_ID), false);
  assert.equal(JSON.stringify(model).includes(OTHER_INTERNAL_ID), false);
  assert.ok(Object.isFrozen(model));
  assert.ok(Object.isFrozen(model.availablePanels));

  const partialFailure = normalizeOverviewReadModel({
    panels: {
      dashboard: { status: "rejected", reason: normalizeAdminError({ status: 500 }) },
      games: fulfilled({ data: { games: [] }, error: null, meta: {} }),
      notifications: fulfilled({ data: { notifications: [] }, error: null, meta: {} }),
      store: fulfilled({ data: { items: [] }, error: null, meta: {} }),
    },
  });
  assert.equal(partialFailure.availablePanels.dashboard, false);
  assert.equal(partialFailure.leaderboard, null);
  assert.equal(partialFailure.attendance, null);
  assert.equal(partialFailure.isEmpty, false);
});

test("Overview API client performs the four read-only scoped requests through /api/admin", async () => {
  const calls = [];
  const rawLeak = "SELECT secret FROM auth.users WITH service_role";
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("/store/items")) {
      return jsonResponse({
        data: null,
        error: { code: "postgres_failed", message: rawLeak, details: rawLeak },
        meta: { requestId: "req-store" },
      }, {
        status: 503,
        headers: { "x-request-id": "req-store" },
      });
    }
    return jsonResponse({ data: {}, error: null, meta: {} });
  };
  const client = createAdminApiClient({ fetchImpl, timeoutMs: 1_000 });
  const result = await client.readOverview({ gameId: GAME_ID });

  assert.deepEqual(ADMIN_OVERVIEW_RESOURCE_KEYS, ["dashboard", "games", "notifications", "store"]);
  assert.equal(result.requestVersion, 1);
  assert.equal(result.current, true);
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      `/api/admin/games/${GAME_ID}/dashboard`,
      "/api/admin/games",
      "/api/admin/notifications?scope=admin-console",
      `/api/admin/games/${GAME_ID}/store/items?include=stock,prices,purchaseStats`,
    ],
  );
  for (const call of calls) {
    assert.equal(call.options.method, "GET");
    assert.equal(call.options.credentials, "include");
    assert.equal(call.options.cache, "no-store");
    assert.equal(call.options.redirect, "error");
    assert.deepEqual(call.options.headers, { Accept: "application/json" });
    assert.equal("Authorization" in call.options.headers, false);
  }
  assert.equal(result.panels.dashboard.status, "fulfilled");
  assert.equal(result.panels.store.status, "rejected");
  assert.equal(isAdminErrorEnvelope(result.panels.store.reason), true);
  assert.equal(result.panels.store.reason.code, "SERVICE_UNAVAILABLE");
  assert.equal(JSON.stringify(result.panels.store.reason).includes(rawLeak), false);
  assert.equal(result.panels.store.reason.requestId, "req-store");

  const invalid = await client.readOverview({ gameId: "../../another-game" });
  assert.equal(invalid.panels.dashboard.status, "rejected");
  assert.equal(invalid.panels.dashboard.reason.code, "GAME_CONTEXT_REQUIRED");
  assert.equal(invalid.panels.store.status, "rejected");
  assert.equal(invalid.panels.store.reason.code, "GAME_CONTEXT_REQUIRED");
  assert.equal(invalid.panels.games.status, "fulfilled");
  assert.equal(invalid.panels.notifications.status, "fulfilled");
});