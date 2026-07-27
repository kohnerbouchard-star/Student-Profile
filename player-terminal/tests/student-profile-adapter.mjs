import assert from "node:assert/strict";

import { createStudentProfileApiCall } from "../src/integrations/student-profile-api-call.js";

const CSRF = "C".repeat(43);

const rawSession = {
  gameSession: { id: "game-1", name: "Econovaria Class", status: "active" },
  player: {
    id: "0c80fe6d-e1d9-4e90-90f4-1b174be727f1",
    playerIdentifier: "CARD-200",
    displayName: "Alex Rivera"
  },
  session: {
    status: "active",
    expiresAt: "2026-07-27T08:00:00.000Z"
  },
  balances: [{ accountType: "cash", currencyCode: "ECO", balance: 1250 }]
};

const capabilityManifest = {
  ok: true,
  schemaVersion: 1,
  manifestVersion: "2026-07-27.1",
  service: "player-api",
  capabilities: {
    routes: {
      dashboard: true,
      store: true,
      banking: true,
      market: true,
      portfolio: true
    },
    actions: {
      storePurchase: true,
      marketOrder: true,
      bankTransfer: true,
      logout: true
    }
  },
  endpoints: [
    { key: "capabilities", operations: [{ method: "GET", pathTemplate: "/players/me/capabilities" }] },
    { key: "dashboard", operations: [{ method: "GET", pathTemplate: "/players/me/game/dashboard" }] },
    { key: "store", operations: [{ method: "GET", pathTemplate: "/players/me/store/items" }] },
    { key: "storePurchase", operations: [{ method: "POST", pathTemplate: "/players/me/store/purchases" }] },
    { key: "marketOrder", operations: [{ method: "POST", pathTemplate: "/players/me/stocks/orders" }] },
    { key: "bankTransfer", operations: [{ method: "POST", pathTemplate: "/players/me/banking/transfers" }] },
    { key: "logout", operations: [{ method: "POST", pathTemplate: "/players/me/session/logout" }] }
  ]
};

const responses = {
  session: rawSession,
  capabilities: capabilityManifest,
  dashboard: {
    gameSession: { id: "game-1", name: "Econovaria Class", marketStatus: "open" },
    me: {
      displayName: "Alex Rivera",
      playerIdentifier: "CARD-200",
      countryCode: "ELD",
      netWorth: 1500,
      cash: {
        primaryCurrencyCode: "ECO",
        totalBalance: 1250,
        balances: [{ accountType: "cash", currencyCode: "ECO", balance: 1250 }]
      },
      stocks: { portfolio: { holdingsMarketValue: 250 }, holdings: [] },
      store: { listings: [], inventory: [] },
      contracts: { available: [], progress: [] }
    },
    public: { market: { stocks: [] }, news: [] }
  },
  store: {
    items: [{
      id: "item-1",
      itemId: "item-1",
      itemKey: "market-lens",
      name: "Market Lens",
      category: "Equipment",
      description: "Market analysis equipment.",
      price: 50,
      stockQuantity: 8
    }]
  },
  storePurchase: {
    ok: true,
    receipt: {
      receiptKey: "receipt_22222222222222222222222222222222",
      quoteKey: "quote_11111111111111111111111111111111",
      itemKey: "market-lens",
      itemName: "Market Lens",
      quantity: 1,
      finalUnitPrice: 50,
      finalTotalPrice: 50,
      currencyCode: "ECO",
      inventoryQuantityOwned: 2,
      completedAt: "2026-07-27T04:00:00.000Z",
      alreadyCompleted: false
    },
    refreshRequired: true
  },
  marketOrder: {
    ok: true,
    action: "execute_order",
    order: {
      ticker: "AURA",
      side: "buy",
      quantity: 2,
      executionPrice: 100,
      grossValue: 200,
      status: "filled",
      rejectionReason: null
    },
    cash: { accountType: "cash", currencyCode: "ECO", balance: 1050 },
    holding: { quantity: 2, averageCost: 100 }
  },
  bankTransfer: {
    ok: true,
    result: {
      transfer_key: "trf_33333333333333333333333333333333",
      amount: 10,
      currency_code: "ECO",
      recipient_player_identifier: "CARD-201",
      already_completed: false
    },
    refreshRequired: true
  }
};

const calls = [];
const apiCall = createStudentProfileApiCall({
  request: async (request) => {
    calls.push(structuredClone({ ...request, signal: undefined }));
    return structuredClone(responses[request.endpointKey]);
  }
});

