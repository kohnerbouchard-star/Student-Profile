#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

import {
  assertDisposableLocalRuntime,
  parseSupabaseStatusEnv,
} from "./lib/disposable-local-runtime.mjs";

const execFileAsync = promisify(execFile);
const BASE_URL = process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR ||
  join(tmpdir(), "econovaria-player-browser");
const DATABASE_URL = process.env.DATABASE_URL || "";
const NPX_COMMAND = process.platform === "win32" ? "npx.cmd" : "npx";
const LICENSE_CODE = process.env.ECONOVARIA_BROWSER_LICENSE_CODE || "PLAYER-E2E-LICENSE-001";
const ADMIN_EMAIL = process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "player.e2e@example.test";
const ADMIN_PASSWORD = process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD || "Player-E2E-Admin-2026!";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Player Multiplayer E2E";
const MEMORABLE_CODE_PATTERN = /^ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}$/;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const PLAYER_ROUTES = Object.freeze([
  "dashboard",
  "world",
  "news",
  "market",
  "portfolio",
  "banking",
  "loans",
  "contracts",
  "business",
  "crafting",
  "store",
  "marketplace",
  "inventory",
  "messages",
  "profile",
  "progression",
]);
const PLAYERS = Object.freeze([
  {
    displayName: "Browser Player Alpha",
    playerIdentifier: "BROWSER-PLAYER-ALPHA",
    accessCode: "BROWSER-ALPHA-ACCESS-001",
  },
  {
    displayName: "Browser Player Beta",
    playerIdentifier: "BROWSER-PLAYER-BETA",
    accessCode: "BROWSER-BETA-ACCESS-002",
  },
]);

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  connectedSetup: {
    signupStatus: 0,
    signInStatus: 0,
    bootstrapStatus: 0,
    gameProvisionStatus: 0,
    localMfaExemptionApplied: false,
    identityFixtureCreated: false,
    disposableRuntime: null,
  },
  adminConsoleRendered: false,
  adminUsesHttpOnlyBff: false,
  gameCode: {
    formatValid: false,
    prefilledWithoutTruncation: false,
    ownerScopedRead: false,
    rotationUnchanged: false,
  },
  playersCreatedThroughRenderedUi: 0,
  concurrentLogin: false,
  playerJourneys: [],
  adminRequests: [],
  adminConsoleErrors: [],
  adminPageErrors: [],
  rawInternalIdentifiersRecorded: false,
  plaintextCredentialsRecorded: false,
};

function redact(value) {
  return String(value || "")
    .replace(UUID_PATTERN, "[uuid-redacted]")
    .replace(/ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}/g, "[game-code-redacted]")
    .replace(/BROWSER-[A-Z0-9-]+/g, "[credential-redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt-redacted]");
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function localSupabaseAdminRuntime() {
  const { stdout } = await execFileAsync(
    NPX_COMMAND,
    ["supabase", "status", "--workdir", "backend", "-o", "env"],
    { timeout: 30_000, maxBuffer: 2_097_152 },
  );
  const values = parseSupabaseStatusEnv(stdout);
  const disposableRuntime = assertDisposableLocalRuntime({
    statusOutput: stdout,
    inheritedDatabaseUrl: DATABASE_URL,
    gatewayUrl: BASE_URL,
  });
  const apiUrl = String(values.API_URL || values.SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/u, "");
  const serviceRoleKey = String(
    values.SERVICE_ROLE_KEY || values.SECRET_KEY || "",
  ).trim();
  const publishableKey = String(values.PUBLISHABLE_KEY || "").trim();
  if (!serviceRoleKey) {
    throw new Error("Disposable local Supabase service credential is unavailable.");
  }
  if (!publishableKey.startsWith("sb_publishable_")) {
    throw new Error("Disposable local Supabase publishable credential is unavailable.");
  }
  return { apiUrl, serviceRoleKey, publishableKey, disposableRuntime };
}

