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
const PLAYERS = Object.freeze({
  seller: { id: "BROWSER-PLAYER-ALPHA", accessCode: "BROWSER-ALPHA-ACCESS-001" },
  buyer: { id: "BROWSER-PLAYER-BETA", accessCode: "BROWSER-BETA-ACCESS-002" },
});
const LISTING_ID = /^lst_[0-9a-f]{32}$/;
const RESERVATION_ID = /^mpr_[0-9a-f]{32}$/;
const ORDER_ID = /^ord_[0-9a-f]{32}$/;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  listing: { created: false, activated: false, persisted: false },
  purchase: { quoteCreated: false, quoteReplaySafe: false, completed: false, persisted: false, replaySafe: false, unauthenticatedRejected: false },
  dispute: { opened: false, persisted: false },
  cancellation: { created: false, cancelled: false, persisted: false },
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
  return { Accept: "application/json", "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${token}` };
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
  const games = Array.isArray(bootstrap.payload.activeGameSessions) ? bootstrap.payload.activeGameSessions : [];
  const game = games.find((item) => item?.name === GAME_NAME) || games[0];
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

function seedMarketplace() {
  const row = psql(`
    with scope as (
      select game.id as game_id, seller.id as seller_id, buyer.id as buyer_id
      from public.game_sessions game
      join public.players seller on seller.game_session_id = game.id
      join public.players buyer on buyer.game_session_id = game.id
      where game.name = '${GAME_NAME}'
        and seller.player_identifier_normalized = '${PLAYERS.seller.id}'
        and buyer.player_identifier_normalized = '${PLAYERS.buyer.id}'
      limit 1
    ), selected_item as (
      select item.id as item_id, item.item_key
      from public.store_items item, scope
      where item.game_session_id = scope.game_id
      order by item.created_at, item.id
      limit 1
    ), selected_currency as (
      select coalesce(
        (
          select account.currency_code
          from public.bank_accounts account
          join public.economic_parties party
            on party.id = account.party_id
           and party.game_session_id = account.game_session_id
          join scope on scope.game_id = account.game_session_id
          where party.party_kind = 'player'
            and party.player_id = scope.seller_id
            and party.status = 'active'
            and account.account_kind = 'checking'
            and account.status = 'active'
          order by account.created_at, account.id
          limit 1
        ),
        'ECO'
      ) as currency_code
    )
    select
      scope.game_id,
      scope.seller_id,
      scope.buyer_id,
      selected_item.item_id,
      selected_item.item_key,
      selected_currency.currency_code
    from scope, selected_item, selected_currency;
  `, true).split("|");
  if (row.length !== 6) {
    throw new Error("Marketplace fixture could not resolve game, players, item, and currency.");
  }
  const [gameId, sellerId, buyerId, itemId, itemKey, currency] = row;

  psql(`
    insert into public.inventory_holdings (
      game_session_id, player_id, store_item_id, quantity_owned, quantity_reserved
    ) values ('${gameId}', '${sellerId}', '${itemId}', 10, 0)
    on conflict on constraint inventory_holdings_scope_unique
    do update set
      quantity_owned = greatest(public.inventory_holdings.quantity_owned, 10),
      quantity_reserved = 0;

    insert into public.marketplace_policies (
      game_session_id,
      marketplace_enabled,
      cross_country_trading_enabled,
      moderation_required,
      disputes_enabled
    ) values ('${gameId}', true, true, false, true)
    on conflict (game_session_id) do update set
      marketplace_enabled = true,
      cross_country_trading_enabled = true,
      moderation_required = false,
      disputes_enabled = true;

    select public.record_player_ledger_entry(
      '${gameId}',
      '${sellerId}',
      'checking',
      1000,
      '${currency}',
      'credit',
      'ledger',
      'staff_player_balance_adjustment',
      null,
      'system',
      null,
      jsonb_build_object(
        'disposable', true,
        'bankTransactionIdempotencyKey',
        'connected-marketplace-seller-seed-v1-${currency}'
      )
    );
    select public.record_player_ledger_entry(
      '${gameId}',
      '${buyerId}',
      'checking',
      1000,
      '${currency}',
      'credit',
      'ledger',
      'staff_player_balance_adjustment',
      null,
      'system',
      null,
      jsonb_build_object(
        'disposable', true,
        'bankTransactionIdempotencyKey',
        'connected-marketplace-buyer-seed-v1-${currency}'
      )
    );
  `);

  const buyerAccountKey = psql(`
    select account.public_key
    from public.bank_accounts account
    join public.economic_parties party
      on party.id = account.party_id
     and party.game_session_id = account.game_session_id
    where account.game_session_id = '${gameId}'
      and party.party_kind = 'player'
      and party.player_id = '${buyerId}'
      and party.status = 'active'
      and account.account_kind = 'checking'
      and account.currency_code = '${currency}'
      and account.status = 'active'
    order by account.created_at, account.id
    limit 1;
  `, true);
  if (!/^bac_[0-9a-f]{32}$/u.test(buyerAccountKey)) {
    throw new Error("Marketplace fixture could not resolve the Buyer Checking account.");
  }
  return { itemKey, currency, buyerAccountKey };
}

function instrument(page, label) {
  page.on("request", (request) => {
    const url = request.url();
    if (!url.includes("/functions/v1/player-web-session-api/")) return;
    const headers = request.headers();
    if (
      headers.authorization !== undefined ||
      headers["x-player-session-token"] !== undefined ||
      headers["x-econovaria-player-session-token"] !== undefined
    ) {
      evidence.pageErrors.push(
        `${label}: browser exposed a Player credential on ${redact(url)}`,
      );
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(`${label}: ${redact(message.text())}`);
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(`${label}: ${redact(error?.message || error)}`));
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/functions/v1/classroom-api/") && !url.includes("/functions/v1/player-web-session-api/")) return;
    evidence.requests.push({ label, method: response.request().method(), path: redact(new URL(url).pathname), status: response.status() });
    if (!(response.headers()["content-type"] || "").includes("application/json")) return;
    const body = await response.text().catch(() => "");
    UUID_PATTERN.lastIndex = 0;
    if (UUID_PATTERN.test(body)) evidence.responseUuidLeak = true;
  });
}

async function login(browser, gameCode, player, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  instrument(page, label);
  await page.goto(`${BASE_URL}/?mode=player&gameCode=${encodeURIComponent(gameCode)}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("#gameCode").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#playerId").fill(player.id);
  await page.locator("#playerAccessCode").fill(player.accessCode);
  const loginResponse = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/player-web-session-api/login") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.locator("#playerForm button[type='submit']").click();
  if ((await loginResponse).status() !== 200) throw new Error(`${label} login failed.`);
  await page.waitForURL(/\/player-terminal\/(?:index\.html)?(?:#.*)?$/u, { timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  return { context, page };
}

async function openMarketplace(page) {
  const control = page.locator('[data-route="marketplace"]:visible').first();
  if (!(await control.isVisible().catch(() => false))) {
    const tradeEntry = page.locator('[data-route="store"]:visible').first();
    await tradeEntry.waitFor({ state: "visible", timeout: 30_000 });
    await tradeEntry.click();
    await page.waitForFunction(() => location.hash === "#store", undefined, { timeout: 30_000 });
  }
  await control.waitFor({ state: "visible", timeout: 30_000 });
  await control.click();
  await page.waitForFunction(() => location.hash === "#marketplace", undefined, { timeout: 30_000 });
  await page.locator(".player-terminal-marketplace-page").waitFor({ state: "visible", timeout: 60_000 });
}

async function reloadMarketplace(page) {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  await openMarketplace(page);
}

async function capture(response) {
  const record = response.request();
  const headers = await record.allHeaders();
  const allowed = new Set(["accept", "apikey", "content-type", "idempotency-key", "x-idempotency-key", "x-econovaria-csrf-token", "x-request-id"]);
  return { url: response.url(), method: record.method(), body: record.postData() || "{}", headers: Object.fromEntries(Object.entries(headers).filter(([name]) => allowed.has(name.toLowerCase()))) };
}

async function replay(page, original) {
  return page.evaluate(async ({ url, method, headers, body }) => {
    const response = await fetch(url, { method, headers, body, cache: "no-store", credentials: "include" });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }, original);
}

async function createListing(page, fixtureData, price) {
  await openMarketplace(page);
  const form = page.locator('form[data-endpoint="marketplaceListing"]');
  const details = form.locator("xpath=ancestor::details[1]");
  if (await details.count() && !(await details.evaluate((node) => node.open))) await details.locator("summary").click();
  await form.waitFor({ state: "visible", timeout: 30_000 });
  await form.locator('[name="itemKey"]').selectOption(fixtureData.itemKey);
  await form.locator('[name="quantity"]').fill("1");
  await form.locator('[name="unitPrice"]').fill(String(price));
  const currencyField = form.locator('[name="currencyCode"]');
  if (await currencyField.count()) {
    await currencyField.evaluate((element, value) => { element.value = value; }, fixtureData.currency);
  }
  await form.locator('[name="condition"]').selectOption("Used");
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/marketplace/listings") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  const listingId = String(payload?.target?.id || "").trim();
  if (response.status() !== 201 || payload?.ok !== true || payload?.outcome !== "applied" || !LISTING_ID.test(listingId)) {
    throw new Error(`Create listing failed: ${response.status()} ${redact(JSON.stringify(payload))}`);
  }
  return { listingId, version: Number(payload.target.version) };
}

async function activateListing(page, listing) {
  await reloadMarketplace(page);
  const form = page.locator(`form[data-endpoint="marketplaceActivate"] input[name="listingId"][value="${listing.listingId}"]`).locator("xpath=ancestor::form[1]");
  await form.waitFor({ state: "visible", timeout: 30_000 });
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/players/me/marketplace/listings/${listing.listingId}/activate`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  if (response.status() !== 200 || payload?.ok !== true || payload?.target?.status !== "active") throw new Error(`Activate listing failed: ${response.status()}.`);
  evidence.listing.activated = true;
  await reloadMarketplace(page);
  const cancelControl = page.locator(
    `form[data-endpoint="marketplaceCancel"] input[name="listingId"][value="${listing.listingId}"]`,
  );
  await cancelControl.waitFor({ state: "attached", timeout: 30_000 });
  const staleActivateControl = page.locator(
    `form[data-endpoint="marketplaceActivate"] input[name="listingId"][value="${listing.listingId}"]`,
  );
  if (await staleActivateControl.count()) {
    throw new Error("Activated seller listing still rendered the draft activation control.");
  }
  evidence.listing.persisted = true;
}

async function purchaseListing(page, listing, fixtureData) {
  await reloadMarketplace(page);
  const card = page.locator(`[data-player-marketplace-select="${listing.listingId}"]`);
  await card.waitFor({ state: "visible", timeout: 30_000 });
  await card.click();

  const quoteForm = page.locator(
    `[data-player-marketplace-funding-form="quote"][data-listing-id="${listing.listingId}"]`,
  );
  await quoteForm.waitFor({ state: "visible", timeout: 30_000 });
  await quoteForm.locator('[name="quantity"]').fill("1");
  await quoteForm.locator('[name="sourceAccountKey"]').first().selectOption(
    fixtureData.buyerAccountKey,
  );
  const targetAmountInput = quoteForm.locator('[name="targetAmount"]').first();
  const targetAmount = Number(await targetAmountInput.inputValue());
  if (!(targetAmount > 0)) {
    throw new Error("Marketplace quote form did not expose a positive exact bill.");
  }

  const quoteResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(
        `/players/me/marketplace/listings/${listing.listingId}/quotes`,
      ) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await quoteForm.locator('button[type="submit"]').click();
  const quoteResponse = await quoteResponsePromise;
  const quotePayload = await parseJson(quoteResponse);
  const reservationId = String(
    quotePayload?.reservation?.reservationKey || "",
  ).trim();
  if (
    ![200, 201].includes(quoteResponse.status()) ||
    quotePayload?.ok !== true ||
    !RESERVATION_ID.test(reservationId) ||
    quotePayload?.reservation?.fundingQuote?.fundingContextKey !== reservationId
  ) {
    throw new Error(
      `Marketplace funding quote failed: ${quoteResponse.status()} ${redact(JSON.stringify(quotePayload))}`,
    );
  }
  evidence.purchase.quoteCreated = true;

  const originalQuote = await capture(quoteResponse);
  const quoteReplay = await replay(page, originalQuote);
  if (
    quoteReplay.status !== 200 ||
    quoteReplay.payload?.ok !== true ||
    quoteReplay.payload?.outcome !== "replayed" ||
    quoteReplay.payload?.reservation?.reservationKey !== reservationId
  ) {
    throw new Error(
      `Marketplace quote replay failed: ${quoteReplay.status} ${redact(JSON.stringify(quoteReplay.payload))}`,
    );
  }
  evidence.purchase.quoteReplaySafe = true;

  const settlementForm = page.locator(
    `[data-player-marketplace-funding-form="settlement"][data-reservation-id="${reservationId}"]`,
  );
  await settlementForm.waitFor({ state: "visible", timeout: 30_000 });
  const settlementResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith(
        `/players/me/marketplace/reservations/${reservationId}/settlements`,
      ) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await settlementForm.locator('button[type="submit"]').click();
  const settlementResponse = await settlementResponsePromise;
  const settlementPayload = await parseJson(settlementResponse);
  const orderId = String(settlementPayload?.order?.orderKey || "").trim();
  if (
    settlementResponse.status() !== 200 ||
    settlementPayload?.ok !== true ||
    !ORDER_ID.test(orderId) ||
    settlementPayload?.order?.reservationKey !== reservationId
  ) {
    throw new Error(
      `Marketplace settlement failed: ${settlementResponse.status()} ${redact(JSON.stringify(settlementPayload))}`,
    );
  }
  const originalSettlement = await capture(settlementResponse);
  evidence.purchase.completed = true;

  await reloadMarketplace(page);
  const orderOption = page.locator(
    `form[data-endpoint="marketplaceDispute"] option[value="${orderId}"]`,
  );
  await orderOption.waitFor({ state: "attached", timeout: 30_000 });
  evidence.purchase.persisted = true;

  const settlementReplay = await replay(page, originalSettlement);
  if (
    settlementReplay.status !== 200 ||
    settlementReplay.payload?.ok !== true ||
    settlementReplay.payload?.outcome !== "replayed" ||
    settlementReplay.payload?.order?.orderKey !== orderId
  ) {
    throw new Error(
      `Marketplace settlement replay failed: ${settlementReplay.status} ${redact(JSON.stringify(settlementReplay.payload))}`,
    );
  }
  evidence.purchase.replaySafe = true;

  const unauthorized = await request(new URL(originalSettlement.url).pathname, {
    method: originalSettlement.method,
    headers: platformHeaders(fixtureData.key),
    body: originalSettlement.body,
  });
  if (![401, 403].includes(unauthorized.status)) {
    throw new Error(
      `Unauthenticated Marketplace settlement returned ${unauthorized.status}.`,
    );
  }
  evidence.purchase.unauthenticatedRejected = true;
  return orderId;
}

async function disputeOrder(page, orderId) {
  const form = page.locator('form[data-endpoint="marketplaceDispute"]');
  const details = form.locator("xpath=ancestor::details[1]");
  if (await details.count() && !(await details.evaluate((node) => node.open))) await details.locator("summary").click();
  await form.waitFor({ state: "visible", timeout: 30_000 });
  await form.locator('[name="orderId"]').selectOption(orderId);
  await form.locator('[name="reason"]').fill("The delivered item materially differed from the connected acceptance listing.");
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/players/me/marketplace/orders/${orderId}/disputes`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  if (response.status() !== 201 || payload?.ok !== true || payload?.target?.status !== "open") throw new Error(`Open dispute failed: ${response.status()}.`);
  evidence.dispute.opened = true;
  await reloadMarketplace(page);
  await page.getByText(/materially differed from the connected acceptance listing/iu).waitFor({ state: "visible", timeout: 30_000 });
  evidence.dispute.persisted = true;
}

async function cancelListing(page, listing) {
  await reloadMarketplace(page);
  const form = page.locator(`form[data-endpoint="marketplaceCancel"] input[name="listingId"][value="${listing.listingId}"]`).locator("xpath=ancestor::form[1]");
  await form.waitFor({ state: "visible", timeout: 30_000 });
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/players/me/marketplace/listings/${listing.listingId}/cancel`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  if (response.status() !== 200 || payload?.ok !== true || payload?.target?.status !== "cancelled") throw new Error(`Cancel listing failed: ${response.status()}.`);
  evidence.cancellation.cancelled = true;
  await reloadMarketplace(page);
  const statusArticle = page.locator(".player-terminal-marketplace-mine article").filter({ has: page.locator(`input[name="listingId"][value="${listing.listingId}"]`) });
  if (await statusArticle.count()) throw new Error("Cancelled listing still rendered actionable controls.");
  evidence.cancellation.persisted = true;
}

let browser;
const contexts = [];
let failure;
try {
  const auth = await fixture();
  const seeded = seedMarketplace();
  const fixtureData = { ...auth, ...seeded };
  browser = await chromium.launch({ headless: true });
  const seller = await login(browser, auth.gameCode, PLAYERS.seller, "Seller");
  const buyer = await login(browser, auth.gameCode, PLAYERS.buyer, "Buyer");
  contexts.push(seller.context, buyer.context);

  const first = await createListing(seller.page, fixtureData, 5);
  evidence.listing.created = true;
  await activateListing(seller.page, first);
  const orderId = await purchaseListing(buyer.page, first, fixtureData);
  await disputeOrder(buyer.page, orderId);

  const second = await createListing(seller.page, fixtureData, 7);
  evidence.cancellation.created = true;
  await cancelListing(seller.page, second);

  if (evidence.consoleErrors.length || evidence.pageErrors.length) throw new Error(`Marketplace browser errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
  if (evidence.responseUuidLeak) throw new Error("Marketplace responses exposed a raw UUID.");
  const incomplete = [...Object.values(evidence.listing), ...Object.values(evidence.purchase), ...Object.values(evidence.dispute), ...Object.values(evidence.cancellation)].some((value) => value !== true);
  if (incomplete) throw new Error("Connected Marketplace evidence is incomplete.");
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(`${OUTPUT_DIR}/player-marketplace-mutation-browser-acceptance.json`, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close().catch(() => {});
}

if (failure) throw failure;
console.log(JSON.stringify({ ok: true, listing: evidence.listing, purchase: evidence.purchase, dispute: evidence.dispute, cancellation: evidence.cancellation }));
