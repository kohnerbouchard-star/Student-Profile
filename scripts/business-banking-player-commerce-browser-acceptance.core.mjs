#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR || "/tmp/econovaria-player-browser";
const ADMIN_EMAIL = process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "player.e2e@example.test";
const ADMIN_PASSWORD = process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD || "Player-E2E-Admin-2026!";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Player Multiplayer E2E";
const CREDIT_AMOUNT = 10_000;
const TRANSFER_AMOUNT = 40;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const CURRENCY_PATTERN = /^[A-Z0-9]{3,16}$/;
const PLAYERS = Object.freeze([
  { label: "Alpha", displayName: "Browser Player Alpha", playerIdentifier: "BROWSER-PLAYER-ALPHA", accessCode: "BROWSER-ALPHA-ACCESS-001" },
  { label: "Beta", displayName: "Browser Player Beta", playerIdentifier: "BROWSER-PLAYER-BETA", accessCode: "BROWSER-BETA-ACCESS-002" },
]);

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  fixtureCredit: { applied: false, amount: CREDIT_AMOUNT, currencyCode: "" },
  transfer: {
    sent: false,
    senderPersisted: false,
    recipientPersisted: false,
    replayedWithoutDuplication: false,
    unauthenticatedRejected: false,
  },
  store: {
    quoteCreated: false,
    purchaseCompleted: false,
    ownershipPersisted: false,
    checkingPersisted: false,
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

async function parseJson(response) {
  return response.json().catch(() => null);
}

async function runtimeConfig() {
  const response = await fetch(`${BASE_URL}/runtime-config.env.js`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Runtime configuration returned ${response.status}.`);
  const match = (await response.text()).match(/Object\.freeze\((\{[\s\S]*\})\);?/);
  if (!match) throw new Error("Runtime configuration could not be parsed.");
  const publishableKey = String(JSON.parse(match[1]).supabasePublishableKey || "").trim();
  if (!publishableKey || publishableKey.startsWith("sb_secret_")) {
    throw new Error("A browser-safe Supabase publishable key is required.");
  }
  return publishableKey;
}

function platformHeaders(publishableKey, token = publishableKey, extra = {}) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: publishableKey,
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function request(path, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  return { status: response.status, ok: response.ok, payload: await parseJson(response) };
}

function walkObjects(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) walkObjects(item, output);
    return output;
  }
  output.push(value);
  for (const child of Object.values(value)) walkObjects(child, output);
  return output;
}

function findPlayer(payload, expected) {
  return walkObjects(payload).find((candidate) => {
    const displayName = String(candidate.displayName || candidate.display_name || "");
    const identifier = String(candidate.playerIdentifier || candidate.player_identifier || candidate.rosterLabel || "");
    const id = String(candidate.id || candidate.playerId || "");
    return Boolean(id) && (displayName === expected.displayName || identifier === expected.playerIdentifier);
  }) || null;
}

function assignedCurrency(record, label) {
  const currencyCode = String(record?.currencyCode || record?.currency_code || "").trim().toUpperCase();
  if (!CURRENCY_PATTERN.test(currencyCode)) {
    throw new Error(`Admin fixture could not resolve ${label}'s assigned country currency.`);
  }
  return currencyCode;
}

async function adminContext() {
  const publishableKey = await runtimeConfig();
  const signIn = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: platformHeaders(publishableKey),
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (signIn.status !== 200 || !signIn.payload?.access_token) {
    throw new Error(`Admin fixture sign-in returned ${signIn.status}.`);
  }
  const token = signIn.payload.access_token;
  const bootstrap = await request("/functions/v1/classroom-api/staff/bootstrap", {
    headers: platformHeaders(publishableKey, token),
  });
  if (bootstrap.status !== 200 || bootstrap.payload?.ok !== true) {
    throw new Error(`Admin fixture bootstrap returned ${bootstrap.status}.`);
  }
  const games = Array.isArray(bootstrap.payload.activeGameSessions)
    ? bootstrap.payload.activeGameSessions
    : [];
  const game = games.find((candidate) => candidate?.name === GAME_NAME) || games[0];
  const gameId = String(game?.id || "");
  const gameCode = String(game?.gameCode || game?.joinCode || "");
  if (!gameId || !gameCode) throw new Error("Admin fixture could not resolve the connected game.");

  const playersResponse = await request(`/functions/v1/admin-api/games/${encodeURIComponent(gameId)}/players`, {
    headers: platformHeaders(publishableKey, token, { "X-Econovaria-Game-Id": gameId }),
  });
  if (playersResponse.status !== 200) {
    throw new Error(`Admin Player list returned ${playersResponse.status}.`);
  }
  const players = PLAYERS.map((expected) => {
    const record = findPlayer(playersResponse.payload, expected);
    if (!record) throw new Error(`Admin fixture could not resolve ${expected.label}.`);
    return {
      ...expected,
      internalId: String(record.id || record.playerId),
      currencyCode: assignedCurrency(record, expected.label),
    };
  });
  return { publishableKey, token, gameId, gameCode, players };
}

async function creditPlayer(admin, player, currencyCode) {
  const idempotencyKey = `commerce-fixture-${player.label.toLowerCase()}-${Date.now()}`;
  const response = await request(
    `/functions/v1/admin-api/games/${encodeURIComponent(admin.gameId)}/players/${encodeURIComponent(player.internalId)}/ledger-adjustments`,
    {
      method: "POST",
      headers: platformHeaders(admin.publishableKey, admin.token, {
        "X-Econovaria-Game-Id": admin.gameId,
        "X-Idempotency-Key": idempotencyKey,
      }),
      body: {
        amount: CREDIT_AMOUNT,
        reason: "Disposable connected commerce acceptance fixture",
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
    throw new Error(`Admin fixture credit returned ${response.status}: ${redact(JSON.stringify(response.payload))}`);
  }
}

function instrument(page, label) {
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(`${label}: ${redact(message.text())}`);
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(`${label}: ${redact(error?.message || error)}`));
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/functions/v1/classroom-api/")) return;
    evidence.requests.push({ label, method: response.request().method(), path: redact(new URL(url).pathname), status: response.status() });
    const contentType = response.headers()["content-type"] || "";
    if (!contentType.includes("application/json")) return;
    const body = await response.text().catch(() => "");
    UUID_PATTERN.lastIndex = 0;
    if (UUID_PATTERN.test(body)) evidence.responseUuidLeak = true;
  });
}

