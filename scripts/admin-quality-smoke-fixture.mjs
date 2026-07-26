import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

export const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL ||
  "http://127.0.0.1:4173/admin/";
export const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
const CSRF_TOKEN = "C".repeat(43);
const BROWSER_ORIGIN = "http://127.0.0.1:4173";
const PERMISSIONS = Object.freeze([
  "account.read",
  "audit.read",
  "attendance.manage",
  "business.manage",
  "contracts.manage",
  "economy.adjust",
  "game.create",
  "game.read",
  "game.switch",
  "game.update",
  "inventory.redeem",
  "market.manage",
  "marketplace.moderate",
  "messaging.moderate",
  "players.manage",
  "progression.review",
  "settings.manage",
  "store.manage",
  "world.manage",
]);

const game = {
  id: GAME_ID,
  gameSessionId: GAME_ID,
  title: "Quality Game",
  name: "Quality Game",
  status: "active",
  gameCode: "QUALITY1",
};
const user = {
  id: ADMIN_ID,
  email: "admin@example.test",
  displayName: "Quality Administrator",
  role: "game_admin",
  permissionVersion: 1,
  securityVersion: 1,
};

const common = {
  gameId: GAME_ID,
  gameSessionId: GAME_ID,
  activeGameId: GAME_ID,
  selectedGameSessionId: GAME_ID,
  permissions: [...PERMISSIONS],
  roles: ["game_admin"],
  adminRole: "game_admin",
  game,
  activeGame: game,
  players: [],
  roster: [],
  attendance: [],
  attendanceRows: [],
  attendanceHistory: [],
  attendanceLedger: [],
  attendanceSummary: {
    presentCount: 0,
    lateCount: 0,
    absentCount: 0,
    activePlayerCount: 0,
    totalPlayers: 0,
    presentRate: 0,
    rewardsIssuedCount: 0,
    rewardsIssuedTotal: 0,
  },
  attendanceCounts: { present: 0, late: 0, absent: 0, total: 0 },
  contracts: [],
  assignments: [],
  contractSubmissions: [],
  submissions: [],
  store: [],
  storeItems: [],
  items: [],
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
  pagination: {
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
  },
  dashboard: {
    activePlayerCount: 0,
    totalPlayers: 0,
    onlinePlayerCount: 0,
    attendanceSummary: { presentCount: 0, lateCount: 0, absentCount: 0 },
    leaderboard: [],
    recentActivity: [],
    marketStatus: "open",
  },
  leaderboard: [],
  recentActivity: [],
};

function sessionTimes() {
  return {
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    absoluteExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  };
}

function safeSession() {
  const times = sessionTimes();
  return {
    authenticated: true,
    ...times,
    assuranceLevel: "aal2",
    mfaRequired: true,
    user,
    csrfToken: CSRF_TOKEN,
    activeGameSessions: [game],
    permissions: [...PERMISSIONS],
    roles: ["game_admin"],
    adminRole: "game_admin",
    storedAt: new Date().toISOString(),
  };
}

function legacySessionBridge(session) {
  const staffSession = {
    staffId: session.user.id,
    staffEmail: session.user.email,
    staffDisplayName: session.user.displayName,
    staffRole: "game_admin",
    roles: ["game_admin"],
    permissions: [...PERMISSIONS],
    activeGameSessions: [game],
    selectedGameSessionId: GAME_ID,
  };
  return {
    currentSession: {
      role: "ADMIN",
      authSource: "http-only-bff",
      permissions: [...PERMISSIONS],
      roles: ["game_admin"],
      adminRole: "game_admin",
      user: session.user,
      assuranceLevel: session.assuranceLevel,
      mfaRequired: true,
      staffSession,
    },
    staffSession,
  };
}

function statusPayload() {
  const times = sessionTimes();
  return {
    ok: true,
    session: {
      authenticated: true,
      ...times,
      assuranceLevel: "aal2",
      mfaRequired: true,
    },
    user,
    activeGameSessions: [game],
    csrfToken: CSRF_TOKEN,
  };
}

function bootstrap() {
  const times = sessionTimes();
  return {
    data: {
      admin: {
        id: ADMIN_ID,
        accountId: ADMIN_ID,
        displayName: "Quality Administrator",
        email: "admin@example.test",
        role: "game_admin",
        roles: ["game_admin"],
      },
      activeGame: game,
      games: [game],
      permissions: [...PERMISSIONS],
      roles: ["game_admin"],
      adminRole: "game_admin",
      csrfToken: "",
      session: {
        id: ADMIN_ID,
        csrfToken: "",
        assuranceLevel: "aal2",
        expiresAt: times.expiresAt,
      },
      capabilities: {
        notifications: false,
        securityHistory: "current_session_only",
        helpArticles: true,
        auditLogFlags: true,
        auditLogExport: true,
        overallScore: false,
        marketplaceAdminTrading: false,
        multiFactorAuthentication: true,
      },
    },
  };
}