async function createConnectedStaffFixture() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is required for disposable local Staff setup.");
  }
  const {
    apiUrl,
    serviceRoleKey,
    publishableKey,
    disposableRuntime,
  } = await localSupabaseAdminRuntime();
  evidence.connectedSetup.disposableRuntime = disposableRuntime;
  const adminHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
  const authResponse = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Multiplayer Browser Teacher" },
    }),
    cache: "no-store",
    redirect: "error",
  });
  evidence.connectedSetup.signupStatus = authResponse.status;
  const authPayload = await authResponse.json().catch(() => null);
  const authUserId = String(authPayload?.id || authPayload?.user?.id || "").trim();
  if (
    !authResponse.ok ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(authUserId)
  ) {
    throw new Error(`Disposable local Auth identity returned ${authResponse.status}.`);
  }

  await execFileAsync("psql", [
    DATABASE_URL,
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `insert into public.staff_users (
       supabase_auth_user_id,
       email,
       display_name,
       status,
       role,
       mfa_required
     ) values (
       ${sqlLiteral(authUserId)}::uuid,
       lower(${sqlLiteral(ADMIN_EMAIL)}),
       'Multiplayer Browser Teacher',
       'active',
       'game_admin',
       false
     );`,
  ], { timeout: 30_000, maxBuffer: 1_048_576 });

  const { stdout } = await execFileAsync("psql", [
    DATABASE_URL,
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `select jsonb_build_object(
       'permissionVersion', permission_version,
       'securityVersion', security_version
     )::text
     from public.staff_users
     where supabase_auth_user_id = ${sqlLiteral(authUserId)}::uuid;`,
  ], { timeout: 30_000, maxBuffer: 1_048_576 });
  const security = JSON.parse(String(stdout || "").trim());
  const permissionVersion = Number(security.permissionVersion);
  const securityVersion = Number(security.securityVersion);
  if (
    !Number.isSafeInteger(permissionVersion) || permissionVersion < 1 ||
    !Number.isSafeInteger(securityVersion) || securityVersion < 1
  ) {
    throw new Error("Disposable local Staff security state is invalid.");
  }

  const metadataResponse = await fetch(
    `${apiUrl}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`,
    {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({
        app_metadata: {
          econovaria_role: "game_admin",
          permission_version: permissionVersion,
          security_version: securityVersion,
        },
        user_metadata: { display_name: "Multiplayer Browser Teacher" },
      }),
      cache: "no-store",
      redirect: "error",
    },
  );
  await metadataResponse.body?.cancel().catch(() => undefined);
  if (!metadataResponse.ok) {
    throw new Error(`Disposable local Auth metadata returned ${metadataResponse.status}.`);
  }

  evidence.connectedSetup.localMfaExemptionApplied = true;
  evidence.connectedSetup.identityFixtureCreated = true;
  return { publishableKey };
}

function instrumentPage(page, target) {
  page.on("console", (message) => {
    if (message.type() === "error") target.consoleErrors.push(redact(message.text()));
  });
  page.on("pageerror", (error) => target.pageErrors.push(redact(error?.message || error)));
  page.on("request", (request) => {
    const url = request.url();
    if (
      !url.includes("/functions/v1/") &&
      !url.includes("/auth/v1/") &&
      !url.includes("/api/")
    ) return;
    const headers = request.headers();
    if (headers.authorization !== undefined) {
      target.pageErrors.push(redact(`Browser exposed Authorization on ${request.method()} ${url}`));
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    if (
      !url.includes("/functions/v1/") &&
      !url.includes("/auth/v1/") &&
      !url.includes("/api/")
    ) return;
    target.requests.push({
      method: response.request().method(),
      url: redact(url.replace(BASE_URL, "[local-gateway]")),
      status: response.status(),
    });
  });
}

function assertNoFailedRequests(label, requests, startIndex = 0) {
  const failed = requests.slice(startIndex).filter((entry) => {
    if (entry.status < 400) return false;
    return !(
      label === "Admin bootstrap" &&
      entry.method === "GET" &&
      entry.status === 401 &&
      entry.url.endsWith("/functions/v1/web-session-api/status")
    );
  });
  if (failed.length) throw new Error(`${label} observed failed requests: ${JSON.stringify(failed)}`);
}

async function waitForAdminConsole(page) {
  await page.waitForURL(/\/admin\/(?:index\.html)?(?:\?.*)?$/, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const preview = document.getElementById("adminPreview");
    return Boolean(preview && !preview.hidden && preview.childElementCount > 0);
  }, undefined, { timeout: 120_000 });
  await page.waitForTimeout(1200);
}

