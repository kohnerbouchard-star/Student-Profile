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
const PLAYER = Object.freeze({
  displayName: "Browser Player Beta",
  playerIdentifier: "BROWSER-PLAYER-BETA",
  accessCode: "BROWSER-BETA-ACCESS-002",
});
const COMPANY_NAME = "Connected Browser Industries";
const PRODUCT_NAME = "Connected Classroom Kit";
const EMPLOYEE_ROLE = "Connected Quality Specialist";
const CAPITALIZATION = 2_000;
const FIXTURE_TARGET_BALANCE = 25_000;
const CURRENCY_PATTERN = /^[A-Z][A-Z0-9_]{2,15}$/;
const UUID_VALUE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const PRODUCT_KEY_PATTERN = /^bpr_[0-9a-f]{32}$/;

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  rosterCurrencyCode: "",
  fundingCurrencyCode: "",
  businessCurrencyCode: "",
  economicContext: { countryCode: "", currencyCode: "" },
  fixtureTargetBalance: FIXTURE_TARGET_BALANCE,
  fixtureCreditAmount: 0,
  balanceBeforeCredit: null,
  storageBalanceBeforeCredit: null,
  balanceAfterCredit: null,
  storageBalanceAfterCredit: null,
  fixtureCreditApplied: false,
  fixtureCreditVisible: false,
  businessRequest: null,
  mutations: {
    businessCreated: false,
    businessPersisted: false,
    businessReplayDeniedDuplicate: false,
    productCreated: false,
    productPersisted: false,
    productApproved: false,
    productApprovalPersisted: false,
    productionRun: false,
    productionPersisted: false,
    priceUpdated: false,
    pricePersisted: false,
    employeeHired: false,
    employeePersisted: false,
    employeeTerminated: false,
    terminationPersisted: false,
    statusChanged: false,
    statusPersisted: false,
    unauthenticatedRejected: false,
  },
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

function databaseFundingState(admin, currencyCode) {
  if (!UUID_VALUE_PATTERN.test(admin.gameId) || !UUID_VALUE_PATTERN.test(admin.playerId)) {
    throw new Error("Business fixture database scope is invalid.");
  }
  if (!CURRENCY_PATTERN.test(currencyCode)) throw new Error("Business fixture database currency is invalid.");
  const raw = psql(`
    with context as (
      select country_code, currency_code
      from public.resolve_player_economic_context_v1(
        '${admin.gameId}'::uuid,
        '${admin.playerId}'::uuid
      )
      limit 1
    )
    select json_build_object(
      'cashBalance', coalesce((
        select balance
        from public.account_balances
        where game_session_id = '${admin.gameId}'::uuid
          and player_id = '${admin.playerId}'::uuid
          and account_type = 'checking'
          and currency_code = '${currencyCode}'
        limit 1
      ), 0),
      'contextCountryCode', coalesce((select country_code from context), ''),
      'contextCurrencyCode', coalesce((select currency_code from context), '')
    )::text;
  `);
  const value = JSON.parse(raw || "{}");
  const cashBalance = Number(value.cashBalance);
  const contextCountryCode = String(value.contextCountryCode || "").trim().toUpperCase();
  const contextCurrencyCode = String(value.contextCurrencyCode || "").trim().toUpperCase();
  if (!Number.isFinite(cashBalance) || !CURRENCY_PATTERN.test(contextCurrencyCode)) {
    throw new Error(`Business fixture database context is invalid: ${redact(raw)}`);
  }
  return { cashBalance, contextCountryCode, contextCurrencyCode };
}

function databaseProductStatus(admin, productKey) {
  if (!UUID_VALUE_PATTERN.test(admin.gameId) || !PRODUCT_KEY_PATTERN.test(productKey)) {
    throw new Error("Business product fixture scope is invalid.");
  }
  return psql(`
    select coalesce(status, '')
    from public.business_products
    where game_session_id = '${admin.gameId}'::uuid
      and public_key = '${productKey}'
    limit 1;
  `).trim().toLowerCase();
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

function headers(key, token = key, extra = {}) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function request(path, { method = "GET", headers: requestHeaders = {}, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  return { status: response.status, payload: await parseJson(response) };
}

function walk(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, output);
    return output;
  }
  output.push(value);
  for (const child of Object.values(value)) walk(child, output);
  return output;
}

function replayed(value) {
  return walk(value).some((item) => item.replayed === true);
}

