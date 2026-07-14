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
const ID_ONLY_IDENTIFIER = "RFID:UPDATED-204";

mkdirSync(ARTIFACT_DIR, { recursive: true });

function base64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function flattenedBody(value) {
  const body = value && typeof value === "object" ? value : {};
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  return { ...body, ...payload };
}

function assert(condition, message) {
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
let phase = "initializing";

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

  const body = request.method() === "POST" ? request.postDataJSON() : null;
  const payload = flattenedBody(body);
  const write = {
    service: "admin-api",
    pathname,
    method: request.method(),
    headers: request.headers(),
    body,
    payload,
  };

  if (request.method() === "POST" && pathname.endsWith(`/games/${GAME_ID}/players`)) {
    writes.push(write);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify({
        ok: true,
        player: {
          id: "00000000-0000-4000-8000-000000000204",
          displayName: payload.displayName,
          rosterLabel: payload.rosterLabel,
          playerIdentifier: payload.playerIdentifier,
          status: "active",
        },
        accessCode: {
          studentCode: payload.accessCode,
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
    writes.push(write);
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
          playerIdentifier: payload.playerIdentifier,
          status: "active",
        },
        accessCode: payload.accessCode
          ? {
              studentCode: payload.accessCode,
              status: "active",
              createdAt: new Date().toISOString(),
            }
          : {
              studentCode: null,
              status: "unchanged",
              createdAt: null,
            },
      }),
    });
    return;
  }

  if (request.method() === "GET" && pathname.endsWith(`/games/${GAME_ID}/players`)) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify({ data: { ...common, players: [existingPlayer], roster: [existingPlayer] } }),
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
  writes.push({
    service: "classroom-api",
    pathname,
    method: request.method(),
    headers: request.headers(),
    body: request.method() === "POST" ? request.postDataJSON() : null,
  });
  await route.fulfill({
    status: 404,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({
      error: {
        code: "unexpected_direct_route",
        message: "Existing-player identity settings must use admin-api.",
      },
    }),
  });
});

async function closeCredentialDialog() {
  const dialog = page.locator("[data-admin-player-access-code-dialog]");
  await dialog.waitFor({ state: "visible", timeout: 8000 });
  await dialog.locator("button", { hasText: "Close" }).click();
  await dialog.waitFor({ state: "detached", timeout: 5000 });
}

async function saveDiagnostics(name, extra = {}) {
  writeFileSync(`${ARTIFACT_DIR}/${name}.json`, JSON.stringify({
    phase,
    writes,
    errors,
    consoleMessages,
    ...extra,
  }, null, 2));
  writeFileSync(`${ARTIFACT_DIR}/${name}.html`, await page.content());
  await page.screenshot({ path: `${ARTIFACT_DIR}/${name}.png`, fullPage: true });
}