async function signInAdminAndCreateGame(page) {
  const consoleErrorStart = evidence.adminConsoleErrors.length;
  await page.goto(`${BASE_URL}/?mode=admin`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.locator("#adminEmail").fill(ADMIN_EMAIL);
  await page.locator("#adminAccessCode").fill(ADMIN_PASSWORD);
  const requestAuditStart = evidence.adminRequests.length;
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/web-session-api/login") &&
      response.request().method() === "POST",
    { timeout: 120_000 },
  );
  const statusResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/web-session-api/status") &&
      response.request().method() === "GET" && response.status() === 200,
    { timeout: 120_000 },
  );
  await page.locator("#adminForm button[type='submit']").click();
  const [loginResponse, statusResponse] = await Promise.all([
    loginResponsePromise,
    statusResponsePromise,
  ]);
  evidence.connectedSetup.signInStatus = loginResponse.status();
  evidence.connectedSetup.bootstrapStatus = statusResponse.status();
  if (loginResponse.status() !== 200 || statusResponse.status() !== 200) {
    throw new Error(
      `Connected Admin web session returned ${loginResponse.status()}/${statusResponse.status()}.`,
    );
  }
  const initialStatus = await statusResponse.json().catch(() => null);
  const initialGames = Array.isArray(initialStatus?.activeGameSessions)
    ? initialStatus.activeGameSessions
    : [];
  if (initialGames.length !== 0) {
    throw new Error(
      "Disposable local Staff unexpectedly owned a game before selector provisioning.",
    );
  }

  await page.locator("#createNewAdminGame").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.locator("#createNewAdminGame").click();
  await page.locator("#adminNewLicenseCode").fill(LICENSE_CODE);
  await page.locator("#adminNewGameName").fill(GAME_NAME);
  await page.locator("#adminNewGameTimeZone").selectOption("Asia/Seoul");
  await page.locator("#adminNewGameDifficulty").selectOption("moderate");

  const provisionResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(
        "/functions/v1/web-session-api/proxy/games",
      ) && response.request().method() === "POST",
    { timeout: 180_000 },
  );
  const refreshedStatusPromise = page.waitForResponse(
    (response) =>
      response.url().includes("/functions/v1/web-session-api/status") &&
      response.request().method() === "GET" && response.status() === 200,
    { timeout: 180_000 },
  );
  await page.locator("#adminCreateGameForm button[type='submit']").click();
  const [provisionResponse, refreshedStatusResponse] = await Promise.all([
    provisionResponsePromise,
    refreshedStatusPromise,
  ]);
  evidence.connectedSetup.gameProvisionStatus = provisionResponse.status();
  if (![200, 201].includes(provisionResponse.status())) {
    throw new Error(
      `Authenticated game selector returned ${provisionResponse.status()}.`,
    );
  }
  const provisionPayload = await provisionResponse.json().catch(() => null);
  const gameId = String(
    provisionPayload?.data?.game?.id ||
      provisionPayload?.data?.game?.gameId ||
      "",
  ).trim();
  if (!gameId) {
    throw new Error("Authenticated game selector did not return a game scope.");
  }
  const refreshedStatus = await refreshedStatusResponse.json().catch(() => null);
  const activeGames = Array.isArray(refreshedStatus?.activeGameSessions)
    ? refreshedStatus.activeGameSessions
    : [];
  if (!activeGames.some((game) => String(game?.id || "") === gameId)) {
    throw new Error(
      "Refreshed Admin status did not contain the selector-provisioned game.",
    );
  }

  const gameRow = page.locator(
    `#adminGameList .game-row[data-game-id="${gameId}"]`,
  ).first();
  await gameRow.waitFor({ state: "visible", timeout: 30_000 });
  await gameRow.click();
  await waitForAdminConsole(page);

  const selectedGameId = await page.evaluate(() =>
    new URL(location.href).searchParams.get("game") || ""
  );
  if (selectedGameId !== gameId) {
    throw new Error("Connected Admin selected the wrong game scope.");
  }
  const storage = await page.evaluate(() =>
    sessionStorage.getItem("econovaria.admin.auth.v1") || ""
  );
  if (/accessToken|refreshToken|eyJ[A-Za-z0-9_-]+\./.test(storage)) {
    throw new Error("Admin browser storage exposed Staff credentials.");
  }

  const retainedErrors = evidence.adminConsoleErrors.slice(0, consoleErrorStart).concat(
    evidence.adminConsoleErrors.slice(consoleErrorStart).filter((entry) =>
      !/Failed to load resource: the server responded with a status of 401/i.test(entry)
    ),
  );
  evidence.adminConsoleErrors.splice(
    0,
    evidence.adminConsoleErrors.length,
    ...retainedErrors,
  );
  evidence.adminUsesHttpOnlyBff = true;
  return { gameId, requestAuditStart };
}

