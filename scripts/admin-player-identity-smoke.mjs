import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE_URL = process.env.ADMIN_SMOKE_BASE_URL || "http://127.0.0.1:4173/admin/";
const ARTIFACT_DIR = process.env.ADMIN_SMOKE_ARTIFACT_DIR || "admin-browser-smoke-artifacts";
const GAME_ID = "00000000-0000-4000-8000-000000000201";
const ADMIN_ID = "00000000-0000-4000-8000-000000000202";
const PLAYER_UUID = "00000000-0000-4000-8000-000000000203";
const CREATE_IDENTIFIER = "RFID:CREATE-203";
const CREATE_ACCESS_CODE = "CREATE-8246";
const UPDATE_IDENTIFIER = "RFID:UPDATED-203";
const UPDATE_ACCESS_CODE = "UPDATED-9357";

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
  title: "RFID Identity Smoke Game",
  name: "RFID Identity Smoke Game",
  status: "active",
  gameCode: "RFID01",
};

const existingPlayer = {
  id: PLAYER_UUID,
  playerId: PLAYER_UUID,
  displayName: "Existing RFID Player",
  name: "Existing RFID Player",
  rosterLabel: "GRADE-10-01",
  playerIdentifier: "RFID:OLD-203",
  status: "active",
  countryCode: "NORTHREACH",
  countryName: "Northreach",
  cashBalance: 0,
  netWorth: 0,
  currencyCode: "NRC",
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
  players: [existingPlayer],
  roster: [existingPlayer],
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
const consoleMessages = [];
const writes = [];

page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack || error.message}`));
page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
page.on("requestfailed", (request) => {
  if (request.url().endsWith("/favicon.ico")) return;
  errors.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`);
});

await page.addInitScript(({ accessToken, gameId, adminId }) => {
  sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify({
    accessToken,
    refreshToken: "identity-smoke-refresh-token",
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

  if (request.method() === "POST" && pathname.endsWith(`/games/${GAME_ID}/players`)) {
    writes.push({ service: "admin-api", pathname, body: request.postDataJSON() });
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ error: { code: "compatibility_required", message: "Use classroom player route." } }),
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
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
      body: "",
    });
    return;
  }

  const body = request.method() === "POST" ? request.postDataJSON() : null;
  writes.push({ service: "classroom-api", pathname, body });

  if (request.method() === "POST" && pathname.endsWith(`/games/${GAME_ID}/players`)) {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify({
        ok: true,
        player: {
          id: "00000000-0000-4000-8000-000000000204",
          displayName: "Created RFID Player",
          rosterLabel: "GRADE-10-02",
          playerIdentifier: body.playerIdentifier,
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        accessCode: {
          studentCode: body.accessCode,
          status: "active",
          createdAt: new Date().toISOString(),
        },
      }),
    });
    return;
  }

  if (
    request.method() === "POST" &&
    pathname.endsWith(`/games/${GAME_ID}/players/${PLAYER_UUID}/access-code/reset`)
  ) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify({
        ok: true,
        player: {
          id: PLAYER_UUID,
          displayName: existingPlayer.displayName,
          rosterLabel: existingPlayer.rosterLabel,
          playerIdentifier: body.playerIdentifier,
          status: "active",
        },
        accessCode: {
          studentCode: body.accessCode,
          status: "active",
          createdAt: new Date().toISOString(),
        },
      }),
    });
    return;
  }

  await route.fulfill({
    status: 404,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ error: { code: "route_not_found", message: "Unexpected route." } }),
  });
});

async function closeCredentialDialog() {
  const dialog = page.locator("[data-admin-player-access-code-dialog]");
  await dialog.waitFor({ state: "visible", timeout: 8000 });
  await dialog.locator("button", { hasText: "Close" }).click();
  await dialog.waitFor({ state: "detached", timeout: 5000 });
}

