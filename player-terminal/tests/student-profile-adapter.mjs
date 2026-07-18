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
  manifestVersion: "2026-07-18.3",
  service: "classroom-api",
  capabilities: {
    routes: {
      news: true,
      market: true,
      inventory: true
    },
    actions: {
      contractAccept: true,
      inventoryUse: true,
      logout: true,
      marketWatchlist: true,
      notificationsRead: true
    }
  },
  endpoints: [
    {
      key: "capabilities",
      operations: [{ method: "GET", pathTemplate: "/players/me/capabilities" }]
    },
    {
      key: "contractAccept",
      operations: [{ method: "POST", pathTemplate: "/players/me/contracts/:contractKey/accept" }]
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
      key: "marketWatchlist",
      operations: [
        { method: "GET", pathTemplate: "/players/me/stocks/watchlist" },
        { method: "PUT", pathTemplate: "/players/me/stocks/watchlist/:ticker" },
        { method: "DELETE", pathTemplate: "/players/me/stocks/watchlist/:ticker" }
      ]
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
  storeQuote: {
    ok: true,
    quoteId: "quote-1",
    itemId: "item-1",
    itemName: "Market Lens",
    quantity: 1,
    finalUnitPrice: 50,
    finalTotalPrice: 50,
    currencyCode: "ECO",
    expiresAt: "2026-07-17T12:05:00.000Z"
  },
  storePurchase: {
    ok: true,
    purchaseId: "purchase-1",
    quoteId: "quote-1",
    finalTotalPrice: 50,
    currencyCode: "ECO",
    refreshRequired: true
  },
  marketOrder: {
    ok: true,
    orderId: "order-1",
    status: "filled"
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
assert.equal(session.capabilityManifestVersion, "2026-07-18.3");
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
assert.equal(calls.at(-1).path, "/players/me/game/dashboard?gameSessionId=game-1");

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
  storeItemId: "item-1",
  quantity: 1
}));
assert.equal(quote.quoteId, "quote-1");
assert.deepEqual(calls.at(-1).payload, { itemId: "item-1", quantity: 1 });
assert.equal(calls.at(-1).path, "/players/me/store/quote");

const purchase = await apiCall(context("storePurchase", "POST", "/store/purchases", {
  quoteId: "quote-1",
  clientSubmittedAt: "2026-07-17T12:01:00.000Z"
}, { idempotencyKey: "idem-purchase-1" }));
assert.equal(purchase.purchaseId, "purchase-1");
assert.equal(calls.at(-1).payload.idempotencyKey, "idem-purchase-1");
assert.equal(calls.at(-1).headers["idempotency-key"], "idem-purchase-1");

await apiCall(context("marketOrder", "POST", "/market/orders", {
  assetId: "asset-1",
  side: "buy",
  orderType: "market",
  quantity: 2
}, { idempotencyKey: "idem-order-1" }));
assert.equal(calls.at(-1).method, "POST");
assert.equal(calls.at(-1).path, "/players/me/stocks/orders");
assert.deepEqual(calls.at(-1).payload, {
  gameSessionId: "game-1",
  stockAssetId: "asset-1",
  side: "buy",
  quantity: 2,
  idempotencyKey: "idem-order-1"
});
assert.equal("playerId" in calls.at(-1).payload, false, "Economic writes must not accept a client-selected owner UUID.");

await assert.rejects(
  apiCall(context("marketOrder", "POST", "/market/orders", {
    playerId: "0c80fe6d-e1d9-4e90-90f4-1b174be727f1",
    assetId: "asset-1",
    side: "buy",
    orderType: "market",
    quantity: 1
  }, { idempotencyKey: "idem-invalid-owner" })),
  (error) => error.code === "INVALID_REQUEST"
);

await assert.rejects(
  apiCall(context("bankTransfer", "POST", "/banking/transfers", {
    recipientPlayerIdentifier: "CARD-201",
    amount: 10
  }, { idempotencyKey: "idem-transfer-1" })),
  (error) => error.name === "ApiConnectionPendingError",
  "Player transfer remains visible but pending until the UUID-authoritative backend route exists."
);

console.log("Student-Profile adapter passed: canonical routes, capability preflight, UI read models, session headers, UUID ownership, and idempotent writes are valid.");
