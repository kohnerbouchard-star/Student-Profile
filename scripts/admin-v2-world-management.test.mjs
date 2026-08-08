import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createWorldManagementApi,
  WORLD_MANAGEMENT_RESOURCE_KEYS,
} from "../admin/v2/src/routes/world-management/WorldManagementApi.js";
import {
  createWorldManagementController,
  normalizeWorldManagementReadModel,
} from "../admin/v2/src/routes/world-management/WorldManagementController.js";
import { ADMIN_DATA_STATES } from "../admin/v2/src/core/data-state.js";
import { createAdminErrorEnvelope } from "../admin/v2/src/core/error-envelope.js";
import { getAdminNavigationRoute } from "../admin/v2/src/core/navigation-registry.js";

const GAME_ID = "10000000-0000-4000-8000-000000000001";
const PRIVATE_PLAYER_UUID = "40000000-0000-4000-8000-000000000004";
const CAMPAIGN_ID = `cmp_${"a".repeat(32)}`;
const EFFECT_ID = `cec_${"b".repeat(32)}`;
const ASSIGNMENT_ID = `acl_${"c".repeat(32)}`;
const ROUTE_ID = "rte_northreach_hanseong_air";
const REQUEST_ID = "admin.world.test.12345678";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function fulfilled(data) {
  return Object.freeze({ status: "fulfilled", value: { data } });
}

function emptyWorldBatch() {
  return Object.freeze({
    requestVersion: 1,
    current: true,
    panels: Object.freeze({
      campaign: fulfilled({
        campaigns: [],
        scheduler: { due: 0, active: 0, paused: 0, emergencyDisabled: 0 },
      }),
      history: fulfilled({ history: [] }),
      effects: fulfilled({
        effects: [],
        summary: { pending: 0, processing: 0, completed: 0, failed: 0 },
      }),
      arrivals: fulfilled({ assignments: [] }),
      geography: fulfilled({ runtime: null, locations: [], routes: [] }),
      travel: fulfilled({ states: [], journeys: [] }),
      residency: fulfilled({ residency: [] }),
    }),
  });
}

