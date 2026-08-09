import assert from "node:assert/strict";
import test from "node:test";

import { createNewsEventsApi } from "../admin/v2/src/routes/news-events/NewsEventsApi.js";
import {
  createNewsEventsController,
  normalizeNewsEventsReadModel,
} from "../admin/v2/src/routes/news-events/NewsEventsController.js";
import { isAdminErrorEnvelope } from "../admin/v2/src/core/error-envelope.js";

const GAME_ID = "10000000-0000-4000-8000-000000000001";
const PRIVATE_UUID = "20000000-0000-4000-8000-000000000002";
const FAILED_EFFECT_ID = "cec_0123456789abcdef0123456789abcdef";
const COMPLETED_EFFECT_ID = "cec_11111111111111111111111111111111";
const RAW_DIAGNOSTIC = "SELECT * FROM private.campaign_effect_commands USING service_role";

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
  return Object.freeze({ status: "fulfilled", value: Object.freeze({ data }) });
}

function rejected(reason) {
  return Object.freeze({ status: "rejected", reason });
}

function campaign(overrides = {}) {
  return {
    public_id: "cmp_0123456789abcdef0123456789abcdef",
    status: "active",
    current_phase: "shortage",
    revision: 9,
    event_sequence: 14,
    scheduled_at: "2026-08-08T03:00:00.000Z",
    updated_at: "2026-08-07T03:00:00.000Z",
    ...overrides,
  };
}

function historyEvent(overrides = {}) {
  return {
    public_id: "evt_shortage_014",
    event_key: "shortage.logistics.disruption",
    trigger_key: "scheduled.shortage.014",
    from_phase: "rivalry",
    to_phase: "shortage",
    sequence: 14,
    actor_type: "system",
    reason: "항만 혼잡과 공급 제약으로 물류 비용이 증가했습니다. 관리자 화면의 긴 한국어 이벤트 사유를 검증합니다.",
    occurred_at: "2026-08-07T02:30:00.000Z",
    created_at: "2026-08-07T02:30:00.000Z",
    ...overrides,
  };
}

function newsEffect(status, id, overrides = {}) {
  const timestamps = {
    pending: { created_at: "2026-08-07T02:00:00.000Z" },
    processing: { created_at: "2026-08-07T01:50:00.000Z", claimed_at: "2026-08-07T02:40:00.000Z" },
    completed: { created_at: "2026-08-07T01:00:00.000Z", claimed_at: "2026-08-07T01:01:00.000Z", completed_at: "2026-08-07T01:02:00.000Z" },
    failed: { created_at: "2026-08-07T00:30:00.000Z", claimed_at: "2026-08-07T00:31:00.000Z" },
  }[status];
  return {
    public_id: id,
    idempotency_key: `campaign:${status}:news`,
    effect_kind: "publish_news",
    payload: {
      newsDefinitionId: `news.${status}.regional_update`,
      audience: status === "processing" ? "affected_locations" : "all_players",
    },
    status,
    attempt_count: status === "failed" ? 3 : 1,
    last_error_code: status === "failed" ? "campaign_news_delivery_failed" : null,
    ...timestamps,
    updated_at: "2026-08-07T02:45:00.000Z",
    ...overrides,
  };
}

function nonNewsEffect() {
  return {
    public_id: "cec_22222222222222222222222222222222",
    effect_kind: "apply_market_shock",
    payload: { marketShockDefinitionId: "market.shortage", magnitudeBasisPoints: -400 },
    status: "completed",
    attempt_count: 1,
    completed_at: "2026-08-07T01:05:00.000Z",
  };
}

function batch({ campaigns = [campaign()], history = [historyEvent()], effects = null, failures = {} } = {}) {
  const rows = effects || [
    newsEffect("pending", "cec_33333333333333333333333333333333"),
    newsEffect("processing", "cec_44444444444444444444444444444444"),
    newsEffect("completed", COMPLETED_EFFECT_ID),
    newsEffect("failed", FAILED_EFFECT_ID),
    nonNewsEffect(),
  ];
  return Object.freeze({
    requestVersion: 1,
    current: true,
    panels: Object.freeze({
      campaign: failures.campaign ? rejected(failures.campaign) : fulfilled({ campaigns, scheduler: {} }),
      history: failures.history ? rejected(failures.history) : fulfilled({ history }),
      effects: failures.effects ? rejected(failures.effects) : fulfilled({
        effects: rows,
        summary: { pending: 1, processing: 1, completed: 2, failed: 1 },
      }),
    }),
  });
}

