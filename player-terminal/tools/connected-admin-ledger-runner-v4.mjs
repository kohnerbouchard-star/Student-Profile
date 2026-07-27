#!/usr/bin/env node

import { createHmac } from "node:crypto";
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
  beforeBalance: null,
  committedBalance: null,
  persistedBalance: null,
  replayBalance: null,
  mutation: {
    submitted: false,
    renderedAfterCommit: false,
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

async function jsonResponse(response) {
  return response.json().catch(() => null);
}

async function runtimeKey() {
  const response = await fetch(`${BASE_URL}/runtime-config.env.js`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Runtime configuration returned ${response.status}.`);
  const match = (await response.text()).match(/Object\.freeze\((\{[\s\S]*\})\);?/);
  if (!match) throw new Error("Runtime configuration could not be parsed.");
  const key = String(JSON.parse(match[1]).supabasePublishableKey || "").trim();
  if (!key || key.startsWith("sb_secret_")) {
    throw new Error("A browser-safe Supabase publishable key is required.");
  }
  return key;
}

function platformHeaders(key) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: key,
  };
}

async function request(pathOrUrl, { method = "GET", headers = {}, body } = {}) {
  const url = /^https?:\/\//u.test(pathOrUrl) ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    cache: "no-store",
    redirect: "manual",
  });
  return { status: response.status, payload: await jsonResponse(response) };
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = String(value || "").replace(/=+$/u, "").replace(/\s+/gu, "").toUpperCase();
  if (!normalized || /[^A-Z2-7]/u.test(normalized)) {
    throw new Error("Admin MFA enrollment did not expose a valid Base32 secret.");
  }
  const output = [];
  let accumulator = 0;
  let bits = 0;
  for (const character of normalized) {
    accumulator = (accumulator << 5) | alphabet.indexOf(character);
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      output.push((accumulator >>> bits) & 0xff);
      accumulator &= (1 << bits) - 1;
    }
  }
  return Buffer.from(output);
}

function generateTotp(secret, timestamp = Date.now()) {
  const key = decodeBase32(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timestamp / 30_000)));
  let digest;
  try {
    digest = createHmac("sha1", key).update(counter).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const value = digest.readUInt32BE(offset) & 0x7fffffff;
    return String(value % 1_000_000).padStart(6, "0");
  } finally {
    key.fill(0);
    counter.fill(0);
    digest?.fill(0);
  }
}

async function completeMfaEnrollmentIfRequired(page) {
  const dialog = page.locator(".econovaria-mfa-dialog");
  await dialog.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  if (!await dialog.isVisible().catch(() => false)) return;

  const secretNode = dialog.locator(".econovaria-mfa-secret");
  await secretNode.waitFor({ state: "visible", timeout: 20_000 });
  const secret = String(await secretNode.textContent() || "").trim();
  const remainingSeconds = 30 - (Math.floor(Date.now() / 1000) % 30);
  if (remainingSeconds < 5) {
    await page.waitForTimeout((remainingSeconds + 1) * 1000);
  }
  await dialog.locator(".econovaria-mfa-code").fill(generateTotp(secret));
  await dialog.locator(".econovaria-mfa-submit").click();
  await dialog.waitFor({ state: "detached", timeout: 30_000 });
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

async function renderedLogin(page) {
  await page.goto(`${BASE_URL}/?mode=admin`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("#adminEmail").fill(ADMIN_EMAIL);
  await page.locator("#adminAccessCode").fill(ADMIN_PASSWORD);
  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/web-session-api/login") &&
      response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.locator("#adminForm button[type='submit']").click();
  const loginResponse = await loginResponsePromise;
  if (loginResponse.status() !== 200) {
    throw new Error(`Admin BFF sign-in returned ${loginResponse.status()}.`);
  }
  await page.locator("#adminGamesStep:not(.hidden)").waitFor({ state: "visible", timeout: 30_000 });
  const namedGame = page.locator("#adminGameList .game-row").filter({ hasText: GAME_NAME }).first();
  const gameControl = await namedGame.count()
    ? namedGame
    : page.locator("#adminGameList .game-row").first();
  await gameControl.waitFor({ state: "visible", timeout: 30_000 });
  await gameControl.click();
  await waitForAdmin(page);
}

async function waitForAdmin(page) {
  await page.waitForURL(/\/admin\/(?:index\.html)?(?:\?.*)?$/u, { timeout: 120_000 });
  await page.waitForFunction(() => {
    const preview = document.getElementById("adminPreview");
    return Boolean(preview && !preview.hidden && preview.childElementCount > 0);
  }, undefined, { timeout: 120_000 });
  await page.waitForTimeout(1000);
}

function namedPlayer(page) {
  return page.getByText(PLAYER_NAME, { exact: true }).first();
}

async function openPlayers(page) {
  if (await namedPlayer(page).isVisible().catch(() => false)) return;
  const candidates = [
    page.getByRole("button", { name: "Players", exact: true }).first(),
    page.locator('[data-admin-terminal-section="players"]:visible').first(),
    page.locator('[data-admin-terminal-action="open-players"]:visible').first(),
    page.locator('[data-route="players"]:visible').first(),
  ];
  let control = null;
  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) {
      control = candidate;
      break;
    }
  }
  if (!control) throw new Error("The Players navigation control was not available.");
  await control.click();
  await namedPlayer(page).waitFor({ state: "visible", timeout: 60_000 });
}

function playerRow(page) {
  return namedPlayer(page).locator(
    "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' admin-terminal-player-row ')][1]",
  );
}

async function readBalance(page) {
  await openPlayers(page);
  const row = playerRow(page);
  await row.waitFor({ state: "visible", timeout: 30_000 });
  const text = String(await row.innerText()).replace(/\s+/gu, " ").trim();
  const match = text.match(/(?:CASH|CHECKING)\s+[^0-9-]*(-?[0-9][0-9,]*(?:\.[0-9]{1,2})?)/iu);
  if (!match) throw new Error(`Could not read Player checking balance from row: ${redact(text)}`);
  return Number(match[1].replaceAll(",", ""));
}

async function openAdjustment(page) {
  const button = playerRow(page).locator('[data-admin-terminal-action="adjust-player-balance"]');
  await button.waitFor({ state: "visible", timeout: 30_000 });
  await button.click();
  const modal = page.locator('[role="dialog"]:visible, [data-admin-terminal-modal-backdrop]:visible').last();
  await modal.waitFor({ state: "visible", timeout: 30_000 });
  return modal;
}

async function fillAdjustment(modal) {
  const amount = modal.locator(
    'input[name="amount"]:visible, input[type="number"]:visible, input[type="text"][name*="amount" i]:visible',
  ).first();
  await amount.waitFor({ state: "visible", timeout: 10_000 });
  await amount.fill(String(ADJUSTMENT));

  const type = modal.locator('select[name="adjustmentType"]:visible').first();
  if (await type.count()) {
    const options = await type.locator("option").evaluateAll((nodes) =>
      nodes.map((node) => ({ value: node.value, text: String(node.textContent || "") }))
    );
    const credit = options.find((option) => /credit|add|increase/iu.test(`${option.value} ${option.text}`));
    if (credit) await type.selectOption(credit.value);
  }

  const reason = modal.locator('select[name="reasonCategory"]:visible').first();
  if (await reason.count()) {
    const values = await reason.locator("option").evaluateAll((nodes) => nodes.map((node) => node.value));
    if (values.includes("manual_correction")) await reason.selectOption("manual_correction");
  }

  const note = modal.locator('textarea[name="ledgerNote"]:visible, textarea[name="reason"]:visible').first();
  if (await note.count()) await note.fill("Connected browser mutation verification");
}

async function submitAdjustment(page, modal) {
  const responsePromise = page.waitForResponse(
    (response) => /\/functions\/v1\/web-session-api\/proxy\/games\/[^/]+\/players\/[^/]+\/ledger-adjustments$/u
      .test(new URL(response.url()).pathname) && response.request().method() === "POST",
    { timeout: 90_000 },
  );
  const submit = modal.getByRole(
    "button",
    { name: /save ledger adjustment|apply|confirm|adjust|credit|update/iu },
  ).last();
  await submit.waitFor({ state: "visible", timeout: 10_000 });
  await submit.click();
  await completeMfaEnrollmentIfRequired(page);
  const response = await responsePromise;
  if (response.status() !== 200) throw new Error(`Ledger adjustment returned ${response.status()}.`);
  const record = response.request();
  const requestHeaders = await record.allHeaders();
  const allowed = new Set([
    "accept",
    "apikey",
    "content-type",
    "x-econovaria-csrf-token",
    "x-econovaria-device-id",
    "x-idempotency-key",
    "x-request-id",
  ]);
  return {
    url: response.url(),
    body: record.postData() || "{}",
    headers: Object.fromEntries(
      Object.entries(requestHeaders).filter(([name]) => allowed.has(name.toLowerCase())),
    ),
  };
}

async function replayThroughBrowser(page, original) {
  return page.evaluate(async ({ url, headers, body }) => {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
      credentials: "include",
    });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }, original);
}

let browser;
let context;
let failure;
try {
  const key = await runtimeKey();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });

  const page = await context.newPage();
  instrument(page);
  await renderedLogin(page);
  evidence.beforeBalance = await readBalance(page);

  const modal = await openAdjustment(page);
  await fillAdjustment(modal);
  const original = await submitAdjustment(page, modal);
  evidence.mutation.submitted = true;

  await waitForAdmin(page);
  evidence.committedBalance = await readBalance(page);
  if (
    !Number.isFinite(evidence.committedBalance) ||
    Math.abs(evidence.committedBalance - evidence.beforeBalance) < 0.001
  ) {
    throw new Error(
      `The committed ledger mutation did not change the rendered balance: ${evidence.beforeBalance} -> ${evidence.committedBalance}.`,
    );
  }
  evidence.mutation.renderedAfterCommit = true;

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForAdmin(page);
  evidence.persistedBalance = await readBalance(page);
  if (Math.abs(evidence.persistedBalance - evidence.committedBalance) > 0.001) {
    throw new Error(
      `The ledger balance did not persist: ${evidence.committedBalance} -> ${evidence.persistedBalance}.`,
    );
  }
  evidence.mutation.persistedAfterReload = true;

  const replay = await replayThroughBrowser(page, original);
  if (replay.status !== 200) throw new Error(`Ledger replay returned ${replay.status}.`);
  const replayResult = replay.payload?.data ?? replay.payload;
  if (replayResult?.outcome && replayResult.outcome !== "replayed") {
    throw new Error(`Ledger replay returned an unexpected outcome: ${redact(JSON.stringify(replay.payload))}`);
  }

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForAdmin(page);
  evidence.replayBalance = await readBalance(page);
  if (Math.abs(evidence.replayBalance - evidence.committedBalance) > 0.001) {
    throw new Error(
      `The replay duplicated the mutation: ${evidence.committedBalance} -> ${evidence.replayBalance}.`,
    );
  }
  evidence.mutation.replayedWithoutDuplication = true;

  const unauthorized = await request(original.url, {
    method: "POST",
    headers: platformHeaders(key),
    body: original.body,
  });
  if (![401, 403].includes(unauthorized.status)) {
    throw new Error(`Unauthenticated ledger mutation returned ${unauthorized.status}.`);
  }
  evidence.mutation.unauthenticatedRejected = true;

  const expectedUnauthorizedConsole =
    "Failed to load resource: the server responded with a status of 401 (Unauthorized)";
  const unexpectedConsoleErrors = evidence.consoleErrors.filter(
    (message) => message !== expectedUnauthorizedConsole,
  );
  if (unexpectedConsoleErrors.length || evidence.pageErrors.length) {
    throw new Error(
      `Admin browser errors: ${JSON.stringify({ consoleErrors: unexpectedConsoleErrors, pageErrors: evidence.pageErrors })}`,
    );
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
  beforeBalance: evidence.beforeBalance,
  committedBalance: evidence.committedBalance,
  mutation: evidence.mutation,
}));