function populatedWorldBatch() {
  const longKoreanName = "한강 국제 물류 관문 ".repeat(18).trim();
  return Object.freeze({
    requestVersion: 1,
    current: true,
    panels: Object.freeze({
      campaign: fulfilled({
        campaigns: [{
          public_id: CAMPAIGN_ID,
          pack_id: "econovaria.beta-seed-pack.v1",
          pack_version: "1.0.0-beta",
          definition_digest: PRIVATE_PLAYER_UUID,
          status: "active",
          current_phase: "shortage",
          revision: 7,
          event_sequence: 14,
          scheduled_at: "2026-08-07T08:00:00.000Z",
          updated_at: "2026-08-07T07:55:00.000Z",
        }],
        scheduler: { due: 1, active: 1, paused: 0, emergencyDisabled: 0 },
      }),
      history: fulfilled({
        history: [{
          public_id: "evt_public",
          event_key: "shortage_escalation",
          trigger_key: "scheduler:14",
          from_phase: "rivalry",
          to_phase: "shortage",
          sequence: 14,
          actor_type: "system",
          reason: "Scheduled authoritative transition",
          occurred_at: "2026-08-07T07:00:00.000Z",
        }],
      }),
      effects: fulfilled({
        effects: [{
          public_id: EFFECT_ID,
          idempotency_key: "private.command.identity",
          effect_kind: "set_route_state",
          payload: { routeDefinitionIds: [ROUTE_ID] },
          status: "failed",
          attempt_count: 2,
          last_error_code: "route_state_conflict",
          created_at: "2026-08-07T07:01:00.000Z",
        }],
        summary: { pending: 0, processing: 0, completed: 0, failed: 1 },
      }),
      arrivals: fulfilled({
        assignments: [{
          public_id: ASSIGNMENT_ID,
          country_id: "northreach",
          class_id: "navigator",
          source: "questionnaire",
          revision: 3,
          assigned_at: "2026-08-07T06:00:00.000Z",
          player_id: PRIVATE_PLAYER_UUID,
        }],
      }),
      geography: fulfilled({
        runtime: {
          pack_id: "econovaria.beta-seed-pack.v1",
          pack_version: "1.0.0-beta",
          definition_digest: PRIVATE_PLAYER_UUID,
          revision: 19,
          initialized_at: "2026-08-01T00:00:00.000Z",
          updated_at: "2026-08-07T07:50:00.000Z",
        },
        locations: [
          {
            public_location_id: "loc_northreach_port",
            country_id: "northreach",
            display_name: "노스리치 북항",
            location_kind: "port",
            availability: "available",
            revision: 2,
          },
          {
            public_location_id: "loc_hanseong_gate",
            country_id: "hanseong_republic",
            display_name: longKoreanName,
            location_kind: "trade_hub",
            availability: "available",
            revision: 5,
          },
        ],
        routes: [{
          public_route_id: ROUTE_ID,
          from_location_id: "loc_northreach_port",
          to_location_id: "loc_hanseong_gate",
          mode: "air",
          bidirectional: true,
          base_cost_minor: 12500,
          base_duration_minutes: 180,
          status: "open",
          reason: "normal",
          cost_multiplier_basis_points: 10000,
          duration_multiplier_basis_points: 10000,
          revision: 6,
        }],
      }),
      travel: fulfilled({
        states: [{
          current_location_id: "loc_northreach_port",
          status: "idle",
          revision: 4,
          player_id: PRIVATE_PLAYER_UUID,
        }],
        journeys: [{
          public_id: "jrn_public_0001",
          from_location_id: "loc_northreach_port",
          to_location_id: "loc_hanseong_gate",
          currency_code: "NRC",
          total_cost_minor: 12500,
          total_duration_minutes: 180,
          status: "completed",
          player_id: PRIVATE_PLAYER_UUID,
        }],
      }),
      residency: fulfilled({
        residency: [
          {
            current_country_id: "northreach",
            currency_code: "NRC",
            eligible_country_ids: ["hanseong_republic"],
            pending_country_id: "hanseong_republic",
            revision: 8,
            player_id: PRIVATE_PLAYER_UUID,
          },
          {
            current_country_id: "hanseong_republic",
            currency_code: "HRC",
            eligible_country_ids: ["northreach"],
            pending_country_id: null,
            revision: 2,
            player_id: PRIVATE_PLAYER_UUID,
          },
        ],
      }),
    }),
  });
}

function apiPayloadFor(url) {
  if (url.endsWith("/world/campaign")) {
    return {
      data: {
        campaigns: [],
        scheduler: { due: 0, active: 0, paused: 0, emergencyDisabled: 0 },
      },
    };
  }
  if (url.includes("/campaign/history")) return { data: { history: [] } };
  if (url.includes("/campaign/effects")) {
    return {
      data: {
        effects: [],
        summary: { pending: 0, processing: 0, completed: 0, failed: 0 },
      },
    };
  }
  if (url.includes("/arrival-classes")) return { data: { assignments: [] } };
  if (url.endsWith("/world/geography")) {
    return { data: { runtime: null, locations: [], routes: [] } };
  }
  if (url.includes("/world/travel")) return { data: { states: [], journeys: [] } };
  if (url.includes("/world/residency")) return { data: { residency: [] } };
  return { data: { operation: "test", outcome: {} } };
}

