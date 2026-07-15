import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

export const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
export const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64")
  .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const now = Math.floor(Date.now() / 1000);
const token = `${b64({ alg: "none", typ: "JWT" })}.${b64({
  sub: ADMIN_ID,
  email: "admin@example.test",
  role: "authenticated",
  iat: now,
  exp: now + 3600,
})}.signature`;

const game = {
  id: GAME_ID,
  gameSessionId: GAME_ID,
  title: "Quality Game",
  name: "Quality Game",
  status: "active",
  gameCode: "QUALITY1",
};

const common = {
  gameId: GAME_ID,
  gameSessionId: GAME_ID,
  activeGameId: GAME_ID,
  selectedGameSessionId: GAME_ID,
  permissions: ["*"], roles: ["game_admin"], adminRole: "game_admin",
  game, activeGame: game,
  players: [], roster: [],
  attendance: [], attendanceRows: [], attendanceHistory: [], attendanceLedger: [],
  attendanceSummary: {
    presentCount: 0, lateCount: 0, absentCount: 0, activePlayerCount: 0,
    totalPlayers: 0, presentRate: 0, rewardsIssuedCount: 0, rewardsIssuedTotal: 0,
  },
  attendanceCounts: { present: 0, late: 0, absent: 0, total: 0 },
  contracts: [], assignments: [], contractSubmissions: [], submissions: [],
  store: [], storeItems: [], items: [],
  assets: [], trades: [], events: [], market: { assets: [], trades: [], events: [] },
  settings: {
    difficultyPreset: "moderate", backendDifficultyPreset: "moderate",
    difficultyBasePreset: "moderate", priceMultiplier: 1, incomeMultiplier: 1,
    shockFrequency: 1, shockSeverity: 1, recoverySupport: 1,
    tradeMultiplier: 1, configSaveState: "saved",
  },
  logs: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1, hasNextPage: false },
  dashboard: {
    activePlayerCount: 0, totalPlayers: 0, onlinePlayerCount: 0,
    attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 },
    leaderboard: [], recentActivity: [], marketStatus: "open",
  },
  leaderboard: [], recentActivity: [],
};

function bootstrap() {
  return {
    data: {
      admin: {
        id: ADMIN_ID, accountId: ADMIN_ID, displayName: "Quality Administrator",
        email: "admin@example.test", role: "game_admin", roles: ["game_admin"],
      },
      activeGame: game, games: [game], permissions: ["*"], roles: ["game_admin"],
      adminRole: "game_admin", csrfToken: "",
      session: { id: ADMIN_ID, csrfToken: "", expiresAt: new Date(Date.now() + 3600000).toISOString() },
      capabilities: {
        notifications: false, securityHistory: "current_session_only", helpArticles: true,
        auditLogFlags: true, auditLogExport: true, overallScore: false, marketplaceAdminTrading: false,
      },
    },
  };
}

export async function createQualityHarness(name) {
  const dir = process.env.ADMIN_SMOKE_ARTIFACT_DIR || `admin-browser-smoke-artifacts/${name}`;
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const writes = [];
  const errors = [];
  const state = { failContract: false, failScan: false, delayReads: true, writeDelay: 420 };

  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "";
    if (request.url().endsWith("/favicon.ico")) return;
    if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(request.url()) && failure.includes("ERR_ABORTED")) return;
    errors.push(`${request.method()} ${request.url()} ${failure}`);
  });

  await page.addInitScript(({ accessToken, gameId, adminId }) => {
    sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
      accessToken, refreshToken: "refresh", user: { id: adminId, email: "admin@example.test" },
    }));
    sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
  }, { accessToken: token, gameId: GAME_ID, adminId: ADMIN_ID });

  await page.route("**/functions/v1/admin-api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;
    if (method === "OPTIONS") {
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
    if (["GET", "HEAD"].includes(method) && state.delayReads && !path.endsWith("/session/bootstrap")) {
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
    if (!["GET", "HEAD"].includes(method)) {
      writes.push({ service: "admin-api", method, path, body: request.postData() || "" });
      await new Promise((resolve) => setTimeout(resolve, state.writeDelay));
      if (/\/contracts$/.test(path) && state.failContract) {
        await route.fulfill({
          status: 422, contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({ message: "Contract could not be posted." }),
        });
        return;
      }
      if (/\/attendance\/(?:scan|scans)$/.test(path)) {
        await route.fulfill({
          status: 404, contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({ error: { code: "route_not_found" } }),
        });
        return;
      }
    }
    const body = path.endsWith("/session/bootstrap")
      ? bootstrap()
      : ["GET", "HEAD"].includes(method)
        ? { data: common }
        : { data: { ok: true, created: true, saved: true } };
    await route.fulfill({
      status: 200, contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify(body),
    });
  });

  await page.route("**/functions/v1/classroom-api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;
    if (method === "OPTIONS") {
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
    writes.push({ service: "classroom-api", method, path, body: request.postData() || "" });
    await new Promise((resolve) => setTimeout(resolve, state.writeDelay));
    if (state.failScan) {
      await route.fulfill({
        status: 404, contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ message: "Player code was not found." }),
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify({
        ok: true,
        player: {
          id: "00000000-0000-4000-8000-000000000003",
          displayName: "Quality Player",
          playerIdentifier: "QUALITY-01",
          rosterLabel: "Quality roster label",
          status: "active",
        },
        attendance: {
          status: "present",
          attendanceDate: "2026-07-16",
          clockedInAt: "2026-07-15T23:42:00.000Z",
          wasCreated: true,
          timezone: "Asia/Seoul",
        },
        reward: {
          amount: 1,
          currencyCode: "ECO",
          ledgerEntryId: "00000000-0000-4000-8000-000000000005",
        },
      }),
    });
  });

  async function capture(label) {
    await page.screenshot({ path: `${dir}/${label}.png`, fullPage: true });
    writeFileSync(`${dir}/${label}.html`, await page.content());
  }

  async function finish(result = {}) {
    writeFileSync(`${dir}/runtime.json`, JSON.stringify({ ...result, writes, errors }, null, 2));
    await context.close();
    await browser.close();
  }

  return { page, browser, context, state, writes, errors, dir, capture, finish };
}
