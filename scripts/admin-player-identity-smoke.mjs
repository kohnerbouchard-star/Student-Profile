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
  const url = request.url();
  const failure = request.failure()?.errorText || "";
  if (url.endsWith("/favicon.ico")) return;
  if (/\/admin\/assets\/videos\/[^/]+\.mp4$/i.test(url) && failure.includes("ERR_ABORTED")) return;
  errors.push(`requestfailed: ${request.method()} ${url} ${failure}`);
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
  const method = request.method();

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

  let body = null;
  if (["POST", "PATCH", "PUT"].includes(method)) {
    try {
      body = request.postDataJSON();
    } catch (_) {
      body = {};
    }
  }

  const payload = flattenedBody(body);
  const write = {
    service: "admin-api",
    pathname,
    method,
    headers: request.headers(),
    body,
    payload,
  };

  if (method === "POST" && pathname.endsWith(`/games/${GAME_ID}/players`)) {
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

  if (method === "PATCH" && pathname.endsWith(`/games/${GAME_ID}/players/${PLAYER_UUID}/settings`)) {
    writes.push(write);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "cache-control": "no-store" },
      body: JSON.stringify({ ok: true, data: { saved: true, settings: body?.settings || {} } }),
    });
    return;
  }

  if (method === "POST" && pathname.endsWith(`/games/${GAME_ID}/players/${PLAYER_UUID}/access-code/reset`)) {
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
          ? { studentCode: payload.accessCode, status: "active", createdAt: new Date().toISOString() }
          : { studentCode: null, status: "unchanged", createdAt: null },
      }),
    });
    return;
  }

  if (method === "GET" && pathname.endsWith(`/games/${GAME_ID}/players`)) {
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

async function closeCreatedPlayerConfirmation() {
  const confirmation = page.locator("[data-admin-player-created-confirmation]");
  await confirmation.waitFor({ state: "visible", timeout: 8000 });
  await confirmation.locator("[data-admin-player-created-done]").click();
  await confirmation.waitFor({ state: "detached", timeout: 5000 });
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

  phase = "rejecting separate identity interfaces";
  assert(
    await page.locator("[data-admin-player-identity-manager], [data-admin-player-identity-manager-dialog], [data-admin-player-identity-settings], [data-admin-player-identity-settings-row]").count() === 0,
    "A removed standalone or inline identity interface is still present.",
  );

  phase = "opening Add Player";
  await page.locator('[data-admin-terminal-action="add-player"]').first().click();
  const createForm = page.locator("[data-admin-terminal-player-form]").filter({ visible: true }).first();
  await createForm.locator('[name="playerIdentifier"]').waitFor({ state: "visible", timeout: 5000 });
  await createForm.locator('[name="displayName"]').fill("Created RFID Player");
  await createForm.locator('[name="rosterLabel"]').fill("GRADE-10-02");
  await createForm.locator('[name="playerIdentifier"]').fill(CREATE_IDENTIFIER);
  await createForm.locator('[name="accessCode"]').fill(CREATE_ACCESS_CODE);
  await createForm.locator('[name="status"]').selectOption("active");
  await createForm.locator('[name="startingLocation"]').selectOption("NORTHREACH");
  await createForm.locator('[data-admin-terminal-action="create-player"]').click();

  phase = "verifying created credentials";
  const confirmation = page.locator("[data-admin-player-created-confirmation]");
  await confirmation.waitFor({ state: "visible", timeout: 8000 });
  const createdCredentials = {
    playerIdentifier: await confirmation.locator("[data-admin-player-created-identifier]").textContent(),
    accessCode: await confirmation.locator("[data-admin-player-created-access-code]").textContent(),
  };
  createdCredentials.playerIdentifier = createdCredentials.playerIdentifier?.trim() || "";
  createdCredentials.accessCode = createdCredentials.accessCode?.trim() || "";

  const createWrite = writes.find((write) =>
    write.service === "admin-api" && write.pathname.endsWith(`/games/${GAME_ID}/players`)
  );
  assert(createWrite, "Player create emitted no authenticated admin-api request.");
  assert(
    createWrite.payload.playerIdentifier === CREATE_IDENTIFIER &&
      createWrite.payload.accessCode === CREATE_ACCESS_CODE,
    `Player create sent the wrong identity payload: ${JSON.stringify(createWrite.body)}.`,
  );
  assert(!("id" in createWrite.payload) && !("uuid" in createWrite.payload), "Player create exposed an editable UUID.");
  assert(String(createWrite.headers.authorization || "").startsWith("Bearer "), "Player create omitted Authorization.");
  assert(createWrite.headers["x-econovaria-game-id"] === GAME_ID, "Player create omitted the game header.");
  assert(
    createdCredentials.playerIdentifier === CREATE_IDENTIFIER &&
      createdCredentials.accessCode === CREATE_ACCESS_CODE,
    `Created credentials were not displayed correctly: ${JSON.stringify(createdCredentials)}.`,
  );
  assert(await page.locator("[data-admin-player-access-code-dialog]").count() === 0, "Legacy credential overlay returned.");
  await closeCreatedPlayerConfirmation();

  phase = "opening Players section";
  await page.locator('[data-admin-section="Players"]').first().click();
  await page.waitForTimeout(500);
  const playerEntry = page.getByText(existingPlayer.displayName, { exact: true }).first();
  await playerEntry.waitFor({ state: "visible", timeout: 8000 });
  await playerEntry.click();

  phase = "opening Edit Player Profile";
  const playerRow = page.locator(".admin-terminal-player-row").filter({ hasText: existingPlayer.displayName }).first();
  const settingsAction = playerRow.locator('[data-admin-terminal-action="player-settings"]').first();
  await settingsAction.waitFor({ state: "visible", timeout: 8000 });
  await settingsAction.click();

  const profile = page.locator('[data-admin-terminal-modal-backdrop][data-modal-id="player-settings-editor"]').last();
  await profile.waitFor({ state: "visible", timeout: 8000 });
  await profile.locator("[data-admin-player-profile-save-status]").waitFor({ state: "visible", timeout: 8000 });
  assert(
    await profile.getAttribute("data-admin-player-profile-identity-editor") !== null,
    "Edit Player Profile was not decorated as the identity editing surface.",
  );
  assert(
    await page.locator("[data-admin-player-identity-settings], [data-admin-player-identity-settings-row]").count() === 0,
    "Opening Edit Player Profile recreated the removed inline identity panel.",
  );

  const identifierInput = profile.locator('[name="playerIdentifier"]');
  const accessCodeInput = profile.locator('[name="accessCode"]');
  assert(
    await identifierInput.inputValue() === existingPlayer.playerIdentifier,
    `Edit Player Profile showed a generated ID instead of ${existingPlayer.playerIdentifier}.`,
  );
  assert(
    await accessCodeInput.getAttribute("type") === "password" &&
      await accessCodeInput.inputValue() === "",
    "Edit Player Profile exposed or prefilled an Access Code.",
  );
  assert(!(await profile.textContent()).includes(PLAYER_UUID), "Edit Player Profile exposed the backend UUID.");

  phase = "saving Player ID and Access Code from Edit Player Profile";
  await identifierInput.fill(UPDATE_IDENTIFIER);
  await accessCodeInput.fill(UPDATE_ACCESS_CODE);
  await profile.locator('[data-admin-terminal-action="confirm-player-settings-save"]').click();
  await profile.getByText("Player profile, Player ID, and Access Code saved.", { exact: true })
    .waitFor({ state: "visible", timeout: 8000 });
  assert(await profile.isVisible(), "Edit Player Profile closed after saving credentials.");
  assert(await page.locator("[data-admin-player-created-confirmation]").count() === 0, "A Player-created confirmation opened during an existing-player update.");
  assert(await page.locator("[data-admin-player-access-code-dialog]").count() === 0, "A second credential popup opened.");

  phase = "saving Player ID without rotating Access Code";
  await identifierInput.fill(ID_ONLY_IDENTIFIER);
  await accessCodeInput.fill("");
  await profile.locator('[data-admin-terminal-action="confirm-player-settings-save"]').click();
  await profile.getByText("Player profile and Player ID saved. The current Access Code was not changed.", { exact: true })
    .waitFor({ state: "visible", timeout: 8000 });

  phase = "verifying authenticated profile and identity writes";
  const profileWrites = writes.filter((write) =>
    write.service === "admin-api" &&
    write.method === "PATCH" &&
    write.pathname.endsWith(`/games/${GAME_ID}/players/${PLAYER_UUID}/settings`)
  );
  assert(profileWrites.length === 2, `Expected two profile settings writes, received ${profileWrites.length}.`);
  for (const write of profileWrites) {
    assert(
      write.body?.settings?.displayName === existingPlayer.displayName,
      `Profile settings were incomplete: ${JSON.stringify(write.body)}.`,
    );
    assert(
      !("id" in (write.body?.settings || {})) && !("uuid" in (write.body?.settings || {})),
      "Profile settings exposed UUID fields.",
    );
  }

  const identityWrites = writes.filter((write) =>
    write.service === "admin-api" &&
    write.pathname.endsWith(`/games/${GAME_ID}/players/${PLAYER_UUID}/access-code/reset`)
  );
  assert(identityWrites.length === 2, `Expected two credential writes, received ${identityWrites.length}.`);
  assert(
    identityWrites[0].payload.playerIdentifier === UPDATE_IDENTIFIER &&
      identityWrites[0].payload.accessCode === UPDATE_ACCESS_CODE,
    `Credential update sent the wrong payload: ${JSON.stringify(identityWrites[0].body)}.`,
  );
  assert(
    identityWrites[1].payload.playerIdentifier === ID_ONLY_IDENTIFIER &&
      !Object.hasOwn(identityWrites[1].payload, "accessCode"),
    `Player-ID-only update reset the Access Code: ${JSON.stringify(identityWrites[1].body)}.`,
  );

  for (const write of [...profileWrites, ...identityWrites]) {
    assert(String(write.headers.authorization || "").startsWith("Bearer "), "A profile write omitted Authorization.");
    assert(write.headers["x-econovaria-game-id"] === GAME_ID, "A profile write omitted the game header.");
  }
  assert(
    writes.filter((write) =>
      write.service === "classroom-api" && write.pathname.includes("/access-code/reset")
    ).length === 0,
    "Edit Player Profile bypassed admin-api.",
  );
  assert(errors.length === 0, errors[0] || "Unexpected browser error.");

  phase = "passed";
  await saveDiagnostics("admin-player-identity", {
    createdCredentials,
    profileWrites,
    identityWrites,
  });
  console.log("Admin Edit Player Profile identity, Player-created confirmation, and Access Code smoke passed.");
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