test("World API uses only the authoritative seven read contracts", async () => {
  const calls = [];
  const api = createWorldManagementApi({
    selectedGameId: GAME_ID,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(apiPayloadFor(url));
    },
    timeoutMs: 1_000,
  });

  const batch = await api.readWorldManagement();

  assert.deepEqual(Object.keys(batch.panels), WORLD_MANAGEMENT_RESOURCE_KEYS);
  assert.equal(batch.current, true);
  assert.deepEqual(calls.map(({ url }) => url), [
    `/api/admin/games/${GAME_ID}/world/campaign`,
    `/api/admin/games/${GAME_ID}/world/campaign/history?limit=100`,
    `/api/admin/games/${GAME_ID}/world/campaign/effects?status=all&limit=100`,
    `/api/admin/games/${GAME_ID}/world/arrival-classes?limit=100`,
    `/api/admin/games/${GAME_ID}/world/geography`,
    `/api/admin/games/${GAME_ID}/world/travel?limit=100`,
    `/api/admin/games/${GAME_ID}/world/residency?limit=100`,
  ]);
  calls.forEach(({ init }) => {
    const headers = new Headers(init.headers);
    assert.equal(init.method, "GET");
    assert.equal(init.credentials, "include");
    assert.equal(init.cache, "no-store");
    assert.equal(headers.has("authorization"), false);
    assert.equal("body" in init, false);
  });
  assert.equal(api.manualTrigger, undefined);
  assert.equal(api.publishNews, undefined);
  assert.equal(api.updateCurrency, undefined);
  assert.equal(api.updateExchangeRate, undefined);
});

test("World API sends exact reviewed mutation shapes and no invented controls", async () => {
  const calls = [];
  const api = createWorldManagementApi({
    selectedGameId: GAME_ID,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ data: { operation: "test", outcome: {} } });
    },
    timeoutMs: 1_000,
  });

  await api.controlCampaign({
    campaignId: CAMPAIGN_ID,
    action: "pause",
    expectedRevision: 7,
    reason: "Administrator paused the campaign after a reviewed safety check.",
    idempotencyKey: `${REQUEST_ID}.campaign`,
  });
  await api.recoverEffect({
    effectId: EFFECT_ID,
    reason: "Administrator requested bounded effect recovery after review.",
    requestId: `${REQUEST_ID}.effect`,
  });
  await api.correctArrivalClass({
    assignmentId: ASSIGNMENT_ID,
    classId: "analyst",
    expectedRevision: 3,
    reason: "Administrator corrected the Arrival Class after reviewed evidence.",
    requestId: `${REQUEST_ID}.arrival`,
  });
  await api.updateRouteState({
    routeIds: [ROUTE_ID],
    status: "closed",
    reason: "war",
    expectedRevision: 19,
    requestId: `${REQUEST_ID}.route`,
  });

  assert.deepEqual(calls.map(({ url }) => url), [
    `/api/admin/games/${GAME_ID}/world/campaign/control`,
    `/api/admin/games/${GAME_ID}/world/campaign/effects/${EFFECT_ID}/recover`,
    `/api/admin/games/${GAME_ID}/world/arrival-classes/${ASSIGNMENT_ID}/correct`,
    `/api/admin/games/${GAME_ID}/world/routes/state`,
  ]);

  const bodies = calls.map(({ init }) => JSON.parse(init.body));
  assert.deepEqual(bodies[0], {
    action: "pause",
    campaignId: CAMPAIGN_ID,
    correctedPhase: null,
    expectedRevision: 7,
    reason: "Administrator paused the campaign after a reviewed safety check.",
  });
  assert.deepEqual(bodies[1], {
    reason: "Administrator requested bounded effect recovery after review.",
    requestId: `${REQUEST_ID}.effect`,
  });
  assert.deepEqual(bodies[2], {
    classId: "analyst",
    expectedRevision: 3,
    reason: "Administrator corrected the Arrival Class after reviewed evidence.",
    requestId: `${REQUEST_ID}.arrival`,
  });
  assert.deepEqual(bodies[3], {
    costMultiplierBasisPoints: 10000,
    durationMultiplierBasisPoints: 10000,
    expectedRevision: 19,
    reason: "war",
    requestId: `${REQUEST_ID}.route`,
    routeIds: [ROUTE_ID],
    status: "closed",
  });
  calls.forEach(({ init }) => {
    const headers = new Headers(init.headers);
    assert.equal(init.method, "POST");
    assert.equal(headers.has("authorization"), false);
    assert.equal(headers.has("idempotency-key"), true);
    assert.equal(headers.get("content-type"), "application/json");
  });

  await assert.rejects(
    api.controlCampaign({
      campaignId: CAMPAIGN_ID,
      action: "invent_new_phase",
      expectedRevision: 7,
      reason: "This is intentionally invalid.",
      idempotencyKey: `${REQUEST_ID}.invalid`,
    }),
    (error) => error?.code === "VALIDATION_FAILED",
  );
  await assert.rejects(
    api.updateRouteState({
      routeIds: [ROUTE_ID],
      status: "restricted",
      reason: "shortage",
      expectedRevision: 19,
      requestId: `${REQUEST_ID}.restricted`,
    }),
    (error) => error?.code === "VALIDATION_FAILED",
  );
  assert.equal(calls.length, 4);
});

