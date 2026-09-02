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
const ACCOUNT_KEY = /^bac_[0-9a-f]{32}$/u;
const QUOTE_KEY = /^sbq_[0-9a-f]{32}$/u;

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
    if (!url.includes("/functions/v1/classroom-api/") && !url.includes("/functions/v1/player-web-session-api/")) return;
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

async function chooseTradableAsset(page) {
  await openMarket(page);
  const rows = page.locator("[data-player-market-select]");
  for (let index = 0; index < await rows.count(); index += 1) {
    const row = rows.nth(index);
    const assetId = String(await row.getAttribute("data-player-market-select") || "").trim().toLowerCase();
    if (assetId === "cel-index") continue;
    await row.click();
    const buyForm = page.locator('form[data-player-market-order-form="buy-quote"]:visible');
    const sellForm = page.locator('form[data-player-market-order-form="sell-review"]:visible');
    await buyForm.waitFor({ state: "visible", timeout: 30_000 });
    await sellForm.waitFor({ state: "visible", timeout: 30_000 });
    const symbol = String(await buyForm.locator('[name="ticker"]').inputValue()).trim().toUpperCase();
    const price = Number(await buyForm.locator('[name="expectedPrice"]').inputValue());
    if (symbol && Number.isFinite(price) && price > 0) return { symbol, price };
  }
  throw new Error("No non-index tradable market asset was rendered.");
}

async function selectTicker(page, ticker) {
  const row = page.locator("[data-player-market-select]").filter({ hasText: ticker }).first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
  await row.click();
  const buyForm = page.locator('form[data-player-market-order-form="buy-quote"]:visible');
  const sellForm = page.locator('form[data-player-market-order-form="sell-review"]:visible');
  await buyForm.waitFor({ state: "visible", timeout: 30_000 });
  await sellForm.waitFor({ state: "visible", timeout: 30_000 });
  const expectedTicker = String(ticker || "").trim().toUpperCase();
  const buyTicker = String(await buyForm.locator('[name="ticker"]').inputValue()).trim().toUpperCase();
  const sellTicker = String(await sellForm.locator('[name="ticker"]').inputValue()).trim().toUpperCase();
  if (!expectedTicker || buyTicker !== expectedTicker || sellTicker !== expectedTicker) {
    throw new Error(`Market order tickets did not converge to ${expectedTicker || "the selected ticker"}: buy=${buyTicker || "none"}, sell=${sellTicker || "none"}.`);
  }
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

async function preservedSubmitValue(locator) {
  const preserved = await locator.getAttribute("data-player-market-submit-value");
  return preserved === null ? locator.inputValue() : preserved;
}

async function authenticatedContextRequest(page, path, { method = "GET", headers = {}, body } = {}) {
  const key = await runtimeKey();
  const response = await page.context().request.fetch(`${BASE_URL}${path}`, {
    method,
    headers: { ...platformHeaders(key), ...headers },
    data: body,
    failOnStatusCode: false,
  });
  return { status: response.status(), payload: await response.json().catch(() => null) };
}

async function replay(page, original) {
  const path = new URL(original.url).pathname;
  return authenticatedContextRequest(page, path, {
    method: "POST",
    headers: original.headers,
    body: JSON.parse(original.body),
  });
}

function assertPublicReplayPayload(payload, label) {
  const body = JSON.stringify(payload);
  UUID_PATTERN.lastIndex = 0;
  if (UUID_PATTERN.test(body)) throw new Error(`${label} replay verification exposed an internal UUID.`);
}

async function readReplayState(page, ticker, accountKey = "") {
  const [portfolio, banking] = await Promise.all([
    authenticatedContextRequest(page, "/functions/v1/player-web-session-api/proxy/players/me/stocks/portfolio"),
    authenticatedContextRequest(page, "/functions/v1/player-web-session-api/proxy/players/me/ledger?limit=50"),
  ]);
  if (portfolio.status !== 200 || portfolio.payload?.ok !== true || !Array.isArray(portfolio.payload?.holdings)) {
    throw new Error(`Portfolio replay verification returned ${portfolio.status}: ${redact(JSON.stringify(portfolio.payload))}`);
  }
  if (banking.status !== 200 || banking.payload?.ok !== true || !Array.isArray(banking.payload?.currentBalances)) {
    throw new Error(`Banking replay verification returned ${banking.status}: ${redact(JSON.stringify(banking.payload))}`);
  }
  assertPublicReplayPayload(portfolio.payload, "Portfolio");
  assertPublicReplayPayload(banking.payload, "Banking");
  const holding = portfolio.payload.holdings.find((item) => String(item?.ticker || "").toUpperCase() === ticker.toUpperCase());
  const checking = banking.payload.currentBalances.find((item) =>
    accountKey
      ? String(item?.accountKey || "").toLowerCase() === accountKey.toLowerCase()
      : String(item?.accountType || "").toLowerCase() === "checking"
  );
  const holdingQuantity = Number(holding?.quantity ?? 0);
  const cashBalance = Number(checking?.balance);
  if (!Number.isFinite(holdingQuantity) || !Number.isFinite(cashBalance)) {
    throw new Error(`Replay verification returned invalid authoritative state: ${redact(JSON.stringify({ holding, checking }))}`);
  }
  return { holdingQuantity, cashBalance };
}

function assertRequestBoundary(body, side) {
  const keys = Object.keys(body).sort();
  const expected = side === "buy"
    ? ["action", "idempotencyKey", "quoteKey"].sort()
    : ["action", "destinationAccountKey", "expectedPrice", "expectedTickIndex", "idempotencyKey", "quantity", "ticker"].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new Error(`${side} settlement forwarded unexpected fields: ${keys.join(", ")}.`);
  }
  for (const forbidden of ["gameSessionId", "gameId", "playerId", "playerSessionId", "stockAssetId", "orderType"]) {
    if (Object.prototype.hasOwnProperty.call(body, forbidden)) throw new Error(`Market settlement forwarded forbidden field ${forbidden}.`);
  }
}

