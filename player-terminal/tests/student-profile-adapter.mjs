import assert from "node:assert/strict";

import { createStudentProfileApiCall } from "../src/integrations/student-profile-api-call.js";

const rawSession = {
  gameSession: { id: "game-1", name: "Econovaria Class", status: "active" },
  player: {
    id: "0c80fe6d-e1d9-4e90-90f4-1b174be727f1",
    playerIdentifier: "CARD-200",
    displayName: "Alex Rivera"
  },
  session: { id: "player-session-1", status: "active" },
  balances: [{ accountType: "cash", currencyCode: "ECO", balance: 1250 }]
};

const rawDashboard = {
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
};

const capabilityManifest = {
  ok: true,
  schemaVersion: 1,
  manifestVersion: "2026-07-22.2",
  service: "classroom-api",
  capabilities: {
    routes: {
      news: true,
      market: true,
      portfolio: true,
      contracts: true,
      inventory: true,
      store: true,
      banking: true
    },
    actions: {
      bankTransfer: true,
      contractAccept: true,
      inventoryUse: true,
      logout: true,
      marketOrder: true,
      marketWatchlist: true,
      notificationsRead: true,
      storePurchase: true
    }
  },
  endpoints: [
    {
      key: "capabilities",
      operations: [{ method: "GET", pathTemplate: "/players/me/capabilities" }]
    },
    {
      key: "banking",
      operations: [{ method: "GET", pathTemplate: "/players/me/ledger" }]
    },
    {
      key: "bankTransfer",
      operations: [{ method: "POST", pathTemplate: "/players/me/banking/transfers" }]
    },
    {
      key: "contractAccept",
      operations: [{ method: "POST", pathTemplate: "/players/me/contracts/:contractKey/accept" }]
    },
    {
      key: "contracts",
      operations: [{ method: "GET", pathTemplate: "/players/me/contracts" }]
    },
    {
      key: "store",
      operations: [{ method: "GET", pathTemplate: "/players/me/store/items" }]
    },
    {
      key: "storeQuote",
      operations: [{ method: "POST", pathTemplate: "/players/me/store/quotes" }]
    },
    {
      key: "storePurchase",
      operations: [
        { method: "GET", pathTemplate: "/players/me/store/purchases" },
        { method: "POST", pathTemplate: "/players/me/store/purchases" }
      ]
    },
    {
      key: "inventory",
      operations: [{ method: "GET", pathTemplate: "/players/me/inventory" }]
    },
    {
      key: "inventoryRedemptions",
      operations: [
        { method: "GET", pathTemplate: "/players/me/inventory/redemptions" },
        { method: "POST", pathTemplate: "/players/me/inventory/:itemId/redemptions" },
        { method: "GET", pathTemplate: "/players/me/inventory/redemptions/:requestId" }
      ]
    },
    {
      key: "logout",
      operations: [{ method: "POST", pathTemplate: "/players/me/session/logout" }]
    },
    {
      key: "market",
      operations: [{ method: "GET", pathTemplate: "/players/me/stocks/assets" }]
    },
    {
      key: "marketOrder",
      operations: [{ method: "POST", pathTemplate: "/players/me/stocks/orders" }]
    },
    {
      key: "marketWatchlist",
      operations: [
        { method: "GET", pathTemplate: "/players/me/stocks/watchlist" },
        { method: "PUT", pathTemplate: "/players/me/stocks/watchlist/:ticker" },
        { method: "DELETE", pathTemplate: "/players/me/stocks/watchlist/:ticker" }
      ]
    },
    {
      key: "portfolio",
      operations: [{ method: "GET", pathTemplate: "/players/me/stocks/portfolio" }]
    },
    {
      key: "news",
      operations: [{ method: "GET", pathTemplate: "/players/me/world/news" }]
    },
    {
      key: "notificationsRead",
      operations: [{ method: "POST", pathTemplate: "/players/me/notifications/read" }]
    }
  ]
};

