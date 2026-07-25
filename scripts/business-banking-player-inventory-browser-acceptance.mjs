#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR || "/tmp/econovaria-player-browser";
const ADMIN_EMAIL = process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "player.e2e@example.test";
const ADMIN_PASSWORD = process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD || "Player-E2E-Admin-2026!";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Player Multiplayer E2E";
const PLAYER_ID = "BROWSER-PLAYER-ALPHA";
const ACCESS_CODE = "BROWSER-ALPHA-ACCESS-001";
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  itemKey: "",
  itemName: "",
  requestCreated: false,
  reservationPersisted: false,
  replayedWithoutDuplicateReservation: false,
  unauthenticatedRejected: false,
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
  if (!response.ok) throw new Error(`Runtime configuration returned ${response.status}.`);
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
  if (signIn.status !== 200 || !signIn.payload?.access_token) {
    throw new Error(`Admin fixture sign-in returned ${signIn.status}.`);
  }
  const bootstrap = await request("/functions/v1/classroom-api/staff/bootstrap", {
    headers: platformHeaders(key, signIn.payload.access_token),
  });
  if (bootstrap.status !== 200 || bootstrap.payload?.ok !== true) {
    throw new Error(`Admin fixture bootstrap returned ${bootstrap.status}.`);
  }
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
    evidence.requests.push({
      method: response.request().method(),
      path: redact(new URL(url).pathname),
      status: response.status(),
    });
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
  await page.goto(`${BASE_URL}/?mode=player&gameCode=${encodeURIComponent(gameCode)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
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

async function openInventory(page) {
  await page.locator('[data-route="inventory"]:visible').first().click();
  await page.waitForFunction(() => location.hash === "#inventory", undefined, { timeout: 30_000 });
  await page.locator(".player-terminal-inventory-page").waitFor({ state: "visible", timeout: 30_000 });
}

async function reloadInventory(page) {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  await openInventory(page);
}

function cardForName(page, name) {
  return page.getByText(name, { exact: true }).locator("xpath=ancestor::article[contains(@class,'player-terminal-inventory-card')][1]");
}

async function quantities(card) {
  const text = String(await card.innerText()).replace(/,/g, " ").replace(/\s+/g, " ");
  const available = Number(text.match(/AVAILABLE\s+(\d+)/i)?.[1]);
  const reserved = Number(text.match(/RESERVED\s+(\d+)/i)?.[1]);
  if (!Number.isSafeInteger(available) || !Number.isSafeInteger(reserved)) {
    throw new Error(`Could not parse Inventory quantities from ${redact(text)}.`);
  }
  return { available, reserved };
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

let browser;
let context;
let failure;
try {
  const fixture = await gameFixture();
  browser = await chromium.launch({ headless: true });
  const player = await login(browser, fixture.gameCode);
  context = player.context;
  const { page } = player;
  await openInventory(page);

  const use = page.locator("[data-player-inventory-use]:visible").first();
  await use.waitFor({ state: "visible", timeout: 30_000 });
  const itemKey = String(await use.getAttribute("data-player-inventory-use"));
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(itemKey)) throw new Error("Inventory use control did not expose a bounded public item key.");
  const card = use.locator("xpath=ancestor::article[contains(@class,'player-terminal-inventory-card')][1]");
  const name = String(await card.locator("h3").innerText());
  const before = await quantities(card);
  evidence.itemKey = itemKey;
  evidence.itemName = name;

  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/players/me/inventory/${itemKey}/redemptions`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await use.click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  if (response.status() !== 200 || payload?.ok !== true || payload?.outcome !== "created") {
    throw new Error(`Inventory redemption returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  const original = await capture(response);
  const requestBody = JSON.parse(original.body);
  const keys = Object.keys(requestBody).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["idempotencyKey", "quantity"])) {
    throw new Error(`Inventory redemption forwarded unexpected fields: ${keys.join(", ")}.`);
  }
  if (requestBody.quantity !== 1 || typeof requestBody.idempotencyKey !== "string") {
    throw new Error("Inventory redemption did not send the bounded quantity and idempotency key.");
  }
  for (const forbidden of ["gameSessionId", "gameId", "playerId", "playerUuid", "playerSessionId", "inventoryHoldingId"]) {
    if (Object.prototype.hasOwnProperty.call(requestBody, forbidden)) throw new Error(`Inventory redemption forwarded forbidden field ${forbidden}.`);
  }
  UUID_PATTERN.lastIndex = 0;
  if (UUID_PATTERN.test(new URL(original.url).pathname) || UUID_PATTERN.test(original.body)) {
    throw new Error("Inventory redemption exposed an internal UUID.");
  }
  evidence.requestBoundaryValid = true;
  evidence.requestCreated = true;

  await reloadInventory(page);
  const after = await quantities(cardForName(page, name));
  if (after.available !== before.available - 1 || after.reserved !== before.reserved + 1) {
    throw new Error(`Inventory reservation did not persist exactly once: ${JSON.stringify({ before, after })}.`);
  }
  evidence.reservationPersisted = true;

  const replayResult = await replay(page, original);
  if (replayResult.status !== 200 || replayResult.payload?.ok !== true || replayResult.payload?.outcome !== "replayed") {
    throw new Error(`Inventory redemption replay was not recognized: ${replayResult.status} ${redact(JSON.stringify(replayResult.payload))}`);
  }
  await reloadInventory(page);
  const afterReplay = await quantities(cardForName(page, name));
  if (afterReplay.available !== after.available || afterReplay.reserved !== after.reserved) {
    throw new Error(`Inventory redemption replay duplicated the reservation: ${JSON.stringify({ after, afterReplay })}.`);
  }
  evidence.replayedWithoutDuplicateReservation = true;

  const unauthorized = await request(new URL(original.url).pathname, {
    method: "POST",
    headers: platformHeaders(fixture.key),
    body: requestBody,
  });
  if (![401, 403].includes(unauthorized.status)) {
    throw new Error(`Unauthenticated Inventory redemption was not rejected: ${unauthorized.status}.`);
  }
  evidence.unauthenticatedRejected = true;

  if (evidence.responseUuidLeak) throw new Error("A connected Inventory response exposed a raw internal UUID.");
  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`Inventory browser errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
  }
  for (const [key, value] of Object.entries(evidence)) {
    if (typeof value === "boolean" && value !== true) throw new Error(`Inventory evidence ${key} is incomplete.`);
  }
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(
    `${OUTPUT_DIR}/business-banking-player-inventory-browser-acceptance.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}

if (failure) throw failure;

console.log(JSON.stringify({
  ok: true,
  itemKey: evidence.itemKey,
  requestCreated: evidence.requestCreated,
  replayedWithoutDuplicateReservation: evidence.replayedWithoutDuplicateReservation,
}));