async function navigateAdminSection(page, name) {
  const startIndex = evidence.adminRequests.length;
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(800);
  assertNoFailedRequests(`Admin ${name}`, evidence.adminRequests, startIndex);
}

async function openShareModal(page) {
  const share = page.locator([
    "[data-econovaria-share-game]:visible",
    'button[title="Share game code"]:visible',
    "[data-admin-terminal-share-button]:visible",
  ].join(", ")).first();
  await share.waitFor({ state: "visible", timeout: 30_000 });
  await share.click();
  const modal = page.locator('[data-modal-id="share-game-access"]:visible').last();
  await modal.waitFor({ state: "visible", timeout: 30_000 });
  const label = modal.locator(".admin-terminal-share-modal-code strong");
  await label.waitFor({ state: "visible", timeout: 10_000 });
  const code = String(await label.textContent() || "").trim();
  if (!MEMORABLE_CODE_PATTERN.test(code)) {
    throw new Error("Game Code was not rendered in the canonical memorable format.");
  }
  return { modal, code };
}

async function readPersistedGameCodeThroughAdminBff(page, gameId, publishableKey) {
  const expectedPath = `/api/admin/games/${encodeURIComponent(gameId)}/join-code/reset`;
  const response = await page.context().request.get(`${BASE_URL}${expectedPath}`, {
    headers: {
      Accept: "application/json",
      apikey: publishableKey,
      "x-econovaria-device-id": crypto.randomUUID(),
      "x-econovaria-game-id": gameId,
    },
    failOnStatusCode: false,
    timeout: 60_000,
  });
  const status = response.status();
  const payload = await response.json().catch(() => null);
  evidence.adminRequests.push({
    method: "GET",
    url: `[local-gateway]${expectedPath}`,
    status,
  });
  if (status !== 200) {
    throw new Error(
      `Owner-scoped Admin Game Code read returned ${status}.`,
    );
  }
  const code = String(
    payload?.data?.joinCode?.gameJoinCode ||
      payload?.joinCode?.gameJoinCode ||
      payload?.data?.gameJoinCode ||
      payload?.gameJoinCode ||
      "",
  ).trim();
  if (!MEMORABLE_CODE_PATTERN.test(code)) {
    throw new Error("Owner-scoped Admin Game Code read returned an invalid code.");
  }
  evidence.gameCode.ownerScopedRead = true;
  return code;
}

function assertJoinCodeWasReadWithoutRotation() {
  const requests = evidence.adminRequests.filter((entry) =>
    entry.url.endsWith("/join-code/reset")
  );
  if (!requests.some((entry) => entry.method === "GET" && entry.status === 200)) {
    throw new Error("Admin journey did not record a successful Game Code read.");
  }
  if (requests.some((entry) => entry.method !== "GET")) {
    throw new Error("Admin journey unexpectedly rotated the Game Code.");
  }
  evidence.gameCode.rotationUnchanged = true;
}

async function createPlayer(page, player) {
  await navigateAdminSection(page, "Overview");
  await page.getByRole("button", { name: /Add Player/i }).click();
  const form = page.locator("[data-admin-terminal-player-form]");
  await form.waitFor({ state: "visible", timeout: 30_000 });
  await form.locator('[name="displayName"]').fill(player.displayName);
  const roster = form.locator('[name="rosterLabel"]');
  if (await roster.count()) await roster.fill("Multiplayer Browser Roster");
  await form.locator('[name="playerIdentifier"]').fill(player.playerIdentifier);
  await form.locator('[name="accessCode"]').fill(player.accessCode);

  const requestStart = evidence.adminRequests.length;
  const responsePromise = page.waitForResponse(
    (response) => /\/functions\/v1\/web-session-api\/proxy\/games\/[^/]+\/players$/.test(new URL(response.url()).pathname) &&
      response.request().method() === "POST",
    { timeout: 120_000 },
  );
  await form.locator('[data-admin-terminal-action="create-player"], button[type="submit"]').first().click();
  const response = await responsePromise;
  if (response.status() !== 201) throw new Error(`Create Player returned ${response.status()}.`);
  assertNoFailedRequests(`Create ${player.displayName}`, evidence.adminRequests, requestStart);

  const confirmation = page.locator("[data-admin-player-created-confirmation]");
  await confirmation.waitFor({ state: "visible", timeout: 30_000 });
  await confirmation.locator("[data-admin-player-created-done]").click();
  evidence.playersCreatedThroughRenderedUi += 1;
}