try {
  phase = "opening admin shell";
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector("#adminPreview:not([hidden])", { timeout: 15_000 });

  phase = "rejecting overview identity manager";
  assert(
    await page.locator("[data-admin-player-identity-manager]").count() === 0,
    "Overview still renders the forbidden standalone Player IDs action.",
  );
  assert(
    await page.locator("[data-admin-player-identity-manager-dialog]").count() === 0,
    "Standalone Player IDs manager dialog still exists.",
  );

  phase = "opening Add Player";
  await page.locator('[data-admin-terminal-action="add-player"]').first().click();
  await page.waitForSelector(".admin-terminal-modal:visible", { timeout: 5000 });
  const createForm = page.locator("[data-admin-terminal-player-form]").filter({ visible: true }).first();
  await createForm.locator('[name="playerIdentifier"]').waitFor({ state: "visible", timeout: 5000 });

  phase = "submitting identity-aware player creation";
  await createForm.locator('[name="displayName"]').fill("Created RFID Player");
  await createForm.locator('[name="rosterLabel"]').fill("GRADE-10-02");
  await createForm.locator('[name="playerIdentifier"]').fill(CREATE_IDENTIFIER);
  await createForm.locator('[name="accessCode"]').fill(CREATE_ACCESS_CODE);
  await createForm.locator('[name="status"]').selectOption("active");
  await createForm.locator('[name="startingLocation"]').selectOption("NORTHREACH");
  await createForm.locator('[data-admin-terminal-action="create-player"]').click();

  phase = "verifying created credentials";
  await page.waitForSelector("[data-admin-player-access-code-dialog]", { timeout: 8000 });
  const createdCredentials = await page.evaluate(() => ({
    playerIdentifier: document.querySelector("[data-admin-player-identifier-value]")?.textContent?.trim() || "",
    accessCode: document.querySelector("[data-admin-player-access-code-value]")?.textContent?.trim() || "",
  }));
  const createWrite = writes.find((write) =>
    write.service === "admin-api" && write.pathname.endsWith(`/games/${GAME_ID}/players`)
  );
  assert(createWrite, "Player create emitted no authenticated admin-api request.");
  assert(
    createWrite.payload.playerIdentifier === CREATE_IDENTIFIER &&
      createWrite.payload.accessCode === CREATE_ACCESS_CODE,
    `Player create sent the wrong identity payload: ${JSON.stringify(createWrite.body)}.`,
  );
  assert(
    !("id" in createWrite.payload) && !("uuid" in createWrite.payload),
    `Player create exposed an editable internal UUID: ${JSON.stringify(createWrite.payload)}.`,
  );
  assert(
    String(createWrite.headers.authorization || "").startsWith("Bearer "),
    "Player create omitted the administrator bearer header.",
  );
  assert(
    createWrite.headers["x-econovaria-game-id"] === GAME_ID,
    "Player create omitted the active game header.",
  );
  assert(
    createdCredentials.playerIdentifier === CREATE_IDENTIFIER &&
      createdCredentials.accessCode === CREATE_ACCESS_CODE,
    `Created credentials were not displayed correctly: ${JSON.stringify(createdCredentials)}.`,
  );
  await closeCredentialDialog();

  phase = "opening Players section";
  await page.locator('[data-admin-section="Players"]').first().click();
  await page.waitForTimeout(500);
  const playerEntry = page.getByText(existingPlayer.displayName, { exact: true }).first();
  await playerEntry.waitFor({ state: "visible", timeout: 8000 });

  phase = "opening selected player settings";
  await playerEntry.click();
  const settings = page.locator(
    `[data-admin-player-identity-settings][data-player-id="${PLAYER_UUID}"]`,
  );
  await settings.waitFor({ state: "visible", timeout: 8000 });
  const settingsForm = settings.locator("[data-admin-player-identity-settings-form]");

  phase = "saving Player ID and Access Code inline";
  await settingsForm.locator('[name="playerIdentifier"]').fill(UPDATE_IDENTIFIER);
  await settingsForm.locator('[name="accessCode"]').fill(UPDATE_ACCESS_CODE);
  await settingsForm.locator('button[type="submit"]').click();
  await settings.getByText("Player ID and Access Code saved.", { exact: true })
    .waitFor({ state: "visible", timeout: 8000 });
  assert(
    await page.locator("[data-admin-player-identity-manager], [data-admin-player-identity-manager-dialog]").count() === 0,
    "Saving from player settings recreated the forbidden standalone identity manager.",
  );
  assert(
    await page.locator("[data-admin-player-access-code-dialog]").count() === 0,
    "Player settings opened a separate credential popup instead of saving inline.",
  );

  phase = "saving Player ID without rotating Access Code";
  await settingsForm.locator('[name="playerIdentifier"]').fill(ID_ONLY_IDENTIFIER);
  await settingsForm.locator('[name="accessCode"]').fill("");
  await settingsForm.locator('button[type="submit"]').click();
  await settings.getByText("Player ID saved. The current Access Code was not changed.", { exact: true })
    .waitFor({ state: "visible", timeout: 8000 });

  phase = "verifying authenticated identity writes";
  const identityWrites = writes.filter((write) =>
    write.service === "admin-api" &&
    write.pathname.endsWith(`/games/${GAME_ID}/players/${PLAYER_UUID}/access-code/reset`)
  );
  assert(identityWrites.length === 2, `Expected two player-settings identity writes, received ${identityWrites.length}.`);

  const credentialWrite = identityWrites[0];
  assert(
    credentialWrite.payload.playerIdentifier === UPDATE_IDENTIFIER &&
      credentialWrite.payload.accessCode === UPDATE_ACCESS_CODE,
    `Credential update sent the wrong payload: ${JSON.stringify(credentialWrite.body)}.`,
  );

  const identifierOnlyWrite = identityWrites[1];
  assert(
    identifierOnlyWrite.payload.playerIdentifier === ID_ONLY_IDENTIFIER &&
      !Object.hasOwn(identifierOnlyWrite.payload, "accessCode"),
    `Player-ID-only update reset the Access Code: ${JSON.stringify(identifierOnlyWrite.body)}.`,
  );

  for (const write of identityWrites) {
    assert(
      String(write.headers.authorization || "").startsWith("Bearer "),
      `Identity update omitted Authorization: ${JSON.stringify(write.headers)}.`,
    );
    assert(
      write.headers["x-econovaria-game-id"] === GAME_ID,
      `Identity update omitted the game header: ${JSON.stringify(write.headers)}.`,
    );
  }

  assert(
    writes.filter((write) =>
      write.service === "classroom-api" && write.pathname.includes("/access-code/reset")
    ).length === 0,
    "Existing-player settings bypassed admin-api and used the removed direct transport.",
  );
  assert(errors.length === 0, errors[0] || "Unexpected browser error.");

  phase = "passed";
  await saveDiagnostics("admin-player-identity", { createdCredentials, identityWrites });
  console.log("Admin player-specific RFID and Access Code settings smoke passed.");
} catch (error) {
  await saveDiagnostics("admin-player-identity-failure", {
    failure: error.stack || error.message || String(error),
  });
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