async function loginPlayer(browser, gameCode, player) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  instrument(page, player.label);
  await page.goto(`${BASE_URL}/?mode=player&gameCode=${encodeURIComponent(gameCode)}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("#gameCode").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#playerId").fill(player.playerIdentifier);
  await page.locator("#playerAccessCode").fill(player.accessCode);
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/classroom-api/players/login") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.locator("#playerForm button[type='submit']").click();
  const response = await responsePromise;
  if (response.status() !== 200) throw new Error(`${player.label} login returned ${response.status()}.`);
  await page.waitForURL(/\/player-terminal\/(?:index\.html)?(?:#.*)?$/, { timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  return { ...player, context, page };
}

async function openRoute(session, route, selector) {
  const nav = session.page.locator(`[data-route="${route}"]:visible`).first();
  if (await nav.count()) {
    await nav.click();
  } else {
    await session.page.evaluate((target) => {
      const nextHash = `#${target}`;
      if (location.hash === nextHash) {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      } else {
        location.hash = nextHash;
      }
    }, route);
  }
  await session.page.waitForFunction((target) => location.hash === `#${target}`, route, { timeout: 30_000 });
  await session.page.locator(selector).waitFor({ state: "visible", timeout: 30_000 });
}

function parseCurrencyAmount(text) {
  const match = String(text).replace(/,/g, "").match(/(-?[0-9]+(?:\.[0-9]{1,2})?)/);
  if (!match) throw new Error(`Could not parse currency amount from ${redact(text)}.`);
  return Number(match[1]);
}

async function balanceForCurrency(session, currencyCode) {
  await openRoute(session, "banking", ".player-terminal-banking-page");
  const card = session.page.locator(`[data-player-banking-balance="checking:${currencyCode}"], [data-player-banking-balance="cash:${currencyCode}"]`).first();
  if (!(await card.count())) return 0;
  await card.waitFor({ state: "visible", timeout: 30_000 });
  return parseCurrencyAmount(await card.locator("h3").innerText());
}