const responses = {
  session: rawSession,
  capabilities: capabilityManifest,
  dashboard: rawDashboard,
  contracts: {
    ok: true,
    contracts: [{
      contractKey: "arrival-orientation",
      sourceType: "staff",
      title: "Arrival orientation",
      description: "Review the national economy.",
      instructions: "Submit a short response.",
      category: "Orientation",
      status: "active",
      visibility: "public",
      targetingPayload: { countryCodes: ["ELD"] },
      requirementsPayload: { items: [{ label: "Read the briefing" }] },
      rewardPayload: { cashAmount: 25, currencyCode: "ECO" },
      completionMode: "manual_review",
      publishedAt: "2026-07-18T00:00:00.000Z",
      deadlineAt: "2027-07-21T00:00:00.000Z",
      expiresAt: "2027-07-22T00:00:00.000Z",
      metadata: { issuer: "Immigration Office" },
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z"
    }],
    progress: []
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
  inventory: {
    categories: ["All", "Equipment"],
    items: [{
      id: "holding-1",
      storeItemId: "item-1",
      itemKey: "market-lens",
      name: "Market Lens",
      category: "Equipment",
      description: "Market analysis equipment.",
      quantityOwned: 1,
      quantityReserved: 0,
      quantityAvailable: 1,
      totalOwnedValue: 50,
      unitValue: 50,
      currencyCode: "ECO",
      availableActions: []
    }],
    summary: { totalItemTypes: 1, totalUnits: 1 }
  },
  banking: {
    currentBalances: [{ accountType: "cash", currencyCode: "ECO", balance: 1250 }],
    ledgerEntries: [{
      id: "ledger-1",
      entryType: "credit",
      amount: 25,
      currencyCode: "ECO",
      accountType: "cash",
      sourceDomain: "contracts",
      sourceAction: "contract_reward",
      createdAt: "2026-07-17T12:00:00.000Z"
    }]
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
  },
  storeQuote: {
    ok: true,
    quote: {
      quoteKey: "quote_11111111111111111111111111111111",
      itemKey: "market-lens",
      itemName: "Market Lens",
      quantity: 1,
      finalUnitPrice: 50,
      finalTotalPrice: 50,
      currencyCode: "ECO",
      expiresAt: "2026-07-17T12:05:00.000Z"
    }
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
      completedAt: "2026-07-17T12:01:00.000Z",
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
      playerSessionToken: "token-1",
      gameSessionId: "game-1",
      playerSessionId: "player-session-1",
      accessToken: ""
    }
  };
}

const sessionStart = calls.length;
const session = await apiCall(context("session", "GET", "/session"));
assert.equal(session.displayName, "Alex Rivera");
assert.equal(session.playerId, "CARD-200", "The terminal may display the mutable Player ID.");
assert.equal(session.capabilitySchemaVersion, 1);
assert.equal(session.capabilityManifestVersion, "2026-07-22.2");
assert.equal(session.capabilityService, "classroom-api");
assert.equal(calls[sessionStart].path, "/players/me");
assert.equal(calls[sessionStart].headers["x-player-session-token"], "token-1");
assert.equal(calls[sessionStart].headers["x-request-id"], "req-session");
assert.equal(calls[sessionStart + 1].path, "/players/me/capabilities");
assert.equal(calls[sessionStart + 1].headers["x-player-session-token"], "token-1");

const dashboard = await apiCall(context("dashboard", "GET", "/dashboard"));
assert.equal(dashboard.netWorth, 1500);
assert.ok(Array.isArray(dashboard.worldEvents));
assert.ok(Array.isArray(dashboard.marketPulse));
assert.equal(calls.at(-1).path, "/players/me/game/dashboard");

const contracts = await apiCall(context("contracts", "GET", "/contracts"));
assert.equal(contracts.items[0].id, "arrival-orientation");
assert.equal(contracts.items[0].status, "Available");
assert.equal(calls.at(-1).path, "/players/me/contracts");
assert.equal(calls.at(-1).payload, undefined);

const store = await apiCall(context("store", "GET", "/store/items"));
assert.equal(store.items[0].name, "Market Lens");
assert.deepEqual(store.categories, ["All", "Equipment"]);
assert.equal(calls.at(-1).path, "/players/me/store/items");

