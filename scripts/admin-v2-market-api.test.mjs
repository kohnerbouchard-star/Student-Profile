import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_MARKET_DETAIL_RESOURCE_KEYS,
  ADMIN_MARKET_RESOURCE_KEYS,
  createAdminApiClient,
} from "../admin/v2/src/api/admin-api-client.js";
import { isAdminErrorEnvelope } from "../admin/v2/src/core/error-envelope.js";
import {
  createMarketController,
  normalizeMarketReadModel,
} from "../admin/v2/src/routes/market/MarketController.js";

const GAME_ID = "10000000-0000-4000-8000-000000000001";
const ASSET_ID = "20000000-0000-4000-8000-000000000002";
const TRADE_ID = "30000000-0000-4000-8000-000000000003";
const PLAYER_ID = "40000000-0000-4000-8000-000000000004";
const EVENT_ID = "50000000-0000-4000-8000-000000000005";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function asset(overrides = {}) {
  return {
    id: ASSET_ID,
    assetId: ASSET_ID,
    ticker: "FGRM",
    symbol: "FGRM",
    companyName: "서리문 희토류 광업",
    name: "서리문 희토류 광업",
    type: "stock",
    assetType: "stock",
    sector: "RARE_MINERALS",
    countryCode: "NORTHREACH",
    description: "A fictional listed company.",
    currentPrice: 84.5,
    previousClose: 82,
    open: 82,
    high: 85,
    low: 81.5,
    change: 2.5,
    changePct: 3.04878,
    marketCap: 152_100_000,
    beta: 1.22,
    volatility: 0.052,
    isActive: true,
    chartHistory: [{
      gameSessionId: GAME_ID,
      tickIndex: 8,
      timestamp: "2026-08-07T02:00:00.000Z",
      label: "Tick 8",
      price: 84.5,
      volume: 1_240,
    }],
    fundamentals: {
      revenueGrowth: 0.07,
      profitMargin: 0.16,
      debtLevel: 0.32,
      cashReserves: 0.58,
      innovationScore: 0.42,
      supplyChainRisk: 0.48,
      politicalExposure: 0.38,
      commodityExposure: 0.82,
      peRatio: 99,
    },
    currencyCode: "NRC",
    exchange: "NRX",
    marketStatus: "open",
    updatedAt: "2026-08-07T02:00:00.000Z",
    ...overrides,
  };
}

function trade(overrides = {}) {
  return {
    id: TRADE_ID,
    tradeId: TRADE_ID,
    playerId: PLAYER_ID,
    assetId: ASSET_ID,
    ticker: "FGRM",
    side: "buy",
    quantity: 3,
    executionPrice: 84.5,
    grossValue: 253.5,
    assetName: "서리문 희토류 광업",
    currencyCode: "NRC",
    createdAt: "2026-08-07T02:02:00.000Z",
    ...overrides,
  };
}

function marketEvent(overrides = {}) {
  return {
    id: EVENT_ID,
    eventId: EVENT_ID,
    headline: "Rare-mineral demand rises",
    explanation: "Demand increased during the current scenario.",
    category: "resource_shock",
    sentiment: "positive",
    source: "runner",
    magnitude: 0.0275,
    volatilityImpact: 0.08,
    active: true,
    status: "active",
    createdAt: "2026-08-07T02:01:00.000Z",
    ...overrides,
  };
}

function fulfilled(value) {
  return Object.freeze({ status: "fulfilled", value });
}

function rejected(reason) {
  return Object.freeze({ status: "rejected", reason });
}

function marketBatch({
  assets = [asset()],
  events = [marketEvent()],
  trades = [trade()],
  eventFailure = null,
  tradeFailure = null,
  requestVersion = 1,
  current = true,
} = {}) {
  return Object.freeze({
    requestVersion,
    current,
    panels: Object.freeze({
      assets: fulfilled({ data: { assets, marketplaceSecurities: assets } }),
      events: eventFailure
        ? rejected(eventFailure)
        : fulfilled({ data: { events, marketEvents: events, news: events } }),
      trades: tradeFailure
        ? rejected(tradeFailure)
        : fulfilled({ data: { trades, marketplaceTrades: trades } }),
    }),
  });
}

