#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR || "/tmp/econovaria-player-browser";
const LICENSE_CODE = process.env.ECONOVARIA_BROWSER_LICENSE_CODE || "PLAYER-E2E-LICENSE-001";
const ADMIN_EMAIL = process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "player.e2e@example.test";
const ADMIN_PASSWORD = process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD || "Player-E2E-Admin-2026!";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Player Multiplayer E2E";
const MEMORABLE_CODE_PATTERN = /^ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}$/;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
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
  createdThroughRenderedUi: false,
  adminConsoleRendered: false,
  gameCode: {
    formatValid: false,
    prefilledWithoutTruncation: false,
  },
  playersCreated: 0,
  concurrentLogin: false,
  playerJourneys: [],
  adminRequests: [],
  adminConsoleErrors: [],
  adminPageErrors: [],
};

function redact(value) {
  return String(value || "")
    .replaceAll(UUID_PATTERN, "[uuid-redacted]")
    .replace(/ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}/g, "[game-code-redacted]")
    .replace(/BROWSER-[A-Z0-9-]+/g, "[credential-redacted]");
}

function instrumentPage(page, target) {
  page.on("console", (message) => {
    if (message.type() === "error") target.consoleErrors.push(redact(message.text()));
  });
  page.on("pageerror", (error) => target.pageErrors.push(redact(error?.message || error)));
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
  const failed = requests.slice(startIndex).filter((request) => request.status >= 400);
  if (failed.length) throw new Error(`${label} observed failed requests: ${JSON.stringify(failed)}`);
}

async function waitForAdminConsole(page) {
  await page.waitForURL(/\/admin\/(?:index\.html)?(?:\?.*)?$/, { timeout: 180_000 });
  await page.waitForFunction(() => {
    const preview = document.getElementById("adminPreview");
    return Boolean(preview && !preview.hidden && preview.childElementCount > 0);
  }, undefined, { timeout: 180_000 });
  await page.waitForTimeout(1200);
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
  await page.waitForFunction((pattern) => {
    const value = String(document.querySelector('[data-modal-id="share-game-access"] .admin-terminal-share-modal-code strong')?.textContent || "").trim();
    return new RegExp(pattern).test(value);
  }, MEMORABLE_CODE_PATTERN.source, { timeout: 30_000 });
  const code = String(await label.textContent() || "").trim();
  if (!MEMORABLE_CODE_PATTERN.test(code)) throw new Error("Game Code was not rendered in the canonical memorable format.");
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
    (response) => /\/functions\/v1\/admin-api\/games\/[^/]+\/players$/.test(new URL(response.url()).pathname) &&
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
  evidence.playersCreated += 1;
}