test("World API converts backend detail into safe Admin V2 envelopes", async () => {
  const rawDetail = "private SQL USING service_role player_uuid=40000000-0000-4000-8000-000000000004";
  const api = createWorldManagementApi({
    selectedGameId: GAME_ID,
    fetchImpl: async () => jsonResponse({
      code: "access_denied",
      message: rawDetail,
      details: rawDetail,
      retryable: false,
    }, { status: 403, headers: { "x-request-id": "world-safe-test" } }),
    timeoutMs: 1_000,
  });

  const batch = await api.readWorldManagement();
  for (const panel of Object.values(batch.panels)) {
    assert.equal(panel.status, "rejected");
    assert.equal(panel.reason.code, "PERMISSION_DENIED");
    assert.equal(panel.reason.requestId, "world-safe-test");
  }
  assert.equal(JSON.stringify(batch).includes(rawDetail), false);
  assert.equal(JSON.stringify(batch).includes(PRIVATE_PLAYER_UUID), false);
});

test("World model preserves Unicode and authoritative currencies while dropping private IDs", () => {
  const model = normalizeWorldManagementReadModel(populatedWorldBatch());
  const serialized = JSON.stringify(model);

  assert.equal(model.runtime.revision, 19);
  assert.equal(model.countries.length, 2);
  assert.deepEqual(model.currencies.map((row) => row.currencyCode), ["HRC", "NRC"]);
  assert.equal(model.countries.find((row) => row.countryId === "northreach").currencies[0], "NRC");
  assert.equal(model.geography.locations[0].displayName, "노스리치 북항");
  assert.match(model.geography.locations[1].displayName, /^한강 국제 물류 관문/);
  assert.equal(model.effects[0].status, "failed");
  assert.equal(model.arrivals[0].classId, "navigator");
  assert.equal(serialized.includes(PRIVATE_PLAYER_UUID), false);
  assert.equal(/player_id|playerId|definition_digest|idempotency_key|payload/i.test(serialized), false);
});

test("World model treats an uninitialized authoritative runtime as empty", () => {
  const model = normalizeWorldManagementReadModel(emptyWorldBatch());
  assert.equal(model.isEmpty, true);
  assert.equal(model.runtime, null);
  assert.equal(model.countries.length, 0);
  assert.equal(model.currencies.length, 0);
});

function controllerApi(readImpl) {
  const calls = {
    read: 0,
    campaign: 0,
    effect: 0,
    arrival: 0,
    route: 0,
  };
  return {
    calls,
    api: {
      async readWorldManagement() {
        calls.read += 1;
        return readImpl(calls.read);
      },
      cancelWorldRequest() { return false; },
      async controlCampaign() { calls.campaign += 1; return { data: { operation: "campaign" } }; },
      async recoverEffect() { calls.effect += 1; return { data: { operation: "effect" } }; },
      async correctArrivalClass() { calls.arrival += 1; return { data: { operation: "arrival" } }; },
      async updateRouteState() { calls.route += 1; return { data: { operation: "route" } }; },
    },
  };
}

