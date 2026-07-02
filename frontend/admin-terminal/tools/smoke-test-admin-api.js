const assert = require("assert");
const path = require("path");

globalThis.EconovariaAdminConfig = {
  CLASSROOM_API_URL: "https://example.supabase.co/functions/v1/classroom-api/",
  SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
};

const api = require(path.join("..", "src", "admin-overview", "adminApi.js"));

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function parseRequestBody(call) {
  return JSON.parse(call.options.body || "{}");
}

async function run() {
  const url = api.__test.buildClassroomApiUrl("/games/game-1/players", {
    limit: 25,
    empty: "",
    date: "2026-07-02",
  });
  assert.strictEqual(
    url,
    "https://example.supabase.co/functions/v1/classroom-api/games/game-1/players?limit=25&date=2026-07-02",
    "adapter should construct classroom-api URLs without duplicate slashes and with query params",
  );

  const staffHeaders = api.__test.buildStaffHeaders("Bearer staff-token", {
    jsonBody: true,
    requestId: "request-1",
  });
  assert.strictEqual(staffHeaders.Authorization, "Bearer staff-token");
  assert.strictEqual(staffHeaders.apikey, "publishable-test-key");
  assert.strictEqual(staffHeaders["Content-Type"], "application/json");
  assert.strictEqual(staffHeaders["x-request-id"], "request-1");

  const playerHeaders = api.__test.buildPlayerHeaders("player-session-token", {
    jsonBody: true,
    requestId: "stock-order-1",
  });
  assert.strictEqual(playerHeaders.Authorization, "Bearer publishable-test-key");
  assert.strictEqual(playerHeaders.apikey, "publishable-test-key");
  assert.strictEqual(playerHeaders["x-player-session-token"], "player-session-token");
  assert.strictEqual(playerHeaders["x-request-id"], "stock-order-1");

  const fetchCalls = [];
  globalThis.fetch = async (requestUrl, options) => {
    fetchCalls.push({ url: requestUrl, options });
    return jsonResponse(200, { ok: true, players: [] });
  };

  await api.listPlayers("11111111-1111-4111-8111-111111111111", "staff-token");
  assert.strictEqual(fetchCalls.length, 1);
  assert.strictEqual(
    fetchCalls[0].url,
    "https://example.supabase.co/functions/v1/classroom-api/games/11111111-1111-4111-8111-111111111111/players",
  );
  assert.strictEqual(fetchCalls[0].options.headers.Authorization, "Bearer staff-token");
  assert.strictEqual(fetchCalls[0].options.headers.apikey, "publishable-test-key");

  fetchCalls.length = 0;
  await api.getStaffBootstrap("staff-token");
  await api.createPlayer("11111111-1111-4111-8111-111111111111", "staff-token", { displayName: "Ada Lovelace" });
  await api.resetPlayerAccessCode("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "staff-token");
  await api.getAttendanceDaily("11111111-1111-4111-8111-111111111111", "staff-token", { date: "2026-07-02" });
  await api.scanAttendance("11111111-1111-4111-8111-111111111111", "staff-token", { studentCode: "ABC123", deviceTimezone: "Asia/Seoul" });
  await api.listStoreItems("11111111-1111-4111-8111-111111111111", "staff-token");
  await api.createStoreItem("11111111-1111-4111-8111-111111111111", "staff-token", { name: "Notebook" });
  await api.updateStoreItem("11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333", "staff-token", { price: 5 });
  await api.resetJoinCode("11111111-1111-4111-8111-111111111111", "staff-token");
  await api.seedInitialBalances("11111111-1111-4111-8111-111111111111", "staff-token", { amount: 100 });
  await api.readPlayerLedger("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "staff-token", { limit: 10 });
  await api.adjustPlayerLedger("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "staff-token", { amount: 5, reason: "Audit test" });
  assert.deepStrictEqual(
    fetchCalls.map((call) => `${call.options.method} ${call.url}`),
    [
      "GET https://example.supabase.co/functions/v1/classroom-api/staff/bootstrap",
      "POST https://example.supabase.co/functions/v1/classroom-api/games/11111111-1111-4111-8111-111111111111/players",
      "POST https://example.supabase.co/functions/v1/classroom-api/games/11111111-1111-4111-8111-111111111111/players/22222222-2222-4222-8222-222222222222/access-code/reset",
      "GET https://example.supabase.co/functions/v1/classroom-api/games/11111111-1111-4111-8111-111111111111/attendance?date=2026-07-02",
      "POST https://example.supabase.co/functions/v1/classroom-api/games/11111111-1111-4111-8111-111111111111/attendance/scan",
      "GET https://example.supabase.co/functions/v1/classroom-api/games/11111111-1111-4111-8111-111111111111/store/items",
      "POST https://example.supabase.co/functions/v1/classroom-api/games/11111111-1111-4111-8111-111111111111/store/items",
      "PATCH https://example.supabase.co/functions/v1/classroom-api/games/11111111-1111-4111-8111-111111111111/store/items/33333333-3333-4333-8333-333333333333",
      "POST https://example.supabase.co/functions/v1/classroom-api/games/11111111-1111-4111-8111-111111111111/join-code/reset",
      "POST https://example.supabase.co/functions/v1/classroom-api/games/11111111-1111-4111-8111-111111111111/players/seed-balances",
      "GET https://example.supabase.co/functions/v1/classroom-api/games/11111111-1111-4111-8111-111111111111/players/22222222-2222-4222-8222-222222222222/ledger?limit=10",
      "POST https://example.supabase.co/functions/v1/classroom-api/games/11111111-1111-4111-8111-111111111111/players/22222222-2222-4222-8222-222222222222/ledger-adjustments",
    ],
    "adapter route helpers should match classroom-api backend route paths",
  );

  const stockPayload = api.__test.buildStockOrderPayload("game-session-1", {
    stockAssetId: "stock-asset-1",
    side: "BUY",
    quantity: 4,
    ticker: "FROST",
    shares: 999,
    playerSessionId: "do-not-send",
    idempotencyKey: "stock-order-fixed",
  });
  assert.strictEqual(stockPayload.ok, true);
  assert.deepStrictEqual(stockPayload.payload, {
    gameSessionId: "game-session-1",
    stockAssetId: "stock-asset-1",
    side: "buy",
    quantity: 4,
    idempotencyKey: "stock-order-fixed",
  });
  for (const forbiddenKey of ["playerSessionId", "ticker", "shares", "optionType", "strike", "expiry", "stopPrice", "short"]) {
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(stockPayload.payload, forbiddenKey),
      false,
      `stock order payload should not include ${forbiddenKey}`,
    );
  }

  const sharesOnlyPayload = api.__test.buildStockOrderPayload("game-session-1", {
    stockAssetId: "stock-asset-1",
    side: "buy",
    shares: 4,
    idempotencyKey: "stock-order-shares-only",
  });
  assert.strictEqual(sharesOnlyPayload.ok, false, "legacy shares-only stock orders should not be executable");
  assert.strictEqual(sharesOnlyPayload.code, "stock_order_quantity_required");

  fetchCalls.length = 0;
  globalThis.fetch = async (requestUrl, options) => {
    fetchCalls.push({ url: requestUrl, options });
    return jsonResponse(201, { ok: true, order: { id: "order-1" } });
  };

  await api.placeStockOrder("game-session-1", "player-session-token", {
    stockAssetId: "stock-asset-1",
    side: "sell",
    quantity: 2,
    idempotencyKey: "stock-order-submit",
  });
  assert.strictEqual(fetchCalls.length, 1);
  assert.strictEqual(
    fetchCalls[0].url,
    "https://example.supabase.co/functions/v1/classroom-api/players/me/stocks/orders",
  );
  assert.deepStrictEqual(parseRequestBody(fetchCalls[0]), {
    gameSessionId: "game-session-1",
    stockAssetId: "stock-asset-1",
    side: "sell",
    quantity: 2,
    idempotencyKey: "stock-order-submit",
  });
  assert.strictEqual(fetchCalls[0].options.headers.Authorization, "Bearer publishable-test-key");
  assert.strictEqual(fetchCalls[0].options.headers.apikey, "publishable-test-key");
  assert.strictEqual(fetchCalls[0].options.headers["x-player-session-token"], "player-session-token");

  const advancedOrders = [
    { stockAssetId: "stock-asset-1", side: "buy", quantity: 1, optionType: "call" },
    { stockAssetId: "stock-asset-1", side: "buy", quantity: 1, instrument: "Call" },
    { stockAssetId: "stock-asset-1", side: "buy", quantity: 1, instrument: "Put" },
    { stockAssetId: "stock-asset-1", side: "Short Sell", quantity: 1 },
    { stockAssetId: "stock-asset-1", side: "Cover Short", quantity: 1 },
    { stockAssetId: "stock-asset-1", side: "sell", quantity: 1, orderType: "Stop Loss", stopPrice: 10 },
    { stockAssetId: "stock-asset-1", side: "sell", quantity: 1, orderType: "Stop Limit", stopPrice: 10 },
    { stockAssetId: "stock-asset-1", side: "buy", quantity: 1, instrumentType: "put_option", strike: 100, expiry: "W2" },
    { stockAssetId: "stock-asset-1", side: "buy", quantity: 1, short: false },
  ];

  for (const advancedOrder of advancedOrders) {
    fetchCalls.length = 0;
    const result = await api.placeStockOrder("game-session-1", "player-session-token", advancedOrder);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, "advanced_stock_order_not_supported");
    assert.strictEqual(fetchCalls.length, 0, "advanced marketplace actions should not be submitted");
  }

  console.log("Admin API adapter smoke tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
