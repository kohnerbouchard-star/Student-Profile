import assert from "node:assert/strict";
import { AdapterTransport } from "../src/api/adapter-transport.js";
import { ApiConnectionPendingError, ApiRequestError } from "../src/api/errors.js";
import { HttpTransport } from "../src/api/http-transport.js";
import { PlayerApi } from "../src/api/player-api.js";
import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import { mergeTerminalRead } from "../src/api/read-model.js";
import { renderDashboardPage } from "../src/pages/dashboard-page.js";
import { renderNewsPage } from "../src/pages/news-page.js";
import { renderMarketPage } from "../src/pages/market-page.js";
import { renderPortfolioPage } from "../src/pages/portfolio-page.js";
import { renderBusinessPage } from "../src/pages/business-page.js";
import { renderContractsPage } from "../src/pages/contracts-page.js";
import { renderStorePage } from "../src/pages/store-page.js";
import { renderMarketplacePage } from "../src/pages/marketplace-page.js";
import { renderInventoryPage } from "../src/pages/inventory-page.js";
import { renderCraftingPage } from "../src/pages/crafting-page.js";
import { renderBankingPage } from "../src/pages/banking-page.js";
import { renderLoansPage } from "../src/pages/loans-page.js";
import { renderMessagesPage } from "../src/pages/messages-page.js";
import { renderProgressionPage } from "../src/pages/progression-page.js";
import { renderProfilePage } from "../src/pages/profile-page.js";

const session = {
  playerSessionToken: "ps_secret_test",
  gameSessionId: "game-1",
  playerSessionId: "player-session-1",
  accessToken: "access-test"
};

const dashboardRoute = resolvePlayerBackendRequest({
  endpointKey: "dashboard",
  method: "GET",
  path: "/dashboard",
  session
});
assert.equal(dashboardRoute.path, "/players/me/game/dashboard?gameSessionId=game-1");

assert.equal(resolvePlayerBackendRequest({
  endpointKey: "countries",
  method: "GET",
  path: "/world/countries",
  session
}).path, "/players/me/world/countries");

assert.equal(resolvePlayerBackendRequest({
  endpointKey: "country",
  method: "GET",
  path: "/world/countries/NORTHREACH",
  params: { countryId: "NORTHREACH" },
  session
}).path, "/players/me/world/countries/NORTHREACH");

assert.equal(resolvePlayerBackendRequest({
  endpointKey: "news",
  method: "GET",
  path: "/world/news",
  session
}).path, "/players/me/world/news?limit=100");

assert.equal(resolvePlayerBackendRequest({
  endpointKey: "notifications",
  method: "GET",
  path: "/notifications",
  session
}).path, "/players/me/notifications?status=unread&limit=50");

const notificationDeliveryId = "11111111-1111-4111-8111-111111111111";
const notificationId = "22222222-2222-4222-8222-222222222222";
const notificationsReadRoute = resolvePlayerBackendRequest({
  endpointKey: "notificationsRead",
  method: "POST",
  path: "/notifications/read",
  payload: { notificationIds: [notificationDeliveryId, notificationDeliveryId] },
  session
});
assert.equal(notificationsReadRoute.path, "/players/me/notifications/read");
assert.deepEqual(notificationsReadRoute.payload, { deliveryIds: [notificationDeliveryId] });

const marketRoute = resolvePlayerBackendRequest({
  endpointKey: "market",
  method: "GET",
  path: "/market/assets",
  session
});
assert.equal(marketRoute.path, "/players/me/stocks/assets?limit=100&offset=0");

const marketAssetRoute = resolvePlayerBackendRequest({
  endpointKey: "marketAsset",
  method: "GET",
  path: "/market/assets/asset-1",
  params: { assetId: "asset-1" },
  payload: { historyLimit: 75 },
  session
});
assert.equal(marketAssetRoute.path, "/players/me/stocks/assets/asset-1?historyLimit=75");

