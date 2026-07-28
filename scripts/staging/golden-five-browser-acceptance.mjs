#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = String(
  process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173",
).replace(/\/$/, "");
const OUTPUT_DIR = String(
  process.env.ECONOVARIA_GOLDEN_BROWSER_OUTPUT_DIR ||
    "/tmp/econovaria-golden-five/browser",
).trim();
const GAME_JOIN_CODE = "ECO-GOLDEN-FIVE-584";
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const ROUTES = Object.freeze([
  "dashboard",
  "world",
  "banking",
  "store",
  "contracts",
  "market",
  "inventory",
  "progression",
]);

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const PLAYERS = Object.freeze([
  {
    slot: 1,
    playerId: "GOLD-ALPHA",
    accessCode: required("ECONOVARIA_GOLDEN_ALPHA_ACCESS_CODE"),
  },
  {
    slot: 2,
    playerId: "GOLD-BRAVO",
    accessCode: required("ECONOVARIA_GOLDEN_BRAVO_ACCESS_CODE"),
  },
  {
    slot: 3,
    playerId: "GOLD-CHARLIE",
    accessCode: required("ECONOVARIA_GOLDEN_CHARLIE_ACCESS_CODE"),
  },
  {
    slot: 4,
    playerId: "GOLD-DELTA",
    accessCode: required("ECONOVARIA_GOLDEN_DELTA_ACCESS_CODE"),
  },
  {
    slot: 5,
    playerId: "GOLD-ECHO",
    accessCode: required("ECONOVARIA_GOLDEN_ECHO_ACCESS_CODE"),
  },
]);

const sensitiveValues = [
  GAME_JOIN_CODE,
  ...PLAYERS.flatMap((player) => [player.playerId, player.accessCode]),
].sort((left, right) => right.length - left.length);