async function loginPlayer(browser, gameCode, player, index) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const journey = {
    player: index + 1,
    requests: [],
    consoleErrors: [],
    pageErrors: [],
    routes: [],
    rawUuidVisible: false,
    loggedOut: false,
  };
  instrumentPage(page, journey);

  await page.goto(`${BASE_URL}/?mode=player&gameCode=${encodeURIComponent(gameCode)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  const gameCodeInput = page.locator("#gameCode");
  await gameCodeInput.waitFor({ state: "visible", timeout: 30_000 });
  const inputState = await gameCodeInput.evaluate((input) => ({ value: input.value, maxLength: input.maxLength }));
  if (inputState.value !== gameCode || inputState.maxLength < gameCode.length) {
    throw new Error("Player login truncated or failed to prefill the complete Game Code.");
  }
  evidence.gameCode.prefilledWithoutTruncation = true;

  await page.locator("#playerId").fill(player.playerIdentifier);
  await page.locator("#playerAccessCode").fill(player.accessCode);
  const requestStart = journey.requests.length;
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/player-web-session-api/login") &&
      response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.locator("#playerForm button[type='submit']").click();
  const loginResponse = await loginResponsePromise;
  if (loginResponse.status() !== 200) throw new Error(`Player ${index + 1} login returned ${loginResponse.status()}.`);
  await page.waitForURL(/\/player-terminal\/(?:index\.html)?(?:#.*)?$/, { timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  assertNoFailedRequests(`Player ${index + 1} login`, journey.requests, requestStart);
  return { context, page, journey };
}

async function visitRoute(session, route) {
  const { page, journey } = session;
  const requestStart = journey.requests.length;
  const control = page.locator(`[data-route="${route}"]:visible`).first();
  await control.waitFor({ state: "visible", timeout: 30_000 });
  const disabled = await control.evaluate((node) => node.getAttribute("aria-disabled") === "true" || Boolean(node.disabled));
  if (disabled) throw new Error(`Player route ${route} is visible but disabled.`);
  await control.click();
  await page.waitForFunction((expectedRoute) => location.hash === `#${expectedRoute}`, route, { timeout: 30_000 });
  await page.waitForTimeout(900);

  const failure = page.locator(".player-terminal-route-error, .player-terminal-error-shell");
  if (await failure.count()) {
    throw new Error(`Player route ${route} rendered an error state: ${redact(await failure.first().textContent())}`);
  }
  const host = page.locator(".player-terminal-page-host");
  const text = String(await host.innerText()).replace(/\s+/g, " ").trim();
  if (text.length < 40) throw new Error(`Player route ${route} rendered insufficient live content.`);
  if (/SECTION UNAVAILABLE|VIEW COULD NOT BE RENDERED|WORLD UNAVAILABLE|ROUTE_NOT_FOUND/i.test(text)) {
    throw new Error(`Player route ${route} exposed an unavailable-state message.`);
  }
  UUID_PATTERN.lastIndex = 0;
  if (UUID_PATTERN.test(text)) journey.rawUuidVisible = true;
  if (journey.rawUuidVisible) throw new Error(`Player route ${route} exposed a raw internal UUID.`);
  assertNoFailedRequests(`Player ${journey.player} route ${route}`, journey.requests, requestStart);
  journey.routes.push({ route, live: true });
}