test("News & Events API uses only authoritative campaign read contracts", async () => {
  const calls = [];
  const api = createNewsEventsApi({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/world/campaign")) {
        return jsonResponse({ data: { campaigns: [campaign()], scheduler: {} } });
      }
      if (url.includes("/history")) return jsonResponse({ data: { history: [historyEvent()] } });
      return jsonResponse({ data: { effects: [newsEffect("completed", COMPLETED_EFFECT_ID)], summary: {} } });
    },
    timeoutMs: 1_000,
  });

  const result = await api.readNewsEvents({ gameId: GAME_ID });

  assert.equal(result.current, true);
  assert.deepEqual(calls.map(({ url }) => url), [
    `/api/admin/games/${GAME_ID}/world/campaign`,
    `/api/admin/games/${GAME_ID}/world/campaign/history?limit=250`,
    `/api/admin/games/${GAME_ID}/world/campaign/effects?status=all&limit=250`,
  ]);
  calls.forEach(({ init }) => {
    assert.equal(init.method, "GET");
    assert.equal(init.credentials, "include");
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    assert.equal("body" in init, false);
  });
  assert.equal(api.createNews, undefined);
  assert.equal(api.updateNews, undefined);
  assert.equal(api.scheduleNews, undefined);
  assert.equal(api.triggerWorldEvent, undefined);
});

test("News & Events read model covers past events and active/upcoming/past/failed publications", () => {
  const { model } = normalizeNewsEventsReadModel(batch(), Date.parse("2026-08-07T03:00:00.000Z"));

  assert.equal(model.events.length, 1);
  assert.equal(model.events[0].eventKey, "shortage.logistics.disruption");
  assert.match(model.events[0].reason, /공급 제약/);
  assert.equal(model.news.length, 4);
  assert.deepEqual(model.news.map((item) => item.lifecycle), ["upcoming", "active", "past", "failed"]);
  assert.equal(model.summary.eventCount, 1);
  assert.equal(model.summary.newsPublicationCount, 4);
  assert.equal(model.summary.activeCount, 1);
  assert.equal(model.summary.upcomingCount, 2, "pending publication plus scheduled campaign checkpoint");
  assert.equal(model.summary.failedCount, 1);
  assert.equal(model.news.some((item) => item.newsDefinitionId === "market.shortage"), false);
});

test("News & Events read model handles zero records without inventing lifecycle data", () => {
  const { model } = normalizeNewsEventsReadModel(batch({ campaigns: [], history: [], effects: [] }));
  assert.equal(model.isEmpty, true);
  assert.deepEqual(model.events, []);
  assert.deepEqual(model.news, []);
  assert.equal(model.summary.activeCount, 0);
  assert.equal(model.summary.upcomingCount, 0);
});

