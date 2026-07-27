#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR || "/tmp/econovaria-player-browser";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ADMIN_EMAIL = process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "player.e2e@example.test";
const ADMIN_PASSWORD = process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD || "Player-E2E-Admin-2026!";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Player Multiplayer E2E";
const PLAYER_ID = "BROWSER-PLAYER-BETA";
const ACCESS_CODE = "BROWSER-BETA-ACCESS-002";
const LOAN_PRODUCT_KEY = `lop_${"4".repeat(32)}`;
const LOAN_KEY = `lon_${"5".repeat(32)}`;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  savings: {
    submitted: false,
    persisted: false,
    replaySafe: false,
    unauthenticatedRejected: false,
  },
  loans: {
    applicationSubmitted: false,
    applicationPersisted: false,
    fixtureApproved: false,
    repaymentSubmitted: false,
    repaymentPersisted: false,
    replaySafe: false,
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
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt-redacted]");
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

async function request(pathOrUrl, { method = "GET", headers = {}, body } = {}) {
  const url = /^https?:\/\//u.test(pathOrUrl) ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    cache: "no-store",
  });
  return { status: response.status, payload: await parseJson(response) };
}

async function fixture() {
  const key = await runtimeKey();
  const signIn = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: platformHeaders(key),
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (signIn.status !== 200 || !signIn.payload?.access_token) throw new Error(`Admin sign-in returned ${signIn.status}.`);
  const bootstrap = await request("/functions/v1/classroom-api/staff/bootstrap", {
    headers: platformHeaders(key, signIn.payload.access_token),
  });
  if (bootstrap.status !== 200 || bootstrap.payload?.ok !== true) throw new Error(`Admin bootstrap returned ${bootstrap.status}.`);
  const sessions = Array.isArray(bootstrap.payload.activeGameSessions) ? bootstrap.payload.activeGameSessions : [];
  const game = sessions.find((item) => item?.name === GAME_NAME) || sessions[0];
  const gameCode = String(game?.gameCode || game?.joinCode || "").trim();
  if (!gameCode) throw new Error("Connected Game Code was unavailable.");
  return { key, gameCode };
}

function psql(sql, tuplesOnly = false) {
  const args = [DATABASE_URL, "-X", "-v", "ON_ERROR_STOP=1"];
  if (tuplesOnly) args.push("-qAt");
  args.push("-c", sql);
  return execFileSync("psql", args, { encoding: "utf8" }).trim();
}

