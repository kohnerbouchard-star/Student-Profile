import { chromium } from "playwright";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
const REQUEST_ID = `red_${"b".repeat(32)}`;

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

const now = Math.floor(Date.now() / 1000);
const token = `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({
  sub: ADMIN_ID,
  email: "admin@example.test",
  role: "authenticated",
  iat: now,
  exp: now + 3600,
})}.signature`;

const game = {
  id: GAME_ID,
  gameSessionId: GAME_ID,
  title: "Redemption Smoke Game",
  name: "Redemption Smoke Game",
  status: "active",
  gameCode: "REDEEM",
};

const common = {
  gameId: GAME_ID,
  gameSessionId: GAME_ID,
  activeGameId: GAME_ID,
  selectedGameSessionId: GAME_ID,
  permissions: ["*"],
  roles: ["game_admin"],
  adminRole: "game_admin",
  game,
  activeGame: game,
  players: [],
  attendance: [],
  attendanceRows: [],
  attendanceHistory: [],
  attendanceLedger: [],
  attendanceSummary: {
    presentCount: 0,
    lateCount: 0,
    absentCount: 0,
    activePlayerCount: 0,
    rewardsIssuedCount: 0,
    rewardsIssuedTotal: 0,
  },
  attendanceCounts: { present: 0, late: 0, absent: 0, total: 0 },
  contracts: [],
  store: [],
  storeItems: [],
  assets: [],
  trades: [],
  events: [],
  market: { assets: [], trades: [], events: [] },
  settings: {
    difficultyPreset: "moderate",
    backendDifficultyPreset: "moderate",
    difficultyBasePreset: "moderate",
    priceMultiplier: 1,
    incomeMultiplier: 1,
    shockFrequency: 1,
    shockSeverity: 1,
    recoverySupport: 1,
    tradeMultiplier: 1,
    configSaveState: "saved",
  },
  logs: [],
  dashboard: {
    activePlayerCount: 0,
    totalPlayers: 0,
    onlinePlayerCount: 0,
    attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 },
    leaderboard: [],
    recentActivity: [],
    marketStatus: "open",
  },
};

function redemption(status = "pending") {
  return {
    id: REQUEST_ID,
    itemId: "meal-pass",
    quantity: 1,
    status,
    requestNote: "Lunch reward",
    resolutionNote: status === "pending" ? null : "Approved for classroom fulfillment",
    requestedAt: "2026-07-18T12:00:00.000Z",
    reviewedAt: status === "pending" ? null : "2026-07-18T12:05:00.000Z",
    fulfilledAt: null,
    updatedAt: status === "pending" ? "2026-07-18T12:00:00.000Z" : "2026-07-18T12:05:00.000Z",
    player: {
      reference: "P-100",
      displayName: "Test Player",
      rosterLabel: "A1",
    },
    item: {
      id: "meal-pass",
      name: "Meal Pass",
      category: "consumable",
    },
  };
}