function marketDetail({ requestVersion = 1, current = true } = {}) {
  const fundamentals = asset().fundamentals;
  return Object.freeze({
    requestVersion,
    current,
    panels: Object.freeze({
      profile: fulfilled({ data: { asset: asset(), profile: asset() } }),
      chart: fulfilled({
        data: {
          candles: [{
            time: "2026-08-07T02:00:00.000Z",
            close: 84.5,
            open: 82,
            high: 84.5,
            low: 82,
            volume: 1_240,
            changePct: 3.04878,
          }],
        },
      }),
      financials: fulfilled({ data: { assetId: ASSET_ID, financials: fundamentals, fundamentals } }),
    }),
  });
}

test("Market client uses the exact read-only batch and lazy-detail contracts", async () => {
  const calls = [];
  const client = createAdminApiClient({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.includes("/profile")) return jsonResponse({ data: { asset: asset(), profile: asset() } });
      if (url.includes("/chart")) return jsonResponse({ data: { candles: [], chart: [] } });
      if (url.includes("/financials")) {
        return jsonResponse({ data: { financials: asset().fundamentals, fundamentals: asset().fundamentals } });
      }
      if (url.includes("/market/assets")) return jsonResponse({ data: { assets: [asset()] } });
      if (url.includes("/market/events")) return jsonResponse({ data: { events: [marketEvent()] } });
      return jsonResponse({ data: { trades: [trade()] } });
    },
    timeoutMs: 1_000,
  });

  const batch = await client.readMarket({ gameId: GAME_ID });
  const detail = await client.readMarketDetail({ gameId: GAME_ID, resourceId: ASSET_ID });

  assert.deepEqual(Object.keys(batch.panels), ADMIN_MARKET_RESOURCE_KEYS);
  assert.deepEqual(Object.keys(detail.panels), ADMIN_MARKET_DETAIL_RESOURCE_KEYS);
  assert.equal(batch.current, true);
  assert.equal(detail.current, true);
  assert.deepEqual(calls.map(({ url }) => url), [
    `/api/admin/games/${GAME_ID}/market/assets?include=quotes`,
    `/api/admin/games/${GAME_ID}/market/events?status=active,recent`,
    `/api/admin/games/${GAME_ID}/market/trades/recent?scope=all-players`,
    `/api/admin/games/${GAME_ID}/market/assets/${ASSET_ID}/profile`,
    `/api/admin/games/${GAME_ID}/market/assets/${ASSET_ID}/chart`,
    `/api/admin/games/${GAME_ID}/market/assets/${ASSET_ID}/financials`,
  ]);
  calls.forEach(({ init }) => {
    assert.equal(init.method, "GET");
    assert.equal(init.credentials, "include");
    assert.equal(init.cache, "no-store");
    assert.equal(init.redirect, "error");
    assert.equal("Authorization" in init.headers, false);
    assert.equal("body" in init, false);
  });
  assert.equal(client.createMarketEvent, undefined);
  assert.equal(client.updateMarketAsset, undefined);
  assert.equal(client.pauseMarket, undefined);
});

