#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR || "/tmp/econovaria-player-browser";
const ADMIN_EMAIL = process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "player.e2e@example.test";
const ADMIN_PASSWORD = process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD || "Player-E2E-Admin-2026!";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Player Multiplayer E2E";
const PLAYER_ID = "BROWSER-PLAYER-BETA";
const ACCESS_CODE = "BROWSER-BETA-ACCESS-002";
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  notifications: {
    unreadObserved: false,
    markedRead: false,
    persisted: false,
    replaySafe: false,
    unauthenticatedRejected: false,
  },
  watchlist: {
    ticker: "",
    toggled: false,
    persisted: false,
    replaySafe: false,
    inversePersisted: false,
    unauthenticatedRejected: false,
  },
  requestBoundaryValid: false,
  requests: [],
  consoleErrors: [],
  pageErrors: [],
  responseUuidLeak: false,
};

function redact(value) {
  return String(value || "")
    .replace(UUID_PATTERN, "[uuid-redacted]")
    .replace(/ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}/g, "[game-code-redacted]")
    .replace(/BROWSER-[A-Z0-9-]+/g, "[credential-redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt-redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[supabase-key-redacted]");
}

async function parseJson(response) {
  return response.json().catch(() => null);
}

async function runtimeKey() {
  const response = await fetch(`${BASE_URL}/runtime-config.env.js`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Runtime configuration returned ${response.status()}.`);
  const match = (await response.text()).match(/Object\.freeze\((\{[\s\S]*\})\);?/);
  if (!match) throw new Error("Runtime configuration could not be parsed.");
  const key = String(JSON.parse(match[1]).supabasePublishableKey || "").trim();
  if (!key || key.startsWith("sb_secret_")) throw new Error("A browser-safe publishable key is required.");
  return key;
}

function platformHeaders(key, token = key) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${token}`,
  };
}

async function request(path, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  return { status: response.status, payload: await parseJson(response) };
}

async function gameFixture() {
  const key = await runtimeKey();
  const signIn = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: platformHeaders(key),
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (signIn.status !== 200 || !signIn.payload?.access_token) throw new Error(`Admin fixture sign-in returned ${signIn.status}.`);
  const bootstrap = await request("/functions/v1/classroom-api/staff/bootstrap", {
    headers: platformHeaders(key, signIn.payload.access_token),
  });
  if (bootstrap.status !== 200 || bootstrap.payload?.ok !== true) throw new Error(`Admin fixture bootstrap returned ${bootstrap.status}.`);
  const games = Array.isArray(bootstrap.payload.activeGameSessions) ? bootstrap.payload.activeGameSessions : [];
  const game = games.find((item) => item?.name === GAME_NAME) || games[0];
  const gameCode = String(game?.gameCode || game?.joinCode || "");
  if (!gameCode) throw new Error("Admin fixture could not resolve the connected Game Code.");
  return { key, gameCode };
}

function instrument(page) {
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(redact(message.text()));
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(redact(error?.message || error)));
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/functions/v1/classroom-api/")) return;
    evidence.requests.push({ method: response.request().method(), path: redact(new URL(url).pathname), status: response.status() });
    const type = response.headers()["content-type"] || "";
    if (!type.includes("application/json")) return;
    const body = await response.text().catch(() => "");
    UUID_PATTERN.lastIndex = 0;
    if (UUID_PATTERN.test(body)) evidence.responseUuidLeak = true;
  });
}

async function login(browser, gameCode) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  instrument(page);
  await page.goto(`${BASE_URL}/?mode=player&gameCode=${encodeURIComponent(gameCode)}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("#gameCode").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#playerId").fill(PLAYER_ID);
  await page.locator("#playerAccessCode").fill(ACCESS_CODE);
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/classroom-api/players/login") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.locator("#playerForm button[type='submit']").click();
  const response = await responsePromise;
  if (response.status() !== 200) throw new Error(`Player login returned ${response.status()}.`);
  await page.waitForURL(/\/player-terminal\/(?:index\.html)?(?:#.*)?$/, { timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  return { context, page };
}

async function openRoute(page, route, selector) {
  await page.locator(`[data-route="${route}"]:visible`).first().click();
  await page.waitForFunction((target) => location.hash === `#${target}`, route, { timeout: 30_000 });
  await page.locator(selector).waitFor({ state: "visible", timeout: 30_000 });
}