function findPublicKey(value, pattern) {
  for (const item of walk(value)) {
    for (const child of Object.values(item)) {
      const candidate = typeof child === "string" ? child.trim().toLowerCase() : "";
      if (pattern.test(candidate)) return candidate;
    }
  }
  return "";
}

function assignedCurrency(record) {
  const currencyCode = String(record?.currencyCode || record?.currency_code || "").trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(currencyCode)) {
    throw new Error("Admin fixture could not resolve the Business Player's assigned country currency.");
  }
  return currencyCode;
}

async function resolveAdminFixture() {
  const publishableKey = await runtimeKey();
  const signIn = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: headers(publishableKey),
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (signIn.status !== 200 || !signIn.payload?.access_token) {
    throw new Error(`Admin fixture sign-in returned ${signIn.status}.`);
  }
  const token = signIn.payload.access_token;
  const bootstrap = await request("/functions/v1/classroom-api/staff/bootstrap", {
    headers: headers(publishableKey, token),
  });
  if (bootstrap.status !== 200 || bootstrap.payload?.ok !== true) {
    throw new Error(`Admin fixture bootstrap returned ${bootstrap.status}.`);
  }
  const games = Array.isArray(bootstrap.payload.activeGameSessions) ? bootstrap.payload.activeGameSessions : [];
  const game = games.find((item) => item?.name === GAME_NAME) || games[0];
  const gameId = String(game?.id || "");
  const gameCode = String(game?.gameCode || game?.joinCode || "");
  if (!gameId || !gameCode) throw new Error("Admin fixture could not resolve the connected game.");

  const players = await request(`/functions/v1/admin-api/games/${encodeURIComponent(gameId)}/players`, {
    headers: headers(publishableKey, token, { "X-Econovaria-Game-Id": gameId }),
  });
  if (players.status !== 200) throw new Error(`Admin Player list returned ${players.status}.`);
  const player = walk(players.payload).find((item) => {
    const name = String(item.displayName || item.display_name || "");
    const identifier = String(item.playerIdentifier || item.player_identifier || item.rosterLabel || "");
    return Boolean(item.id || item.playerId) && (name === PLAYER.displayName || identifier === PLAYER.playerIdentifier);
  });
  const playerId = String(player?.id || player?.playerId || "");
  if (!playerId) throw new Error("Admin fixture could not resolve the connected Player.");
  return {
    publishableKey,
    token,
    gameId,
    gameCode,
    playerId,
    rosterCurrencyCode: assignedCurrency(player),
  };
}

async function creditPlayer(admin, currencyCode, amount) {
  const idempotencyKey = `business-fixture-${Date.now()}`;
  const response = await request(
    `/functions/v1/admin-api/games/${encodeURIComponent(admin.gameId)}/players/${encodeURIComponent(admin.playerId)}/ledger-adjustments`,
    {
      method: "POST",
      headers: headers(admin.publishableKey, admin.token, {
        "X-Econovaria-Game-Id": admin.gameId,
        "X-Idempotency-Key": idempotencyKey,
      }),
      body: {
        amount,
        reason: "Disposable connected Business acceptance fixture",
        accountType: "checking",
        currencyCode,
        idempotencyKey,
      },
    },
  );
  const adjustment = response.payload?.data || response.payload;
  const applied = response.payload?.ok === true || adjustment?.adjusted === true;
  if (
    response.status !== 200 ||
    !applied ||
    adjustment?.ledger?.accountType !== "checking" ||
    String(adjustment?.ledger?.currencyCode || "").toUpperCase() !== currencyCode
  ) {
    throw new Error(`Business fixture credit returned ${response.status}: ${redact(JSON.stringify(response.payload))}`);
  }
  evidence.fixtureCreditApplied = true;
}

