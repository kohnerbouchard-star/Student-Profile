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

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const writes = [];

page.on("pageerror", (error) => errors.push(error.stack || error.message));

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
      body: JSON.stringify({ error: { code: "route_not_found" } }),
    });
    return;
  }
  const body = pathname.endsWith("/session/bootstrap")
    ? {
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
      }
    : { data: common };
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
    body: JSON.stringify(body),
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
      player: {
        id: "00000000-0000-4000-8000-000000000003",
        displayName: "Attendance Smoke Player",
        rosterLabel: "ATT-001",
        status: "active",
      },
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
  await page.locator('[data-admin-terminal-action="scan-attendance"]').first().click();
  await page.waitForSelector(".admin-terminal-modal:visible", { timeout: 5000 });

  const replacedScanner = page.locator(".admin-terminal-modal:visible img.admin-terminal-scanner-video");
  if (await replacedScanner.count()) {
    throw new Error("Attendance scanner video was replaced with an image.");
  }
  const scannerVideo = page.locator(".admin-terminal-modal:visible video.admin-terminal-scanner-video").first();
  await scannerVideo.waitFor({ state: "visible", timeout: 5000 });
  const scannerSource = await scannerVideo.locator("source").getAttribute("src");
  if (!String(scannerSource || "").endsWith("/assets/videos/scanner-background.mp4")) {
    throw new Error(`Attendance scanner used ${scannerSource || "no source"} instead of scanner-background.mp4.`);
  }

  await page.locator('[data-admin-terminal-set-mode="manual"]').click();
  const panel = page.locator("[data-admin-terminal-manual-panel]");
  await panel.waitFor({ state: "visible", timeout: 5000 });
  await panel.locator("[data-admin-terminal-manual-scan-input]").fill("PLAYER-CODE-123");
  await panel.locator('[data-admin-terminal-action="submit-attendance-scan"]').click();
  await page.waitForFunction(() => {
    const state = document.querySelector("[data-admin-terminal-scanner-state]")?.textContent || "";
    return /confirmed|completed/i.test(state);
  }, null, { timeout: 10_000 });

  const browserResult = await page.evaluate(() => ({
    player: document.querySelector("[data-admin-terminal-last-scan-player]")?.textContent?.trim() || "",
    status: document.querySelector("[data-admin-terminal-last-scan-status]")?.textContent?.trim() || "",
    resultHidden: document.querySelector("[data-admin-terminal-last-scan-result]")?.hasAttribute("hidden") ?? true,
    emptyHidden: document.querySelector("[data-admin-terminal-last-scan-empty]")?.hasAttribute("hidden") ?? false,
    scannerState: document.querySelector("[data-admin-terminal-scanner-state]")?.textContent?.trim() || "",
  }));
  const result = { ...browserResult, scannerSource };

  writeFileSync(`${ARTIFACT_DIR}/attendance-action-runtime.json`, JSON.stringify({ result, writes, errors }, null, 2));
  await page.screenshot({ path: `${ARTIFACT_DIR}/attendance-action.png`, fullPage: true });
  writeFileSync(`${ARTIFACT_DIR}/attendance-action.html`, await page.content());

  if (errors.length) throw new Error(errors[0]);
  if (writes.filter((write) => write.service === "admin-api").length !== 1) {
    throw new Error(`Expected one admin attendance attempt: ${JSON.stringify(writes)}.`);
  }
  const classroomWrites = writes.filter((write) => write.service === "classroom-api");
  if (classroomWrites.length !== 1) {
    throw new Error(`Expected one classroom attendance retry: ${JSON.stringify(writes)}.`);
  }
  if (!classroomWrites[0].pathname.endsWith(`/games/${GAME_ID}/attendance/scan`)) {
    throw new Error(`Attendance retry used unexpected path ${classroomWrites[0].pathname}.`);
  }
  if (classroomWrites[0].body?.playerId !== "PLAYER-CODE-123") {
    throw new Error(`Attendance retry sent unexpected body ${JSON.stringify(classroomWrites[0].body)}.`);
  }
  if (result.resultHidden || !result.emptyHidden || !/confirmed|completed/i.test(result.scannerState)) {
    throw new Error(`Attendance result did not reach confirmed visible state: ${JSON.stringify(result)}.`);
  }
  if (!result.player || !result.status) {
    throw new Error(`Attendance result omitted player or status: ${JSON.stringify(result)}.`);
  }
  console.log("Admin attendance scanner submission and original video smoke passed.");
} catch (error) {
  try {
    writeFileSync(`${ARTIFACT_DIR}/attendance-action-error.json`, JSON.stringify({
      error: error.stack || error.message || String(error),
      writes,
      errors,
    }, null, 2));
    await page.screenshot({ path: `${ARTIFACT_DIR}/attendance-action-error.png`, fullPage: true });
    writeFileSync(`${ARTIFACT_DIR}/attendance-action-error.html`, await page.content());
  } catch (_) {}
  console.error(error.stack || error.message || String(error));
  console.error("ATTENDANCE_WRITES", JSON.stringify(writes, null, 2));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
