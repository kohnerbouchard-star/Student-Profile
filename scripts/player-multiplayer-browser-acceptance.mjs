#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const BASE_URL = process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR || "/tmp/econovaria-player-browser";
const DATABASE_URL = process.env.DATABASE_URL || "";
const LICENSE_CODE = process.env.ECONOVARIA_BROWSER_LICENSE_CODE || "PLAYER-E2E-LICENSE-001";
const ADMIN_EMAIL = process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "player.e2e@example.test";
const ADMIN_PASSWORD = process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD || "Player-E2E-Admin-2026!";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Player Multiplayer E2E";
const REQUEST_TIMEOUT_MS = 180_000;
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
    localMfaExemptionApplied: false,
  },
  adminConsoleRendered: false,
  adminUsesHttpOnlyBff: false,
  gameCode: {
    formatValid: false,
    prefilledWithoutTruncation: false,
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

async function request(path, { method = "GET", headers = {}, body, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");
    return { status: response.status, ok: response.ok, payload };
  } finally {
    clearTimeout(timer);
  }
}

async function browserRuntimeConfig() {
  const response = await fetch(`${BASE_URL}/runtime-config.env.js`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Runtime configuration returned ${response.status}.`);
  const source = await response.text();
  const match = source.match(/Object\.freeze\((\{[\s\S]*\})\);?/);
  if (!match) throw new Error("Runtime configuration could not be parsed.");
  const config = JSON.parse(match[1]);
  const publishableKey = String(config.supabasePublishableKey || "").trim();
  if (!publishableKey || publishableKey.startsWith("sb_secret_")) {
    throw new Error("A browser-safe Supabase publishable key is required.");
  }
  return { publishableKey };
}

function publicHeaders(publishableKey) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: publishableKey,
    "x-econovaria-device-id": crypto.randomUUID(),
  };
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function disableMfaForDisposableLocalStaff() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL is required for disposable local Staff setup.");
  const query = `update public.staff_users set mfa_required = false where lower(email) = lower(${sqlLiteral(ADMIN_EMAIL)}); select coalesce((select mfa_required::text from public.staff_users where lower(email) = lower(${sqlLiteral(ADMIN_EMAIL)}) limit 1), 'missing');`;
  const { stdout } = await execFileAsync("psql", [
    DATABASE_URL,
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    query,
  ], { timeout: 30_000, maxBuffer: 1_048_576 });
  const status = String(stdout || "").trim().split(/\s+/).at(-1);
  if (status !== "false") throw new Error("Disposable local Staff MFA exemption could not be verified.");
  evidence.connectedSetup.localMfaExemptionApplied = true;
}

async function createConnectedGame() {
  const { publishableKey } = await browserRuntimeConfig();
  const signup = await request("/functions/v1/bootstrap-api/staff/signup", {
    method: "POST",
    headers: publicHeaders(publishableKey),
    body: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      displayName: "Multiplayer Browser Teacher",
      purchaseCode: LICENSE_CODE,
      gameName: GAME_NAME,
      difficultyPreset: "moderate",
      stockMarketWindow: { timezone: "Asia/Seoul" },
    },
  });
  evidence.connectedSetup.signupStatus = signup.status;
  if (signup.status !== 201 || signup.payload?.ok !== true) {
    throw new Error(`Connected staff signup returned ${signup.status}.`);
  }

  const gameId = String(signup.payload?.activation?.gameSessionId || "").trim();
  if (!gameId) throw new Error("Connected staff signup did not return the provisioned game scope.");
  await disableMfaForDisposableLocalStaff();
  return { gameId, publishableKey };
}

function instrumentPage(page, target) {
  page.on("console", (message) => {
    if (message.type() === "error") target.consoleErrors.push(redact(message.text()));
  });
  page.on("pageerror", (error) => target.pageErrors.push(redact(error?.message || error)));
  page.on("request", (request) => {
    const url = request.url();
    if (!url.includes("/functions/v1/") && !url.includes("/auth/v1/")) return;
    const headers = request.headers();
    if (headers.authorization !== undefined) {
      target.pageErrors.push(redact(`Browser exposed Authorization on ${request.method()} ${url}`));
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/functions/v1/") && !url.includes("/auth/v1/")) return;
    target.requests.push({
      method: response.request().method(),
      url: redact(url.replace(BASE_URL, "[local-gateway]")),
      status: response.status(),
    });
  });
}

function assertNoFailedRequests(label, requests, startIndex = 0) {
  const failed = requests.slice(startIndex).filter((entry) => entry.status >= 400);
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

async function signInAdmin(page, expectedGameId) {
  await page.goto(`${BASE_URL}/?mode=admin`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("#adminEmail").fill(ADMIN_EMAIL);
  await page.locator("#adminAccessCode").fill(ADMIN_PASSWORD);
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/web-session-api/login") &&
      response.request().method() === "POST",
    { timeout: 120_000 },
  );
  const statusResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/web-session-api/status") &&
      response.request().method() === "GET",
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
    throw new Error(`Connected Admin web session returned ${loginResponse.status()}/${statusResponse.status()}.`);
  }
  const status = await statusResponse.json().catch(() => null);
  const activeGames = Array.isArray(status?.activeGameSessions) ? status.activeGameSessions : [];
  if (!activeGames.some((game) => String(game?.id || "") === expectedGameId)) {
    throw new Error("Connected Admin web session did not contain the provisioned game scope.");
  }
  await waitForAdminConsole(page);
  const storage = await page.evaluate(() => sessionStorage.getItem("econovaria.admin.auth.v1") || "");
  if (/accessToken|refreshToken|eyJ[A-Za-z0-9_-]+\./.test(storage)) {
    throw new Error("Admin browser storage exposed Staff credentials.");
  }
  evidence.adminUsesHttpOnlyBff = true;
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
    (response) => response.url().includes("/functions/v1/player-api/players/login") &&
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
  const setup = await createConnectedGame();

  browser = await chromium.launch({ headless: true });
  adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const adminPage = await adminContext.newPage();
  instrumentPage(adminPage, {
    requests: evidence.adminRequests,
    consoleErrors: evidence.adminConsoleErrors,
    pageErrors: evidence.adminPageErrors,
  });
  await signInAdmin(adminPage, setup.gameId);
  evidence.adminConsoleRendered = true;
  assertNoFailedRequests("Admin bootstrap", evidence.adminRequests);

  const share = await openShareModal(adminPage);
  const gameCode = share.code;
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