async function approveProduct(admin, productKey) {
  if (!PRODUCT_KEY_PATTERN.test(productKey)) throw new Error("Business product response omitted a valid public product key.");
  const idempotencyKey = `business-product-approval-${Date.now()}`;
  const response = await request(
    `/functions/v1/admin-api/games/${encodeURIComponent(admin.gameId)}/business-products/${encodeURIComponent(productKey)}/review`,
    {
      method: "POST",
      headers: headers(admin.publishableKey, admin.token, {
        "X-Econovaria-Game-Id": admin.gameId,
        "X-Idempotency-Key": idempotencyKey,
      }),
      body: {
        decision: "approve",
        reason: "Connected Business lifecycle approval",
        idempotencyKey,
      },
    },
  );
  const reviewed = walk(response.payload).find((item) => {
    const key = String(item.productKey || item.product_key || "").trim().toLowerCase();
    return key === productKey;
  });
  if (response.status !== 200 || String(reviewed?.status || "").toLowerCase() !== "active") {
    throw new Error(`Business product approval returned ${response.status}: ${redact(JSON.stringify(response.payload))}`);
  }
  evidence.mutations.productApproved = true;
  if (databaseProductStatus(admin, productKey) !== "active") {
    throw new Error("Approved Business product did not persist as active.");
  }
  evidence.mutations.productApprovalPersisted = true;
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
    if (!(response.headers()["content-type"] || "").includes("application/json")) return;
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
  await page.locator("#playerId").fill(PLAYER.playerIdentifier);
  await page.locator("#playerAccessCode").fill(PLAYER.accessCode);
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

async function checkingBalance(page, currencyCode, { optional = false } = {}) {
  await openRoute(page, "banking", ".player-terminal-banking-page");
  const card = page.locator(`[data-player-banking-balance="checking:${currencyCode}"]`).first();
  if (!(await card.count())) {
    if (optional) return 0;
    throw new Error(`The Player Banking page did not render the ${currencyCode} checking balance.`);
  }
  await card.waitFor({ state: "visible", timeout: 30_000 });
  const text = String(await card.locator("h3").innerText()).replace(/,/g, "");
  const amount = Number(text.match(/-?[0-9]+(?:\.[0-9]{1,2})?/)?.[0]);
  if (!Number.isFinite(amount)) throw new Error(`Could not parse the ${currencyCode} checking balance from ${redact(text)}.`);
  return amount;
}

async function openBusiness(page) {
  const businessControl = page.locator('[data-route="business"]:visible').first();
  if (!(await businessControl.count())) {
    const workControl = page.locator('[data-route="contracts"]:visible').first();
    await workControl.click();
    await page.waitForFunction(() => location.hash === "#contracts", { timeout: 30_000 });
    await page.locator('[data-route="business"]:visible').first().waitFor({ state: "visible", timeout: 30_000 });
  }
  await openRoute(page, "business", ".player-terminal-business-page");
}

async function renderedBusinessCurrency(page) {
  await openBusiness(page);
  const label = page.locator('form[data-endpoint="businessCreate"] label').filter({ hasText: "STARTING CAPITAL" }).first();
  await label.waitFor({ state: "visible", timeout: 30_000 });
  const labelText = String(await label.innerText()).toUpperCase();
  const currencyCode = labelText.match(/STARTING CAPITAL\s*\(([A-Z][A-Z0-9_]{2,15})\)/)?.[1] || "";
  if (!CURRENCY_PATTERN.test(currencyCode)) {
    throw new Error(`The Business formation control did not expose a valid operating currency: ${redact(labelText)}.`);
  }
  return currencyCode;
}

function form(page, endpoint) {
  return page.locator(`form[data-endpoint="${endpoint}"]`).first();
}

async function exposeForm(target) {
  await target.evaluate((element) => {
    const details = element.closest("details");
    if (details) details.open = true;
  });
  await target.waitFor({ state: "visible", timeout: 30_000 });
}

async function submitMutation(page, endpoint, pathPattern, configure) {
  const target = form(page, endpoint);
  await exposeForm(target);
  await configure(target);
  const responsePromise = page.waitForResponse(
    (response) => pathPattern.test(new URL(response.url()).pathname) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await target.locator('button[type="submit"]').click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  const requestRecord = response.request();
  const allHeaders = await requestRecord.allHeaders();
  const allowed = new Set([
    "accept", "apikey", "authorization", "content-type", "idempotency-key",
    "x-player-session-token", "x-request-id",
  ]);
  const operation = {
    responsePayload: payload,
    request: {
      url: response.url(),
      body: requestRecord.postData() || "{}",
      headers: Object.fromEntries(Object.entries(allHeaders).filter(([name]) => allowed.has(name.toLowerCase()))),
    },
  };
  if (endpoint === "businessCreate") {
    const body = JSON.parse(operation.request.body);
    evidence.businessRequest = {
      keys: Object.keys(body).sort(),
      capitalization: Number(body.capitalization),
      entityType: String(body.entityType || ""),
      industryCode: String(body.industryCode || ""),
      hasAcquireBusinessKey: Boolean(body.acquireBusinessKey),
      hasIdempotencyKey: typeof body.idempotencyKey === "string" && body.idempotencyKey.length >= 8,
    };
  }
  if (response.status() !== 200 || payload?.ok !== true) {
    throw new Error(`${endpoint} returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  return operation;
}

async function replayRequest(page, original) {
  return page.evaluate(async ({ url, headers: requestHeaders, body }) => {
    const response = await fetch(url, { method: "POST", headers: requestHeaders, body, cache: "no-store" });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }, original);
}

async function reloadBusiness(page) {
  if (!await page.evaluate(() => location.hash === "#business")) await openBusiness(page);
  const previousSurface = await page.locator(".player-terminal-business-page").first().elementHandle();
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/business") && response.request().method() === "GET",
    { timeout: 60_000 },
  );
  await page.evaluate(() => {
    globalThis.dispatchEvent(new CustomEvent("econovaria:player-resources-invalidated", {
      detail: { resources: ["business"] },
    }));
  });
  if (previousSurface) {
    await page.waitForFunction((surface) => !surface.isConnected, previousSurface, { timeout: 30_000 });
  }
  const response = await responsePromise;
  if (!response.ok()) throw new Error(`Business refresh returned ${response.status()}.`);
  await page.locator(".player-terminal-business-page").waitFor({ state: "visible", timeout: 30_000 });
}

async function requireText(page, text) {
  await page.waitForFunction((expected) => {
    return [...document.querySelectorAll("body *")].some((element) => {
      if (String(element.textContent || "").trim() !== expected) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    });
  }, text, { timeout: 30_000 });
}

async function createBusiness(page) {
  await openBusiness(page);
  const operation = await submitMutation(page, "businessCreate", /\/players\/me\/businesses$/, async (target) => {
    await target.locator('[name="legalName"]').fill(COMPANY_NAME);
    await target.locator('[name="entityType"]').selectOption("corporation");
    await target.locator('[name="industryCode"]').fill("education_manufacturing");
    await target.locator('[name="capitalization"]').fill(String(CAPITALIZATION));
  });
  await requireText(page, COMPANY_NAME);
  evidence.mutations.businessCreated = true;
  await reloadBusiness(page);
  await requireText(page, COMPANY_NAME);
  evidence.mutations.businessPersisted = true;

  const replay = await replayRequest(page, operation.request);
  if (replay.status !== 200 || replay.payload?.ok !== true || !replayed(replay.payload)) {
    throw new Error(`Business creation replay was not recognized: ${replay.status} ${redact(JSON.stringify(replay.payload))}`);
  }
  await reloadBusiness(page);
  if ((await page.getByText(COMPANY_NAME, { exact: true }).count()) < 1) {
    throw new Error("Business disappeared after idempotent replay.");
  }
  evidence.mutations.businessReplayDeniedDuplicate = true;
  return operation.request;
}

async function createProduct(page, admin) {
  const operation = await submitMutation(page, "businessProductCreate", /\/players\/me\/business\/products$/, async (target) => {
    await target.locator('[name="name"]').fill(PRODUCT_NAME);
    await target.locator('[name="category"]').fill("classroom_equipment");
    await target.locator('[name="unitPrice"]').fill("12");
    await target.locator('[name="unitInputCost"]').fill("0");
    await target.locator('[name="unitLaborCost"]').fill("0");
    await target.locator('[name="capacityUnits"]').fill("100");
    await target.locator('[name="qualityScore"]').fill("60");
  });
  await requireText(page, PRODUCT_NAME);
  evidence.mutations.productCreated = true;
  await reloadBusiness(page);
  await requireText(page, PRODUCT_NAME);
  evidence.mutations.productPersisted = true;

  const productKey = findPublicKey(operation.responsePayload, PRODUCT_KEY_PATTERN);
  await approveProduct(admin, productKey);
  await reloadBusiness(page);
  await requireText(page, PRODUCT_NAME);
}

async function runProduction(page) {
  const beforeText = String(await page.locator(".player-terminal-company-facts").innerText());
  const before = Number(beforeText.match(/PRODUCTION\s+([0-9,]+)/i)?.[1]?.replace(/,/g, "") || 0);
  await submitMutation(page, "businessProduction", /\/players\/me\/business\/production-runs$/, async (target) => {
    await target.locator('[name="quantity"]').fill("10");
    await target.locator('[name="priority"]').selectOption("standard");
  });
  evidence.mutations.productionRun = true;
  await reloadBusiness(page);
  const afterText = String(await page.locator(".player-terminal-company-facts").innerText());
  const after = Number(afterText.match(/PRODUCTION\s+([0-9,]+)/i)?.[1]?.replace(/,/g, "") || 0);
  if (!(after >= before + 10)) throw new Error(`Production output did not persist: ${before} -> ${after}.`);
  evidence.mutations.productionPersisted = true;
}

async function updatePrice(page) {
  await submitMutation(page, "businessPrice", /\/players\/me\/business\/products\/bpr_[0-9a-f]{32}\/pricing$/, async (target) => {
    await target.locator('[name="price"]').fill("15");
  });
  evidence.mutations.priceUpdated = true;
  await reloadBusiness(page);
  const product = page.getByText(PRODUCT_NAME, { exact: true }).locator("xpath=ancestor::article[1]").first();
  const text = String(await product.innerText()).replace(/,/g, "");
  if (!/PRICE\s+[^0-9]*15(?:\.00)?/i.test(text)) throw new Error(`Updated product price was not rendered: ${redact(text)}.`);
  evidence.mutations.pricePersisted = true;
}

async function hireEmployee(page) {
  await submitMutation(page, "businessHire", /\/players\/me\/business\/employees\/hire$/, async (target) => {
    await target.locator('[name="role"]').fill(EMPLOYEE_ROLE);
    await target.locator('[name="contractType"]').selectOption("cycle");
    await target.locator('[name="wagePerCycle"]').fill("25");
    await target.locator('[name="productivityIndex"]').fill("1.2");
  });
  await requireText(page, EMPLOYEE_ROLE);
  evidence.mutations.employeeHired = true;
  await reloadBusiness(page);
  await requireText(page, EMPLOYEE_ROLE);
  evidence.mutations.employeePersisted = true;
}

async function terminateEmployee(page) {
  const employee = page.getByText(EMPLOYEE_ROLE, { exact: true }).locator("xpath=ancestor::article[1]").first();
  const target = employee.locator('form[data-endpoint="businessTerminate"]');
  await target.locator('[name="reason"]').fill("Connected lifecycle termination verification");
  const responsePromise = page.waitForResponse(
    (response) => /\/players\/me\/business\/employees\/emp_[0-9a-f]{32}\/terminate$/.test(new URL(response.url()).pathname) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await target.locator('button[type="submit"]').click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  if (response.status() !== 200 || payload?.ok !== true) {
    throw new Error(`businessTerminate returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  evidence.mutations.employeeTerminated = true;
  await reloadBusiness(page);
  const activeEmployee = page.locator(".player-terminal-business-products article").filter({ hasText: EMPLOYEE_ROLE });
  if (await activeEmployee.count()) throw new Error("Terminated employee remained in the active employee list after reload.");
  evidence.mutations.terminationPersisted = true;
}

async function changeStatus(page) {
  await submitMutation(page, "businessStatus", /\/players\/me\/business\/status$/, async (target) => {
    await target.locator('[name="transition"]').selectOption("restructure");
    await target.locator('[name="reason"]').fill("Connected lifecycle status verification");
  });
  evidence.mutations.statusChanged = true;
  await reloadBusiness(page);
  await page.getByText("RESTRUCTURING", { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
  evidence.mutations.statusPersisted = true;
}

let browser;
let context;
let failure;
try {
  const admin = await resolveAdminFixture();
  browser = await chromium.launch({ headless: true });
  const player = await login(browser, admin.gameCode);
  context = player.context;
  evidence.rosterCurrencyCode = admin.rosterCurrencyCode;

  const rosterStorage = databaseFundingState(admin, admin.rosterCurrencyCode);
  evidence.economicContext = {
    countryCode: rosterStorage.contextCountryCode,
    currencyCode: rosterStorage.contextCurrencyCode,
  };
  const fundingCurrencyCode = rosterStorage.contextCurrencyCode;
  evidence.fundingCurrencyCode = fundingCurrencyCode;
  const storageBefore = fundingCurrencyCode === admin.rosterCurrencyCode
    ? rosterStorage
    : databaseFundingState(admin, fundingCurrencyCode);
  evidence.storageBalanceBeforeCredit = storageBefore.cashBalance;

  const balanceBeforeCredit = await checkingBalance(player.page, fundingCurrencyCode, { optional: true });
  evidence.balanceBeforeCredit = balanceBeforeCredit;
  if (Math.abs(balanceBeforeCredit - storageBefore.cashBalance) > 0.001) {
    throw new Error(`Player Banking and storage cash disagree before funding: ${balanceBeforeCredit} vs ${storageBefore.cashBalance}.`);
  }

  const fixtureCreditAmount = Math.max(1, Math.round((FIXTURE_TARGET_BALANCE - storageBefore.cashBalance) * 100) / 100);
  evidence.fixtureCreditAmount = fixtureCreditAmount;
  await creditPlayer(admin, fundingCurrencyCode, fixtureCreditAmount);
  await player.page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await player.page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });

  const balanceAfterCredit = await checkingBalance(player.page, fundingCurrencyCode);
  const storageAfter = databaseFundingState(admin, fundingCurrencyCode);
  evidence.balanceAfterCredit = balanceAfterCredit;
  evidence.storageBalanceAfterCredit = storageAfter.cashBalance;
  if (Math.abs(balanceAfterCredit - storageAfter.cashBalance) > 0.001) {
    throw new Error(`Player Banking and storage cash disagree after funding: ${balanceAfterCredit} vs ${storageAfter.cashBalance}.`);
  }
  if (storageAfter.cashBalance < FIXTURE_TARGET_BALANCE || storageAfter.cashBalance < CAPITALIZATION) {
    throw new Error(`Business fixture funding is below the required threshold: ${storageAfter.cashBalance}.`);
  }
  evidence.fixtureCreditVisible = true;

  const businessCurrencyCode = await renderedBusinessCurrency(player.page);
  evidence.businessCurrencyCode = businessCurrencyCode;
  if (businessCurrencyCode !== storageAfter.contextCurrencyCode) {
    throw new Error(`Business currency ${businessCurrencyCode} does not match server economic currency ${storageAfter.contextCurrencyCode}.`);
  }

  const originalCreate = await createBusiness(player.page);
  if (evidence.businessRequest?.capitalization !== CAPITALIZATION) {
    throw new Error(`Business request capitalization was ${evidence.businessRequest?.capitalization} instead of ${CAPITALIZATION}.`);
  }
  await createProduct(player.page, admin);
  await runProduction(player.page);
  await updatePrice(player.page);
  await hireEmployee(player.page);
  await terminateEmployee(player.page);
  await changeStatus(player.page);

  const unauthorized = await request(new URL(originalCreate.url).pathname, {
    method: "POST",
    headers: headers(admin.publishableKey),
    body: JSON.parse(originalCreate.body),
  });
  if (![401, 403].includes(unauthorized.status)) {
    throw new Error(`Unauthenticated Business mutation was not rejected: ${unauthorized.status}.`);
  }
  evidence.mutations.unauthenticatedRejected = true;

  if (evidence.responseUuidLeak) throw new Error("A connected Player Business response exposed a raw internal UUID.");
  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`Player Business browser errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
  }
  if (!evidence.fixtureCreditApplied || !evidence.fixtureCreditVisible || !Object.values(evidence.mutations).every(Boolean)) {
    throw new Error(`Connected Player Business evidence is incomplete: ${JSON.stringify({
      fixtureCreditApplied: evidence.fixtureCreditApplied,
      fixtureCreditVisible: evidence.fixtureCreditVisible,
      mutations: evidence.mutations,
    })}`);
  }
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(
    `${OUTPUT_DIR}/business-banking-player-business-browser-acceptance.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}

if (failure) throw failure;

console.log(JSON.stringify({
  ok: true,
  rosterCurrencyCode: evidence.rosterCurrencyCode,
  fundingCurrencyCode: evidence.fundingCurrencyCode,
  businessCurrencyCode: evidence.businessCurrencyCode,
  economicContext: evidence.economicContext,
  fixtureTargetBalance: evidence.fixtureTargetBalance,
  fixtureCreditAmount: evidence.fixtureCreditAmount,
  storageBalanceAfterCredit: evidence.storageBalanceAfterCredit,
  businessRequest: evidence.businessRequest,
  mutations: evidence.mutations,
  requestCount: evidence.requests.length,
}));