async function loginPlayer(browser, gameCode, player, index) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
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
  const inputState = await gameCodeInput.evaluate((input) => ({
    value: input.value,
    maxLength: input.maxLength,
  }));
  if (inputState.value !== gameCode || inputState.maxLength < gameCode.length) {
    throw new Error("Player login truncated or failed to prefill the complete Game Code.");
  }
  evidence.gameCode.prefilledWithoutTruncation = true;

  await page.locator("#playerId").fill(player.playerIdentifier);
  await page.locator("#playerAccessCode").fill(player.accessCode);
  const loginRequestStart = journey.requests.length;
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/classroom-api/players/login") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.locator("#playerForm button[type='submit']").click();
  const loginResponse = await loginResponsePromise;
  if (loginResponse.status() !== 200) throw new Error(`Player ${index + 1} login returned ${loginResponse.status()}.`);
  await page.waitForURL(/\/player-terminal\/(?:index\.html)?(?:#.*)?$/, { timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  assertNoFailedRequests(`Player ${index + 1} login`, journey.requests, loginRequestStart);

  return { context, page, journey };
}

async function visitRoute(session, route) {
  const { page, journey } = session;
  const startIndex = journey.requests.length;
  const control = page.locator(`[data-route="${route}"]:visible`).first();
  await control.waitFor({ state: "visible", timeout: 30_000 });
  const disabled = await control.evaluate((node) => node.getAttribute("aria-disabled") === "true" || Boolean(node.disabled));
  if (disabled) throw new Error(`Player route ${route} is visible but disabled.`);
  await control.click();
  await page.waitForFunction((expectedRoute) => location.hash === `#${expectedRoute}`, route, { timeout: 30_000 });
  await page.waitForTimeout(900);

  const failure = page.locator(".player-terminal-route-error, .player-terminal-error-shell");
  if (await failure.count()) {
    const text = redact(await failure.first().textContent());
    throw new Error(`Player route ${route} rendered an error state: ${text}`);
  }
  const main = page.locator("#player-main-content");
  const text = String(await main.innerText()).replace(/\s+/g, " ").trim();
  if (text.length < 40) throw new Error(`Player route ${route} rendered insufficient live content.`);
  if (/SECTION UNAVAILABLE|VIEW COULD NOT BE RENDERED|WORLD UNAVAILABLE|ROUTE_NOT_FOUND/i.test(text)) {
    throw new Error(`Player route ${route} exposed an unavailable-state message.`);
  }
  if (UUID_PATTERN.test(text)) journey.rawUuidVisible = true;
  if (journey.rawUuidVisible) throw new Error(`Player route ${route} exposed a raw internal UUID.`);
  assertNoFailedRequests(`Player ${journey.player} route ${route}`, journey.requests, startIndex);
  journey.routes.push({ route, live: true });
}

async function exercisePlayer(session) {
  for (const route of PLAYER_ROUTES) await visitRoute(session, route);

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

const browser = await chromium.launch({ headless: true });
const adminContext = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const adminPage = await adminContext.newPage();
instrumentPage(adminPage, {
  requests: evidence.adminRequests,
  consoleErrors: evidence.adminConsoleErrors,
  pageErrors: evidence.adminPageErrors,
});

let failure;
const playerSessions = [];
try {
  await adminPage.goto(`${BASE_URL}/?mode=create`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await adminPage.locator("#createForm").waitFor({ state: "visible", timeout: 30_000 });
  await adminPage.locator("#licenseCode").fill(LICENSE_CODE);
  await adminPage.locator("#createEmail").fill(ADMIN_EMAIL);
  await adminPage.locator("#createDisplayName").fill("Multiplayer Browser Teacher");
  await adminPage.locator("#sessionName").fill(GAME_NAME);
  await adminPage.locator("#gameTimeZone").selectOption("Asia/Seoul");
  await adminPage.locator("#difficultyLevel").selectOption("moderate");
  await adminPage.locator("#createAccessCode").fill(ADMIN_PASSWORD);
  await adminPage.locator("#confirmAccessCode").fill(ADMIN_PASSWORD);

  const signupPromise = adminPage.waitForResponse(
    (response) => response.url().includes("/functions/v1/classroom-api/staff/signup"),
    { timeout: 180_000 },
  );
  await adminPage.getByRole("button", { name: "Create Game", exact: true }).click();
  const signup = await signupPromise;
  if (signup.status() !== 201) throw new Error(`Rendered Create Game returned ${signup.status()}.`);
  evidence.createdThroughRenderedUi = true;
  await waitForAdminConsole(adminPage);
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
  await writeFile(
    `${OUTPUT_DIR}/player-multiplayer-browser-acceptance.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  for (const session of playerSessions) await session.context.close().catch(() => {});
  await adminContext.close().catch(() => {});
  await browser.close();
}

if (failure) throw failure;

console.log(JSON.stringify({
  ok: true,
  playersCreated: evidence.playersCreated,
  concurrentLogin: evidence.concurrentLogin,
  routesPerPlayer: evidence.playerJourneys.map((journey) => journey.routes.length),
  loggedOut: evidence.playerJourneys.map((journey) => journey.loggedOut),
}));
