import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts";
const GAME_ID = "00000000-0000-4000-8000-000000000001";

mkdirSync(ARTIFACT_DIR, { recursive: true });

function base64Url(value) {
  return Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fakeToken() {
  const now = Math.floor(Date.now() / 1000);
  return `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({
    sub: "00000000-0000-4000-8000-000000000002",
    email: "admin@example.test",
    role: "authenticated",
    iat: now,
    exp: now + 3600,
  })}.signature`;
}

function responseFor(pathname) {
  const player = {
    id: "00000000-0000-4000-8000-000000000003",
    displayName: "Smoke Test Player",
    rosterLabel: "ST-001",
    status: "active",
    countryCode: "NOV",
    countryName: "Novaria",
    cashBalance: 1000,
    stockMarketValue: 0,
    inventoryMarketValue: 0,
    netWorth: 1000,
    currencyCode: "ECO",
  };
  const game = {
    id: GAME_ID,
    gameSessionId: GAME_ID,
    title: "Browser Smoke Game",
    name: "Browser Smoke Game",
    status: "active",
    gameCode: "SMOKE1",
  };
  const settings = {
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
    players: [player],
    attendance: [],
    attendanceRows: [],
    attendanceHistory: [],
    attendanceLedger: [],
    attendanceSummary: {
      presentCount: 0,
      lateCount: 0,
      absentCount: 1,
      activePlayerCount: 1,
      rewardsIssuedCount: 0,
      rewardsIssuedTotal: 0,
    },
    attendanceCounts: { present: 0, late: 0, absent: 1, total: 1 },
    contracts: [],
    store: [],
    storeItems: [],
    assets: [],
    trades: [],
    events: [],
    market: { assets: [], trades: [], events: [] },
    settings,
    logs: [],
    dashboard: {
      activePlayerCount: 1,
      totalPlayers: 1,
      onlinePlayerCount: 1,
      attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 1 },
      leaderboard: [player],
      recentActivity: [],
      marketStatus: "open",
    },
  };

  if (pathname.endsWith("/session/bootstrap")) {
    return {
      data: {
        admin: {
          id: "00000000-0000-4000-8000-000000000002",
          accountId: "00000000-0000-4000-8000-000000000002",
          displayName: "Smoke Test Administrator",
          email: "admin@example.test",
          role: "game_admin",
          roles: ["game_admin"],
        },
        activeGame: game,
        games: [game],
        permissions: ["*"],
        roles: ["game_admin"],
        csrfToken: "",
        session: {
          id: "00000000-0000-4000-8000-000000000002",
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
      },
    };
  }
  if (pathname.includes("/players")) return { data: { ...common, players: [player] } };
  if (pathname.includes("/attendance/history")) {
    return { data: { ...common, rows: [], records: [], attendanceHistory: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 } } };
  }
  if (pathname.includes("/attendance")) return { data: common };
  if (pathname.includes("/contracts")) return { data: { ...common, contracts: [] } };
  if (pathname.includes("/store")) return { data: { ...common, store: [], storeItems: [] } };
  if (pathname.includes("/market")) return { data: { ...common, assets: [], trades: [], events: [], market: common.market } };
  if (pathname.includes("/settings")) return { data: { ...common, settings } };
  if (pathname.includes("/logs")) return { data: { ...common, logs: [] } };
  return { data: common };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const consoleMessages = [];

page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => {
  const text = `${message.type()}: ${message.text()}`;
  consoleMessages.push(text);
  if (message.type() === "error") errors.push(text);
});
page.on("requestfailed", (request) => {
  errors.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`);
});

await page.addInitScript(({ token, gameId }) => {
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
    accessToken: token,
    refreshToken: "smoke-refresh-token",
    user: {
      id: "00000000-0000-4000-8000-000000000002",
      email: "admin@example.test",
    },
  }));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
}, { token: fakeToken(), gameId: GAME_ID });

await page.route("**/functions/v1/admin-api/**", async (route) => {
  const request = route.request();
  if (request.method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id, x-econovaria-csrf",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      },
      body: "",
    });
    return;
  }
  const pathname = new URL(request.url()).pathname;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify(responseFor(pathname)),
  });
});

async function capture(name) {
  await page.screenshot({ path: `${ARTIFACT_DIR}/${name}.png`, fullPage: true });
  writeFileSync(`${ARTIFACT_DIR}/${name}.html`, await page.content());
}

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.waitForSelector("[data-admin-section]", { timeout: 15_000 });
  await page.waitForTimeout(1500);

  const initial = await page.locator("[data-admin-section]").evaluateAll((nodes) => nodes.map((node) => ({
    label: (node.textContent || "").trim().replace(/\s+/g, " "),
    section: node.getAttribute("data-admin-section"),
    disabled: "disabled" in node ? Boolean(node.disabled) : node.getAttribute("aria-disabled") === "true",
    ariaCurrent: node.getAttribute("aria-current"),
    className: node.className,
    rect: (() => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })(),
  })));
  console.log("NAV_INITIAL", JSON.stringify(initial, null, 2));

  if (initial.length < 8) throw new Error(`Expected at least 8 navigation controls, received ${initial.length}.`);
  const disabled = initial.filter((item) => item.disabled);
  if (disabled.length) throw new Error(`Navigation controls are disabled: ${disabled.map((item) => item.section || item.label).join(", ")}`);

  for (const item of initial) {
    const locator = page.locator(`[data-admin-section="${item.section}"]`).first();
    await locator.scrollIntoViewIfNeeded();
    await locator.click({ timeout: 5000 });
    await page.waitForTimeout(250);
    const state = await locator.evaluate((node) => ({
      ariaCurrent: node.getAttribute("aria-current"),
      className: node.className,
      pressed: node.getAttribute("aria-pressed"),
    }));
    const shellText = (await page.locator("#adminPreview").innerText()).replace(/\s+/g, " ").slice(0, 500);
    console.log("NAV_CLICK", JSON.stringify({ section: item.section, state, shellText }));
    if (errors.length) throw new Error(`Runtime error after clicking ${item.section}: ${errors[0]}`);
  }

  const actionable = page.locator("button[data-admin-terminal-action]:not([disabled]), [role=button][data-admin-terminal-action]:not([aria-disabled=true])");
  const actionCount = await actionable.count();
  console.log("ACTIONABLE_COUNT", actionCount);
  if (actionCount === 0) throw new Error("No enabled delegated action controls were rendered.");

  await capture("admin-browser-smoke-pass");
  console.log("Admin browser interaction smoke passed.");
} catch (error) {
  await capture("admin-browser-smoke-failure");
  console.error(error.stack || error.message || String(error));
  console.error("BROWSER_ERRORS", JSON.stringify(errors, null, 2));
  console.error("CONSOLE_MESSAGES", JSON.stringify(consoleMessages, null, 2));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
