import {
  BASE_URL,
  createQualityHarness,
  GAME_ID,
} from "./admin-quality-smoke-fixture.mjs";

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

const game = Object.freeze({
  id: GAME_ID,
  gameSessionId: GAME_ID,
  title: "Quality Game",
  name: "Quality Game",
  status: "active",
  gameCode: "QUALITY1",
});

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

function bootstrapPayload() {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return {
    data: {
      admin: {
        id: "00000000-0000-4000-8000-000000000002",
        accountId: "00000000-0000-4000-8000-000000000002",
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
        id: "00000000-0000-4000-8000-000000000002",
        csrfToken: "",
        assuranceLevel: "aal2",
        expiresAt,
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

function defaultModel(overrides = {}) {
  return {
    gameId: GAME_ID,
    gameSessionId: GAME_ID,
    activeGameId: GAME_ID,
    selectedGameSessionId: GAME_ID,
    permissions: [...PERMISSIONS],
    roles: ["game_admin"],
    adminRole: "game_admin",
    game,
    activeGame: game,
    games: [game],
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
    ...overrides,
  };
}

function parseBody(request) {
  const raw = request.postData() || "";
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function validateRequest(request, errors) {
  const headers = request.headers();
  if (headers.authorization !== undefined) {
    errors.push(`${request.method()} ${request.url()} exposed Staff Authorization`);
  }
  if (!headers.apikey) {
    errors.push(`${request.method()} ${request.url()} omitted publishable application identity`);
  }
  if (headers["x-econovaria-game-id"] !== GAME_ID) {
    errors.push(`${request.method()} ${request.url()} omitted canonical game scope`);
  }
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
    headers["x-econovaria-csrf-token"] !== CSRF_TOKEN
  ) {
    errors.push(`${request.method()} ${request.url()} omitted cookie-bound CSRF`);
  }
}

export async function createSpecializedQualityHarness(
  name,
  { model: modelOverrides = {}, handleProxy } = {},
) {
  const harness = await createQualityHarness(name);
  const { page, writes, errors } = harness;
  const model = defaultModel(modelOverrides);
  const pattern = "**/functions/v1/web-session-api/proxy/**";
  await page.unroute(pattern);
  await page.route(pattern, async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders(), body: "" });
      return;
    }

    validateRequest(request, errors);
    const pathname = new URL(request.url()).pathname;
    const marker = "/functions/v1/web-session-api/proxy";
    const path = pathname.startsWith(marker)
      ? pathname.slice(marker.length) || "/"
      : pathname;
    const parsedBody = parseBody(request);
    if (!["GET", "HEAD"].includes(method)) {
      writes.push({
        service: "admin-bff",
        method,
        path,
        body: request.postData() || "",
        parsedBody,
        headers: request.headers(),
      });
    }

    const custom = typeof handleProxy === "function"
      ? await handleProxy({
        request,
        method,
        path,
        parsedBody,
        model,
        writes,
        errors,
      })
      : null;
    if (custom) {
      await route.fulfill({
        status: custom.status ?? 200,
        contentType: custom.contentType || "application/json",
        headers: { ...corsHeaders(), ...(custom.headers || {}) },
        body: typeof custom.body === "string"
          ? custom.body
          : JSON.stringify(custom.body ?? {}),
      });
      return;
    }

    const body = path.endsWith("/session/bootstrap")
      ? bootstrapPayload()
      : ["GET", "HEAD"].includes(method)
        ? { data: model }
        : { data: { ok: true, created: true, saved: true } };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders(),
      body: JSON.stringify(body),
    });
  });

  return { ...harness, model };
}

export { BASE_URL, GAME_ID };
