import { expect, test } from "@playwright/test";

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const LISTING_ID = "lst_11111111111111111111111111111111";
const RESERVATION_ID = "mpr_22222222222222222222222222222222";
const ORDER_ID = "ord_33333333333333333333333333333333";
const ACCOUNT_ID = "bac_44444444444444444444444444444444";
const TARGET_ACCOUNT_ID = "bac_55555555555555555555555555555555";
const QUOTE_ID = "pfq_66666666666666666666666666666666";
const RECEIPT_ID = "pfr_77777777777777777777777777777777";
const BANK_TRANSACTION_ID = "btx_88888888888888888888888888888888";
const DISTRIBUTION_TRANSACTION_ID = "btx_99999999999999999999999999999999";
const FIXING_ID = "fxf_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CSRF_TOKEN = "M".repeat(43);
const NOW = "2026-08-28T01:00:00.000Z";
const EXPIRES = "2099-08-28T01:02:00.000Z";

function session() {
  return {
    ok: true,
    player: {
      playerId: "PLAYER-42",
      displayName: "Marketplace Tester",
      rosterLabel: "Trader 42",
      countryCode: "LUMENOR",
      countryName: "Lumenor",
      currencyCode: "LUM",
      status: "active",
    },
    gameSession: {
      name: "Marketplace Browser Game",
      code: "MARKET42",
      status: "active",
    },
    session: { status: "active", expiresAt: "2099-08-28T03:00:00.000Z" },
    balances: [],
    attendance: { status: "not_configured" },
    availableActions: [],
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
    ["marketplacePurchase", "POST", "/players/me/marketplace/listings/:listingId/quotes"],
    ["marketplaceSettlement", "POST", "/players/me/marketplace/reservations/:reservationId/settlements"],
    ["marketplaceCancel", "POST", "/players/me/marketplace/listings/:listingId/cancel"],
    ["marketplaceDispute", "POST", "/players/me/marketplace/orders/:orderId/disputes"],
    ["inventory", "GET", "/players/me/inventory"],
    ["bankingFx", "GET", "/players/me/banking/fx"],
  ].map(([key, method, pathTemplate]) => ({
    key,
    operations: [{ method, pathTemplate }],
  }));
  return {
    schemaVersion: 1,
    manifestVersion: "2026-08-28.1",
    service: "player-api",
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
        marketplaceActivate: true,
        marketplaceCancel: true,
        marketplaceListing: true,
        marketplacePurchase: true,
        marketplaceDispute: true,
      },
    },
    endpoints,
  };
}

function dashboard() {
  return {
    ok: true,
    gameSession: {
      id: GAME_ID,
      name: "Marketplace Browser Game",
      status: "active",
      marketStatus: "open",
      currentTick: 42,
      updatedAt: NOW,
    },
    me: {
      playerId: "PLAYER-42",
      displayName: "Marketplace Tester",
      rosterLabel: "Trader 42",
      countryCode: "LUMENOR",
      netWorth: 1000,
      cash: {
        balances: [{ accountType: "checking", currencyCode: "LUM", balance: 500 }],
        primaryCurrencyCode: "LUM",
        totalBalance: 500,
      },
      stocks: {
        portfolio: {
          totalMarketValue: 0,
          totalCostBasis: 0,
          totalRealizedPnl: 0,
          totalUnrealizedPnl: 0,
          totalPnl: 0,
        },
        holdings: [],
        orders: [],
        trades: [],
      },
      store: { currencyCode: "LUM", listings: [], inventory: [], recentPurchases: [] },
      contracts: { available: [], progress: [] },
    },
    public: {
      leaderboard: [],
      players: [],
      market: { stocks: [], news: [] },
      contracts: [],
      storeListings: [],
    },
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
        expiresAt: "2099-08-29T01:00:00.000Z",
        createdAt: NOW,
        updatedAt: NOW,
        moderationReason: null,
        mine: false,
      }],
      myListings: [],
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

function bankingFx() {
  return {
    configured: true,
    generatedAt: NOW,
    currencies: [{ currencyCode: "LUM", minorUnit: 2 }],
    balances: [{
      accountKey: ACCOUNT_ID,
      accountKind: "checking",
      currencyCode: "LUM",
      postedAmount: 500,
      heldAmount: 0,
      availableAmount: 500,
    }],
    fixing: {
      fixingKey: FIXING_ID,
      effectiveAt: NOW,
      calculatedAt: NOW,
      nextFixingAt: "2099-08-29T08:00:00.000Z",
      overdue: false,
      policyVersion: "daily-fixing-v1",
    },
    pendingOrders: [],
    completedOrders: [],
  };
}