test("Market client settles optional panel failures into safe envelopes", async () => {
  const rawDetail = "SELECT * FROM private_table USING service_role";
  const client = createAdminApiClient({
    fetchImpl: async (url) => {
      if (url.includes("/assets")) return jsonResponse({ data: { assets: [asset()] } });
      if (url.includes("/events")) {
        return jsonResponse({ code: "admin_rate_limit_exceeded", message: rawDetail, retryable: true }, {
          status: 429,
          headers: { "retry-after": "9" },
        });
      }
      return jsonResponse({ data: { wrong: [] } });
    },
    timeoutMs: 1_000,
  });

  const result = await client.readMarket({ gameId: GAME_ID });
  assert.equal(result.panels.assets.status, "fulfilled");
  assert.equal(result.panels.events.status, "rejected");
  assert.equal(result.panels.events.reason.code, "RATE_LIMITED");
  assert.equal(result.panels.events.reason.retryAfterSeconds, 9);
  assert.equal(result.panels.trades.status, "rejected");
  assert.equal(result.panels.trades.reason.code, "INVALID_RESPONSE");
  assert.equal(JSON.stringify(result).includes(rawDetail), false);

  const model = normalizeMarketReadModel(result);
  assert.equal(model.instruments.length, 1);
  assert.equal(model.events.length, 0);
  assert.equal(model.trades.length, 0);
  assert.equal(model.panels.events.status, "failed");
  assert.equal(model.panels.trades.status, "failed");
});

test("Market client safely normalizes read-path 401, 403, 409, 422, 429, and 5xx failures", async () => {
  const rawDetail = "internal SQL, Supabase service-role, and function trace";
  const cases = [
    { status: 401, code: "auth_required", expected: "SESSION_REQUIRED" },
    { status: 403, code: "access_denied", expected: "PERMISSION_DENIED" },
    { status: 409, code: "market_conflict", expected: "CONFLICT" },
    { status: 422, code: "invalid_market_filter", expected: "VALIDATION_FAILED" },
    { status: 429, code: "admin_rate_limit_exceeded", expected: "RATE_LIMITED" },
    { status: 503, code: "upstream_unavailable", expected: "SERVICE_UNAVAILABLE" },
  ];

  for (const fixture of cases) {
    const client = createAdminApiClient({
      fetchImpl: async () => jsonResponse({
        code: fixture.code,
        message: rawDetail,
        details: rawDetail,
        retryable: true,
      }, {
        status: fixture.status,
        headers: fixture.status === 429 ? { "retry-after": "7" } : {},
      }),
      timeoutMs: 1_000,
    });
    const result = await client.readMarket({ gameId: GAME_ID });
    const error = result.panels.assets.reason;
    assert.equal(error.code, fixture.expected);
    assert.equal(isAdminErrorEnvelope(error), true);
    assert.equal(JSON.stringify(result).includes(rawDetail), false);
    if (fixture.status === 429) assert.equal(error.retryAfterSeconds, 7);
  }
});

test("Market client keeps main and detail cancellation independent", async () => {
  const detailSignals = [];
  const client = createAdminApiClient({
    fetchImpl: async (url, init) => {
      if (url.includes(`/${ASSET_ID}/`)) {
        detailSignals.push(init.signal);
        return await new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        });
      }
      if (url.includes("/assets")) return jsonResponse({ data: { assets: [asset()] } });
      if (url.includes("/events")) return jsonResponse({ data: { events: [] } });
      return jsonResponse({ data: { trades: [] } });
    },
    timeoutMs: 1_000,
  });

  const main = await client.readMarket({ gameId: GAME_ID });
  const pendingDetail = client.readMarketDetail({ gameId: GAME_ID, resourceId: ASSET_ID });
  await Promise.resolve();
  assert.equal(client.cancelMarketRequest(), false);
  assert.equal(client.cancelMarketDetailRequest(), true);
  assert.equal(client.cancelMarketDetailRequest(), false);
  const detail = await pendingDetail;

  assert.equal(main.current, true);
  assert.equal(detail.current, false);
  assert.equal(detailSignals.length, 3);
  assert.equal(detailSignals.every((signal) => signal.aborted), true);
  assert.equal(Object.values(detail.panels).every((entry) => entry.status === "rejected"), true);
});

