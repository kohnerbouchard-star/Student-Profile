#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR || "/tmp/econovaria-player-browser";
const ADMIN_EMAIL = process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "player.e2e@example.test";
const ADMIN_PASSWORD = process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD || "Player-E2E-Admin-2026!";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Player Multiplayer E2E";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PLAYER_ID = "BROWSER-PLAYER-ALPHA";
const ACCESS_CODE = "BROWSER-ALPHA-ACCESS-001";
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  deterministicCalendarFixtureInstalled: false,
  deterministicCalendarFixtureRestored: false,
  ticker: "",
  buy: { filled: false, holdingPersisted: false, cashPersisted: false, replaySafe: false },
  sell: { filled: false, holdingPersisted: false, cashPersisted: false, replaySafe: false },
  stalePriceRejected: false,
  forbiddenScopeRejected: false,
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

function psql(sql) {
  return execFileSync("psql", [DATABASE_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function installOpenCalendarFixture() {
  const original = psql("select pg_get_functiondef('public.is_stock_market_open_at(uuid,timestamptz)'::regprocedure);");
  if (!original.includes("is_stock_market_open_at")) throw new Error("Could not capture the authoritative market calendar function.");
  psql(`
    create or replace function public.is_stock_market_open_at(
      p_game_session_id uuid,
      p_at timestamptz default now()
    ) returns boolean
    language sql
    stable
    security definer
    set search_path = public, pg_temp
    as $$
      select exists (
        select 1 from public.game_sessions game_session
        where game_session.id = p_game_session_id
          and game_session.status = 'active'
      ) and p_at is not null
    $$;
  `);
  evidence.deterministicCalendarFixtureInstalled = true;
  return original;
}

function restoreCalendarFixture(definition) {
  if (!definition) return;
  psql(definition);
  evidence.deterministicCalendarFixtureRestored = true;
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

async function openMarket(page) {
  await openRoute(page, "market", ".player-terminal-market-page");
}

async function reloadMarket(page) {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  await openMarket(page);
}

async function cash(page) {
  await openRoute(page, "banking", ".player-terminal-banking-page");
  const card = page.locator('[data-player-banking-balance^="cash:"], [data-player-banking-balance^="checking:"]').first();
  await card.waitFor({ state: "visible", timeout: 30_000 });
  const text = String(await card.locator("h3").innerText()).replace(/,/g, "");
  const amount = Number(text.match(/-?[0-9]+(?:\.[0-9]{1,2})?/)?.[0]);
  if (!Number.isFinite(amount)) throw new Error(`Could not parse Player cash from ${redact(text)}.`);
  return amount;
}

async function chooseTradableAsset(page) {
  await openMarket(page);
  const rows = page.locator("[data-player-market-select]");
  for (let index = 0; index < await rows.count(); index += 1) {
    const row = rows.nth(index);
    const text = String(await row.innerText());
    if (/\bINDEX\b|COMPOSITE/i.test(text)) continue;
    await row.click();
    const ticket = page.locator('form[data-endpoint="marketOrder"]');
    await ticket.waitFor({ state: "visible", timeout: 30_000 });
    const symbol = String(await page.locator(".player-terminal-order-ticket strong").first().innerText()).trim();
    const priceText = String(await page.locator(".player-terminal-selected-price > strong").innerText()).replace(/,/g, "");
    const price = Number(priceText.match(/[0-9]+(?:\.[0-9]{1,4})?/)?.[0]);
    if (symbol && Number.isFinite(price) && price > 0) return { symbol, price };
  }
  throw new Error("No non-index tradable market asset was rendered.");
}

async function selectTicker(page, ticker) {
  const row = page.locator("[data-player-market-select]").filter({ hasText: ticker }).first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
  await row.click();
  await page.locator(".player-terminal-order-ticket").getByText(ticker, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
}

async function position(page) {
  const text = String(await page.locator(".player-terminal-position-strip").innerText()).replace(/,/g, " ").replace(/\s+/g, " ");
  const quantity = Number(text.match(/YOUR POSITION\s+([0-9]+(?:\.[0-9]+)?)\s+shares/i)?.[1]);
  if (!Number.isFinite(quantity)) throw new Error(`Could not parse market position from ${redact(text)}.`);
  return quantity;
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

async function executeRenderedOrder(page, ticker, side) {
  await openMarket(page);
  await selectTicker(page, ticker);
  const form = page.locator('form[data-endpoint="marketOrder"]');
  const sideInput = form.locator(`[name="side"][value="${side}"]`);
  const sideControl = sideInput.locator("xpath=ancestor::label[1]");
  await sideControl.click();
  if (!(await sideInput.isChecked())) throw new Error(`Rendered ${side} order control did not select its radio input.`);
  await form.locator('[name="orderType"]').selectOption("market");
  await form.locator('[name="quantity"]').fill("1");
  await form.locator('button[type="submit"]').click();
  const dialog = page.locator("[data-player-market-order-dialog]");
  await dialog.waitFor({ state: "visible", timeout: 30_000 });
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/stocks/orders") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await dialog.locator("[data-player-market-order-confirm]").click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  if (response.status() !== 200 || payload?.ok !== true || payload?.order?.status !== "filled") {
    throw new Error(`${side} market order returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  await page.locator("[data-player-market-order-dialog]").getByText("FILLED", { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
  const original = await capture(response);
  const body = JSON.parse(original.body);
  const keys = Object.keys(body).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["expectedPrice", "idempotencyKey", "quantity", "side", "ticker"])) {
    throw new Error(`Market order forwarded unexpected fields: ${keys.join(", ")}.`);
  }
  if (body.ticker !== ticker || body.side !== side || body.quantity !== 1 || !(body.expectedPrice > 0) || typeof body.idempotencyKey !== "string") {
    throw new Error(`Market order body did not match the rendered review: ${redact(JSON.stringify(body))}`);
  }
  for (const forbidden of ["gameSessionId", "gameId", "playerId", "playerSessionId", "stockAssetId", "orderType"]) {
    if (Object.prototype.hasOwnProperty.call(body, forbidden)) throw new Error(`Market order forwarded forbidden field ${forbidden}.`);
  }
  UUID_PATTERN.lastIndex = 0;
  if (UUID_PATTERN.test(original.body) || UUID_PATTERN.test(new URL(original.url).pathname)) throw new Error("Market order exposed an internal UUID.");
  evidence.requestBoundaryValid = true;
  return { payload, original };
}

async function assertReplaySafe(page, order, expectedHolding, expectedCash) {
  const result = await replay(page, order.original);
  if (result.status !== 200 || result.payload?.ok !== true || result.payload?.order?.status !== "filled") {
    throw new Error(`Market order replay failed: ${result.status} ${redact(JSON.stringify(result.payload))}`);
  }
  if (Number(result.payload?.holding?.quantity) !== expectedHolding || Math.abs(Number(result.payload?.cash?.balance) - expectedCash) > 0.001) {
    throw new Error("Market order replay returned a different terminal result.");
  }
  await reloadMarket(page);
  await selectTicker(page, evidence.ticker);
  const holding = await position(page);
  const cashBalance = await cash(page);
  if (holding !== expectedHolding || Math.abs(cashBalance - expectedCash) > 0.001) {
    throw new Error(`Market order replay duplicated a mutation: ${JSON.stringify({ holding, cashBalance, expectedHolding, expectedCash })}.`);
  }
}

let browser;
let context;
let originalCalendarDefinition = "";
let failure;
try {
  originalCalendarDefinition = installOpenCalendarFixture();
  const fixture = await gameFixture();
  browser = await chromium.launch({ headless: true });
  const player = await login(browser, fixture.gameCode);
  context = player.context;
  const { page } = player;

  const asset = await chooseTradableAsset(page);
  evidence.ticker = asset.symbol;
  const holdingBefore = await position(page);
  const cashBefore = await cash(page);

  const buy = await executeRenderedOrder(page, asset.symbol, "buy");
  evidence.buy.filled = true;
  await reloadMarket(page);
  await selectTicker(page, asset.symbol);
  const holdingAfterBuy = await position(page);
  if (holdingAfterBuy !== holdingBefore + 1) throw new Error(`Buy holding did not persist: ${holdingBefore} -> ${holdingAfterBuy}.`);
  evidence.buy.holdingPersisted = true;
  const cashAfterBuy = await cash(page);
  if (!(cashAfterBuy < cashBefore)) throw new Error(`Buy order did not debit cash: ${cashBefore} -> ${cashAfterBuy}.`);
  evidence.buy.cashPersisted = true;
  await assertReplaySafe(page, buy, holdingAfterBuy, cashAfterBuy);
  evidence.buy.replaySafe = true;

  const sell = await executeRenderedOrder(page, asset.symbol, "sell");
  evidence.sell.filled = true;
  await reloadMarket(page);
  await selectTicker(page, asset.symbol);
  const holdingAfterSell = await position(page);
  if (holdingAfterSell !== holdingBefore) throw new Error(`Sell holding did not persist: ${holdingAfterBuy} -> ${holdingAfterSell}.`);
  evidence.sell.holdingPersisted = true;
  const cashAfterSell = await cash(page);
  if (!(cashAfterSell > cashAfterBuy)) throw new Error(`Sell order did not credit cash: ${cashAfterBuy} -> ${cashAfterSell}.`);
  evidence.sell.cashPersisted = true;
  await assertReplaySafe(page, sell, holdingAfterSell, cashAfterSell);
  evidence.sell.replaySafe = true;

  const orderPath = new URL(buy.original.url).pathname;
  const buyBody = JSON.parse(buy.original.body);
  const stale = await request(orderPath, {
    method: "POST",
    headers: buy.original.headers,
    body: {
      ...buyBody,
      expectedPrice: buyBody.expectedPrice + 1,
      idempotencyKey: `${buyBody.idempotencyKey}-stale`,
    },
  });
  if (stale.status !== 409 || stale.payload?.error?.code !== "stale_stock_price") {
    throw new Error(`Stale-price order was not rejected: ${stale.status} ${redact(JSON.stringify(stale.payload))}`);
  }
  evidence.stalePriceRejected = true;

  const forbidden = await request(orderPath, {
    method: "POST",
    headers: buy.original.headers,
    body: {
      ...buyBody,
      playerId: "attacker-controlled",
      idempotencyKey: `${buyBody.idempotencyKey}-scope`,
    },
  });
  if (forbidden.status !== 400 || forbidden.payload?.error?.code !== "invalid_stock_market_trading_request") {
    throw new Error(`Client ownership-field order was not rejected: ${forbidden.status} ${redact(JSON.stringify(forbidden.payload))}`);
  }
  evidence.forbiddenScopeRejected = true;

  const unauthorized = await request(orderPath, {
    method: "POST",
    headers: platformHeaders(fixture.key),
    body: buyBody,
  });
  if (![401, 403].includes(unauthorized.status)) throw new Error(`Unauthenticated market order was not rejected: ${unauthorized.status}.`);
  evidence.unauthenticatedRejected = true;

  if (evidence.responseUuidLeak) throw new Error("A connected market response exposed a raw internal UUID.");
  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`Market browser errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
  }
  if (!Object.values(evidence.buy).every(Boolean) || !Object.values(evidence.sell).every(Boolean)) {
    throw new Error("Connected market-order evidence is incomplete.");
  }
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  try {
    restoreCalendarFixture(originalCalendarDefinition);
  } catch (restoreError) {
    evidence.calendarRestoreFailure = redact(restoreError?.stack || restoreError);
    if (!failure) failure = restoreError;
  }
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(
    `${OUTPUT_DIR}/business-banking-player-market-browser-acceptance.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}

if (failure) throw failure;

console.log(JSON.stringify({
  ok: true,
  ticker: evidence.ticker,
  buy: evidence.buy,
  sell: evidence.sell,
  stalePriceRejected: evidence.stalePriceRejected,
  forbiddenScopeRejected: evidence.forbiddenScopeRejected,
}));