const watchlistAssetId = "33333333-3333-4333-8333-333333333333";
const watchlistAddRoute = resolvePlayerBackendRequest({
  endpointKey: "marketWatchlist",
  method: "POST",
  path: `/market/watchlist/${watchlistAssetId}`,
  params: { assetId: watchlistAssetId },
  payload: { enabled: true, gameSessionId: "must-not-be-forwarded" },
  session
});
assert.equal(watchlistAddRoute.method, "PUT");
assert.equal(watchlistAddRoute.path, `/players/me/stocks/watchlist/${watchlistAssetId}`);
assert.equal(watchlistAddRoute.payload, undefined, "Watchlist mutations must send no body.");
assert.equal(resolvePlayerBackendRequest({
  endpointKey: "marketWatchlist",
  method: "POST",
  path: `/market/watchlist/${watchlistAssetId}`,
  params: { assetId: watchlistAssetId },
  payload: { enabled: false },
  session
}).method, "DELETE");

const bankingRoute = resolvePlayerBackendRequest({
  endpointKey: "banking",
  method: "GET",
  path: "/banking/summary",
  session
});
assert.equal(bankingRoute.path, "/players/me/ledger?limit=50");

const contractRoute = resolvePlayerBackendRequest({
  endpointKey: "contractSubmit",
  method: "POST",
  path: "/contracts/contract-1/submissions",
  params: { contractId: "contract-1" },
  payload: { gameSessionId: "game-1", submissionUrl: "https://example.test/work", note: "Complete" },
  session
});
assert.equal(contractRoute.path, "/players/me/contracts/contract-1/submit");
assert.deepEqual(contractRoute.payload, {
  gameSessionId: "game-1",
  evidencePayload: { submissionUrl: "https://example.test/work", note: "Complete" }
});

const contractAcceptRoute = resolvePlayerBackendRequest({
  endpointKey: "contractAccept",
  method: "POST",
  path: "/contracts/contract-1/accept",
  params: { contractId: "contract-1" },
  payload: { gameSessionId: "game-1" },
  session
});
assert.equal(contractAcceptRoute.path, "/players/me/contracts/contract-1/accept");
assert.deepEqual(contractAcceptRoute.payload, { gameSessionId: "game-1" });

assert.equal(resolvePlayerBackendRequest({
  endpointKey: "inventory",
  method: "GET",
  path: "/inventory",
  session
}).path, "/players/me/inventory");
const logoutRoute = resolvePlayerBackendRequest({
  endpointKey: "logout",
  method: "POST",
  path: "/session/logout",
  payload: { gameSessionId: "must-not-be-forwarded" },
  session
});
assert.equal(logoutRoute.path, "/players/me/session/logout");
assert.equal(logoutRoute.payload, undefined, "Logout must send no request body.");

assert.throws(() => resolvePlayerBackendRequest({
  endpointKey: "marketOrder",
  method: "POST",
  path: "/market/orders",
  payload: { gameSessionId: "game-1", assetId: "asset-1", side: "buy", quantity: 2, orderType: "limit", idempotencyKey: "order-1" },
  session
}), (error) => error instanceof ApiRequestError && error.body?.code === "player_limit_orders_not_supported");

let adapterContext = null;
const adapterTransport = new AdapterTransport(async (context) => {
  adapterContext = context;
  return { ok: true };
}, session);
await adapterTransport.request({ endpointKey: "contracts", method: "GET", path: "/contracts" });
assert.equal(adapterContext.path, "/contracts", "Host adapters retain the stable provisional context.");
assert.equal(adapterContext.backendRequest.path, "/players/me/contracts?gameSessionId=game-1");
assert.equal(adapterContext.session.playerSessionToken, "ps_secret_test");

const originalFetch = globalThis.fetch;
let fetchCall = null;
globalThis.fetch = async (url, init) => {
  fetchCall = { url, init };
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};