test("Market read-model exposes public symbols and excludes UUID, currency, and inferred session data", () => {
  const model = normalizeMarketReadModel(marketBatch());
  const serialized = JSON.stringify(model);

  assert.equal(model.instruments[0].rowKey, "FGRM");
  assert.equal(model.instruments[0].symbol, "FGRM");
  assert.equal(model.instruments[0].name, "서리문 희토류 광업");
  assert.equal(model.instruments[0].type, "stock");
  assert.deepEqual(Object.keys(model.instruments[0].fundamentals), [
    "revenueGrowth",
    "profitMargin",
    "debtLevel",
    "cashReserves",
    "innovationScore",
    "supplyChainRisk",
    "politicalExposure",
    "commodityExposure",
  ]);
  assert.equal(model.instruments[0].history[0].volume, 1_240);
  assert.equal(model.trades[0].symbol, "FGRM");
  assert.equal(model.events[0].active, true);
  assert.equal(serialized.includes(ASSET_ID), false);
  assert.equal(serialized.includes(TRADE_ID), false);
  assert.equal(serialized.includes(PLAYER_ID), false);
  assert.equal(serialized.includes(EVENT_ID), false);
  assert.equal(/currency|exchange|marketStatus/i.test(serialized), false);
  assert.equal(serialized.includes("peRatio"), false);
});

test("Market read-model drops malformed object and array text optionals", () => {
  const model = normalizeMarketReadModel(marketBatch({
    assets: [asset({
      description: { raw: "must not stringify" },
      sector: ["RARE_MINERALS"],
    })],
    events: [marketEvent({ source: { label: "runner" } })],
    trades: [trade({ assetName: ["must not stringify"] })],
  }));
  const serialized = JSON.stringify(model);

  assert.equal(model.instruments[0].description, "");
  assert.equal(model.instruments[0].sector, "");
  assert.equal(model.events[0].source, "");
  assert.equal(model.trades[0].assetName, "");
  assert.equal(serialized.includes("[object Object]"), false);
  assert.equal(serialized.includes("must not stringify"), false);
});

test("Market controller fails closed before protected calls and owns six-state refresh behavior", async () => {
  let readCount = 0;
  let cancelCount = 0;
  let allowed = false;
  const changes = [];
  let nextBatch = marketBatch();
  const api = {
    async readMarket() {
      readCount += 1;
      if (nextBatch instanceof Error) throw nextBatch;
      return nextBatch;
    },
    async readMarketDetail() { return marketDetail(); },
    cancelMarketRequest() { cancelCount += 1; return false; },
    cancelMarketDetailRequest() { return false; },
  };
  const controller = createMarketController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: (permission) => allowed && permission === "market.manage",
    onChange: (state) => changes.push(state.status),
  });

  assert.equal(controller.getState().status, "initial-loading");
  await controller.load();
  assert.equal(readCount, 0);
  assert.equal(cancelCount, 0);
  assert.deepEqual(changes, []);

  allowed = true;
  await controller.load();
  assert.equal(controller.getState().status, "ready");
  assert.deepEqual(changes, ["initial-loading", "ready"]);

  nextBatch = new Error("Supabase function leaked internal SQL");
  await controller.load();
  assert.equal(controller.getState().status, "stale");
  assert.equal(controller.getState().data.instruments[0].rowKey, "FGRM");
  assert.equal(JSON.stringify(controller.getState()).includes("Supabase"), false);

  nextBatch = marketBatch({ assets: [] });
  await controller.load();
  assert.equal(controller.getState().status, "empty");
  controller.destroy();
});

