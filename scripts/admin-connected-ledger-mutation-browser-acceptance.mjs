#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = process.env.ECONOVARIA_BROWSER_OUTPUT_DIR || "/tmp/econovaria-browser";
const ADMIN_EMAIL = process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "browser.e2e@example.test";
const ADMIN_PASSWORD = process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD || "Browser-E2E-Access-2026!";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Browser E2E Economy";
const PLAYER_NAME = "Browser E2E Player";
const ADJUSTMENT = 25;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  adminAuthenticated: false,
  playerLocated: false,
  modalOpened: false,
  controlInventory: [],
  mutation: {
    applied: false,
    persistedAfterReload: false,
    replayedWithoutDuplication: false,
    unauthenticatedRejected: false,
  },
  requests: [],
  consoleErrors: [],
  pageErrors: [],
};

function redact(value) {
  return String(value || "")
    .replace(UUID_PATTERN, "[uuid-redacted]")
    .replace(/ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}/g, "[game-code-redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jwt-redacted]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[supabase-key-redacted]");
}

async function runtimeConfig() {
  const response = await fetch(`${BASE_URL}/runtime-config.env.js`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Runtime configuration returned ${response.status}.`);
  const source = await response.text();
  const match = source.match(/Object\.freeze\((\{[\s\S]*\})\);?/);
  if (!match) throw new Error("Runtime configuration could not be parsed.");
  const config = JSON.parse(match[1]);
  const publishableKey = String(config.supabasePublishableKey || "").trim();
  if (!publishableKey || publishableKey.startsWith("sb_secret_")) {
    throw new Error("A browser-safe Supabase publishable key is required.");
  }
  return { publishableKey };
}

function platformHeaders(publishableKey, token = publishableKey) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: publishableKey,
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
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  return { status: response.status, ok: response.ok, payload };
}

async function authenticateAdmin() {
  const { publishableKey } = await runtimeConfig();
  const signIn = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: platformHeaders(publishableKey),
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (signIn.status !== 200 || !signIn.payload?.access_token) {
    throw new Error(`Connected Admin sign-in returned ${signIn.status}.`);
  }
  const accessToken = signIn.payload.access_token;
  const bootstrap = await request("/functions/v1/classroom-api/staff/bootstrap", {
    headers: platformHeaders(publishableKey, accessToken),
  });
  if (bootstrap.status !== 200 || bootstrap.payload?.ok !== true) {
    throw new Error(`Connected staff bootstrap returned ${bootstrap.status}.`);
  }
  const sessions = Array.isArray(bootstrap.payload.activeGameSessions)
    ? bootstrap.payload.activeGameSessions
    : [];
  const game = sessions.find((item) => item?.name === GAME_NAME) || sessions[0];
  const gameId = String(game?.id || "").trim();
  if (!gameId) throw new Error("Connected Admin bootstrap did not return the expected game.");
  evidence.adminAuthenticated = true;
  return {
    publishableKey,
    gameId,
    adminRecord: {
      accessToken,
      refreshToken: String(signIn.payload.refresh_token || ""),
      csrfToken: "",
      user: signIn.payload.user || null,
    },
  };
}

function instrument(page) {
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(redact(message.text()));
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(redact(error?.message || error)));
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/functions/v1/") && !url.includes("/auth/v1/")) return;
    evidence.requests.push({
      method: response.request().method(),
      path: redact(new URL(url).pathname),
      status: response.status(),
    });
  });
}

async function waitForAdminConsole(page) {
  await page.waitForURL(/\/admin\/(?:index\.html)?(?:\?.*)?$/, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const preview = document.getElementById("adminPreview");
    return Boolean(preview && !preview.hidden && preview.childElementCount > 0);
  }, undefined, { timeout: 120_000 });
  await page.waitForTimeout(1000);
}

async function navigatePlayers(page) {
  await page.getByRole("button", { name: "Players", exact: true }).click();
  await page.getByText(PLAYER_NAME, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
}

function playerRow(page) {
  return page.getByText(PLAYER_NAME, { exact: true })
    .locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' admin-terminal-player-row ')][1]");
}

async function readCashText(page) {
  const row = playerRow(page);
  await row.waitFor({ state: "visible", timeout: 30_000 });
  const text = String(await row.innerText()).replace(/\s+/g, " ").trim();
  const match = text.match(/CASH\s+[^0-9-]*(-?[0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (!match) throw new Error(`Could not read Player cash from row: ${redact(text)}`);
  return {
    text: match[0],
    amount: Number(match[1].replace(/,/g, "")),
  };
}

async function visibleMutationModal(page) {
  const modal = page.locator([
    "[data-admin-terminal-modal-backdrop]:visible [role='dialog']",
    "[data-admin-terminal-modal-backdrop]:visible",
    "[role='dialog']:visible",
  ].join(", ")).last();
  await modal.waitFor({ state: "visible", timeout: 30_000 });
  return modal;
}

async function inventoryControls(modal) {
  return modal.locator("input, select, textarea, button").evaluateAll((controls) => controls.map((control) => ({
    tag: control.tagName.toLowerCase(),
    type: control.getAttribute("type") || "",
    name: control.getAttribute("name") || "",
    value: control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement
      ? String(control.value || "").slice(0, 80)
      : "",
    text: String(control.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
    ariaLabel: control.getAttribute("aria-label") || "",
    disabled: Boolean(control.disabled),
  })));
}

async function fillBalanceModal(modal) {
  const amount = modal.locator([
    'input[name="amount"]',
    'input[name*="amount" i]',
    'input[type="number"]',
  ].join(", ")).filter({ visible: true }).first();
  await amount.waitFor({ state: "visible", timeout: 10_000 });
  await amount.fill(String(ADJUSTMENT));

  const reason = modal.locator([
    'textarea[name="reason"]',
    'input[name="reason"]',
    'textarea[name*="reason" i]',
    'input[name*="reason" i]',
  ].join(", ")).filter({ visible: true }).first();
  if (await reason.count()) await reason.fill("Connected browser mutation verification");

  const selects = modal.locator("select:visible");
  for (let index = 0; index < await selects.count(); index += 1) {
    const select = selects.nth(index);
    const options = await select.locator("option").evaluateAll((nodes) => nodes.map((node) => ({
      value: node.value,
      text: String(node.textContent || "").trim(),
    })));
    const credit = options.find((option) => /credit|add|increase/i.test(`${option.value} ${option.text}`));
    const cash = options.find((option) => /cash/i.test(`${option.value} ${option.text}`));
    const eld = options.find((option) => /^ELD$/i.test(option.value) || /\bELD\b/i.test(option.text));
    if (credit) await select.selectOption(credit.value);
    else if (cash) await select.selectOption(cash.value);
    else if (eld) await select.selectOption(eld.value);
  }

  const creditRadio = modal.locator([
    'input[type="radio"][value="credit"]',
    'input[type="radio"][value="add"]',
    'input[type="radio"][value="increase"]',
  ].join(", ")).first();
  if (await creditRadio.count()) await creditRadio.check();
}

async function submitBalanceMutation(page, modal) {
  const responsePromise = page.waitForResponse(
    (response) => /\/functions\/v1\/admin-api\/games\/[^/]+\/players\/[^/]+\/ledger-adjustments$/.test(new URL(response.url()).pathname) &&
      response.request().method() === "POST",
    { timeout: 60_000 },
  );
  const submit = modal.getByRole("button", { name: /apply|confirm|adjust|save|credit|update/i }).last();
  await submit.waitFor({ state: "visible", timeout: 10_000 });
  await submit.click();
  const response = await responsePromise;
  const payload = await response.json().catch(() => null);
  if (response.status() !== 200 || payload?.ok !== true || payload?.outcome !== "applied") {
    throw new Error(`Admin ledger adjustment returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  const request = response.request();
  const requestHeaders = await request.allHeaders();
  const replayHeaders = Object.fromEntries(Object.entries(requestHeaders).filter(([name]) => [
    "accept",
    "apikey",
    "authorization",
    "content-type",
    "x-econovaria-csrf",
    "x-econovaria-game-id",
    "x-idempotency-key",
    "x-request-id",
  ].includes(name.toLowerCase())));
  return {
    url: response.url(),
    body: request.postData() || "{}",
    headers: replayHeaders,
    balance: Number(payload.ledgerEntry?.balance),
    currencyCode: String(payload.ledgerEntry?.currencyCode || ""),
  };
}

async function replayMutation(page, original) {
  return page.evaluate(async ({ url, headers, body }) => {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
    });
    return {
      status: response.status,
      payload: await response.json().catch(() => null),
    };
  }, original);
}

