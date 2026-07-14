import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts";
const GAME_ID = "00000000-0000-4000-8000-000000000701";
const ADMIN_ID = "00000000-0000-4000-8000-000000000702";
const PLAYER_ID = "00000000-0000-4000-8000-000000000703";
const TAB_LABELS = ["Overview", "Bank Accounts", "Assets", "Liabilities", "Inventory", "Logs"];
const TAB_KEYS = ["overview", "bank", "assets", "liabilities", "inventory", "logs"];

mkdirSync(ARTIFACT_DIR, { recursive: true });

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const now = Math.floor(Date.now() / 1000);
const accessToken = `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url({
  sub: ADMIN_ID,
  email: "admin@example.test",
  role: "authenticated",
  iat: now,
  exp: now + 3600,
})}.signature`;

const game = {
  id: GAME_ID,
  gameSessionId: GAME_ID,
  title: "Player Drawer Smoke Game",
  name: "Player Drawer Smoke Game",
  status: "active",
  gameCode: "DRAWER",
};

const player = {
  id: PLAYER_ID,
  playerId: PLAYER_ID,
  displayName: "Authoritative Drawer Player",
  name: "Authoritative Drawer Player",
  rosterLabel: "DRAWER-01",
  playerIdentifier: "RFID:DRAWER-01",
  status: "active",
  sessionStatus: "offline",
  countryCode: "NORTHREACH",
  countryName: "Northreach",
  location: "Northreach",
  currencyCode: "NRC",
  cashBalance: 1250,
  balance: 1250,
  netWorth: 1980,
  balances: [
    { accountType: "cash", balance: 1250, currencyCode: "NRC" },
    { accountType: "savings", balance: 300, currencyCode: "NRC" },
  ],
  stockMarketValue: 400,
  stockPositions: [
    {
      stockAssetId: "00000000-0000-4000-8000-000000000704",
      ticker: "NOVA",
      companyName: "Novaria Logistics",
      quantity: 4,
      currentPrice: 100,
      marketValue: 400,
    },
  ],
  inventoryMarketValue: 30,
  inventoryPositions: [
    {
      storeItemId: "00000000-0000-4000-8000-000000000705",
      itemName: "Market Intel Token",
      quantityOwned: 1,
      quantityReserved: 0,
      availableQuantity: 1,
      unitValue: 30,
      marketValue: 30,
    },
  ],
  overallScore: null,
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
  roster: [player],
  leaderboard: [],
  attendance: [],
  attendanceRows: [],
  attendanceHistory: [],
  attendanceLedger: [],
  attendanceSummary: {
    presentCount: 0,
    lateCount: 0,
    absentCount: 0,
    activePlayerCount: 1,
    rewardsIssuedCount: 0,
    rewardsIssuedTotal: 0,
  },
  attendanceCounts: { present: 0, late: 0, absent: 0, total: 1 },
  contracts: [],
  store: [],
  storeItems: [],
  assets: [],
  trades: [],
  events: [],
  market: { assets: [], trades: [], events: [] },
  settings: {},
  logs: [],
  dashboard: {
    activePlayerCount: 1,
    totalPlayers: 1,
    onlinePlayerCount: 0,
    attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 },
    leaderboard: [],
    recentActivity: [],
    marketStatus: "open",
  },
};

function bootstrapResponse() {
  return {
    data: {
      admin: {
        id: ADMIN_ID,
        accountId: ADMIN_ID,
        displayName: "Drawer Smoke Administrator",
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
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      capabilities: {},
    },
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
let phase = "initializing";

page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("requestfailed", (request) => {
  const url = request.url();
  const failure = request.failure()?.errorText || "";
  if (url.endsWith("/favicon.ico")) return;
  if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(url) && failure.includes("ERR_ABORTED")) return;
  errors.push(`requestfailed: ${request.method()} ${url} ${failure}`);
});

await page.addInitScript(({ token, gameId, adminId }) => {
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
    accessToken: token,
    refreshToken: "drawer-smoke-refresh-token",
    user: { id: adminId, email: "admin@example.test" },
  }));
  sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
}, { token: accessToken, gameId: GAME_ID, adminId: ADMIN_ID });

await page.route("**/functions/v1/admin-api/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (request.method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      },
      body: "",
    });
    return;
  }

  const body = pathname.endsWith("/session/bootstrap")
    ? bootstrapResponse()
    : pathname.endsWith(`/games/${GAME_ID}/players`)
      ? { data: { ...common, players: [player], roster: [player] } }
      : { data: common };

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify(body),
  });
});

async function saveDiagnostics(name, extra = {}) {
  writeFileSync(`${ARTIFACT_DIR}/${name}.json`, JSON.stringify({ phase, errors, ...extra }, null, 2));
  writeFileSync(`${ARTIFACT_DIR}/${name}.html`, await page.content());
  await page.screenshot({ path: `${ARTIFACT_DIR}/${name}.png`, fullPage: true });
}

try {
  phase = "opening admin shell";
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });

  phase = "opening Players section";
  await page.locator('[data-admin-section="Players"]').first().click();
  const playerEntry = page.getByText(player.displayName, { exact: true }).first();
  await playerEntry.waitFor({ state: "visible", timeout: 8000 });
  await playerEntry.click();

  phase = "verifying original drawer shell";
  const drawer = page.locator("[data-admin-terminal-player-drawer]").first();
  await drawer.waitFor({ state: "visible", timeout: 8000 });
  assert(await drawer.getAttribute("data-admin-player-drawer-authoritative") !== null, "Player drawer is not marked as authoritative-data only.");
  assert(await page.locator(".admin-terminal-player-real-data-v604").count() === 0, "Flat backend player record is still visible.");

  const labels = await drawer.locator("[data-player-drawer-tab]").allTextContents();
  assert(JSON.stringify(labels.map((value) => value.trim())) === JSON.stringify(TAB_LABELS), `Player drawer tabs drifted: ${JSON.stringify(labels)}.`);
  assert(!(await drawer.textContent()).includes(PLAYER_ID), "Player drawer exposed the backend UUID.");

  for (const key of TAB_KEYS) {
    phase = `opening ${key} drawer tab`;
    const button = drawer.locator(`[data-player-drawer-tab="${key}"]`);
    await button.click();
    const panel = drawer.locator(`[data-player-drawer-panel="${key}"]`);
    await panel.waitFor({ state: "visible", timeout: 5000 });
    assert(await button.getAttribute("aria-selected") === "true", `${key} tab was not selected.`);
    assert(await drawer.locator("[data-player-drawer-panel]:visible").count() === 1, `${key} tab left multiple panels visible.`);
  }

  assert(errors.length === 0, errors[0] || "Unexpected browser error.");
  phase = "passed";
  await saveDiagnostics("admin-player-drawer-v606", { tabs: labels });
  console.log("Authoritative player data renders inside the original v606 six-tab drawer.");
} catch (error) {
  await saveDiagnostics("admin-player-drawer-v606-failure", {
    failure: error.stack || error.message || String(error),
  });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
