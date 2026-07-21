import { expect, test } from "@playwright/test";

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const LISTING_ID = "lst_11111111111111111111111111111111";
const ORDER_ID = "ord_22222222222222222222222222222222";
const SESSION_TOKEN = "marketplace-browser-session-token";
const NOW = "2026-07-21T01:00:00.000Z";

function session() {
  return {
    ok: true,
    session: {
      playerId: "PLAYER-42",
      playerSessionId: "psn_marketplace_browser",
      playerSessionToken: SESSION_TOKEN,
      gameSessionId: GAME_ID,
      gameId: GAME_ID,
      gameCode: "MARKET42",
      gameName: "Marketplace Browser Game",
      gameStatus: "active",
      displayName: "Marketplace Tester",
      countryCode: "LUMENOR",
      countryName: "Lumenor",
      currencyCode: "LUM",
      expiresAt: "2026-07-21T03:00:00.000Z",
    },
    player: {
      id: "PLAYER-42",
      name: "Marketplace Tester",
      displayName: "Marketplace Tester",
      rosterLabel: "Trader 42",
      countryCode: "LUMENOR",
      currencyCode: "LUM",
    },
  };
}

function capabilities() {
  const endpoints = [
    ["bootstrap", "GET", "/players/me"],
    ["capabilities", "GET", "/players/me/capabilities"],
    ["dashboard", "GET", "/players/me/game/dashboard"],
    ["marketplace", "GET", "/players/me/marketplace/listings"],
    ["marketplaceListing", "POST", "/players/me/marketplace/listings"],
    ["marketplaceActivate", "POST", "/players/me/marketplace/listings/:listingId/activate"],
    ["marketplacePurchase", "POST", "/players/me/marketplace/listings/:listingId/purchase"],
    ["marketplaceCancel", "POST", "/players/me/marketplace/listings/:listingId/cancel"],
    ["marketplaceDispute", "POST", "/players/me/marketplace/orders/:orderId/disputes"],
    ["inventory", "GET", "/players/me/inventory"],
  ].map(([key, method, pathTemplate]) => ({ key, operations: [{ method, pathTemplate }] }));
  return {
    schemaVersion: 1,
    manifestVersion: "2026-07-21.1",
    service: "classroom-api",
    capabilities: {
      routes: {
        dashboard: true,
        news: false,
        market: false,
        portfolio: false,
        business: false,
        contracts: false,
        store: false,
        marketplace: true,
        inventory: true,
        crafting: false,
        banking: false,
        loans: false,
        messages: false,
        progression: false,
        profile: true,
      },
      actions: {
        bankingExport: false,
        bankTransfer: false,
        businessHire: false,
        businessPrice: false,
        businessProduction: false,
        chartRange: false,
        contractAccept: false,
        contractSubmit: false,
        craftItem: false,
        inventoryUse: false,
        loanApply: false,
        loanRepay: false,
        logout: false,
        marketOrder: false,
        marketSearch: false,
        marketWatchlist: false,
        marketplaceActivate: true,
        marketplaceCancel: true,
        marketplaceListing: true,
        marketplacePurchase: true,
        marketplaceDispute: true,
        messageAttachment: false,
        messageSearch: false,
        messageSend: false,
        notificationsRead: false,
        progressionClaim: false,
        progressionUnlock: false,
        savingsTransfer: false,
        storePurchase: false,
        storyDeliveryState: false,
      },
    },
    endpoints,
  };
}

function dashboard() {
  return {
    ok: true,
    gameSession: { id: GAME_ID, name: "Marketplace Browser Game", status: "active", marketStatus: "open", currentTick: 42, updatedAt: NOW },
    me: {
      playerId: "PLAYER-42",
      displayName: "Marketplace Tester",
      rosterLabel: "Trader 42",
      countryCode: "LUMENOR",
      netWorth: 1000,
      cash: { balances: [{ accountType: "checking", currencyCode: "LUM", balance: 500 }], primaryCurrencyCode: "LUM", totalBalance: 500 },
      stocks: { portfolio: { totalMarketValue: 0, totalCostBasis: 0, totalRealizedPnl: 0, totalUnrealizedPnl: 0, totalPnl: 0 }, holdings: [], orders: [], trades: [] },
      store: { currencyCode: "LUM", listings: [], inventory: [], recentPurchases: [] },
      contracts: { available: [], progress: [] },
    },
    public: { leaderboard: [], players: [], market: { stocks: [], news: [] }, contracts: [], storeListings: [] },
    unseenCutscenes: [],
    realtime: { publicChannel: `game:${GAME_ID}:public`, lastSequence: null, events: [] },
  };
}