function redact(value) {
  let output = String(value ?? "");
  for (const sensitive of sensitiveValues) {
    output = output.split(sensitive).join("[fixture-value-redacted]");
  }
  return output
    .replace(UUID_PATTERN, "[uuid-redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt-redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[supabase-key-redacted]");
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search ? "?[query-redacted]" : ""}`;
  } catch {
    return redact(value);
  }
}

function instrument(page, journey) {
  page.on("console", (message) => {
    if (message.type() === "error") journey.consoleErrors.push(redact(message.text()));
  });
  page.on("pageerror", (error) => journey.pageErrors.push(redact(error?.message || error)));
  page.on("request", (request) => {
    const url = request.url();
    if (!url.includes("/functions/v1/") && !url.includes("/auth/v1/")) return;
    const headers = request.headers();
    if (headers.authorization !== undefined) {
      journey.securityFailures.push(`Browser exposed Authorization on ${request.method()} ${safeUrl(url)}.`);
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/functions/v1/") && !url.includes("/auth/v1/")) return;
    journey.requests.push({
      method: response.request().method(),
      path: safeUrl(url),
      status: response.status(),
    });
  });
}

function assertNoFailedRequests(journey, label, startIndex = 0) {
  const failed = journey.requests.slice(startIndex).filter((entry) => entry.status >= 400);
  if (failed.length > 0) {
    throw new Error(`${label} observed failed requests: ${JSON.stringify(failed)}`);
  }
}

async function loginPlayer(browser, player) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const journey = {
    slot: player.slot,
    loginStatus: null,
    requests: [],
    routes: [],
    consoleErrors: [],
    pageErrors: [],
    securityFailures: [],
    refreshPersisted: false,
    loggedOut: false,
  };
  instrument(page, journey);

  await page.goto(`${BASE_URL}/?mode=player&gameCode=${encodeURIComponent(GAME_JOIN_CODE)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.locator("#gameCode").waitFor({ state: "visible", timeout: 30_000 });
  const gameCodeValue = await page.locator("#gameCode").inputValue();
  if (gameCodeValue !== GAME_JOIN_CODE) throw new Error(`Player ${player.slot} did not receive the complete Game Code.`);

  await page.locator("#playerId").fill(player.playerId);
  await page.locator("#playerAccessCode").fill(player.accessCode);
  const requestStart = journey.requests.length;
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/functions/v1/player-web-session-api/login") &&
      response.request().method() === "POST",
    { timeout: 120_000 },
  );
  await page.locator("#playerForm button[type='submit']").click();
  const loginResponse = await loginResponsePromise;
  journey.loginStatus = loginResponse.status();
  if (loginResponse.status() !== 200) {
    throw new Error(`Player ${player.slot} login returned ${loginResponse.status()}.`);
  }

  await page.waitForURL(/\/player-terminal\/(?:index\.html)?(?:#.*)?$/, { timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(1000);
  assertNoFailedRequests(journey, `Player ${player.slot} login`, requestStart);

  return { context, page, journey, player };
}

async function visitRoute(session, route) {
  const { page, journey } = session;
  const requestStart = journey.requests.length;
  const control = page.locator(`[data-route="${route}"]:visible`).first();
  await control.waitFor({ state: "visible", timeout: 30_000 });
  const unavailable = await control.evaluate(
    (node) => node.getAttribute("aria-disabled") === "true" || Boolean(node.disabled),
  );
  if (unavailable) throw new Error(`Player ${journey.slot} route ${route} is visible but disabled.`);

  await control.click();
  await page.waitForFunction(
    (expected) => window.location.hash === `#${expected}`,
    route,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(1000);

  const errorShell = page.locator(
    ".player-terminal-route-error, .player-terminal-error-shell, [data-player-route-error]",
  );
  if (await errorShell.count()) {
    throw new Error(
      `Player ${journey.slot} route ${route} rendered an error state: ${redact(
        await errorShell.first().innerText(),
      )}`,
    );
  }

  const host = page.locator(".player-terminal-page-host");
  await host.waitFor({ state: "visible", timeout: 30_000 });
  const text = String(await host.innerText()).replace(/\s+/g, " ").trim();
  if (text.length < 40) throw new Error(`Player ${journey.slot} route ${route} rendered insufficient live content.`);
  if (/SECTION UNAVAILABLE|VIEW COULD NOT BE RENDERED|WORLD UNAVAILABLE|ROUTE_NOT_FOUND/i.test(text)) {
    throw new Error(`Player ${journey.slot} route ${route} exposed an unavailable-state message.`);
  }
  UUID_PATTERN.lastIndex = 0;
  if (UUID_PATTERN.test(text)) throw new Error(`Player ${journey.slot} route ${route} exposed a raw internal UUID.`);

  assertNoFailedRequests(journey, `Player ${journey.slot} route ${route}`, requestStart);
  journey.routes.push({ route, live: true });
}

async function exercisePlayer(session) {
  for (const route of ROUTES) await visitRoute(session, route);

  const { page, journey } = session;
  const expectedHash = page.url().includes("#") ? new URL(page.url()).hash : "#dashboard";
  const requestStart = journey.requests.length;
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(1200);
  if (!page.url().endsWith(expectedHash)) {
    throw new Error(`Player ${journey.slot} did not preserve the active route across refresh.`);
  }
  const returnedToLogin = await page.locator("#playerForm:visible").count();
  if (returnedToLogin) throw new Error(`Player ${journey.slot} lost the web session during refresh.`);
  assertNoFailedRequests(journey, `Player ${journey.slot} refresh`, requestStart);
  journey.refreshPersisted = true;

  const logout = page.locator('[data-player-action="logout"]:visible').first();
  await logout.waitFor({ state: "visible", timeout: 30_000 });
  const logoutStart = journey.requests.length;
  await logout.click();
  await page.waitForURL(/reason=logged-out/, { timeout: 60_000 });
  assertNoFailedRequests(journey, `Player ${journey.slot} logout`, logoutStart);
  journey.loggedOut = true;
}

await mkdir(OUTPUT_DIR, { recursive: true });
const evidence = {
  schemaVersion: 1,
  evidenceType: "econovaria-golden-five-browser-acceptance",
  capturedAt: new Date().toISOString(),
  baseUrl: new URL(BASE_URL).origin,
  game: "Econovaria Golden Five",
  requestedConcurrency: PLAYERS.length,
  routes: ROUTES,
  journeys: [],
  decision: "FAIL",
};

let browser;
const sessions = [];
let failure;
try {
  browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
  const loggedIn = await Promise.all(
    PLAYERS.map((player) => loginPlayer(browser, player)),
  );
  sessions.push(...loggedIn);
  await Promise.all(sessions.map(exercisePlayer));
  evidence.journeys = sessions.map(({ journey }) => journey);

  for (const journey of evidence.journeys) {
    if (journey.loginStatus !== 200) throw new Error(`Player ${journey.slot} did not authenticate.`);
    if (journey.routes.length !== ROUTES.length) throw new Error(`Player ${journey.slot} did not complete every route.`);
    if (!journey.refreshPersisted || !journey.loggedOut) throw new Error(`Player ${journey.slot} did not complete session persistence and logout.`);
    if (journey.consoleErrors.length || journey.pageErrors.length || journey.securityFailures.length) {
      throw new Error(`Player ${journey.slot} emitted browser or security errors.`);
    }
  }
  evidence.decision = "PASS";
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
  evidence.journeys = sessions.map(({ journey }) => journey);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  const serialized = JSON.stringify(evidence);
  UUID_PATTERN.lastIndex = 0;
  if (UUID_PATTERN.test(serialized)) {
    failure ||= new Error("Browser evidence contains a raw UUID.");
    evidence.decision = "FAIL";
  }
  if (sensitiveValues.some((value) => serialized.includes(value))) {
    failure ||= new Error("Browser evidence contains a fixture credential or identifier.");
    evidence.decision = "FAIL";
  }
  await writeFile(
    `${OUTPUT_DIR}/golden-five-browser-acceptance.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  for (const session of sessions) await session.context.close().catch(() => {});
  await browser?.close().catch(() => {});
}

if (failure) throw failure;

console.log(JSON.stringify({
  ok: true,
  concurrentPlayers: evidence.journeys.length,
  routesPerPlayer: evidence.journeys.map((journey) => journey.routes.length),
  refreshPersisted: evidence.journeys.every((journey) => journey.refreshPersisted),
  decision: evidence.decision,
}));