test("World controller enforces world.manage before any read", async () => {
  const fixture = controllerApi(async () => populatedWorldBatch());
  const controller = createWorldManagementController({
    api: fixture.api,
    selectedGameId: GAME_ID,
    hasPermission: () => false,
  });

  const state = await controller.load();
  assert.equal(fixture.calls.read, 0);
  assert.equal(state.status, ADMIN_DATA_STATES.INITIAL_LOADING);
  controller.destroy();
});

test("World controller keeps last good state stale and blocks stale mutations", async () => {
  const unavailable = createAdminErrorEnvelope({
    code: "SERVICE_UNAVAILABLE",
    retryable: true,
  });
  const fixture = controllerApi(async (count) => {
    if (count === 1) return populatedWorldBatch();
    throw unavailable;
  });
  const controller = createWorldManagementController({
    api: fixture.api,
    selectedGameId: GAME_ID,
    hasPermission: (permission) => permission === "world.manage",
  });

  const ready = await controller.load();
  assert.equal(ready.status, ADMIN_DATA_STATES.READY);
  const stale = await controller.load();
  assert.equal(stale.status, ADMIN_DATA_STATES.STALE);
  assert.equal(stale.data.runtime.revision, 19);

  const mutation = await controller.controlCampaign("pause");
  assert.equal(mutation.ok, false);
  assert.equal(mutation.error.code, "CONFLICT");
  assert.equal(fixture.calls.campaign, 0);
  controller.destroy();
});

test("World controller rejects unsupported Arrival Class corrections without mutation", async () => {
  const fixture = controllerApi(async () => populatedWorldBatch());
  const controller = createWorldManagementController({
    api: fixture.api,
    selectedGameId: GAME_ID,
    hasPermission: (permission) => permission === "world.manage",
  });
  await controller.load();

  const assignment = controller.getState().data.arrivals[0];
  const result = await controller.correctArrivalClass(assignment, "invented_class");
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "VALIDATION_FAILED");
  assert.equal(fixture.calls.arrival, 0);
  controller.destroy();
});

test("World Management stays first-class while News & Events remains planned", async () => {
  const world = getAdminNavigationRoute("world-management");
  const news = getAdminNavigationRoute("news-events");
  const market = getAdminNavigationRoute("market");
  const store = getAdminNavigationRoute("store");
  const overview = getAdminNavigationRoute("overview");
  const marketplace = getAdminNavigationRoute("marketplace");

  assert.equal(world.migration, "v2");
  assert.deepEqual(world.permission.allOf, ["world.manage"]);
  assert.equal(news.migration, "planned");
  assert.equal(market.migration, "v2");
  assert.equal(store.migration, "v2");
  assert.equal(overview.migration, "v2");
  assert.equal(marketplace.migration, "planned");

  const routeSource = await readFile(
    new URL("../admin/v2/src/routes/world-management/WorldManagementRoute.js", import.meta.url),
    "utf8",
  );
  const apiSource = await readFile(
    new URL("../admin/v2/src/routes/world-management/WorldManagementApi.js", import.meta.url),
    "utf8",
  );
  const appSource = await readFile(
    new URL("../admin/v2/src/app.js", import.meta.url),
    "utf8",
  );
  const cssSource = await readFile(
    new URL("../admin/v2/styles/routes/world-management.css", import.meta.url),
    "utf8",
  );

  assert.equal(apiSource.includes("/manual-trigger"), false);
  assert.equal(apiSource.includes("publish_news"), false);
  assert.equal(routeSource.includes("manualTrigger"), false);
  assert.match(routeSource, /News & Events remains a separate Admin route/);
  assert.match(appSource, /createWorldManagementController/);
  assert.match(appSource, /createOverviewController/);
  assert.match(appSource, /createStoreController/);
  assert.match(appSource, /createMarketController/);
  assert.match(cssSource, /@media \(max-width: 900px\)/);
  assert.match(cssSource, /@media \(max-width: 640px\)/);
  assert.match(cssSource, /admin-data-table__row/);
});