function seedBankingAndLoanProduct() {
  psql(`
    do $$
    declare
      v_game_id uuid;
      v_player_id uuid;
      v_currency text;
    begin
      select g.id, p.id
      into v_game_id, v_player_id
      from public.game_sessions g
      join public.players p on p.game_session_id = g.id
      where g.name = '${GAME_NAME}'
        and p.player_identifier_normalized = '${PLAYER_ID}'
      limit 1;
      if v_game_id is null or v_player_id is null then raise exception 'CONNECTED_PLAYER_NOT_FOUND'; end if;

      select ab.currency_code into v_currency
      from public.account_balances ab
      where ab.game_session_id = v_game_id
        and ab.player_id = v_player_id
        and ab.account_type = 'checking'
      limit 1;
      v_currency := coalesce(v_currency, 'ECO');

      perform public.record_player_ledger_entry(
        v_game_id, v_player_id, 'checking', 10000, v_currency,
        'credit', 'acceptance', 'connected_banking_seed', gen_random_uuid(),
        'system', null, jsonb_build_object('disposable', true)
      );
      perform public.record_player_ledger_entry(
        v_game_id, v_player_id, 'savings', 100, v_currency,
        'credit', 'acceptance', 'connected_savings_seed', gen_random_uuid(),
        'system', null, jsonb_build_object('disposable', true)
      );

      insert into public.loan_products (
        public_key, game_session_id, name, borrower_type, status, currency_code,
        minimum_amount, maximum_amount, annual_rate, origination_fee_rate,
        term_cycles, payment_frequency_cycles, minimum_credit_score,
        maximum_payment_to_income, disclosure_text
      ) values (
        '${LOAN_PRODUCT_KEY}', v_game_id, 'Connected Player Credit', 'player', 'active', v_currency,
        100, 1000, 0.05, 0, 12, 1, 300, 0.75,
        'Connected browser acceptance facility with fixed economic disclosures and no automatic approval.'
      ) on conflict (public_key) do update set status = 'active';
    end
    $$;
  `);
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
  await page.waitForURL(/\/player-terminal\/(?:index\.html)?(?:#.*)?$/u, { timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  return { context, page };
}

async function openRoute(page, route, selector) {
  const control = page.locator(`[data-route="${route}"]:visible`).first();
  await control.waitFor({ state: "visible", timeout: 30_000 });
  await control.click();
  await page.waitForFunction((expected) => location.hash === `#${expected}`, route, { timeout: 30_000 });
  await page.locator(selector).waitFor({ state: "visible", timeout: 60_000 });
}

async function reloadRoute(page, route, selector) {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  await openRoute(page, route, selector);
}

async function openDisclosureForm(form) {
  const disclosure = form.locator("xpath=..");
  const summary = disclosure.locator("summary");
  await summary.waitFor({ state: "visible", timeout: 30_000 });
  if ((await disclosure.getAttribute("open")) === null) await summary.click();
  await form.waitFor({ state: "visible", timeout: 30_000 });
}

function numberFromText(value) {
  const match = String(value || "").replaceAll(",", "").match(/-?\d+(?:\.\d+)?/u);
  return match ? Number(match[0]) : Number.NaN;
}

async function bankingBalances(page) {
  const checking = page.locator('[data-player-banking-balance^="checking:"] h3').first();
  const savings = page.locator('[data-player-banking-balance^="savings:"] h3').first();
  await checking.waitFor({ state: "visible", timeout: 30_000 });
  await savings.waitFor({ state: "visible", timeout: 30_000 });
  return {
    checking: numberFromText(await checking.textContent()),
    savings: numberFromText(await savings.textContent()),
  };
}

async function capture(response) {
  const record = response.request();
  const headers = await record.allHeaders();
  const allowed = new Set(["accept", "apikey", "authorization", "content-type", "idempotency-key", "x-idempotency-key", "x-player-session-token", "x-request-id"]);
  return {
    url: response.url(),
    method: record.method(),
    body: record.postData() || "{}",
    headers: Object.fromEntries(Object.entries(headers).filter(([name]) => allowed.has(name.toLowerCase()))),
  };
}

async function replay(page, original) {
  return page.evaluate(async ({ url, method, headers, body }) => {
    const response = await fetch(url, { method, headers, body, cache: "no-store" });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }, original);
}

async function proveSavings(page, fixtureData) {
  await openRoute(page, "banking", ".player-terminal-banking-page");
  const before = await bankingBalances(page);
  const form = page.locator('form[data-endpoint="savingsTransfer"]');
  await form.waitFor({ state: "visible", timeout: 30_000 });
  await form.locator('[name="fromAccount"]').selectOption("checking");
  await form.locator('[name="toAccount"]').selectOption("savings");
  await form.locator('[name="amount"]').fill("10");
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/banking/savings/transfers") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  if (response.status() !== 200) throw new Error(`Savings transfer returned ${response.status()}.`);
  const original = await capture(response);
  evidence.savings.submitted = true;

  await reloadRoute(page, "banking", ".player-terminal-banking-page");
  const after = await bankingBalances(page);
  if (Math.abs(after.checking - (before.checking - 10)) > 0.01 || Math.abs(after.savings - (before.savings + 10)) > 0.01) {
    throw new Error(`Savings balances did not persist: ${JSON.stringify({ before, after })}`);
  }
  evidence.savings.persisted = true;

  const replayResult = await replay(page, original);
  if (replayResult.status !== 200 || replayResult.payload?.ok !== true) {
    throw new Error(`Savings replay returned ${replayResult.status}: ${redact(JSON.stringify(replayResult.payload))}`);
  }
  await reloadRoute(page, "banking", ".player-terminal-banking-page");
  const afterReplay = await bankingBalances(page);
  if (Math.abs(afterReplay.checking - after.checking) > 0.01 || Math.abs(afterReplay.savings - after.savings) > 0.01) {
    throw new Error("Savings replay duplicated the transfer.");
  }
  evidence.savings.replaySafe = true;

  const unauthorized = await request(new URL(original.url).pathname, {
    method: original.method,
    headers: platformHeaders(fixtureData.key),
    body: original.body,
  });
  if (![401, 403].includes(unauthorized.status)) throw new Error(`Unauthenticated savings transfer returned ${unauthorized.status}.`);
  evidence.savings.unauthenticatedRejected = true;
}

function applicationCount() {
  return Number(psql(`
    select count(*)
    from public.loan_applications application
    join public.players player on player.id = application.player_id
    join public.game_sessions game on game.id = application.game_session_id
    join public.loan_products product on product.id = application.loan_product_id
    where game.name = '${GAME_NAME}'
      and player.player_identifier_normalized = '${PLAYER_ID}'
      and product.public_key = '${LOAN_PRODUCT_KEY}';
  `, true));
}

function approveLatestApplication() {
  psql(`
    do $$
    declare
      v_application public.loan_applications%rowtype;
      v_product public.loan_products%rowtype;
      v_loan_id uuid;
      v_ledger_entry uuid;
    begin
      select application.* into v_application
      from public.loan_applications application
      join public.players player on player.id = application.player_id
      join public.game_sessions game on game.id = application.game_session_id
      join public.loan_products product on product.id = application.loan_product_id
      where game.name = '${GAME_NAME}'
        and player.player_identifier_normalized = '${PLAYER_ID}'
        and product.public_key = '${LOAN_PRODUCT_KEY}'
        and application.status = 'pending_review'
      order by application.created_at desc
      limit 1
      for update;
      if not found then raise exception 'CONNECTED_LOAN_APPLICATION_NOT_FOUND'; end if;
      select * into v_product from public.loan_products where id = v_application.loan_product_id;

      update public.loan_applications
      set status = 'approved', reviewed_at = now(), review_reason = 'Connected browser acceptance approval'
      where id = v_application.id;

      insert into public.player_loans (
        public_key, game_session_id, player_id, business_id, loan_product_id, application_id,
        currency_code, original_principal, principal_balance, accrued_interest,
        annual_rate, origination_fee, scheduled_payment, status, next_due_at, last_accrued_at
      ) values (
        '${LOAN_KEY}', v_application.game_session_id, v_application.player_id, null,
        v_application.loan_product_id, v_application.id, v_product.currency_code,
        v_application.amount, v_application.amount, 0, v_product.annual_rate, 0,
        v_application.projected_payment, 'active', now() + interval '7 days', now()
      ) returning id into v_loan_id;

      select ledger_entry_id into v_ledger_entry
      from public.record_player_ledger_entry(
        v_application.game_session_id, v_application.player_id, 'checking', v_application.amount,
        v_product.currency_code, 'credit', 'loans', 'loan_disbursement', v_loan_id,
        'system', null, jsonb_build_object('loan_key', '${LOAN_KEY}', 'disposable', true)
      );
      update public.player_loans set disbursement_ledger_entry_id = v_ledger_entry where id = v_loan_id;
    end
    $$;
  `);
  evidence.loans.fixtureApproved = true;
}

async function proveLoans(page, fixtureData) {
  await openRoute(page, "loans", ".player-terminal-loans-page");
  const offer = page.locator("[data-player-loan-offer]").filter({ hasText: "Connected Player Credit" }).first();
  await offer.waitFor({ state: "visible", timeout: 30_000 });
  await offer.click();
  const form = page.locator(`form[data-endpoint="loanApply"][data-offer-id="${LOAN_PRODUCT_KEY}"]`);
  await openDisclosureForm(form);
  await form.locator('[name="amount"]').fill("500");
  await form.locator('[name="purpose"]').selectOption({ index: 0 });
  await form.locator('[name="repaymentSource"]').fill("Connected gameplay income and existing checking reserves.");
  const beforeApplications = applicationCount();
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/players/me/banking/loans/applications/${LOAN_PRODUCT_KEY}`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  if (response.status() !== 200) throw new Error(`Loan application returned ${response.status()}.`);
  evidence.loans.applicationSubmitted = true;
  if (applicationCount() !== beforeApplications + 1) throw new Error("Rendered loan application did not create exactly one application.");
  evidence.loans.applicationPersisted = true;

  approveLatestApplication();
  await reloadRoute(page, "loans", ".player-terminal-loans-page");
  const repayForm = page.locator(`form[data-endpoint="loanRepay"][data-loan-id="${LOAN_KEY}"]`);
  await openDisclosureForm(repayForm);
  const amountField = repayForm.locator('[name="amount"]');
  const beforeBalance = Number(await amountField.getAttribute("max"));
  await amountField.fill("10");
  const repayResponsePromise = page.waitForResponse(
    (candidate) => new URL(candidate.url()).pathname.endsWith(`/players/me/banking/loans/${LOAN_KEY}/payments`) && candidate.request().method() === "POST",
    { timeout: 60_000 },
  );
  await repayForm.locator('button[type="submit"]').click();
  const repayResponse = await repayResponsePromise;
  if (repayResponse.status() !== 200) throw new Error(`Loan repayment returned ${repayResponse.status()}.`);
  const original = await capture(repayResponse);
  evidence.loans.repaymentSubmitted = true;

  await reloadRoute(page, "loans", ".player-terminal-loans-page");
  const persistedForm = page.locator(`form[data-endpoint="loanRepay"][data-loan-id="${LOAN_KEY}"]`);
  await openDisclosureForm(persistedForm);
  const persistedBalance = Number(await persistedForm.locator('[name="amount"]').getAttribute("max"));
  if (!(persistedBalance < beforeBalance)) throw new Error(`Loan repayment did not reduce the balance: ${beforeBalance} -> ${persistedBalance}.`);
  evidence.loans.repaymentPersisted = true;

  const replayResult = await replay(page, original);
  if (replayResult.status !== 200 || replayResult.payload?.ok !== true) {
    throw new Error(`Loan repayment replay returned ${replayResult.status}: ${redact(JSON.stringify(replayResult.payload))}`);
  }
  await reloadRoute(page, "loans", ".player-terminal-loans-page");
  const replayForm = page.locator(`form[data-endpoint="loanRepay"][data-loan-id="${LOAN_KEY}"]`);
  await openDisclosureForm(replayForm);
  const replayBalance = Number(await replayForm.locator('[name="amount"]').getAttribute("max"));
  if (Math.abs(replayBalance - persistedBalance) > 0.01) throw new Error("Loan repayment replay duplicated the payment.");
  evidence.loans.replaySafe = true;

  const unauthorized = await request(new URL(original.url).pathname, {
    method: original.method,
    headers: platformHeaders(fixtureData.key),
    body: original.body,
  });
  if (![401, 403].includes(unauthorized.status)) throw new Error(`Unauthenticated loan repayment returned ${unauthorized.status}.`);
  evidence.loans.unauthenticatedRejected = true;
}

let browser;
let context;
let failure;
try {
  const fixtureData = await fixture();
  seedBankingAndLoanProduct();
  browser = await chromium.launch({ headless: true });
  ({ context, page: globalThis.__bankingPage } = await login(browser, fixtureData.gameCode));
  const page = globalThis.__bankingPage;
  await proveSavings(page, fixtureData);
  await proveLoans(page, fixtureData);

  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`Banking/Loans browser errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
  }
  if (evidence.responseUuidLeak) throw new Error("Banking/Loans responses exposed a raw UUID.");
  const incomplete = [...Object.values(evidence.savings), ...Object.values(evidence.loans)].some((value) => value !== true);
  if (incomplete) throw new Error("Connected Banking/Loans mutation evidence is incomplete.");
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(`${OUTPUT_DIR}/player-banking-loans-mutation-browser-acceptance.json`, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  delete globalThis.__bankingPage;
}

if (failure) throw failure;
console.log(JSON.stringify({ ok: true, savings: evidence.savings, loans: evidence.loans }));