const inventory = await apiCall(context("inventory", "GET", "/inventory"));
assert.equal(inventory.items[0].id, "holding-1");
assert.equal(inventory.items[0].quantity, 1);
assert.equal(calls.at(-1).path, "/players/me/inventory");

const banking = await apiCall(context("banking", "GET", "/banking/summary"));
assert.equal(banking.checking.available, 1250);
assert.equal(banking.transactions[0].amount, 25);
assert.equal(calls.at(-1).path, "/players/me/ledger?limit=50");

const quote = await apiCall(context("storeQuote", "POST", "/store/quotes", {
  itemKey: "market-lens",
  quantity: 1
}));
assert.equal(quote.quote.quoteKey, "quote_11111111111111111111111111111111");
assert.deepEqual(calls.at(-1).payload, { itemKey: "market-lens", quantity: 1 });
assert.equal(calls.at(-1).path, "/players/me/store/quotes");

const purchase = await apiCall(context("storePurchase", "POST", "/store/purchases", {
  quoteKey: "quote_11111111111111111111111111111111",
  clientSubmittedAt: "2026-07-17T12:01:00.000Z"
}, { idempotencyKey: "idem-purchase-1" }));
assert.equal(purchase.receipt.receiptKey, "receipt_22222222222222222222222222222222");
assert.equal(calls.at(-1).payload.idempotencyKey, "idem-purchase-1");
assert.equal(calls.at(-1).headers["idempotency-key"], "idem-purchase-1");

await apiCall(context("marketOrder", "POST", "/market/orders", {
  ticker: "AURA",
  expectedPrice: 100,
  side: "buy",
  orderType: "market",
  quantity: 2
}, { idempotencyKey: "idem-order-1" }));
assert.equal(calls.at(-1).method, "POST");
assert.equal(calls.at(-1).path, "/players/me/stocks/orders");
assert.deepEqual(calls.at(-1).payload, {
  ticker: "AURA",
  expectedPrice: 100,
  side: "buy",
  quantity: 2,
  idempotencyKey: "idem-order-1"
});
assert.equal("gameSessionId" in calls.at(-1).payload, false);
assert.equal("playerSessionId" in calls.at(-1).payload, false);
assert.equal("stockAssetId" in calls.at(-1).payload, false);
assert.equal("playerId" in calls.at(-1).payload, false, "Economic writes must not accept a client-selected owner UUID.");

await assert.rejects(
  apiCall(context("marketOrder", "POST", "/market/orders", {
    playerId: "0c80fe6d-e1d9-4e90-90f4-1b174be727f1",
    ticker: "AURA",
    expectedPrice: 100,
    side: "buy",
    orderType: "market",
    quantity: 1
  }, { idempotencyKey: "idem-invalid-owner" })),
  (error) => error.code === "INVALID_REQUEST"
);

const transfer = await apiCall(context("bankTransfer", "POST", "/banking/transfers", {
  recipientPlayerIdentifier: "CARD-201",
  amount: 10
}, { idempotencyKey: "idem-transfer-1" }));
assert.equal(transfer.result.transfer_key, "trf_33333333333333333333333333333333");
assert.equal(calls.at(-1).method, "POST");
assert.equal(calls.at(-1).path, "/players/me/banking/transfers");
assert.deepEqual(calls.at(-1).payload, {
  recipientPlayerIdentifier: "CARD-201",
  amount: 10,
  memo: null,
  idempotencyKey: "idem-transfer-1"
});
assert.equal(calls.at(-1).headers["idempotency-key"], "idem-transfer-1");
assert.equal("recipientPlayerUuid" in calls.at(-1).payload, false);
assert.equal("senderPlayerId" in calls.at(-1).payload, false);
assert.equal("gameSessionId" in calls.at(-1).payload, false);

console.log("Student-Profile adapter passed: canonical routes, capability preflight, UUID-private Contracts, market orders, and player transfers, UI read models, session headers, and idempotent writes are valid.");