let browser;
let context;
let failure;
try {
  const auth = await authenticateAdmin();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await context.addInitScript(({ origin, adminRecord, gameId }) => {
    try {
      if (location.origin !== origin) return;
      sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify(adminRecord));
      sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
    } catch (_) {}
  }, { origin: new URL(BASE_URL).origin, adminRecord: auth.adminRecord, gameId: auth.gameId });

  const page = await context.newPage();
  instrument(page);
  await page.goto(`${BASE_URL}/admin/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForAdminConsole(page);
  await navigatePlayers(page);
  evidence.playerLocated = true;

  const before = await readCashText(page);
  const row = playerRow(page);
  const adjust = row.locator('[data-admin-terminal-action="adjust-player-balance"]');
  await adjust.waitFor({ state: "visible", timeout: 30_000 });
  await adjust.click();
  const modal = await visibleMutationModal(page);
  evidence.modalOpened = true;
  evidence.controlInventory = await inventoryControls(modal);
  await fillBalanceModal(modal);
  const original = await submitBalanceMutation(page, modal);
  evidence.mutation.applied = true;

  await navigatePlayers(page);
  const after = await readCashText(page);
  if (Math.abs(after.amount - (before.amount + ADJUSTMENT)) > 0.001) {
    throw new Error(`Rendered cash did not apply exactly one adjustment: ${before.amount} -> ${after.amount}.`);
  }

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForAdminConsole(page);
  await navigatePlayers(page);
  const persisted = await readCashText(page);
  if (Math.abs(persisted.amount - after.amount) > 0.001) {
    throw new Error(`Admin ledger adjustment did not persist after reload: ${after.amount} -> ${persisted.amount}.`);
  }
  evidence.mutation.persistedAfterReload = true;

  const replay = await replayMutation(page, original);
  if (replay.status !== 200 || replay.payload?.ok !== true || replay.payload?.outcome !== "replayed") {
    throw new Error(`Idempotent replay was not recognized: ${replay.status} ${redact(JSON.stringify(replay.payload))}`);
  }
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForAdminConsole(page);
  await navigatePlayers(page);
  const afterReplay = await readCashText(page);
  if (Math.abs(afterReplay.amount - persisted.amount) > 0.001) {
    throw new Error(`Idempotent replay duplicated the balance mutation: ${persisted.amount} -> ${afterReplay.amount}.`);
  }
  evidence.mutation.replayedWithoutDuplication = true;

  const unauthorized = await request(new URL(original.url).pathname, {
    method: "POST",
    headers: platformHeaders(auth.publishableKey),
    body: JSON.parse(original.body),
  });
  if (![401, 403].includes(unauthorized.status)) {
    throw new Error(`Unauthenticated ledger mutation was not rejected: ${unauthorized.status}.`);
  }
  evidence.mutation.unauthenticatedRejected = true;

  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`Admin mutation browser errors: ${JSON.stringify({
      consoleErrors: evidence.consoleErrors,
      pageErrors: evidence.pageErrors,
    })}`);
  }
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(
    `${OUTPUT_DIR}/admin-connected-ledger-mutation-browser-acceptance.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}

if (failure) throw failure;

console.log(JSON.stringify({
  ok: true,
  playerLocated: evidence.playerLocated,
  mutation: evidence.mutation,
  requestCount: evidence.requests.length,
}));