async function reloadReady(page) {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
}

async function capture(response) {
  const requestRecord = response.request();
  const allHeaders = await requestRecord.allHeaders();
  const allowed = new Set([
    "accept", "apikey", "authorization", "content-type", "idempotency-key",
    "x-player-session-token", "x-request-id",
  ]);
  return {
    url: response.url(),
    body: requestRecord.postData() || "{}",
    headers: Object.fromEntries(Object.entries(allHeaders).filter(([name]) => allowed.has(name.toLowerCase()))),
  };
}

async function replay(page, original) {
  return page.evaluate(async ({ url, headers, body }) => {
    const response = await fetch(url, { method: "POST", headers, body, cache: "no-store" });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }, original);
}

async function openNotifications(page) {
  const toggle = page.locator('[data-player-local-action="toggle-notifications"]:visible').first();
  await toggle.click();
  const drawer = page.locator("[data-player-notification-drawer]:visible");
  await drawer.waitFor({ state: "visible", timeout: 30_000 });
  return drawer;
}

async function proveNotifications(page, fixture) {
  const drawer = await openNotifications(page);
  const markRead = drawer.locator('[data-player-action="notifications-read"]');
  await markRead.waitFor({ state: "visible", timeout: 30_000 });
  if (!(await markRead.isEnabled())) throw new Error("Recipient did not have a real unread notification after Messaging.");
  evidence.notifications.unreadObserved = true;

  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/notifications/read") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await markRead.click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  if (response.status() !== 200 || payload?.ok !== true) {
    throw new Error(`Notification read mutation returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  const original = await capture(response);
  const body = JSON.parse(original.body);
  if (JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(["readAt"]) || typeof body.readAt !== "string") {
    throw new Error(`Notification read mutation forwarded an unexpected body: ${redact(JSON.stringify(body))}`);
  }
  evidence.requestBoundaryValid = true;
  evidence.notifications.markedRead = true;

  await reloadReady(page);
  const persistedDrawer = await openNotifications(page);
  const persistedButton = persistedDrawer.locator('[data-player-action="notifications-read"]');
  if (await persistedButton.isEnabled()) throw new Error("Notification read state did not persist after reload.");
  evidence.notifications.persisted = true;

  const replayResult = await replay(page, original);
  if (replayResult.status !== 200 || replayResult.payload?.ok !== true) {
    throw new Error(`Notification read replay failed: ${replayResult.status} ${redact(JSON.stringify(replayResult.payload))}`);
  }
  await reloadReady(page);
  const replayDrawer = await openNotifications(page);
  if (await replayDrawer.locator('[data-player-action="notifications-read"]').isEnabled()) {
    throw new Error("Notification read replay restored unread state.");
  }
  evidence.notifications.replaySafe = true;

  const unauthorized = await request(new URL(original.url).pathname, {
    method: "POST",
    headers: platformHeaders(fixture.key),
    body,
  });
  if (![401, 403].includes(unauthorized.status)) throw new Error(`Unauthenticated notification read was not rejected: ${unauthorized.status}.`);
  evidence.notifications.unauthenticatedRejected = true;
}

async function proveWatchlist(page, fixture) {
  await openRoute(page, "market", ".player-terminal-market-page");
  const control = page.locator("[data-player-market-watchlist]:visible").first();
  await control.waitFor({ state: "visible", timeout: 30_000 });
  const ticker = String(await control.getAttribute("data-player-market-watchlist"));
  if (!/^[A-Z0-9][A-Z0-9._-]{0,15}$/.test(ticker)) throw new Error("Watchlist control did not expose a bounded public ticker.");
  const before = await control.evaluate((element) => element.classList.contains("is-watchlisted"));
  evidence.watchlist.ticker = ticker;

  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/stocks/watchlist") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await control.click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  if (response.status() !== 200 || payload?.ok !== true) {
    throw new Error(`Watchlist mutation returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  const original = await capture(response);
  const body = JSON.parse(original.body);
  const expectedAction = before ? "remove" : "add";
  if (JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(["action", "ticker"]) || body.ticker !== ticker || body.action !== expectedAction) {
    throw new Error(`Watchlist mutation body did not match the rendered state: ${redact(JSON.stringify(body))}`);
  }
  evidence.watchlist.toggled = true;

  await reloadReady(page);
  await openRoute(page, "market", ".player-terminal-market-page");
  const persisted = page.locator(`[data-player-market-watchlist="${ticker}"]`).first();
  const persistedState = await persisted.evaluate((element) => element.classList.contains("is-watchlisted"));
  if (persistedState === before) throw new Error("Watchlist mutation did not persist after reload.");
  evidence.watchlist.persisted = true;

  const replayResult = await replay(page, original);
  if (replayResult.status !== 200 || replayResult.payload?.ok !== true) {
    throw new Error(`Watchlist replay failed: ${replayResult.status} ${redact(JSON.stringify(replayResult.payload))}`);
  }
  await reloadReady(page);
  await openRoute(page, "market", ".player-terminal-market-page");
  const replayState = await page.locator(`[data-player-market-watchlist="${ticker}"]`).first().evaluate((element) => element.classList.contains("is-watchlisted"));
  if (replayState !== persistedState) throw new Error("Watchlist replay changed the terminal state.");
  evidence.watchlist.replaySafe = true;

  const inverseControl = page.locator(`[data-player-market-watchlist="${ticker}"]`).first();
  const inversePromise = page.waitForResponse(
    (candidate) => new URL(candidate.url()).pathname.endsWith("/players/me/stocks/watchlist") && candidate.request().method() === "POST",
    { timeout: 60_000 },
  );
  await inverseControl.click();
  const inverseResponse = await inversePromise;
  if (inverseResponse.status() !== 200) throw new Error(`Inverse watchlist mutation returned ${inverseResponse.status()}.`);
  await reloadReady(page);
  await openRoute(page, "market", ".player-terminal-market-page");
  const restoredState = await page.locator(`[data-player-market-watchlist="${ticker}"]`).first().evaluate((element) => element.classList.contains("is-watchlisted"));
  if (restoredState !== before) throw new Error("Inverse watchlist mutation did not restore the starting state.");
  evidence.watchlist.inversePersisted = true;

  const unauthorized = await request(new URL(original.url).pathname, {
    method: "POST",
    headers: platformHeaders(fixture.key),
    body,
  });
  if (![401, 403].includes(unauthorized.status)) throw new Error(`Unauthenticated watchlist mutation was not rejected: ${unauthorized.status}.`);
  evidence.watchlist.unauthenticatedRejected = true;
}

let browser;
let context;
let failure;
try {
  const fixture = await gameFixture();
  browser = await chromium.launch({ headless: true });
  const player = await login(browser, fixture.gameCode);
  context = player.context;
  await proveNotifications(player.page, fixture);
  await proveWatchlist(player.page, fixture);

  if (evidence.responseUuidLeak) throw new Error("A connected Player state-control response exposed a raw internal UUID.");
  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`Player state-control browser errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
  }
  if (!Object.values(evidence.notifications).every(Boolean) || !Object.values(evidence.watchlist).every(Boolean)) {
    throw new Error("Connected Player state-control evidence is incomplete.");
  }
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(
    `${OUTPUT_DIR}/business-banking-player-state-controls-browser-acceptance.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}

if (failure) throw failure;

console.log(JSON.stringify({
  ok: true,
  notifications: evidence.notifications,
  watchlist: evidence.watchlist,
  requestBoundaryValid: evidence.requestBoundaryValid,
}));