test("Market controller keeps UUIDs private and detail updates out of shell rendering", async () => {
  const shellChanges = [];
  const detailCalls = [];
  let detailCancelCount = 0;
  const api = {
    async readMarket() { return marketBatch(); },
    async readMarketDetail(input) {
      detailCalls.push(input);
      return marketDetail({ requestVersion: detailCalls.length });
    },
    cancelMarketRequest() { return false; },
    cancelMarketDetailRequest() { detailCancelCount += 1; return false; },
  };
  const controller = createMarketController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: (permission) => permission === "market.manage",
    onChange: (state) => shellChanges.push(state.status),
  });

  await controller.load();
  const shellChangeCount = shellChanges.length;
  const detailState = await controller.loadDetail("FGRM");

  assert.equal(detailCalls.length, 1);
  assert.deepEqual(detailCalls[0], { gameId: GAME_ID, resourceId: ASSET_ID });
  assert.equal(detailState.status, "ready");
  assert.equal(detailState.data.rowKey, "FGRM");
  assert.equal(detailState.data.chart.length, 1);
  assert.equal(JSON.stringify(detailState).includes(ASSET_ID), false);
  assert.equal(shellChanges.length, shellChangeCount);
  assert.equal(detailCancelCount, 1);

  assert.deepEqual(controller.updateFilters({
    query: "서리문",
    sector: "RARE_MINERALS",
    type: "stock",
    status: "active",
    country: "NORTHREACH",
  }), {
    query: "서리문",
    sector: "rare_minerals",
    type: "stock",
    status: "active",
    country: "northreach",
  });
  assert.equal(shellChanges.length, shellChangeCount);

  assert.equal(
    controller.updateFilters({ sector: "첨단 희토류 및 장기 부문 이름" }).sector,
    "첨단 희토류 및 장기 부문 이름",
  );
  controller.destroy();
});

test("Market controller resets a canceled first load so route reactivation can load again", async () => {
  let resolveFirstRead;
  let firstReadActive = false;
  let firstReadCancelled = false;
  let readCount = 0;
  const firstRead = new Promise((resolve) => {
    resolveFirstRead = resolve;
  });
  const api = {
    async readMarket() {
      readCount += 1;
      if (readCount === 1) {
        firstReadActive = true;
        return firstRead;
      }
      return marketBatch({ requestVersion: readCount });
    },
    async readMarketDetail() { return marketDetail(); },
    cancelMarketRequest() {
      if (!firstReadActive || firstReadCancelled) return false;
      firstReadCancelled = true;
      return true;
    },
    cancelMarketDetailRequest() { return false; },
  };
  const controller = createMarketController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: (permission) => permission === "market.manage",
  });

  const pendingFirstLoad = controller.load();
  assert.equal(controller.getState().status, "initial-loading");
  assert.equal(controller.getState().requestVersion, 1);

  controller.deactivate();
  assert.equal(controller.getState().status, "initial-loading");
  assert.equal(controller.getState().requestVersion, 0);

  resolveFirstRead(marketBatch({ requestVersion: 1, current: false }));
  await pendingFirstLoad;
  await controller.load();
  assert.equal(readCount, 2);
  assert.equal(controller.getState().status, "ready");
  controller.destroy();
});

test("Market controller ignores superseded detail responses and tears down both request classes", async () => {
  const pending = [];
  let cancelMainCount = 0;
  let cancelDetailCount = 0;
  const api = {
    async readMarket() { return marketBatch(); },
    readMarketDetail() {
      return new Promise((resolve) => pending.push(resolve));
    },
    cancelMarketRequest() { cancelMainCount += 1; return true; },
    cancelMarketDetailRequest() { cancelDetailCount += 1; return true; },
  };
  const controller = createMarketController({
    api,
    selectedGameId: GAME_ID,
    hasPermission: () => true,
  });

  await controller.load();
  const first = controller.loadDetail("FGRM");
  const second = controller.loadDetail("FGRM");
  pending[0](marketDetail({ requestVersion: 1 }));
  pending[1](marketDetail({ requestVersion: 2 }));
  await Promise.all([first, second]);
  assert.equal(controller.getDetailState().status, "ready");
  assert.equal(controller.getDetailState().requestVersion, 2);

  controller.destroy();
  assert.equal(cancelMainCount >= 2, true);
  assert.equal(cancelDetailCount >= 3, true);
});