try {
  const http = new HttpTransport({
    apiBaseUrl: "https://api.example.test/classroom-api/",
    requestTimeoutMs: 1000,
    stockMarketRunnerSecret: "must-never-be-sent",
    ...session
  });
  await http.request({ endpointKey: "dashboard", method: "GET", path: "/dashboard" });
  assert.equal(fetchCall.url, "https://api.example.test/classroom-api/players/me/game/dashboard?gameSessionId=game-1");
  assert.equal(fetchCall.init.headers["x-player-session-token"], "ps_secret_test");
  assert.equal(fetchCall.init.headers.Authorization, "Bearer access-test");
  assert.equal(fetchCall.init.headers["x-stock-market-runner-secret"], undefined);
  assert.equal(fetchCall.init.headers["x-econovaria-game-session-id"], undefined);
  assert.equal(fetchCall.init.credentials, "omit");

  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: false,
    error: {
      code: "invalid_player_session",
      message: "Player session is invalid or expired.",
      retryable: false
    }
  }), {
    status: 401,
    headers: { "content-type": "application/json" }
  });
  await assert.rejects(
    http.request({ endpointKey: "dashboard", method: "GET", path: "/dashboard" }),
    (error) => error instanceof ApiRequestError &&
      error.status === 401 &&
      error.message === "Player session is invalid or expired." &&
      error.body?.error?.code === "invalid_player_session"
  );

  await assert.rejects(
    http.request({ endpointKey: "business", method: "GET", path: "/business" }),
    ApiConnectionPendingError
  );
} finally {
  globalThis.fetch = originalFetch;
}

const sessionResponse = {
  ok: true,
  gameSession: { id: "game-1", name: "Integration Game", status: "active" },
  player: { id: "player-1", displayName: "Avery Rowan", rosterLabel: "Avery", status: "active" },
  session: { id: "player-session-1", status: "active", expiresAt: "2099-01-01T00:00:00.000Z" },
  balances: [{ accountType: "cash", balance: 5000, currencyCode: "ECO" }]
};

const dashboardResponse = {
  ok: true,
  gameSession: { id: "game-1", name: "Integration Game", status: "active", marketStatus: "open", currentTick: 4, updatedAt: null },
  me: {
    playerId: "player-1",
    displayName: "Avery Rowan",
    rosterLabel: "Avery",
    countryCode: "NORTHREACH",
    netWorth: 7300,
    cash: { balances: [{ accountType: "cash", currencyCode: "ECO", balance: 5000 }], primaryCurrencyCode: "ECO", totalBalance: 5000 },
    stocks: {
      portfolio: { cashBalance: 5000, holdingsMarketValue: 2300, totalEquity: 7300, totalCostBasis: 2000, unrealizedPnl: 300, realizedPnl: 0, positionsCount: 1 },
      holdings: [{ stockAssetId: "asset-1", ticker: "NOVA", companyName: "Nova Labs", sector: "Technology", countryCode: "LUM", quantity: 10, averageCost: 200, currentPrice: 230, marketValue: 2300, costBasis: 2000, unrealizedPnl: 300, unrealizedPnlPct: 15, realizedPnl: 0 }],
      orders: [],
      trades: []
    },
    store: {
      currencyCode: "ECO",
      listings: [{ id: "item-1", itemKey: "market-lens", name: "Market Lens", description: "Market equipment", category: "Equipment", price: 250, currencyCode: "ECO", stockQuantity: 5, status: "active", visibility: "visible", sortOrder: 1 }],
      inventory: [{ inventoryId: "inventory-1", itemId: "item-1", itemName: "Market Lens", quantityOwned: 1, quantityReserved: 0, updatedAt: "2026-07-17T00:00:00.000Z" }],
      recentPurchases: []
    },
    contracts: {
      available: [{ contractId: "contract-1", title: "Market Brief", description: "Write a short brief.", instructions: "Submit a link.", sourceType: "staff", rewardPayload: { cashAmount: 100 }, requirementsPayload: { items: ["Submission link"] }, targetingPayload: {}, metadata: {}, publishedAt: "2026-07-17T00:00:00.000Z", deadlineAt: null, expiresAt: null }],
      progress: []
    }
  },
  public: {
    leaderboard: [],
    players: [],
    market: {
      stocks: [{ assetId: "asset-1", ticker: "NOVA", companyName: "Nova Labs", sector: "Technology", countryCode: "NORTHREACH", currentPrice: 230, previousClose: 225, changePct: 2.22, openPrice: 226, dayHigh: 233, dayLow: 224, volume: 2000, marketCap: 1000000, currentVolatility: 0.2, longRunVolatility: 0.25, description: null }],
      news: [{ id: "news-1", category: "Market", sentiment: "positive", scope: "ticker", targetKey: "NOVA", headline: "Nova rises", explanation: "Demand increased.", createdAt: "2026-07-17T00:00:00.000Z" }]
    },
    contracts: [],
    storeListings: []
  },
  unseenCutscenes: [],
  realtime: { publicChannel: "game:game-1:public", lastSequence: null, events: [] }
};