function fundedQuote() {
  return {
    ok: true,
    outcome: "applied",
    reservation: {
      reservationKey: RESERVATION_ID,
      listingKey: LISTING_ID,
      itemKey: "data-chip",
      quantity: 1,
      unitPrice: 15,
      subtotal: 15,
      feeRate: 0.025,
      taxRate: 0.01,
      feeAmount: 0.38,
      taxAmount: 0.15,
      buyerTotal: 15.53,
      sellerProceeds: 15,
      currencyCode: "LUM",
      status: "reserved",
      version: 1,
      listingVersion: 7,
      expiresAt: EXPIRES,
      replayed: false,
      fundingQuote: {
        quoteKey: QUOTE_ID,
        fundingContextKind: "marketplace.purchase",
        fundingContextKey: RESERVATION_ID,
        targetCurrencyCode: "LUM",
        targetMinorUnit: 2,
        targetAmount: 15.53,
        fixingKey: FIXING_ID,
        policyVersion: "retail-checkout-v1",
        requiresFx: false,
        expiresAt: EXPIRES,
        lines: [{
          lineNumber: 1,
          sourceAccountKey: ACCOUNT_ID,
          sourceCurrencyCode: "LUM",
          sourceMinorUnit: 2,
          targetCurrencyCode: "LUM",
          targetMinorUnit: 2,
          postedAmount: 500,
          heldAmount: 0,
          availableAmount: 500,
          targetContribution: 15.53,
          sourceDebit: 15.53,
          referenceRate: 1,
          customerRate: 1,
          effectiveRate: 1,
          spreadRate: 0,
          requiresFx: false,
          roundingDisclosure: "Same-currency source debit equals the listing-currency contribution.",
        }],
      },
    },
  };
}

function fundedOrder() {
  return {
    ok: true,
    outcome: "applied",
    order: {
      orderKey: ORDER_ID,
      reservationKey: RESERVATION_ID,
      listingKey: LISTING_ID,
      itemKey: "data-chip",
      quantity: 1,
      unitPrice: 15,
      subtotal: 15,
      feeAmount: 0.38,
      taxAmount: 0.15,
      buyerTotal: 15.53,
      sellerProceeds: 15,
      currencyCode: "LUM",
      status: "completed",
      version: 2,
      completedAt: NOW,
      refundedAt: null,
      replayed: false,
      fundingReceipt: {
        receiptKey: RECEIPT_ID,
        quoteKey: QUOTE_ID,
        bankTransactionKey: BANK_TRANSACTION_ID,
        targetAccountKey: TARGET_ACCOUNT_ID,
        fundingContextKind: "marketplace.purchase",
        fundingContextKey: RESERVATION_ID,
        targetCurrencyCode: "LUM",
        targetAmount: 15.53,
        targetReserveDrawAmount: 0,
        sourceDomain: "marketplace",
        sourceAction: "marketplace_purchase_funding",
        createdAt: NOW,
        lines: [{
          lineNumber: 1,
          sourceAccountKey: ACCOUNT_ID,
          sourceCurrencyCode: "LUM",
          targetContribution: 15.53,
          sourceDebit: 15.53,
          referenceRate: 1,
          customerRate: 1,
          effectiveRate: 1,
          spreadRate: 0,
          requiresFx: false,
        }],
      },
      distributionBankTransactionKey: DISTRIBUTION_TRANSACTION_ID,
    },
  };
}

