import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR ||
  "admin-browser-smoke-artifacts/player-scope";
const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
const REQUEST_ID = "00000000-0000-4000-8000-000000000003";
mkdirSync(ARTIFACT_DIR, { recursive: true });

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
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
  title: "Player Scope Smoke Game",
  name: "Player Scope Smoke Game",
  status: "active",
  gameCode: "SCOPE1",
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

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  summary: {
    connected: 6,
    readOnly: 2,
    planned: 6,
    missingAdminSurfaces: 5,
  },
  domains: [
    {
      key: "inventory",
      label: "Inventory and redemptions",
      status: "read_only",
      summary: "Inventory reads are connected and redemption review is being activated.",
      playerReads: ["inventory"],
      playerWrites: ["inventoryUse"],
      missingPlayerWrites: [],
      adminSurface: "available",
      adminSummary: "Redemption review and fulfillment controls are available.",
      implementationPhase: 1,
    },
    {
      key: "marketplace",
      label: "Player marketplace",
      status: "planned",
      summary: "Listings and settlement remain planned.",
      playerReads: [],
      playerWrites: [],
      missingPlayerWrites: ["marketplaceListing"],
      adminSurface: "partial",
      adminSummary: "Moderation and settlement controls remain to be built.",
      implementationPhase: 2,
    },
  ],
};

let redemptionStatus = "pending";
const patchBodies = [];

function queuePayload() {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    requests: [{
      id: REQUEST_ID,
      gameSessionId: GAME_ID,
      playerId: "00000000-0000-4000-8000-000000000010",
      inventoryHoldingId: "00000000-0000-4000-8000-000000000011",
      storeItemId: "00000000-0000-4000-8000-000000000012",
      quantity: 1,
      status: redemptionStatus,
      requestNote: "Use for the workshop activity.",
      resolutionNote: null,
      requestedAt: new Date().toISOString(),
      reviewedAt: redemptionStatus === "pending" ? null : new Date().toISOString(),
      fulfilledAt: redemptionStatus === "fulfilled" ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      player: {
        id: "00000000-0000-4000-8000-000000000010",
        displayName: "Avery Smoke",
        rosterLabel: "SMOKE-1",
      },
      item: {
        id: "00000000-0000-4000-8000-000000000012",
        name: "Repair Kit",
        category: "Consumables",
      },
    }],
    summary: {
      total: 1,
      pending: redemptionStatus === "pending" ? 1 : 0,
      approved: redemptionStatus === "approved" ? 1 : 0,
      fulfilled: redemptionStatus === "fulfilled" ? 1 : 0,
      rejected: redemptionStatus === "rejected" ? 1 : 0,
    },
  };
}

function bootstrapPayload() {
  return {
    data: {
      admin: {
        id: ADMIN_ID,
        accountId: ADMIN_ID,
        displayName: "Scope Smoke Administrator",
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
        playerScopeReadiness: true,
      },
    },
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];

page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("requestfailed", (request) => {
  const url = request.url();
  const failure = request.failure()?.errorText || "";
  if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(url) && failure.includes("ERR_ABORTED")) return;
  errors.push(`requestfailed: ${request.method()} ${url} ${failure}`);
});

await page.addInitScript(({ accessToken, gameId, adminId }) => {
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
    accessToken,
    refreshToken: "scope-smoke-refresh-token",
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
        "access-control-allow-headers": "authorization, apikey, content-type, x-econovaria-game-id, x-econovaria-csrf",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      },
      body: "",
    });
    return;
  }

  const pathname = new URL(request.url()).pathname;
  let payload;
  if (pathname.endsWith("/session/bootstrap")) {
    payload = bootstrapPayload();
  } else if (pathname.endsWith(`/games/${GAME_ID}/player-capabilities`)) {
    payload = { data: { game, playerCapabilities: manifest } };
  } else if (pathname.endsWith(`/games/${GAME_ID}/inventory/redemptions/${REQUEST_ID}`)) {
    const body = JSON.parse(request.postData() || "{}");
    patchBodies.push(body);
    if (body.action === "approve") redemptionStatus = "approved";
    if (body.action === "fulfill") redemptionStatus = "fulfilled";
    if (body.action === "reject") redemptionStatus = "rejected";
    payload = {
      ok: true,
      outcome: redemptionStatus,
      redemption: queuePayload().requests[0],
    };
  } else if (pathname.endsWith(`/games/${GAME_ID}/inventory/redemptions`)) {
    payload = queuePayload();
  } else {
    payload = { data: common };
  }

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
    body: JSON.stringify(payload),
  });
});

try {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.locator("#econovariaPlayerScopeLauncher").waitFor({ state: "visible" });
  await page.locator("#econovariaPlayerScopeLauncher").click();
  await page.locator("#econovariaPlayerScopeDialog").waitFor({ state: "visible" });
  await page.getByRole("heading", { name: "Capability readiness" }).waitFor();
  await page.getByText("Player marketplace", { exact: true }).waitFor();
  await page.getByText("PLANNED", { exact: true }).waitFor();
  await page.getByText("Repair Kit", { exact: true }).waitFor();

  const noteInput = page.locator(".econovaria-player-scope-note input");
  await noteInput.fill("Verified for workshop use");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("button", { name: "Fulfill", exact: true }).waitFor();

  requireCondition(patchBodies.length === 1, "Approval did not produce exactly one PATCH request.");
  requireCondition(patchBodies[0].action === "approve", "Approval PATCH action was not preserved.");
  requireCondition(
    patchBodies[0].resolutionNote === "Verified for workshop use",
    "Approval resolution note was not preserved.",
  );

  await page.getByRole("button", { name: "Fulfill", exact: true }).click();
  await page.getByText("FULFILLED", { exact: true }).waitFor();
  requireCondition(patchBodies.length === 2, "Fulfillment did not produce exactly one additional PATCH request.");
  requireCondition(patchBodies[1].action === "fulfill", "Fulfillment PATCH action was not preserved.");

  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  requireCondition(
    overflow.documentWidth <= overflow.viewportWidth + 2,
    `Player Scope overflowed horizontally: ${overflow.documentWidth}/${overflow.viewportWidth}.`,
  );

  await page.screenshot({
    path: `${ARTIFACT_DIR}/player-scope-redemption-fulfilled.png`,
    fullPage: true,
  });
  writeFileSync(
    `${ARTIFACT_DIR}/player-scope-redemption-fulfilled.html`,
    await page.content(),
  );

  requireCondition(errors.length === 0, `Player Scope browser errors:\n${errors.join("\n")}`);
  console.log("Player Scope readiness and redemption browser workflow passed.");
} finally {
  await browser.close();
}