test("News & Events read model strips UUID-bearing text and private identifiers", () => {
  const result = batch({
    campaigns: [campaign({ private_owner: PRIVATE_UUID })],
    history: [historyEvent({ reason: `Internal owner ${PRIVATE_UUID}` })],
    effects: [newsEffect("failed", FAILED_EFFECT_ID, { private_owner: PRIVATE_UUID })],
  });
  const { model } = normalizeNewsEventsReadModel(result);
  const serialized = JSON.stringify(model);

  assert.equal(model.events[0].reason, "");
  assert.equal(serialized.includes(GAME_ID), false);
  assert.equal(serialized.includes(PRIVATE_UUID), false);
  assert.equal(serialized.includes(FAILED_EFFECT_ID), false, "effect recovery id remains controller-private");
  assert.doesNotMatch(serialized, /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

test("News & Events settles safe panel failures without leaking backend details", async () => {
  const api = createNewsEventsApi({
    fetchImpl: async (url) => {
      if (url.includes("/history")) {
        return jsonResponse({ code: "admin_rate_limit_exceeded", message: RAW_DIAGNOSTIC, details: RAW_DIAGNOSTIC }, {
          status: 429,
          headers: { "retry-after": "8" },
        });
      }
      if (url.includes("/effects")) return new Response(RAW_DIAGNOSTIC, { status: 200, headers: { "content-type": "text/plain" } });
      return jsonResponse({ data: { campaigns: [campaign()], scheduler: {} } });
    },
    timeoutMs: 1_000,
  });

  const result = await api.readNewsEvents({ gameId: GAME_ID });
  assert.equal(result.panels.campaign.status, "fulfilled");
  assert.equal(result.panels.history.status, "rejected");
  assert.equal(result.panels.history.reason.code, "RATE_LIMITED");
  assert.equal(result.panels.history.reason.retryAfterSeconds, 8);
  assert.equal(result.panels.effects.status, "rejected");
  assert.equal(result.panels.effects.reason.code, "INVALID_RESPONSE");
  assert.equal(JSON.stringify(result).includes(RAW_DIAGNOSTIC), false);

  const { model } = normalizeNewsEventsReadModel(result);
  assert.equal(model.panels.history.status, "failed");
  assert.equal(model.panels.effects.status, "failed");
  assert.equal(JSON.stringify(model).includes(RAW_DIAGNOSTIC), false);
});

test("News & Events controller fails closed before protected reads", async () => {
  let reads = 0;
  const controller = createNewsEventsController({
    api: {
      async readNewsEvents() { reads += 1; return batch(); },
      async recoverNewsPublication() { throw new Error("should not run"); },
      cancelNewsEventsRequest() {},
    },
    selectedGameId: GAME_ID,
    hasPermission: () => false,
  });

  await controller.load();
  assert.equal(reads, 0);
  assert.equal(controller.getState().hasResolved, false);
  controller.destroy();
});

test("News & Events recovery is limited to failed publish_news effects and sends the exact reviewed mutation", async () => {
  const calls = [];
  let readCount = 0;
  const api = {
    async readNewsEvents() { readCount += 1; return batch(); },
    async recoverNewsPublication(input) { calls.push(input); return { data: { outcome: [{ status: "pending" }] } }; },
    cancelNewsEventsRequest() {},
  };
  const notices = [];
  const controller = createNewsEventsController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: (permission) => permission === "world.manage",
    notify: (notice) => notices.push(notice),
  });

  await controller.load();
  const completed = controller.getState().data.news.find((row) => row.status === "completed");
  const failed = controller.getState().data.news.find((row) => row.status === "failed");
  assert.equal(await controller.recover(completed.rowKey, "Reviewed and approved recovery."), false);
  assert.equal(calls.length, 0);
  assert.equal(await controller.recover(failed.rowKey, "Reviewed after delivery service recovery."), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].gameId, GAME_ID);
  assert.equal(calls[0].effectId, FAILED_EFFECT_ID);
  assert.equal(calls[0].reason, "Reviewed after delivery service recovery.");
  assert.match(calls[0].requestId, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/);
  assert.equal(readCount, 2, "successful recovery refreshes authoritative state");
  assert.equal(notices.some((notice) => notice.title === "Recovery queued"), true);
  controller.destroy();
});

test("News & Events API recovery posts only reason/requestId and surfaces safe errors", async () => {
  const calls = [];
  const requestId = "news-recover:test:12345678";
  const api = createNewsEventsApi({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ code: "UPSTREAM_UNAVAILABLE", message: RAW_DIAGNOSTIC }, { status: 503 });
    },
  });

  await assert.rejects(
    api.recoverNewsPublication({
      gameId: GAME_ID,
      effectId: FAILED_EFFECT_ID,
      reason: "Reviewed recovery after worker outage.",
      requestId,
    }),
    (error) => {
      assert.equal(isAdminErrorEnvelope(error), true);
      assert.equal(error.code, "SERVICE_UNAVAILABLE");
      assert.equal(JSON.stringify(error).includes(RAW_DIAGNOSTIC), false);
      return true;
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `/api/admin/games/${GAME_ID}/world/campaign/effects/${FAILED_EFFECT_ID}/recover`);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Idempotency-Key"], requestId);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    reason: "Reviewed recovery after worker outage.",
    requestId,
  });
});