const calls = [];
const api = new PlayerApi({
  usePreviewData: false,
  simulatePreviewWrites: false,
  playerSessionToken: "ps_secret_test",
  gameSessionId: "",
  playerSessionId: "",
  accessToken: "",
  lazyRouteReads: true,
  apiCall: async (context) => {
    calls.push(context);
    if (context.endpointKey === "session") return sessionResponse;
    if (context.endpointKey === "dashboard") return dashboardResponse;
    if (context.endpointKey === "countries") return {
      ok: true,
      generatedAt: "2026-07-17T00:03:00.000Z",
      playerCountryProfileId: "country-profile-1",
      items: [{
        id: "country-profile-1",
        countryCode: "NORTHREACH",
        countryName: "Northreach",
        capitalName: "Frostgate",
        currencyCode: "ECO",
        map: { region: "northwest", color: "purple" },
        isPlayerCountry: true,
        economy: {
          id: "snapshot-1",
          sequence: 4,
          effectiveAt: "2026-07-17T00:02:00.000Z",
          label: "Current cycle",
          difficultyPreset: "standard",
          realGdpIndex: 112.4,
          gdpGrowthRate: 0.038,
          inflationRate: 0.019,
          unemploymentRate: 0.043,
          interestRate: 0.035,
          taxRate: 0.12,
          subsidyRate: 0.02,
          exchangeRateIndex: 1.016,
          politicalStabilityIndex: 1.62,
          marketRiskIndex: 1.1
        }
      }]
    };
    if (context.endpointKey === "news") return {
      ok: true,
      generatedAt: "2026-07-17T00:03:00.000Z",
      page: { limit: 100, returned: 2 },
      items: [{
        id: "world-news-1",
        shockId: "northreach-growth",
        category: "macro",
        sentiment: "positive",
        source: "world-runner",
        scope: "country",
        targetKey: "NORTHREACH",
        headline: "Northreach output expands",
        explanation: "Real output increased during the current cycle.",
        impact: { magnitude: 0.4, confidence: 0.9, volatility: 0.1, volume: null },
        tick: { created: 4, expires: 8 },
        createdAt: "2026-07-17T00:02:00.000Z",
        updatedAt: "2026-07-17T00:02:00.000Z"
      }, {
        id: "world-news-2",
        shockId: "nova-demand",
        category: "earnings",
        sentiment: "mixed",
        source: "market-runner",
        scope: "ticker",
        targetKey: "NOVA",
        headline: "Nova demand shifts",
        explanation: "Demand moved across two customer segments.",
        impact: { magnitude: 0.2, confidence: 0.75, volatility: 0.05, volume: 0.1 },
        tick: { created: 4, expires: null },
        createdAt: "2026-07-17T00:01:00.000Z",
        updatedAt: "2026-07-17T00:01:00.000Z"
      }]
    };
    if (context.endpointKey === "notifications") return {
      ok: true,
      generatedAt: "2026-07-17T00:03:00.000Z",
      filter: { status: "unread", limit: 50 },
      page: { hasMore: false, nextCursor: null },
      items: [{
        id: notificationDeliveryId,
        deliveryId: notificationDeliveryId,
        notificationId,
        sourceType: "system",
        sourceId: null,
        notificationType: "market_alert",
        title: "Market cycle complete",
        summary: "The latest market cycle is ready.",
        priority: "high",
        displayMode: "drawer",
        status: "unread",
        publishedAt: "2026-07-17T00:02:00.000Z",
        deliveredAt: "2026-07-17T00:02:01.000Z",
        seenAt: null,
        dismissedAt: null,
        acknowledgedAt: null
      }]
    };
    if (context.endpointKey === "notificationsRead") return {
      ok: true,
      message: "Notifications marked read.",
      requestedCount: 1,
      newlyReadCount: 1,
      alreadyReadCount: 0,
      processedAt: "2026-07-17T00:04:00.000Z",
      deliveries: [{
        deliveryId: notificationDeliveryId,
        notificationId,
        seenAt: "2026-07-17T00:04:00.000Z"
      }]
    };
    if (context.endpointKey === "store") return { ok: true, items: dashboardResponse.me.store.listings };
    if (context.endpointKey === "market") return {
      ok: true,
      action: "read_assets",
      tickIndex: 5,
      assets: [{
        ...dashboardResponse.public.market.stocks[0],
        currentPrice: 235,
        previousClose: 230,
        changePct: 2.17,
        isWatchlisted: true
      }],
      pagination: { limit: 100, offset: 0, returned: 1, hasMore: false, nextOffset: null }
    };
    if (context.endpointKey === "marketAsset") return {
      ok: true,
      action: "read_asset",
      tickIndex: 5,
      asset: {
        ...dashboardResponse.public.market.stocks[0],
        currentPrice: 235,
        previousClose: 230,
        changePct: 2.17,
        isWatchlisted: true
      },
      history: [
        { tickIndex: 3, price: 220, previousPrice: 215, changePct: 2.33, volume: 1000, createdAt: "2026-07-17T00:00:00.000Z" },
        { tickIndex: 4, price: 230, previousPrice: 220, changePct: 4.55, volume: 1500, createdAt: "2026-07-17T00:01:00.000Z" },
        { tickIndex: 5, price: 235, previousPrice: 230, changePct: 2.17, volume: 2000, createdAt: "2026-07-17T00:02:00.000Z" }
      ],
      historyLimit: 200,
      historyReturned: 3
    };
    if (context.endpointKey === "marketWatchlist") return {
      ok: true,
      action: context.payload.enabled ? "add_watchlist" : "remove_watchlist",
      assetId: context.params.assetId,
      isWatchlisted: context.payload.enabled === true,
      changed: true
    };
    if (context.endpointKey === "inventory") return {
      ok: true,
      capacity: null,
      categories: ["All", "Equipment"],
      summary: { itemTypes: 1, quantityOwned: 1, quantityReserved: 0, quantityAvailable: 1, values: [{ currencyCode: "ECO", totalOwnedValue: 250 }] },
      items: [{ id: "inventory-1", storeItemId: "item-1", itemKey: "market-lens", name: "Market Lens", description: "Market equipment", category: "Equipment", quantityOwned: 1, quantityReserved: 0, quantityAvailable: 1, unitValue: 250, totalOwnedValue: 250, currencyCode: "ECO", itemStatus: "active", itemVisibility: "visible", availableActions: [], createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T00:00:00.000Z" }]
    };
    if (context.endpointKey === "banking") return {
      ok: true,
      generatedAt: "2026-07-17T00:03:00.000Z",
      currentBalances: [
        { accountType: "cash", balance: 4750, currencyCode: "ECO" },
        { accountType: "savings", balance: 500, currencyCode: "ECO" }
      ],
      ledgerEntries: [{
        id: "ledger-1",
        accountType: "cash",
        amount: 250,
        currencyCode: "ECO",
        entryType: "debit",
        sourceDomain: "store",
        sourceAction: "store_purchase",
        sourceId: "purchase-1",
        createdByType: "player",
        createdAt: "2026-07-17T00:02:00.000Z"
      }]
    };
    if (context.endpointKey === "storeQuote") return { ok: true, quoteId: "quote-1", finalTotalPrice: 250 };
    if (context.endpointKey === "storePurchase") return { ok: true, purchaseId: "purchase-1", refreshRequired: true };
    if (context.endpointKey === "logout") return { ok: true, message: "Player session logged out.", alreadyLoggedOut: false, session: { id: "player-session-1", status: "revoked", revokedAt: "2026-07-17T00:00:00.000Z" } };
    throw new Error(`Unexpected endpoint ${context.endpointKey}`);
  }
});

const terminalData = await api.bootstrap();
assert.deepEqual(calls.slice(0, 2).map((call) => call.endpointKey), ["session", "dashboard"], "Production bootstrap must make only two requests.");
assert.equal(api.config.gameSessionId, "game-1");
assert.equal(api.config.playerSessionId, "player-session-1");
assert.equal(terminalData.session.displayName, "Avery Rowan");
assert.equal(terminalData.session.playerId, "—", "Backend UUIDs must not be exposed as player-facing IDs.");
assert.equal(terminalData.dashboard.netWorth, 7300);
assert.equal(terminalData.market.assets[0].owned, 10);
assert.equal(terminalData.store.items[0].owned, 1);
assert.equal(terminalData.inventory.items[0].quantity, 1);
assert.equal(terminalData.contracts.items[0].status, "Available");

const productionUi = {
  newsCategory: "All",
  newsId: "news-1",
  marketSector: "All",
  marketAssetId: "asset-1",
  contractTab: "Available",
  contractId: "contract-1",
  storeCategory: "All",
  marketplaceCategory: "All",
  marketplaceListingId: "",
  inventoryCategory: "All",
  messageThreadId: "",
  loanOfferId: "",
  craftingRecipeId: "",
  progressionTab: "Overview"
};
const productionPages = {
  dashboard: renderDashboardPage(terminalData),
  news: renderNewsPage(terminalData, productionUi),
  market: renderMarketPage(terminalData, productionUi),
  portfolio: renderPortfolioPage(terminalData),
  business: renderBusinessPage(terminalData, productionUi),
  contracts: renderContractsPage(terminalData, productionUi),
  store: renderStorePage(terminalData, productionUi),
  marketplace: renderMarketplacePage(terminalData, productionUi),
  inventory: renderInventoryPage(terminalData, productionUi),
  crafting: renderCraftingPage(terminalData, productionUi),
  banking: renderBankingPage(terminalData),
  loans: renderLoansPage(terminalData, productionUi),
  messages: renderMessagesPage(terminalData, productionUi),
  progression: renderProgressionPage(terminalData, productionUi),
  profile: renderProfilePage(terminalData, { usePreviewData: false, apiBaseUrl: "/classroom-api", simulatePreviewWrites: false })
};
for (const [name, html] of Object.entries(productionPages)) {
  assert.ok(html.includes("player-terminal-page"), `${name} must render from the production dashboard model.`);
  assert.ok(!/\bundefined\b/.test(html), `${name} production HTML must not contain undefined values.`);
}
assert.ok(productionPages.business.includes("Business is not configured"));
assert.ok(productionPages.loans.includes("Loans are not configured"));
assert.ok(productionPages.progression.includes("Progression is not configured"));
assert.ok(productionPages.inventory.includes("CAPACITY NOT CONFIGURED"));

const countriesData = await api.loadRoute("dashboard", terminalData);
assert.equal(countriesData.countries[0].id, "northreach");
assert.equal(countriesData.countries[0].growth, 3.8);
assert.equal(countriesData.countries[0].stability, 81);
assert.deepEqual(countriesData.countries[0].resources, [], "Unsupported country narratives must remain empty.");
assert.equal(countriesData.session.countryName, "Northreach");
assert.equal(countriesData.session.capital, "Frostgate");
assert.equal(countriesData.dashboard.inflationRate, 1.9);

const newsData = await api.loadRoute("news", countriesData);
assert.equal(newsData.news.items[0].title, "Northreach output expands");
assert.deepEqual(newsData.news.items[0].countryIds, ["northreach"]);
assert.deepEqual(newsData.news.items[1].assetIds, ["asset-1"]);
assert.deepEqual(newsData.countries[0].eventIds, ["world-news-1"]);

const notificationData = await api.refreshNotifications(newsData);
assert.equal(notificationData.notifications.length, 1);
assert.equal(notificationData.notifications[0].id, notificationDeliveryId);
assert.equal(notificationData.notifications[0].tone, "warn");
assert.equal(notificationData.dashboard.unreadNotifications, 1);
const notificationRead = await api.execute("notificationsRead", {
  deliveryIds: [notificationDeliveryId]
});
const notificationsCleared = mergeTerminalRead(
  notificationData,
  "notificationsRead",
  notificationRead
);
assert.equal(notificationsCleared.notifications.length, 0);
assert.equal(notificationsCleared.dashboard.unreadNotifications, 0);
const notificationReadCall = calls.find((call) => call.endpointKey === "notificationsRead");
assert.deepEqual(notificationReadCall.backendRequest.payload, {
  deliveryIds: [notificationDeliveryId]
});

const storeData = await api.loadRoute("store", notificationsCleared);
assert.equal(storeData.store.items.length, 1);
await api.loadRoute("store", storeData);
assert.equal(calls.filter((call) => call.endpointKey === "store").length, 1, "A lazy route is loaded once per bootstrap.");

const inventoryData = await api.loadRoute("inventory", storeData);
assert.equal(inventoryData.inventory.capacity, null, "A missing capacity policy must remain null.");
assert.equal(inventoryData.inventory.items[0].quantity, 1);
assert.equal(inventoryData.inventory.items[0].value, 250);
assert.deepEqual(inventoryData.inventory.items[0].availableActions, []);

const marketData = await api.loadRoute("market", inventoryData);
assert.deepEqual(calls.filter((call) => ["market", "marketAsset"].includes(call.endpointKey)).map((call) => call.endpointKey), ["market", "marketAsset"]);
assert.equal(marketData.market.assets[0].price, 235);
assert.deepEqual(marketData.market.assets[0].history, [220, 230, 235]);
assert.equal(marketData.market.assets[0].owned, 10, "A market refresh must preserve player holdings from the scoped dashboard.");
assert.equal(marketData.market.assets[0].watchlisted, true, "Backend watchlist state must override stale local state.");
const watchlistResult = await api.execute("marketWatchlist", { enabled: false }, { assetId: "asset-1" });
const watchlistData = mergeTerminalRead(marketData, "marketWatchlist", watchlistResult);
assert.equal(watchlistData.market.assets[0].watchlisted, false);
const watchlistCall = calls.find((call) => call.endpointKey === "marketWatchlist");
assert.equal(watchlistCall.backendRequest.method, "DELETE");
assert.equal(watchlistCall.backendRequest.payload, undefined);

const bankingData = await api.loadRoute("banking", watchlistData);
assert.equal(bankingData.banking.checking.balance, 4750);
assert.equal(bankingData.banking.savings.balance, 500);
assert.equal(bankingData.banking.savings.interestRate, null);
assert.equal(bankingData.banking.transfersConfigured, false);
assert.equal(bankingData.banking.transactions[0].amount, -250);
assert.equal(bankingData.banking.transactions[0].description, "Store Purchase");

const purchase = await api.purchaseStoreItem({ storeItemId: "item-1", quantity: 1, idempotencyKey: "purchase-key-1" });
assert.equal(purchase.quote.quoteId, "quote-1");
assert.equal(purchase.purchase.purchaseId, "purchase-1");
const quoteCall = calls.find((call) => call.endpointKey === "storeQuote");
const purchaseCall = calls.find((call) => call.endpointKey === "storePurchase");
assert.deepEqual(quoteCall.backendRequest.payload, { itemId: "item-1", quantity: 1 });
assert.deepEqual(purchaseCall.backendRequest.payload, {
  quoteId: "quote-1",
  idempotencyKey: "purchase-key-1",
  clientSubmittedAt: purchaseCall.payload.clientSubmittedAt
});

const logoutResponse = await api.logout();
assert.equal(logoutResponse.session.status, "revoked");
const logoutCall = calls.find((call) => call.endpointKey === "logout");
assert.equal(logoutCall.backendRequest.path, "/players/me/session/logout");
assert.equal(logoutCall.backendRequest.payload, undefined);
assert.equal(api.config.playerSessionToken, "");
assert.equal(api.config.accessToken, "");

console.log("API adapter test passed: authenticated route mapping, bounded bootstrap, World, notifications, market, watchlists, ledger, inventory, purchases, and logout contracts are valid.");
