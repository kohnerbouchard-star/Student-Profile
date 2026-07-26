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
  return { status: response.status, payload: await jsonResponse(response) };
}

async function authenticate() {
  const key = await runtimeKey();
  const signIn = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: platformHeaders(key),
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (signIn.status !== 200 || !signIn.payload?.access_token) throw new Error(`Admin sign-in returned ${signIn.status}.`);
  const accessToken = signIn.payload.access_token;
  const bootstrap = await request("/functions/v1/classroom-api/staff/bootstrap", {
    headers: platformHeaders(key, accessToken),
  });
  if (bootstrap.status !== 200 || bootstrap.payload?.ok !== true) throw new Error(`Admin bootstrap returned ${bootstrap.status}.`);
  const sessions = Array.isArray(bootstrap.payload.activeGameSessions) ? bootstrap.payload.activeGameSessions : [];
  const game = sessions.find((item) => item?.name === GAME_NAME) || sessions[0];
  const gameId = String(game?.id || "").trim();
  if (!gameId) throw new Error("Admin bootstrap did not return the test game.");
  return {
    key,
    gameId,
    record: {
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
  return namedPlayer(page).locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' admin-terminal-player-row ')][1]");
}

async function readCash(page) {
  await openPlayers(page);
  const row = playerRow(page);
  await row.waitFor({ state: "visible", timeout: 30_000 });
  const text = String(await row.innerText()).replace(/\s+/gu, " ").trim();
  const match = text.match(/CASH\s+[^0-9-]*(-?[0-9][0-9,]*(?:\.[0-9]{1,2})?)/iu);
  if (!match) throw new Error(`Could not read Player cash from row: ${redact(text)}`);
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
  const amount = modal.locator('input[name="amount"]:visible, input[type="number"]:visible, input[type="text"][name*="amount" i]:visible').first();
  await amount.waitFor({ state: "visible", timeout: 10_000 });
  await amount.fill(String(ADJUSTMENT));

  const type = modal.locator('select[name="adjustmentType"]:visible').first();
  if (await type.count()) {
    const options = await type.locator("option").evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, text: String(node.textContent || "") })));
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
    (response) => /\/functions\/v1\/admin-api\/games\/[^/]+\/players\/[^/]+\/ledger-adjustments$/u.test(new URL(response.url()).pathname) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  const submit = modal.getByRole("button", { name: /save ledger adjustment|apply|confirm|adjust|credit|update/iu }).last();
  await submit.waitFor({ state: "visible", timeout: 10_000 });
  await submit.click();
  const response = await responsePromise;
  if (response.status() !== 200) throw new Error(`Ledger adjustment returned ${response.status()}.`);
  const record = response.request();
  const requestHeaders = await record.allHeaders();
  const allowed = new Set(["accept", "apikey", "authorization", "content-type", "x-econovaria-csrf", "x-econovaria-game-id", "x-idempotency-key", "x-request-id"]);
  return {
    url: response.url(),
    body: record.postData() || "{}",
    headers: Object.fromEntries(Object.entries(requestHeaders).filter(([name]) => allowed.has(name.toLowerCase()))),
  };
}

let browser;
let context;
let failure;
try {
  const auth = await authenticate();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await context.addInitScript(({ origin, record, gameId }) => {
    if (location.origin !== origin) return;
    sessionStorage.setItem("econovaria.admin.auth.v1", JSON.stringify(record));
    sessionStorage.setItem("econovaria.admin.selected-game.v1", gameId);
  }, { origin: new URL(BASE_URL).origin, record: auth.record, gameId: auth.gameId });

  const page = await context.newPage();
  instrument(page);
  await page.goto(`${BASE_URL}/admin/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForAdmin(page);
  evidence.beforeBalance = await readCash(page);

  const modal = await openAdjustment(page);
  await fillAdjustment(modal);
  const original = await submitAdjustment(page, modal);
  evidence.mutation.submitted = true;

  await waitForAdmin(page);
  evidence.committedBalance = await readCash(page);
  if (!Number.isFinite(evidence.committedBalance) || Math.abs(evidence.committedBalance - evidence.beforeBalance) < 0.001) {
    throw new Error(`The committed ledger mutation did not change the rendered balance: ${evidence.beforeBalance} -> ${evidence.committedBalance}.`);
  }
  evidence.mutation.renderedAfterCommit = true;

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForAdmin(page);
  evidence.persistedBalance = await readCash(page);
  if (Math.abs(evidence.persistedBalance - evidence.committedBalance) > 0.001) {
    throw new Error(`The ledger balance did not persist: ${evidence.committedBalance} -> ${evidence.persistedBalance}.`);
  }
  evidence.mutation.persistedAfterReload = true;

  const replay = await request(original.url, {
    method: "POST",
    headers: original.headers,
    body: original.body,
  });
  if (replay.status !== 200) throw new Error(`Ledger replay returned ${replay.status}.`);
  const replayResult = replay.payload?.data ?? replay.payload;
  if (replayResult?.outcome && replayResult.outcome !== "replayed") {
    throw new Error(`Ledger replay returned an unexpected outcome: ${redact(JSON.stringify(replay.payload))}`);
  }

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForAdmin(page);
  evidence.replayBalance = await readCash(page);
  if (Math.abs(evidence.replayBalance - evidence.committedBalance) > 0.001) {
    throw new Error(`The replay duplicated the mutation: ${evidence.committedBalance} -> ${evidence.replayBalance}.`);
  }
  evidence.mutation.replayedWithoutDuplication = true;

  const unauthorized = await request(new URL(original.url).pathname, {
    method: "POST",
    headers: platformHeaders(auth.key),
    body: original.body,
  });
  if (![401, 403].includes(unauthorized.status)) throw new Error(`Unauthenticated ledger mutation returned ${unauthorized.status}.`);
  evidence.mutation.unauthenticatedRejected = true;

  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`Admin browser errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
  }
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(`${OUTPUT_DIR}/admin-connected-ledger-mutation-browser-acceptance.json`, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}

if (failure) throw failure;
console.log(JSON.stringify({ ok: true, beforeBalance: evidence.beforeBalance, committedBalance: evidence.committedBalance, mutation: evidence.mutation }));