function context(endpointKey, method, path, payload, extra = {}) {
  return {
    endpointKey,
    method,
    path,
    payload,
    params: extra.params || {},
    requestId: extra.requestId || `req-${endpointKey}`,
    idempotencyKey: extra.idempotencyKey || "",
    signal: null,
    session: {
      authenticated: true,
      csrfToken: CSRF,
      gameSessionId: "game-1"
    },
    config: {
      authenticated: true,
      csrfToken: CSRF,
      gameSessionId: "game-1",
      publishableKey: "sb_publishable_adapter_fixture"
    }
  };
}

const sessionStart = calls.length;
const session = await apiCall(context("session", "GET", "/session"));
assert.equal(session.displayName, "Alex Rivera");
assert.equal(session.playerId, "CARD-200");
assert.equal(session.capabilitySchemaVersion, 1);
assert.equal(session.capabilityManifestVersion, "2026-07-27.1");
assert.equal(session.capabilityService, "player-api");
assert.equal(calls[sessionStart].path, "/players/me");
assert.equal(calls[sessionStart].headers.apikey, "sb_publishable_adapter_fixture");
assert.equal(calls[sessionStart].headers["x-player-session-token"], undefined);
assert.equal(calls[sessionStart].headers.authorization, undefined);
assert.equal(calls[sessionStart].headers["x-request-id"], "req-session");
assert.equal(calls[sessionStart + 1].path, "/players/me/capabilities");
assert.equal(calls[sessionStart + 1].headers["x-player-session-token"], undefined);

const dashboard = await apiCall(context("dashboard", "GET", "/dashboard"));
assert.equal(dashboard.netWorth, 1500);
assert.equal(calls.at(-1).path, "/players/me/game/dashboard");

const store = await apiCall(context("store", "GET", "/store/items"));
assert.equal(store.items[0].name, "Market Lens");
assert.equal(calls.at(-1).path, "/players/me/store/items");

const purchase = await apiCall(context("storePurchase", "POST", "/store/purchases", {
  quoteKey: "quote_11111111111111111111111111111111",
  clientSubmittedAt: "2026-07-27T04:00:00.000Z"
}, { idempotencyKey: "idem-purchase-1" }));
assert.equal(purchase.receipt.receiptKey, "receipt_22222222222222222222222222222222");
assert.equal(calls.at(-1).headers["x-econovaria-csrf-token"], CSRF);
assert.equal(calls.at(-1).headers["idempotency-key"], "idem-purchase-1");
assert.equal(calls.at(-1).headers["x-player-session-token"], undefined);

await apiCall(context("marketOrder", "POST", "/market/orders", {
  ticker: "AURA",
  expectedPrice: 100,
  side: "buy",
  orderType: "market",
  quantity: 2
}, { idempotencyKey: "idem-order-1" }));
assert.equal(calls.at(-1).path, "/players/me/stocks/orders");
assert.equal(calls.at(-1).headers["x-econovaria-csrf-token"], CSRF);
assert.equal("gameSessionId" in calls.at(-1).payload, false);
assert.equal("playerId" in calls.at(-1).payload, false);

await assert.rejects(
  apiCall(context("marketOrder", "POST", "/market/orders", {
    playerId: "0c80fe6d-e1d9-4e90-90f4-1b174be727f1",
    ticker: "AURA",
    expectedPrice: 100,
    side: "buy",
    quantity: 1
  }, { idempotencyKey: "idem-invalid-owner" })),
  (error) => error.code === "INVALID_REQUEST"
);

const transfer = await apiCall(context("bankTransfer", "POST", "/banking/transfers", {
  recipientPlayerIdentifier: "CARD-201",
  amount: 10
}, { idempotencyKey: "idem-transfer-1" }));
assert.equal(transfer.result.transfer_key, "trf_33333333333333333333333333333333");
assert.equal(calls.at(-1).path, "/players/me/banking/transfers");
assert.equal(calls.at(-1).headers["x-econovaria-csrf-token"], CSRF);
assert.equal("recipientPlayerUuid" in calls.at(-1).payload, false);
assert.equal("senderPlayerId" in calls.at(-1).payload, false);
assert.equal("gameSessionId" in calls.at(-1).payload, false);

console.log("Student-Profile adapter passed: cookie-session transport, capability preflight, canonical routes, ownership privacy, CSRF, and idempotent writes are valid.");