function response(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installRoutes(page) {
  let quotePosts = 0;
  let settlementPosts = 0;
  let committed = false;
  await page.route("**/functions/v1/player-api/**", async (route) => {
    throw new Error(`Player browser bypassed the HttpOnly BFF: ${route.request().url()}`);
  });
  await page.route("**/functions/v1/player-web-session-api/proxy/**", async (route) => {
    const request = route.request();
    const headers = request.headers();
    expect(headers.authorization).toBeUndefined();
    expect(headers["x-player-session-token"]).toBeUndefined();
    expect(headers["x-econovaria-player-session-token"]).toBeUndefined();
    expect(headers.apikey).toBeTruthy();
    expect(headers.cookie).toContain("econovaria_player_session=");
    if (!["GET", "HEAD"].includes(request.method())) {
      expect(headers["x-econovaria-csrf-token"]).toBe(CSRF_TOKEN);
    }

    const url = new URL(request.url());
    const path = url.pathname.replace(
      /^.*\/functions\/v1\/player-web-session-api\/proxy/u,
      "",
    );
    if (path === "/players/me" && request.method() === "GET") {
      return response(route, session());
    }
    if (path === "/players/me/capabilities" && request.method() === "GET") {
      return response(route, capabilities());
    }
    if (path === "/players/me/game/dashboard" && request.method() === "GET") {
      return response(route, dashboard());
    }
    if (path === "/players/me/inventory" && request.method() === "GET") {
      return response(route, inventory());
    }
    if (path === "/players/me/banking/fx" && request.method() === "GET") {
      return response(route, bankingFx());
    }
    if (path === "/players/me/marketplace/listings" && request.method() === "GET") {
      if (committed) {
        return response(route, {
          error: {
            code: "marketplace_refresh_failed",
            message: "refresh unavailable",
            retryable: true,
          },
        }, 503);
      }
      return response(route, marketplace());
    }
    if (
      path === `/players/me/marketplace/listings/${LISTING_ID}/quotes` &&
      request.method() === "POST"
    ) {
      quotePosts += 1;
      const body = request.postDataJSON();
      expect(body.quantity).toBe(1);
      expect(body.expectedVersion).toBe(7);
      expect(body.allocations).toEqual([
        { sourceAccountKey: ACCOUNT_ID, targetAmount: 15.53 },
      ]);
      expect(body.idempotencyKey).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u);
      expect(JSON.stringify(body)).not.toMatch(/playerUuid|playerId|gameSessionId/u);
      return response(route, fundedQuote(), 201);
    }
    if (
      path === `/players/me/marketplace/reservations/${RESERVATION_ID}/settlements` &&
      request.method() === "POST"
    ) {
      settlementPosts += 1;
      const body = request.postDataJSON();
      expect(body.idempotencyKey).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u);
      expect(Number.isFinite(Date.parse(body.clientSubmittedAt))).toBe(true);
      expect(JSON.stringify(body)).not.toMatch(/playerUuid|playerId|gameSessionId/u);
      committed = true;
      return response(route, fundedOrder());
    }
    return response(route, {
      error: { code: "route_not_found", message: path, retryable: false },
    }, 404);
  });
  return {
    quotePosts: () => quotePosts,
    settlementPosts: () => settlementPosts,
  };
}

async function installSession(page) {
  await page.context().addCookies([{
    name: "econovaria_player_session",
    value: "v1.marketplace-browser.http-only-envelope",
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Strict",
  }]);
  await page.addInitScript(({ csrfToken }) => {
    sessionStorage.setItem("econovaria.player.auth.v1", JSON.stringify({
      authenticated: true,
      sessionExpiresAt: "2099-08-28T03:00:00.000Z",
      absoluteExpiresAt: "2099-08-28T05:00:00.000Z",
      csrfToken,
      player: {
        playerId: "PLAYER-42",
        displayName: "Marketplace Tester",
        rosterLabel: "Trader 42",
        countryCode: "LUMENOR",
        countryName: "Lumenor",
        currencyCode: "LUM",
        status: "active",
      },
      gameSession: {
        name: "Marketplace Browser Game",
        code: "MARKET42",
        status: "active",
      },
      storedAt: NOW,
    }));
  }, { csrfToken: CSRF_TOKEN });
}

test("Marketplace purchase reviews exact funding before atomic settlement", async ({ page }) => {
  await installSession(page);
  const harness = await installRoutes(page);
  await page.goto("/?api=1#marketplace");

  const marketplacePage = page.locator(".player-terminal-marketplace-page");
  const quoteForm = marketplacePage.locator(
    '[data-player-marketplace-funding-form="quote"]',
  );
  await expect(marketplacePage).toBeVisible();
  await expect(
    marketplacePage.getByRole("heading", { name: "Marketplace" }),
  ).toBeVisible();
  await expect(quoteForm).toBeVisible();
  await expect(quoteForm.locator('[name="sourceAccountKey"]').first()).toHaveValue(
    ACCOUNT_ID,
  );
  await expect(quoteForm.locator('[name="targetAmount"]').first()).toHaveValue(
    "15.53",
  );
  await expect(page.evaluate(() => document.cookie)).resolves.not.toContain("econovaria_player_session");

  await quoteForm.getByRole("button", { name: /Review exact funding quote/i }).click();
  await expect.poll(harness.quotePosts).toBe(1);
  const settlementForm = marketplacePage.locator(
    '[data-player-marketplace-funding-form="settlement"]',
  );
  await expect(settlementForm).toBeVisible();
  await expect(marketplacePage.getByText("IMMUTABLE FUNDING QUOTE")).toBeVisible();
  await expect(marketplacePage.getByText(/LUM 15\.53 total/u)).toBeVisible();

  await settlementForm.getByRole("button", { name: /Confirm quoted purchase/i }).click();
  await expect.poll(harness.settlementPosts).toBe(1);
  await expect(page.locator(".player-terminal-toast")).toContainText(
    /settled|delivered|replayed/iu,
  );
  await page.waitForTimeout(150);
  expect(harness.quotePosts()).toBe(1);
  expect(harness.settlementPosts()).toBe(1);
  await expect(marketplacePage).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu,
  );
});