async function exercisePlayer(session) {
  for (const route of PLAYER_ROUTES) await visitRoute(session, route);
  await visitRoute(session, "profile");
  session.journey.routes.pop();

  const { page, journey } = session;
  const logout = page.locator('[data-player-action="logout"]:visible').first();
  await logout.waitFor({ state: "visible", timeout: 30_000 });
  const requestStart = journey.requests.length;
  await logout.click();
  await page.waitForURL(/reason=logged-out/, { timeout: 60_000 });
  assertNoFailedRequests(`Player ${journey.player} logout`, journey.requests, requestStart);
  const retainedSession = await page.evaluate(() => sessionStorage.getItem("econovaria.player.auth.v1"));
  if (retainedSession) throw new Error(`Player ${journey.player} session remained after logout.`);
  journey.loggedOut = true;
}

let browser;
let adminContext;
const playerSessions = [];
let failure;
try {
  const { publishableKey } = await createConnectedStaffFixture();

  browser = await chromium.launch({ headless: true });
  adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const adminPage = await adminContext.newPage();
  instrumentPage(adminPage, {
    requests: evidence.adminRequests,
    consoleErrors: evidence.adminConsoleErrors,
    pageErrors: evidence.adminPageErrors,
  });
  const {
    gameId,
    requestAuditStart: authenticatedRequestStart,
  } = await signInAdminAndCreateGame(adminPage);
  evidence.adminConsoleRendered = true;
  assertNoFailedRequests("Admin bootstrap", evidence.adminRequests, authenticatedRequestStart);

  const persistedGameCode = await readPersistedGameCodeThroughAdminBff(
    adminPage,
    gameId,
    publishableKey,
  );
  const share = await openShareModal(adminPage);
  const gameCode = share.code;
  if (gameCode !== persistedGameCode) {
    throw new Error("Rendered Game Code did not match the owner-scoped persisted read.");
  }
  assertJoinCodeWasReadWithoutRotation();
  evidence.gameCode.formatValid = true;
  await adminPage.keyboard.press("Escape");
  if (await share.modal.isVisible().catch(() => false)) {
    await share.modal.locator('[data-admin-terminal-modal-close], button[aria-label*="Close"]').first().click();
  }

  for (const player of PLAYERS) await createPlayer(adminPage, player);
  if (evidence.adminConsoleErrors.length || evidence.adminPageErrors.length) {
    throw new Error(`Admin emitted browser errors: ${JSON.stringify({
      consoleErrors: evidence.adminConsoleErrors,
      pageErrors: evidence.adminPageErrors,
    })}`);
  }

  const sessions = await Promise.all(PLAYERS.map((player, index) => loginPlayer(browser, gameCode, player, index)));
  playerSessions.push(...sessions);
  evidence.concurrentLogin = true;
  await Promise.all(sessions.map(exercisePlayer));
  evidence.playerJourneys = sessions.map(({ journey }) => journey);

  for (const journey of evidence.playerJourneys) {
    if (journey.consoleErrors.length || journey.pageErrors.length) {
      throw new Error(`Player ${journey.player} emitted browser errors: ${JSON.stringify({
        consoleErrors: journey.consoleErrors,
        pageErrors: journey.pageErrors,
      })}`);
    }
    if (journey.routes.length !== PLAYER_ROUTES.length || !journey.loggedOut) {
      throw new Error(`Player ${journey.player} did not complete the full terminal journey.`);
    }
  }
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  const serialized = JSON.stringify(evidence);
  UUID_PATTERN.lastIndex = 0;
  evidence.rawInternalIdentifiersRecorded = UUID_PATTERN.test(serialized);
  evidence.plaintextCredentialsRecorded = /BROWSER-(?:PLAYER|ALPHA|BETA|ACCESS)-[A-Z0-9-]+/.test(serialized);
  if (evidence.rawInternalIdentifiersRecorded || evidence.plaintextCredentialsRecorded) {
    failure ||= new Error("Player browser evidence contained a raw identifier or plaintext credential.");
  }
  await writeFile(
    `${OUTPUT_DIR}/player-multiplayer-browser-acceptance.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  for (const session of playerSessions) await session.context.close().catch(() => {});
  await adminContext?.close().catch(() => {});
  await browser?.close().catch(() => {});
}

if (failure) throw failure;

console.log(JSON.stringify({
  ok: true,
  playersCreated: evidence.playersCreatedThroughRenderedUi,
  concurrentLogin: evidence.concurrentLogin,
  routesPerPlayer: evidence.playerJourneys.map((journey) => journey.routes.length),
  loggedOut: evidence.playerJourneys.map((journey) => journey.loggedOut),
}));
