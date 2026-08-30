import assert from "node:assert/strict";

import { createStudentProfileApiCall } from "../src/integrations/student-profile-api-call.js";

const CSRF = "C".repeat(43);
const STOCK_QUOTE = "sbq_11111111111111111111111111111111";
const STOCK_SOURCE = "bac_22222222222222222222222222222222";
const STOCK_DESTINATION = "bac_33333333333333333333333333333333";
const STOCK_SETTLEMENT = "btx_44444444444444444444444444444444";

const rawSession = {
  gameSession: { id: "game-1", name: "Econovaria Class", status: "active" },
  player: {
    id: "0c80fe6d-e1d9-4e90-90f4-1b174be727f1",
    playerIdentifier: "CARD-200",
    displayName: "Alex Rivera",
    countryCurrencyCode: "ELD"
  },
  session: {
    status: "active",
    expiresAt: "2026-07-27T08:00:00.000Z"
  },
  balances: [
    { accountType: "checking", currencyCode: "ECO", balance: 1250 },
    { accountType: "checking", currencyCode: "ELD", balance: 480 },
    { accountType: "savings", currencyCode: "ELD", balance: 120 }
  ]
};

const capabilityManifest = {
  ok: true,
  schemaVersion: 1,
  manifestVersion: "2026-07-27.1",
  service: "classroom-api",
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
    { key: "banking", operations: [{ method: "GET", pathTemplate: "/players/me/ledger" }] },
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
      netWorth: 600,
      netWorthValuation: { currencyCode: "ELD", status: "partial_unconverted" },
      cash: {
        primaryCurrencyCode: "ELD",
        totalBalance: 600,
        balances: [
          { accountType: "checking", currencyCode: "ECO", balance: 1250 },
          { accountType: "checking", currencyCode: "ELD", balance: 480 },
          { accountType: "savings", currencyCode: "ELD", balance: 120 }
        ]
      },
      stocks: { portfolio: { holdingsMarketValue: 250 }, holdings: [] },
      store: { listings: [], inventory: [] },
      contracts: { available: [], progress: [] }
    },
    public: { market: { stocks: [] }, news: [] }
  },
  banking: {
    currentBalances: [
      { accountType: "checking", currencyCode: "ECO", balance: 1250 },
      { accountType: "checking", currencyCode: "ELD", balance: 480 },
      { accountType: "savings", currencyCode: "ELD", balance: 120 }
    ],
    ledgerEntries: [],
    generatedAt: "2026-07-27T04:00:00.000Z",
    staleAt: "2026-07-27T04:05:00.000Z",
    stale: false,
    pagination: { cursor: null, nextCursor: null, hasMore: false, limit: 50 }
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
      currencyCode: "ELD",
      inventoryQuantityOwned: 2,
      completedAt: "2026-07-27T04:00:00.000Z",
      alreadyCompleted: false
    },
    refreshRequired: true
  },
  marketOrderQuote: {
    ok: true,
    action: "create_buy_quote",
    quote: {
      quoteKey: STOCK_QUOTE,
      ticker: "AURA",
      listingCurrencyCode: "XAL",
      quantity: 2,
      quotedPrice: 100,
      priceTickIndex: 42,
      grossValue: 200,
      expiresAt: "2026-08-30T12:05:00.000Z",
      funding: { lines: [] }
    }
  },
  marketOrderBuySettlement: {
    ok: true,
    action: "settle_buy_quote",
    settlement: {
      quoteKey: STOCK_QUOTE,
      ticker: "AURA",
      listingCurrencyCode: "XAL",
      quantity: 2,
      executionPrice: 100,
      priceTickIndex: 42,
      grossValue: 200,
      holdingQuantityAfter: 2,
      averageCostAfter: 100,
      filledAt: "2026-08-30T12:01:00.000Z",
      alreadyCompleted: false,
      funding: { lines: [] }
    }
  },
  marketOrderSellSettlement: {
    ok: true,
    action: "settle_sell",
    settlement: {
      ticker: "AURA",
      listingCurrencyCode: "XAL",
      quantity: 1,
      executionPrice: 105,
      priceTickIndex: 43,
      grossValue: 105,
      holdingQuantityAfter: 1,
      averageCostAfter: 100,
      filledAt: "2026-08-30T12:02:00.000Z",
      destinationAccountKey: STOCK_DESTINATION,
      settlementTransactionKey: STOCK_SETTLEMENT,
      alreadyCompleted: false
    }
  },
  bankTransfer: {
    ok: true,
    result: {
      transfer_key: "trf_33333333333333333333333333333333",
      amount: 10,
      currency_code: "ELD",
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
    if (request.endpointKey === "marketOrder") {
      if (request.payload.action === "create_buy_quote") return structuredClone(responses.marketOrderQuote);
      if (request.payload.action === "settle_buy_quote") return structuredClone(responses.marketOrderBuySettlement);
      if (request.payload.action === "settle_sell") return structuredClone(responses.marketOrderSellSettlement);
    }
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
assert.equal(session.currencyCode, "ELD");
assert.equal(session.currencyResolved, true);
assert.equal(session.capabilitySchemaVersion, 1);
assert.equal(session.capabilityManifestVersion, "2026-07-27.1");
assert.equal(session.capabilityService, "classroom-api");
assert.equal(calls[sessionStart].path, "/players/me");
assert.equal(calls[sessionStart].headers.apikey, "sb_publishable_adapter_fixture");
assert.equal(calls[sessionStart].headers["x-player-session-token"], undefined);
assert.equal(calls[sessionStart].headers.authorization, undefined);
assert.equal(calls[sessionStart].headers["x-request-id"], "req-session");
assert.equal(calls[sessionStart + 1].path, "/players/me/capabilities");
assert.equal(calls[sessionStart + 1].headers["x-player-session-token"], undefined);

const dashboard = await apiCall(context("dashboard", "GET", "/dashboard"));
assert.equal(dashboard.netWorth, 600);
assert.equal(calls.at(-1).path, "/players/me/game/dashboard");

const banking = await apiCall(context("banking", "GET", "/banking"));
assert.equal(banking.checking.currencyCode, "ELD");
assert.equal(banking.checking.balance, 480);
assert.equal(banking.savings.currencyCode, "ELD");
assert.equal(banking.savings.balance, 120);
assert.equal(banking.balances.length, 3);
assert.equal(calls.at(-1).path, "/players/me/ledger?limit=50");

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

const quote = await apiCall(context("marketOrder", "POST", "/market/orders", {
  action: "create_buy_quote",
  ticker: "AURA",
  quantity: 2,
  expectedPrice: 100,
  expectedTickIndex: 42,
  allocations: [{ sourceAccountKey: STOCK_SOURCE, targetAmount: 200 }]
}, { idempotencyKey: "idem-stock-quote-1" }));
assert.equal(quote.quote.quoteKey, STOCK_QUOTE);
assert.equal(calls.at(-1).path, "/players/me/stocks/orders");
assert.equal(calls.at(-1).headers["x-econovaria-csrf-token"], CSRF);
assert.equal(calls.at(-1).headers["idempotency-key"], "idem-stock-quote-1");
assert.deepEqual(calls.at(-1).payload, {
  action: "create_buy_quote",
  ticker: "AURA",
  quantity: 2,
  expectedPrice: 100,
  expectedTickIndex: 42,
  allocations: [{ sourceAccountKey: STOCK_SOURCE, targetAmount: 200 }],
  idempotencyKey: "idem-stock-quote-1"
});
assert.equal("gameSessionId" in calls.at(-1).payload, false);
assert.equal("playerId" in calls.at(-1).payload, false);
assert.equal("stockAssetId" in calls.at(-1).payload, false);

const buySettlement = await apiCall(context("marketOrder", "POST", "/market/orders", {
  action: "settle_buy_quote",
  quoteKey: STOCK_QUOTE
}, { idempotencyKey: "idem-stock-buy-1" }));
assert.equal(buySettlement.settlement.quoteKey, STOCK_QUOTE);
assert.deepEqual(calls.at(-1).payload, {
  action: "settle_buy_quote",
  quoteKey: STOCK_QUOTE,
  idempotencyKey: "idem-stock-buy-1"
});

const sellSettlement = await apiCall(context("marketOrder", "POST", "/market/orders", {
  action: "settle_sell",
  ticker: "AURA",
  quantity: 1,
  expectedPrice: 105,
  expectedTickIndex: 43,
  destinationAccountKey: STOCK_DESTINATION
}, { idempotencyKey: "idem-stock-sell-1" }));
assert.equal(sellSettlement.settlement.settlementTransactionKey, STOCK_SETTLEMENT);
assert.deepEqual(calls.at(-1).payload, {
  action: "settle_sell",
  ticker: "AURA",
  quantity: 1,
  expectedPrice: 105,
  expectedTickIndex: 43,
  destinationAccountKey: STOCK_DESTINATION,
  idempotencyKey: "idem-stock-sell-1"
});

await assert.rejects(
  apiCall(context("marketOrder", "POST", "/market/orders", {
    playerId: "0c80fe6d-e1d9-4e90-90f4-1b174be727f1",
    action: "create_buy_quote",
    ticker: "AURA",
    quantity: 1,
    expectedPrice: 100,
    expectedTickIndex: 42,
    allocations: [{ sourceAccountKey: STOCK_SOURCE, targetAmount: 100 }]
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

console.log("Student-Profile adapter passed: C3E quote, buy settlement, and destination-account sale use exact public-key bodies while cookie-session transport, ownership privacy, CSRF, and idempotency remain valid.");