async function runViewport(browser, viewport, fullFlow) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  let committed = false;
  let failRefresh = false;

  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  page.on("console", (message) => {
    const value = message.text();
    const expectedRefreshFailure = failRefresh && /status of 503|503 \(Service Unavailable\)/i.test(value);
    if (message.type() === "error" && !expectedRefreshFailure) errors.push(value);
  });

  await page.addInitScript(({ accessToken, gameId, adminId }) => {
    sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
      accessToken,
      refreshToken: "smoke-refresh-token",
      user: { id: adminId, email: "admin@example.test" },
    }));
    sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
  }, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID });

  await page.route("**/functions/v1/admin-api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id, x-econovaria-csrf, x-idempotency-key, x-request-id",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      }, body: "" });
      return;
    }
    if (url.pathname.endsWith("/session/bootstrap")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
        body: JSON.stringify({ data: {
          admin: {
            id: ADMIN_ID,
            accountId: ADMIN_ID,
            displayName: "Smoke Test Administrator",
            email: "admin@example.test",
            role: "game_admin",
            roles: ["game_admin"],
          },
          activeGame: game,
          games: [game],
          permissions: ["*"],
          roles: ["game_admin"],
          adminRole: "game_admin",
          csrfToken: "",
          session: {
            id: ADMIN_ID,
            csrfToken: "",
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
          capabilities: {
            notifications: false,
            securityHistory: "current_session_only",
            helpArticles: true,
            auditLogFlags: true,
            auditLogExport: true,
            overallScore: false,
            marketplaceAdminTrading: false,
          },
        } }),
      });
      return;
    }
    if (/\/inventory\/redemptions(?:\/|$)/.test(url.pathname)) {
      if (request.method() === "POST") {
        committed = true;
        failRefresh = true;
        const action = url.pathname.split("/").at(-1);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
          body: JSON.stringify({ data: {
            outcome: "applied",
            action,
            redemption: redemption(action === "reject" ? "rejected" : action === "fulfill" ? "fulfilled" : "approved"),
            effectApplication: "not_automated",
          } }),
        });
        return;
      }
      if (failRefresh) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
          body: JSON.stringify({
            code: "inventory_redemption_schema_not_applied",
            message: "Inventory redemption is temporarily unavailable.",
            retryable: true,
          }),
        });
        return;
      }
      const history = url.searchParams.get("status") === "all";
      const rows = history && committed ? [redemption("approved")] : [redemption("pending")];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
        body: JSON.stringify({ data: {
          redemptions: rows,
          requests: rows,
          summary: { returned: 999 },
          pagination: { limit: 10, offset: 0, returned: rows.length, hasMore: false },
          filters: { status: history ? "all" : "pending" },
        } }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify({ data: common }),
    });
  });

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.waitForSelector('[data-admin-section="Store"]', { timeout: 15_000 });
  await page.locator('[data-admin-section="Store"]').click();
  await page.waitForSelector("[data-admin-inventory-redemptions-open]", { timeout: 5_000 });
  await page.locator("[data-admin-inventory-redemptions-open]").click();
  await page.waitForSelector(`#adminInventoryRedemptionDrawer:not([hidden]) [data-admin-redemption-request="${REQUEST_ID}"]`, { timeout: 10_000 });

  const structure = await page.evaluate(() => ({
    drawerRole: document.getElementById("adminInventoryRedemptionDrawer")?.getAttribute("role"),
    selectedTab: document.querySelector('[data-admin-redemption-filter][aria-selected="true"]')?.getAttribute("data-admin-redemption-filter"),
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    snapshot: window.EconovariaAdminInventoryRedemptionQueue?.snapshot?.(),
  }));
  if (structure.drawerRole !== "dialog") throw new Error("Redemption drawer dialog semantics are missing.");
  if (structure.selectedTab !== "pending") throw new Error("Pending filter was not selected.");
  if (structure.documentWidth > structure.viewportWidth + 2) throw new Error(`Redemption drawer overflows at ${viewport.width}px.`);
  if (structure.snapshot?.returned !== 1) throw new Error("Redemption queue did not expose one validated request.");

  if (fullFlow) {
    await page.locator('[data-admin-redemption-review="approve"]').click();
    const modal = page.locator('[data-modal-id="inventory-redemption-review"]');
    await modal.waitFor({ state: "visible", timeout: 5_000 });
    if (await modal.locator('[role="dialog"][aria-modal="true"]').count() !== 1) {
      throw new Error("Approve confirmation is not an accessible modal dialog.");
    }
    await modal.locator('textarea[name="note"]').fill("Approved for classroom fulfillment");
    await modal.locator('button[type="submit"]').click();
    await modal.waitFor({ state: "detached", timeout: 10_000 });
    await page.waitForFunction(() => {
      const snapshot = window.EconovariaAdminInventoryRedemptionQueue?.snapshot?.();
      return snapshot?.stale === true && Boolean(snapshot?.success);
    }, null, { timeout: 10_000 });
    const committedState = await page.evaluate((requestId) => ({
      snapshot: window.EconovariaAdminInventoryRedemptionQueue.snapshot(),
      live: document.querySelector("[data-admin-redemption-status]")?.textContent || "",
      requestStillVisible: Boolean(document.querySelector(`[data-admin-redemption-request="${requestId}"]`)),
    }), REQUEST_ID);
    if (!committedState.snapshot.success.toLowerCase().includes("approve")) {
      throw new Error("Committed success was not retained after refresh failure.");
    }
    if (!committedState.live.toLowerCase().includes("refresh failed")) {
      throw new Error("Stale refresh failure was not surfaced after committed success.");
    }
    if (committedState.requestStillVisible) {
      throw new Error("Approved request was not optimistically removed from the pending queue.");
    }
  }

  await page.locator('[data-admin-section="Overview"]').click();
  await page.waitForTimeout(700);
  const closed = await page.evaluate(() => ({
    drawerHidden: document.getElementById("adminInventoryRedemptionDrawer")?.hidden === true,
    launchPresent: Boolean(document.querySelector("[data-admin-inventory-redemptions-open]")),
  }));
  if (!closed.drawerHidden || closed.launchPresent) throw new Error("Queue surface did not close when leaving Store.");
  if (errors.length) throw new Error(errors[0]);

  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await runViewport(browser, { width: 1440, height: 1000 }, true);
  await runViewport(browser, { width: 1024, height: 768 }, false);
  await runViewport(browser, { width: 768, height: 900 }, false);
  console.log("Admin inventory redemption queue browser smoke passed at desktop, compact, and narrow widths.");
} finally {
  await browser.close();
}