try {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });

  await page.locator('[data-admin-terminal-action="add-player"]').first().click();
  await page.waitForSelector(".admin-terminal-modal:visible", { timeout: 5000 });

  const form = page.locator("[data-admin-terminal-player-form]");
  await form.locator('[name="playerIdentifier"]').waitFor({ state: "visible", timeout: 5000 });
  await form.locator('[name="displayName"]').fill("Created RFID Player");
  await form.locator('[name="rosterLabel"]').fill("GRADE-10-02");
  await form.locator('[name="playerIdentifier"]').fill(CREATE_IDENTIFIER);
  await form.locator('[name="accessCode"]').fill(CREATE_ACCESS_CODE);
  await form.locator('[name="status"]').selectOption("active");
  await form.locator('[name="startingLocation"]').selectOption("NORTHREACH");
  await form.locator('[data-admin-terminal-action="create-player"]').click();

  await page.waitForSelector("[data-admin-player-access-code-dialog]", { timeout: 8000 });
  const createdCredentials = await page.evaluate(() => ({
    playerIdentifier: document.querySelector("[data-admin-player-identifier-value]")?.textContent?.trim() || "",
    accessCode: document.querySelector("[data-admin-player-access-code-value]")?.textContent?.trim() || "",
  }));

  const classroomCreate = writes.find((write) =>
    write.service === "classroom-api" && write.pathname.endsWith(`/games/${GAME_ID}/players`)
  );
  if (!classroomCreate) throw new Error("Player create emitted no classroom-api fallback request.");
  if (
    classroomCreate.body?.playerIdentifier !== CREATE_IDENTIFIER ||
    classroomCreate.body?.accessCode !== CREATE_ACCESS_CODE ||
    "id" in classroomCreate.body ||
    "uuid" in classroomCreate.body
  ) {
    throw new Error(`Player create sent the wrong identity payload: ${JSON.stringify(classroomCreate.body)}.`);
  }
  if (
    createdCredentials.playerIdentifier !== CREATE_IDENTIFIER ||
    createdCredentials.accessCode !== CREATE_ACCESS_CODE
  ) {
    throw new Error(`Created credentials were not displayed correctly: ${JSON.stringify(createdCredentials)}.`);
  }

  await closeCredentialDialog();

  const managerButton = page.locator("[data-admin-player-identity-manager]");
  await managerButton.waitFor({ state: "visible", timeout: 5000 });
  await managerButton.click();
  const manager = page.locator("[data-admin-player-identity-manager-dialog]");
  await manager.waitFor({ state: "visible", timeout: 5000 });
  await manager.locator("select").selectOption(PLAYER_UUID);
  await manager.locator('[name="playerIdentifier"]').fill(UPDATE_IDENTIFIER);
  await manager.locator('[name="accessCode"]').fill(UPDATE_ACCESS_CODE);
  await manager.locator('button[type="submit"]').click();

  await page.waitForSelector("[data-admin-player-access-code-dialog]", { timeout: 8000 });
  const updatedCredentials = await page.evaluate(() => ({
    playerIdentifier: document.querySelector("[data-admin-player-identifier-value]")?.textContent?.trim() || "",
    accessCode: document.querySelector("[data-admin-player-access-code-value]")?.textContent?.trim() || "",
  }));

  const identityWrite = writes.find((write) =>
    write.service === "classroom-api" &&
    write.pathname.endsWith(`/games/${GAME_ID}/players/${PLAYER_UUID}/access-code/reset`)
  );
  if (!identityWrite) throw new Error("Existing-player identity update emitted no classroom-api request.");
  if (
    identityWrite.body?.playerIdentifier !== UPDATE_IDENTIFIER ||
    identityWrite.body?.accessCode !== UPDATE_ACCESS_CODE
  ) {
    throw new Error(`Identity update sent the wrong payload: ${JSON.stringify(identityWrite.body)}.`);
  }
  if (
    updatedCredentials.playerIdentifier !== UPDATE_IDENTIFIER ||
    updatedCredentials.accessCode !== UPDATE_ACCESS_CODE
  ) {
    throw new Error(`Updated credentials were not displayed correctly: ${JSON.stringify(updatedCredentials)}.`);
  }

  if (errors.length) throw new Error(errors[0]);

  writeFileSync(`${ARTIFACT_DIR}/admin-player-identity-runtime.json`, JSON.stringify({
    writes,
    createdCredentials,
    updatedCredentials,
    errors,
    consoleMessages,
  }, null, 2));
  await page.screenshot({ path: `${ARTIFACT_DIR}/admin-player-identity.png`, fullPage: true });
  console.log("Admin RFID Player ID and Access Code create/update smoke passed.");
} catch (error) {
  writeFileSync(`${ARTIFACT_DIR}/admin-player-identity-runtime.json`, JSON.stringify({
    writes,
    errors,
    consoleMessages,
  }, null, 2));
  await page.screenshot({ path: `${ARTIFACT_DIR}/admin-player-identity-failure.png`, fullPage: true });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
