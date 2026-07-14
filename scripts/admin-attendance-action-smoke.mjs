import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts";
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_ID = "00000000-0000-4000-8000-000000000003";
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

function bootstrapResponse() {
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

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const consoleMessages = [];
const writes = [];

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
  const pathname = new URL(request.url()).pathname;
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
  if (request.method() === "POST" && pathname.endsWith(`/games/${GAME_ID}/attendance/scans`)) {
    writes.push({ service: "admin-api", pathname, body: request.postDataJSON() });
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ error: { code: "route_not_found", message: "Use classroom route." } }),
    });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify(pathname.endsWith("/session/bootstrap") ? bootstrapResponse() : { data: common }),
  });
});

await page.route("**/functions/v1/classroom-api/**", async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  if (request.method() === "OPTIONS") {
    await route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id",
        "access-control-allow-methods": "POST,OPTIONS",
      },
      body: "",
    });
    return;
  }
  writes.push({ service: "classroom-api", pathname, body: request.postDataJSON() });
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify({
      ok: true,
      gameSession: { id: GAME_ID, name: game.name, status: "active" },
      player: { id: PLAYER_ID, displayName: "Attendance Smoke Player", rosterLabel: "ATT-001", status: "active" },
      attendance: {
        id: "00000000-0000-4000-8000-000000000004",
        status: "present",
        attendanceDate: "2026-07-14",
        clockedInAt: new Date().toISOString(),
        wasCreated: true,
        timezone: "Asia/Seoul",
      },
      reward: { amount: 1, currencyCode: "XAL", ledgerEntryId: null },
    }),
  });
});

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });
  await page.locator('[data-admin-terminal-action="scan-attendance"]').first().click({ timeout: 5000 });
  await page.waitForSelector('.admin-terminal-modal:visible', { timeout: 5000 });
  await page.locator('[data-admin-terminal-set-mode="manual"]').click({ timeout: 5000 });
  const manualPanel = page.locator('[data-admin-terminal-manual-panel]');
  await manualPanel.waitFor({ state: "visible", timeout: 5000 });
  await manualPanel.locator('[data-admin-terminal-manual-scan-input]').fill("PLAYER-CODE-123");
  await manualPanel.locator('[data-admin-terminal-action="submit-attendance-scan"]').click({ timeout: 5000 });
  await page.waitForTimeout(800);

  const result = await page.evaluate(() => ({
    player: document.querySelector('[data-admin-terminal-last-scan-player]')?.textContent?.trim() || "",
    status: document.querySelector('[data-admin-terminal-last-scan-status]')?.textContent?.trim() || "",
    resultHidden: document.querySelector('[data-admin-terminal-last-scan-result]')?.hasAttribute("hidden") ?? true,
    emptyHidden: document.querySelector('[data-admin-terminal-last-scan-empty]')?.hasAttribute("hidden") ?? false,
    scannerState: document.querySelector('[data-admin-terminal-scanner-state]')?.textContent?.trim() || "",
  }));

  writeFileSync(`${ARTIFACT_DIR}/attendance-action-runtime.json`, JSON.stringify({ result, writes, errors, consoleMessages }, null, 2));
  await page.screenshot({ path: `${ARTIFACT_DIR}/attendance-action.png`, fullPage: true });
  writeFileSync(`${ARTIFACT_DIR}/attendance-action.html`, await page.content());

  if (errors.length) throw new Error(errors[0]);
  if (!writes.some((write) => write.service === "admin-api")) {
    throw new Error("Attendance submit emitted no primary admin-api request.");
  }
  const classroomWrite = writes.find((write) => write.service === "classroom-api");
  if (!classroomWrite) throw new Error("Attendance submit emitted no classroom-api fallback request.");
  if (!classroomWrite.pathname.endsWith(`/games/${GAME_ID}/attendance/scan`)) {
    throw new Error(`Attendance fallback used unexpected path ${classroomWrite.pathname}.`);
  }
  if (classroomWrite.body?.playerId !== "PLAYER-CODE-123") {
    throw new Error(`Attendance fallback sent unexpected body ${JSON.stringify(classroomWrite.body)}.`);
  }
  if (result.resultHidden || result.player !== "Attendance Smoke Player") {
    throw new Error(`Attendance success did not update the scanner result: ${JSON.stringify(result)}.`);
  }
  console.log("Admin attendance scanner submission smoke passed.");
} catch (error) {
  console.error(error.stack || error.message || String(error));
  console.error("ATTENDANCE_WRITES", JSON.stringify(writes, null, 2));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
