import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts";
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
mkdirSync(ARTIFACT_DIR, { recursive: true });

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
  title: "Browser Smoke Game",
  name: "Browser Smoke Game",
  status: "active",
  gameCode: "SMOKE1",
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
  settings: {},
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

function responseFor(pathname) {
  if (pathname.endsWith("/session/bootstrap")) {
    return {
      data: {
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
        capabilities: {},
      },
    };
  }
  return { data: common };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const consoleMessages = [];

page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));

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
  if (request.method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id, x-econovaria-csrf, x-csrf-token",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      },
      body: "",
    });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify(responseFor(new URL(request.url()).pathname)),
  });
});

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.waitForSelector('[data-admin-terminal-action="scan-attendance"]', { timeout: 15_000 });
  const control = page.locator('[data-admin-terminal-action="scan-attendance"]').first();
  await control.click({ timeout: 5000 });
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => ({
    visibleModalCount: [...document.querySelectorAll(".admin-terminal-modal")]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }).length,
    attendanceSectionActive: Boolean(document.querySelector('[data-admin-section="Attendance"][aria-current="page"]')),
    focusedText: document.activeElement?.textContent?.trim() || "",
    bodyText: document.body.innerText.slice(0, 4000),
  }));

  writeFileSync(`${ARTIFACT_DIR}/attendance-action-runtime.json`, JSON.stringify({ result, errors, consoleMessages }, null, 2));
  await page.screenshot({ path: `${ARTIFACT_DIR}/attendance-action.png`, fullPage: true });
  writeFileSync(`${ARTIFACT_DIR}/attendance-action.html`, await page.content());

  if (errors.length) throw new Error(errors[0]);
  if (result.visibleModalCount === 0 && !result.attendanceSectionActive) {
    throw new Error("Scan Attendance click produced no modal and did not open the Attendance section.");
  }
  console.log("Admin attendance action smoke passed.");
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