function marketplace() {
  return {
    ok: true,
    marketplace: {
      policy: {
        marketplaceEnabled: true,
        crossCountryTradingEnabled: true,
        moderationRequired: false,
        feeRate: 0.025,
        taxRate: 0.01,
        listingDurationHours: 168,
        purchaseReservationMinutes: 5,
        disputeWindowDays: 7,
        disputesEnabled: true,
      },
      listings: [{
        id: LISTING_ID,
        itemId: "data-chip",
        name: "Data Chip",
        description: "Encrypted market data used for browser verification.",
        category: "Equipment",
        image: null,
        country: "lumenor",
        condition: "Like New",
        seller: "Nova Trader",
        sellerReference: "PLAYER-77",
        unitPrice: 15,
        currencyCode: "LUM",
        quantity: 2,
        status: "active",
        version: 7,
        expiresAt: "2026-07-28T01:00:00.000Z",
        createdAt: NOW,
        updatedAt: NOW,
        moderationReason: null,
        mine: false,
      }],
      myListings: [{
        id: "lst_33333333333333333333333333333333",
        itemId: "data-chip",
        name: "Data Chip",
        description: "A reserved inventory listing.",
        category: "Equipment",
        image: null,
        country: "lumenor",
        condition: "Used",
        seller: "Marketplace Tester",
        sellerReference: "PLAYER-42",
        unitPrice: 12,
        currencyCode: "LUM",
        quantity: 1,
        status: "draft",
        version: 1,
        expiresAt: "2026-07-28T01:00:00.000Z",
        createdAt: NOW,
        updatedAt: NOW,
        moderationReason: null,
        mine: true,
      }],
      reservations: [],
      orders: [],
      disputes: [],
      summary: { listingCount: 1, activeSellers: 1, volume: 30 },
    },
  };
}

function inventory() {
  return {
    ok: true,
    inventory: {
      items: [{
        inventoryId: "inv_11111111111111111111111111111111",
        itemId: "itm_11111111111111111111111111111111",
        itemKey: "data-chip",
        name: "Data Chip",
        description: "Encrypted market data.",
        category: "Equipment",
        quantity: 3,
        quantityReserved: 1,
        quantityAvailable: 2,
        image: null,
      }],
      capacityUsed: 3,
      capacityMax: 100,
    },
  };
}

function response(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installRoutes(page) {
  let purchasePosts = 0;
  let committed = false;
  await page.route("**/functions/v1/classroom-api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/functions\/v1\/classroom-api/, "");
    if (path === "/players/me" && request.method() === "GET") return response(route, session());
    if (path === "/players/me/capabilities" && request.method() === "GET") return response(route, capabilities());
    if (path === "/players/me/game/dashboard" && request.method() === "GET") return response(route, dashboard());
    if (path === "/players/me/inventory" && request.method() === "GET") return response(route, inventory());
    if (path === "/players/me/marketplace/listings" && request.method() === "GET") {
      if (committed) return response(route, { error: { code: "marketplace_refresh_failed", message: "refresh unavailable", retryable: true } }, 503);
      return response(route, marketplace());
    }
    if (path === `/players/me/marketplace/listings/${LISTING_ID}/purchase` && request.method() === "POST") {
      purchasePosts += 1;
      const body = request.postDataJSON();
      expect(body).toEqual(expect.objectContaining({ quantity: 1, expectedVersion: 7 }));
      expect(body.idempotencyKey).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/);
      expect(JSON.stringify(body)).not.toMatch(/playerUuid|playerId|gameSessionId/);
      committed = true;
      return response(route, {
        ok: true,
        outcome: "applied",
        target: { id: ORDER_ID, status: "completed", version: 2, committedAt: NOW },
        committed: true,
        refreshRequired: true,
      });
    }
    return response(route, { error: { code: "route_not_found", message: path, retryable: false } }, 404);
  });
  return { purchasePosts: () => purchasePosts };
}

function installSession(page) {
  return page.addInitScript(({ gameId, token }) => {
    const value = {
      gameSessionId: gameId,
      playerSessionId: "psn_marketplace_browser",
      playerSessionToken: token,
      expiresAt: "2026-07-21T03:00:00.000Z",
    };
    globalThis.ECONOVARIA_PLAYER_SESSION = value;
    globalThis.ECONOVARIA_PLAYER_TERMINAL_CONFIG = {
      ...(globalThis.ECONOVARIA_PLAYER_TERMINAL_CONFIG || {}),
      usePreviewData: false,
      gameSessionId: gameId,
      playerSessionId: value.playerSessionId,
      playerSessionToken: token,
    };
  }, { gameId: GAME_ID, token: SESSION_TOKEN });
}

test("Marketplace purchase remains committed when authoritative refresh fails", async ({ page }) => {
  await installSession(page);
  const harness = await installRoutes(page);
  await page.goto("/?api=1#marketplace");

  const marketplacePage = page.locator(".player-terminal-marketplace-page");
  await expect(marketplacePage).toBeVisible();
  await expect(marketplacePage.getByRole("heading", { name: "Marketplace" })).toBeVisible();
  await expect(marketplacePage.getByText("Data Chip", { exact: true }).first()).toBeVisible();
  await expect(marketplacePage.locator('input[name="listingId"]')).toHaveValue(LISTING_ID);
  await expect(marketplacePage.locator('input[name="expectedVersion"]')).toHaveValue("7");
  await expect(marketplacePage.getByText("Create a draft listing", { exact: true })).toBeVisible();
  await expect(marketplacePage.getByText("Disputes and refunds", { exact: true })).toBeVisible();

  await marketplacePage.getByRole("button", { name: /Buy listing/i }).click();
  await expect.poll(harness.purchasePosts).toBe(1);
  await expect(page.locator(".player-terminal-toast")).toContainText(/Action completed|refresh/i);
  await page.waitForTimeout(150);
  expect(harness.purchasePosts()).toBe(1);
  await expect(marketplacePage).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});