function corsHeaders() {
  return {
    "access-control-allow-origin": BROWSER_ORIGIN,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers":
      "apikey,content-type,x-econovaria-csrf-token,x-econovaria-device-id,x-econovaria-game-id,x-idempotency-key,x-request-id",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
    "cache-control": "private, no-store",
  };
}

function assertBffRequest(request, errors) {
  const headers = request.headers();
  if (headers.authorization !== undefined) {
    errors.push(`${request.method()} ${request.url()} exposed Staff Authorization`);
  }
  if (!headers.apikey) {
    errors.push(`${request.method()} ${request.url()} omitted publishable application identity`);
  }
  if (headers["x-econovaria-game-id"] !== GAME_ID) {
    errors.push(`${request.method()} ${request.url()} omitted game scope`);
  }
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
    headers["x-econovaria-csrf-token"] !== CSRF_TOKEN
  ) {
    errors.push(`${request.method()} ${request.url()} omitted cookie-bound CSRF`);
  }
}

function attendanceSuccess() {
  return {
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
  };
}

export async function createQualityHarness(name) {
  const dir = process.env.ADMIN_SMOKE_ARTIFACT_DIR ||
    `admin-browser-smoke-artifacts/${name}`;
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const writes = [];
  const errors = [];
  const state = {
    failContract: false,
    failScan: false,
    delayReads: true,
    writeDelay: 420,
  };

  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "";
    if (request.url().endsWith("/favicon.ico")) return;
    if (
      /\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(request.url()) &&
      failure.includes("ERR_ABORTED")
    ) return;
    if (
      /\/admin\/assets\/icons\/media-placeholder\.svg$/i.test(request.url()) &&
      failure.includes("ERR_ABORTED")
    ) return;
    errors.push(`${request.method()} ${request.url()} ${failure}`);
  });

  const session = safeSession();
  const bridge = legacySessionBridge(session);
  await page.addInitScript(({ sessionValue, gameId, bridgeValue }) => {
    sessionStorage.setItem(
      "econovaria.admin.auth.v1",
      JSON.stringify(sessionValue),
    );
    sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
    window.currentSession = bridgeValue.currentSession;
    window.state = window.state || {};
    window.state.staffSession = bridgeValue.staffSession;
  }, {
    sessionValue: session,
    gameId: GAME_ID,
    bridgeValue: bridge,
  });

  await page.route("**/functions/v1/web-session-api/status", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(), body: "" });
      return;
    }
    if (request.headers().authorization !== undefined) {
      errors.push("Admin status request exposed Staff Authorization");
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(),
      body: JSON.stringify(statusPayload()),
    });
  });

  await page.route("**/functions/v1/web-session-api/proxy/**", async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(), body: "" });
      return;
    }

    assertBffRequest(request, errors);
    const pathname = new URL(request.url()).pathname;
    const marker = "/functions/v1/web-session-api/proxy";
    const path = pathname.startsWith(marker)
      ? pathname.slice(marker.length) || "/"
      : pathname;

    if (["GET", "HEAD"].includes(method) && state.delayReads && !path.endsWith("/session/bootstrap")) {
      await new Promise((resolve) => setTimeout(resolve, 450));
    }

    if (!["GET", "HEAD"].includes(method)) {
      writes.push({
        service: "admin-bff",
        method,
        path,
        body: request.postData() || "",
      });
      await new Promise((resolve) => setTimeout(resolve, state.writeDelay));

      if (/\/contracts$/.test(path) && state.failContract) {
        await route.fulfill({
          status: 422,
          contentType: "application/json",
          headers: corsHeaders(),
          body: JSON.stringify({ message: "Contract could not be posted." }),
        });
        return;
      }
      if (/\/attendance\/(?:scan|scans)$/.test(path)) {
        await route.fulfill({
          status: state.failScan ? 404 : 200,
          contentType: "application/json",
          headers: corsHeaders(),
          body: JSON.stringify(
            state.failScan
              ? { message: "Player code was not found." }
              : attendanceSuccess(),
          ),
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
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(),
      body: JSON.stringify(body),
    });
  });

  for (const prohibited of [
    "**/functions/v1/admin-api/**",
    "**/functions/v1/classroom-api/**",
  ]) {
    await page.route(prohibited, async (route) => {
      errors.push(`Prohibited browser authority reached: ${route.request().url()}`);
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Prohibited browser authority" }),
      });
    });
  }

  async function capture(label) {
    await page.screenshot({ path: `${dir}/${label}.png`, fullPage: true });
    writeFileSync(`${dir}/${label}.html`, await page.content());
  }

  async function finish(result = {}) {
    writeFileSync(
      `${dir}/runtime.json`,
      JSON.stringify({ ...result, writes, errors }, null, 2),
    );
    await context.close();
    await browser.close();
  }

  return { page, browser, context, state, writes, errors, dir, capture, finish };
}