async function sendTransfer(sender, recipient, currencyCode) {
  await openRoute(sender, "banking", ".player-terminal-banking-page");
  const form = sender.page.locator('form[data-endpoint="bankTransfer"]');
  await form.evaluate((element) => { const details = element.closest("details"); if (details) details.open = true; });
  await form.locator('[name="recipientPlayerIdentifier"]').fill(recipient.playerIdentifier);
  await form.locator('[name="amount"]').fill(String(TRANSFER_AMOUNT));
  await form.locator('[name="memo"]').fill("Connected secure transfer verification");
  const responsePromise = sender.page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/banking/transfers") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  if (response.status() !== 200 || payload?.ok !== true) {
    throw new Error(`Player transfer returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  const resultCurrency = String(payload?.transfer?.currencyCode || payload?.currencyCode || "").toUpperCase();
  if (resultCurrency && resultCurrency !== currencyCode) {
    throw new Error(`Player transfer settled in ${resultCurrency} instead of ${currencyCode}.`);
  }
  evidence.transfer.sent = true;
  const requestRecord = response.request();
  const headers = await requestRecord.allHeaders();
  const allowed = new Set(["accept", "apikey", "authorization", "content-type", "x-player-session", "x-player-session-token", "x-idempotency-key", "x-request-id"]);
  return {
    currencyCode,
    url: response.url(),
    body: requestRecord.postData() || "{}",
    headers: Object.fromEntries(Object.entries(headers).filter(([name]) => allowed.has(name.toLowerCase()))),
  };
}

async function replayTransfer(sender, original) {
  return sender.page.evaluate(async ({ url, headers, body }) => {
    const response = await fetch(url, { method: "POST", headers, body, cache: "no-store" });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }, original);
}

function includesReplayTrue(value) {
  return walkObjects(value).some((candidate) => candidate.replayed === true);
}

async function purchaseStoreItem(session, currencyCode) {
  await openRoute(session, "store", ".player-terminal-store-page");
  const button = session.page.locator("[data-player-purchase]:not([disabled])").first();
  await button.waitFor({ state: "visible", timeout: 30_000 });
  const itemKey = String(await button.getAttribute("data-player-purchase"));
  const card = button.locator("xpath=ancestor::article[1]");
  const beforeText = String(await card.innerText());
  const beforeOwned = Number(beforeText.match(/OWNED\s+(\d+)/i)?.[1] || 0);
  const checkingBefore = await balanceForCurrency(session, currencyCode);
  await openRoute(session, "store", ".player-terminal-store-page");
  await session.page.locator(`[data-player-purchase="${itemKey}"]`).click();
  const modal = session.page.locator('[aria-labelledby="storePurchaseModalTitle"]').last();
  await modal.waitFor({ state: "visible", timeout: 30_000 });

  const quotePromise = session.page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/store/quotes") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await modal.locator("[data-player-store-review]").click();
  const quoteResponse = await quotePromise;
  if (quoteResponse.status() !== 200) throw new Error(`Store quote returned ${quoteResponse.status()}.`);
  evidence.store.quoteCreated = true;

  const reviewModal = session.page.locator('[aria-labelledby="storePurchaseModalTitle"]').last();
  await reviewModal.locator("[data-player-store-confirm]").waitFor({ state: "visible", timeout: 30_000 });
  const purchasePromise = session.page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/store/purchases") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await reviewModal.locator("[data-player-store-confirm]").click();
  const purchaseResponse = await purchasePromise;
  const purchasePayload = await parseJson(purchaseResponse);
  if (purchaseResponse.status() !== 200 || purchasePayload?.ok !== true) {
    throw new Error(`Store purchase returned ${purchaseResponse.status()}: ${redact(JSON.stringify(purchasePayload))}`);
  }
  evidence.store.purchaseCompleted = true;
  const purchaseRequest = purchaseResponse.request();
  const unauthorizedBody = purchaseRequest.postData() || "{}";
  const close = session.page.locator('[aria-labelledby="storePurchaseModalTitle"] [data-player-local-action="close-modal"]').last();
  if (await close.count()) await close.click();

  await session.page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await session.page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  await openRoute(session, "store", ".player-terminal-store-page");
  const persistedCard = session.page.locator(`[data-player-purchase="${itemKey}"]`).locator("xpath=ancestor::article[1]");
  const afterOwned = Number(String(await persistedCard.innerText()).match(/OWNED\s+(\d+)/i)?.[1] || 0);
  if (afterOwned !== beforeOwned + 1) {
    throw new Error(`Store ownership did not increment exactly once: ${beforeOwned} -> ${afterOwned}.`);
  }
  evidence.store.ownershipPersisted = true;

  const checkingAfter = await balanceForCurrency(session, currencyCode);
  if (!(checkingAfter < checkingBefore)) {
    throw new Error(`Store purchase did not reduce authoritative checking: ${checkingBefore} -> ${checkingAfter}.`);
  }
  evidence.store.checkingPersisted = true;
  return { url: purchaseResponse.url(), body: unauthorizedBody };
}

let browser;
const sessions = [];
let failure;
try {
  const admin = await adminContext();
  const currencyCode = admin.players[0].currencyCode;
  evidence.fixtureCredit.currencyCode = currencyCode;

  browser = await chromium.launch({ headless: true });
  const alpha = await loginPlayer(browser, admin.gameCode, admin.players[0]);
  const beta = await loginPlayer(browser, admin.gameCode, admin.players[1]);
  sessions.push(alpha, beta);

  const alphaInitial = await balanceForCurrency(alpha, currencyCode);
  await creditPlayer(admin, admin.players[0], currencyCode);
  evidence.fixtureCredit.applied = true;
  await alpha.page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await alpha.page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  const alphaFunded = await balanceForCurrency(alpha, currencyCode);
  if (Math.abs(alphaFunded - (alphaInitial + CREDIT_AMOUNT)) > 0.001) {
    throw new Error(`Fixture credit did not persist: ${alphaInitial} -> ${alphaFunded}.`);
  }

  const betaBefore = await balanceForCurrency(beta, currencyCode);
  const transfer = await sendTransfer(alpha, beta, currencyCode);
  await alpha.page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await beta.page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await alpha.page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  await beta.page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  const alphaAfter = await balanceForCurrency(alpha, currencyCode);
  const betaAfter = await balanceForCurrency(beta, currencyCode);
  if (Math.abs(alphaAfter - (alphaFunded - TRANSFER_AMOUNT)) > 0.001) {
    throw new Error(`Sender transfer balance mismatch: ${alphaFunded} -> ${alphaAfter}.`);
  }
  if (Math.abs(betaAfter - (betaBefore + TRANSFER_AMOUNT)) > 0.001) {
    throw new Error(`Recipient transfer balance mismatch: ${betaBefore} -> ${betaAfter}.`);
  }
  evidence.transfer.senderPersisted = true;
  evidence.transfer.recipientPersisted = true;

  const replay = await replayTransfer(alpha, transfer);
  if (replay.status !== 200 || replay.payload?.ok !== true || !includesReplayTrue(replay.payload)) {
    throw new Error(`Transfer replay was not recognized: ${replay.status} ${redact(JSON.stringify(replay.payload))}`);
  }
  await alpha.page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await beta.page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await alpha.page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  await beta.page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  if (Math.abs((await balanceForCurrency(alpha, currencyCode)) - alphaAfter) > 0.001 ||
      Math.abs((await balanceForCurrency(beta, currencyCode)) - betaAfter) > 0.001) {
    throw new Error("Transfer replay duplicated a ledger mutation.");
  }
  evidence.transfer.replayedWithoutDuplication = true;

  const unauthTransfer = await request(new URL(transfer.url).pathname, {
    method: "POST",
    headers: platformHeaders(admin.publishableKey),
    body: JSON.parse(transfer.body),
  });
  if (![401, 403].includes(unauthTransfer.status)) {
    throw new Error(`Unauthenticated Player transfer was not rejected: ${unauthTransfer.status}.`);
  }
  evidence.transfer.unauthenticatedRejected = true;

  const purchase = await purchaseStoreItem(alpha, currencyCode);
  const unauthPurchase = await request(new URL(purchase.url).pathname, {
    method: "POST",
    headers: platformHeaders(admin.publishableKey),
    body: JSON.parse(purchase.body),
  });
  if (![401, 403].includes(unauthPurchase.status)) {
    throw new Error(`Unauthenticated Store purchase was not rejected: ${unauthPurchase.status}.`);
  }
  evidence.store.unauthenticatedRejected = true;

  if (evidence.responseUuidLeak) throw new Error("A connected Player commerce response exposed a raw internal UUID.");
  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`Player commerce browser errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
  }
  if (!Object.values(evidence.transfer).every(Boolean) || !Object.values(evidence.store).every(Boolean)) {
    throw new Error("Connected Player commerce evidence is incomplete.");
  }
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(
    `${OUTPUT_DIR}/business-banking-player-commerce-browser-acceptance.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  for (const session of sessions) await session.context.close().catch(() => {});
  await browser?.close().catch(() => {});
}

if (failure) throw failure;

console.log(JSON.stringify({
  ok: true,
  transfer: evidence.transfer,
  store: evidence.store,
  requestCount: evidence.requests.length,
}));