async function executeBuy(page, ticker) {
  await openMarket(page);
  await selectTicker(page, ticker);
  const form = page.locator('form[data-player-market-order-form="buy-quote"]:visible');
  const quantity = Number(await preservedSubmitValue(form.locator('[name="quantity"]')));
  if (quantity !== 1) throw new Error(`Buy quote did not preserve the canonical quantity: ${quantity}.`);
  const fundingAccountKey = String(await preservedSubmitValue(form.locator('[name="sourceAccountKey1"]'))).trim().toLowerCase();
  if (!ACCOUNT_KEY.test(fundingAccountKey)) throw new Error("Buy quote did not expose an owned Checking funding account.");
  const expectedPrice = Number(await preservedSubmitValue(form.locator('[name="expectedPrice"]')));
  if (!(expectedPrice > 0)) throw new Error("Buy quote did not expose a positive canonical expected price.");
  const targetAmount = Number(await preservedSubmitValue(form.locator('[name="targetAmount1"]')));
  if (!(targetAmount > 0)) throw new Error("Buy quote did not preserve a positive canonical funding amount.");
  const optionalFunding = await Promise.all([
    preservedSubmitValue(form.locator('[name="sourceAccountKey2"]')),
    preservedSubmitValue(form.locator('[name="targetAmount2"]')),
    preservedSubmitValue(form.locator('[name="sourceAccountKey3"]')),
    preservedSubmitValue(form.locator('[name="targetAmount3"]')),
  ]);
  if (optionalFunding.some((value) => String(value || "").trim())) {
    throw new Error(`Buy quote unexpectedly prefilled optional funding lines: ${redact(JSON.stringify(optionalFunding))}`);
  }
  const quoteButton = form.getByRole("button", { name: /Create exact quote/i });
  await quoteButton.waitFor({ state: "visible", timeout: 30_000 });
  if (await quoteButton.isDisabled()) throw new Error("Buy quote action is disabled by the current Player market capability or market state.");
  const stateBefore = await readReplayState(page, ticker, fundingAccountKey);
  const quoteResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/stocks/orders") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await quoteButton.click();
  const quoteResponse = await quoteResponsePromise;
  const quotePayload = await parseJson(quoteResponse);
  if (quoteResponse.status() !== 200 || quotePayload?.ok !== true || quotePayload?.action !== "create_buy_quote" || !QUOTE_KEY.test(String(quotePayload?.quote?.quoteKey || ""))) {
    throw new Error(`Buy quote returned ${quoteResponse.status()}: ${redact(JSON.stringify(quotePayload))}`);
  }
  const quoteBody = JSON.parse((await capture(quoteResponse)).body);
  if (quoteBody.action !== "create_buy_quote" || quoteBody.ticker !== ticker || Number(quoteBody.quantity) !== 1 || !Array.isArray(quoteBody.allocations) || quoteBody.allocations.length !== 1) {
    throw new Error(`Buy quote body did not match the rendered funding request: ${redact(JSON.stringify(quoteBody))}`);
  }
  for (const allocation of quoteBody.allocations) {
    if (!ACCOUNT_KEY.test(String(allocation?.sourceAccountKey || "")) || !(Number(allocation?.targetAmount) > 0)) {
      throw new Error(`Buy quote forwarded invalid public funding evidence: ${redact(JSON.stringify(allocation))}`);
    }
  }
  const dialog = page.locator("[data-player-market-order-dialog]");
  await dialog.waitFor({ state: "visible", timeout: 30_000 });
  await dialog.getByText("IMMUTABLE BUY QUOTE", { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
  const settlementResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/stocks/orders") && response.request().method() === "POST" && response.request().postData()?.includes("settle_buy_quote"),
    { timeout: 60_000 },
  );
  await dialog.locator("[data-player-market-order-confirm]").click();
  const settlementResponse = await settlementResponsePromise;
  const payload = await parseJson(settlementResponse);
  if (settlementResponse.status() !== 200 || payload?.ok !== true || payload?.action !== "settle_buy_quote" || payload?.settlement?.ticker !== ticker) {
    throw new Error(`Buy settlement returned ${settlementResponse.status()}: ${redact(JSON.stringify(payload))}`);
  }
  await page.locator("[data-player-market-order-dialog]").getByText("FILLED", { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
  const original = await capture(settlementResponse);
  const body = JSON.parse(original.body);
  assertRequestBoundary(body, "buy");
  if (body.action !== "settle_buy_quote" || body.quoteKey !== quotePayload.quote.quoteKey || typeof body.idempotencyKey !== "string") {
    throw new Error(`Buy settlement body did not match the immutable quote: ${redact(JSON.stringify(body))}`);
  }
  evidence.requestBoundaryValid = true;
  return { quotePayload, payload, original, quoteOriginal: await capture(quoteResponse), fundingAccountKey, stateBefore };
}

async function executeSell(page, ticker, destinationAccountKey) {
  await openMarket(page);
  await selectTicker(page, ticker);
  const form = page.locator('form[data-player-market-order-form="sell-review"]:visible');
  const quantity = Number(await preservedSubmitValue(form.locator('[name="quantity"]')));
  if (quantity !== 1) throw new Error(`Sell review did not preserve the canonical quantity: ${quantity}.`);
  const destination = form.locator('[name="destinationAccountKey"]');
  const desiredDestination = String(destinationAccountKey || "").trim().toLowerCase();
  let selectedDestination = String(await preservedSubmitValue(destination)).trim().toLowerCase();
  if (ACCOUNT_KEY.test(desiredDestination) && selectedDestination !== desiredDestination) {
    if (!(await destination.isVisible())) {
      throw new Error("Sell review hid the Checking destination before the requested owned account could be selected.");
    }
    await destination.selectOption(desiredDestination);
    selectedDestination = String(await preservedSubmitValue(destination)).trim().toLowerCase();
  }
  if (!ACCOUNT_KEY.test(selectedDestination)) {
    if (!(await destination.isVisible())) throw new Error("Sell review did not expose an owned Checking destination.");
    const first = await destination.locator("option").evaluateAll((options) => options.map((option) => option.value).find(Boolean) || "");
    if (!ACCOUNT_KEY.test(String(first))) throw new Error("Sell review did not expose an owned Checking destination.");
    await destination.selectOption(first);
    selectedDestination = String(await preservedSubmitValue(destination)).trim().toLowerCase();
  }
  const reviewButton = form.getByRole("button", { name: /Review sale/i });
  await reviewButton.waitFor({ state: "visible", timeout: 30_000 });
  if (await reviewButton.isDisabled()) throw new Error("Sell review action is disabled by the current Player market capability or market state.");
  await reviewButton.click();
  const dialog = page.locator("[data-player-market-order-dialog]");
  await dialog.waitFor({ state: "visible", timeout: 30_000 });
  await dialog.getByText("IMMEDIATE SELL REVIEW", { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/stocks/orders") && response.request().method() === "POST" && response.request().postData()?.includes("settle_sell"),
    { timeout: 60_000 },
  );
  await dialog.locator("[data-player-market-order-confirm]").click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  if (response.status() !== 200 || payload?.ok !== true || payload?.action !== "settle_sell" || payload?.settlement?.ticker !== ticker) {
    throw new Error(`Sell settlement returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  await page.locator("[data-player-market-order-dialog]").getByText("FILLED", { exact: false }).waitFor({ state: "visible", timeout: 30_000 });
  const original = await capture(response);
  const body = JSON.parse(original.body);
  assertRequestBoundary(body, "sell");
  if (body.action !== "settle_sell" || body.ticker !== ticker || Number(body.quantity) !== 1 || !(Number(body.expectedPrice) > 0) || !ACCOUNT_KEY.test(String(body.destinationAccountKey || "")) || body.destinationAccountKey !== selectedDestination || typeof body.idempotencyKey !== "string") {
    throw new Error(`Sell settlement body did not match the rendered review: ${redact(JSON.stringify(body))}`);
  }
  return { payload, original };
}

async function assertReplaySafe(page, order, accountKey, expectedHolding, expectedCash, action) {
  const result = await replay(page, order.original);
  if (result.status !== 200 || result.payload?.ok !== true || result.payload?.action !== action || result.payload?.settlement?.alreadyCompleted !== true) {
    throw new Error(`Market settlement replay failed: ${result.status} ${redact(JSON.stringify(result.payload))}`);
  }
  const authoritative = await readReplayState(page, evidence.ticker, accountKey);
  if (authoritative.holdingQuantity !== expectedHolding || Math.abs(authoritative.cashBalance - expectedCash) > 0.001) {
    throw new Error(`Market settlement replay duplicated a mutation: ${JSON.stringify({
      holding: authoritative.holdingQuantity,
      cashBalance: authoritative.cashBalance,
      expectedHolding,
      expectedCash,
    })}.`);
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

  const buy = await executeBuy(page, asset.symbol);
  const before = buy.stateBefore;
  const fundingAccountKey = buy.fundingAccountKey;
  evidence.buy.filled = true;
  await reloadMarket(page);
  await selectTicker(page, asset.symbol);
  const holdingAfterBuy = await position(page);
  if (holdingAfterBuy !== before.holdingQuantity + 1) throw new Error(`Buy holding did not persist: ${before.holdingQuantity} -> ${holdingAfterBuy}.`);
  evidence.buy.holdingPersisted = true;
  const stateAfterBuy = await readReplayState(page, asset.symbol, fundingAccountKey);
  if (!(stateAfterBuy.cashBalance < before.cashBalance)) throw new Error(`Buy order did not debit cash: ${before.cashBalance} -> ${stateAfterBuy.cashBalance}.`);
  evidence.buy.cashPersisted = true;
  await assertReplaySafe(page, buy, fundingAccountKey, holdingAfterBuy, stateAfterBuy.cashBalance, "settle_buy_quote");
  evidence.buy.replaySafe = true;

  const sell = await executeSell(page, asset.symbol, fundingAccountKey);
  evidence.sell.filled = true;
  await reloadMarket(page);
  await selectTicker(page, asset.symbol);
  const holdingAfterSell = await position(page);
  if (holdingAfterSell !== before.holdingQuantity) throw new Error(`Sell holding did not persist: ${holdingAfterBuy} -> ${holdingAfterSell}.`);
  evidence.sell.holdingPersisted = true;
  const stateAfterSell = await readReplayState(page, asset.symbol, fundingAccountKey);
  if (!(stateAfterSell.cashBalance > stateAfterBuy.cashBalance)) throw new Error(`Sell order did not credit cash: ${stateAfterBuy.cashBalance} -> ${stateAfterSell.cashBalance}.`);
  evidence.sell.cashPersisted = true;
  await assertReplaySafe(page, sell, fundingAccountKey, holdingAfterSell, stateAfterSell.cashBalance, "settle_sell");
  evidence.sell.replaySafe = true;

  const quotePath = new URL(buy.quoteOriginal.url).pathname;
  const quoteBody = JSON.parse(buy.quoteOriginal.body);
  const stale = await authenticatedContextRequest(page, quotePath, {
    method: "POST",
    headers: buy.quoteOriginal.headers,
    body: {
      ...quoteBody,
      expectedPrice: Number(quoteBody.expectedPrice) + 1,
      idempotencyKey: `${quoteBody.idempotencyKey}-stale`,
    },
  });
  if (stale.status !== 409 || stale.payload?.error?.code !== "stale_stock_price") {
    throw new Error(`Stale-price quote was not rejected: ${stale.status} ${redact(JSON.stringify(stale.payload))}`);
  }
  evidence.stalePriceRejected = true;

  const forbidden = await authenticatedContextRequest(page, quotePath, {
    method: "POST",
    headers: buy.quoteOriginal.headers,
    body: {
      ...quoteBody,
      playerId: "attacker-controlled",
      idempotencyKey: `${quoteBody.idempotencyKey}-scope`,
    },
  });
  if (forbidden.status !== 400 || forbidden.payload?.error?.code !== "invalid_stock_market_trading_request") {
    throw new Error(`Client ownership-field quote was not rejected: ${forbidden.status} ${redact(JSON.stringify(forbidden.payload))}`);
  }
  evidence.forbiddenScopeRejected = true;

  const unauthorized = await request(quotePath, {
    method: "POST",
    headers: platformHeaders(fixture.key),
    body: quoteBody,
  });
  if (![401, 403].includes(unauthorized.status)) throw new Error(`Unauthenticated market quote was not rejected: ${unauthorized.status}.`);
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
