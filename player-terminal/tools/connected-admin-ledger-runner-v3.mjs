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
  beforeBalance: null,
  authoritativeBalance: null,
  renderedBalance: null,
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

async function parseJson(response) {
  return response.json().catch(() => null);
}

function responseData(payload) {
  return payload?.data && typeof payload.data === "object" ? payload.data : payload;
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

function platformHeaders(publishableKey, token = publishableKey) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: publishableKey,
    Authorization: `Bearer ${token}`,
  };
}

async function request(pathOrUrl, { method = "GET", headers = {}, body } = {}) {
  const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    cache: "no-store",
  });
  return { status: response.status, ok: response.ok, payload: await parseJson(response) };
}

async function authenticateAdmin() {
  const publishableKey = await runtimeConfig();
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
  await page.waitForTimeout(1200);
}

function playerName(page) {
  return page.getByText(PLAYER_NAME, { exact: true }).first();
}

async function ensurePlayers(page) {
  if (await playerName(page).isVisible().catch(() => false)) return;
  const candidates = [
    page.getByRole("button", { name: "Players", exact: true }),
    page.locator('[data-admin-terminal-section="players"]'),
    page.locator('[data-admin-terminal-action="open-players"]'),
    page.locator('[data-route="players"]'),
  ];
  let control = null;
  for (const candidate of candidates) {
    if (await candidate.first().isVisible().catch(() => false)) {
      control = candidate.first();
      break;
    }
  }
  if (!control) {
    await page.waitForFunction(() => [...document.querySelectorAll("button, [role='button']")].some((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && String(node.textContent || "").trim() === "Players";
    }), undefined, { timeout: 120_000 });
    control = page.getByRole("button", { name: "Players", exact: true }).first();
  }
  await control.click();
  await playerName(page).waitFor({ state: "visible", timeout: 60_000 });
}

function playerRow(page) {
  return playerName(page).locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' admin-terminal-player-row ')][1]");
}

async function readCash(page) {
  await ensurePlayers(page);
  const row = playerRow(page);
  await row.waitFor({ state: "visible", timeout: 30_000 });
  const text = String(await row.innerText()).replace(/\s+/g, " ").trim();
  const match = text.match(/CASH\s+[^0-9-]*(-?[0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (!match) throw new Error(`Could not read Player cash from row: ${redact(text)}`);
  return Number(match[1].replace(/,/g, ""));
}

async function visibleModal(page) {
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
    text: String(control.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
    ariaLabel: control.getAttribute("aria-label") || "",
    disabled: Boolean(control.disabled),
  })));
}

async function fillBalanceModal(modal) {
  const amount = modal.locator('input[name="amount"]:visible, input[name*="amount" i]:visible, input[type="number"]:visible').first();
  await amount.waitFor({ state: "visible", timeout: 10_000 });
  await amount.fill(String(ADJUSTMENT));

  const adjustmentType = modal.locator('select[name="adjustmentType"]:visible').first();
  if (await adjustmentType.count()) {
    const options = await adjustmentType.locator("option").evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, text: String(node.textContent || "") })));
    const credit = options.find((option) => /credit|add|increase/i.test(`${option.value} ${option.text}`));
    if (credit) await adjustmentType.selectOption(credit.value);
  }

  const reasonCategory = modal.locator('select[name="reasonCategory"]:visible').first();
  if (await reasonCategory.count()) {
    const values = await reasonCategory.locator("option").evaluateAll((nodes) => nodes.map((node) => node.value));
    if (values.includes("manual_correction")) await reasonCategory.selectOption("manual_correction");
  }

  const note = modal.locator('textarea[name="ledgerNote"]:visible, textarea[name="reason"]:visible, input[name="reason"]:visible').first();
  if (await note.count()) await note.fill("Connected browser mutation verification");
}

async function submitBalanceMutation(page, modal) {
  const responsePromise = page.waitForResponse(
    (response) => /\/functions\/v1\/admin-api\/games\/[^/]+\/players\/[^/]+\/ledger-adjustments$/.test(new URL(response.url()).pathname) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  const submit = modal.getByRole("button", { name: /apply|confirm|adjust|save|credit|update/i }).last();
  await submit.waitFor({ state: "visible", timeout: 10_000 });
  await submit.click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  const result = responseData(payload);
  const authoritativeBalance = Number(
    result?.ledgerEntry?.balance ?? result?.balance ?? result?.currentBalance,
  );
  if (response.status() !== 200 || result?.adjusted !== true || result?.outcome !== "applied" || !Number.isFinite(authoritativeBalance)) {
    throw new Error(`Admin ledger adjustment returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  const requestRecord = response.request();
  const requestHeaders = await requestRecord.allHeaders();
  const allowed = new Set(["accept", "apikey", "authorization", "content-type", "x-econovaria-csrf", "x-econovaria-game-id", "x-idempotency-key", "x-request-id"]);
  return {
    url: response.url(),
    body: requestRecord.postData() || "{}",
    headers: Object.fromEntries(Object.entries(requestHeaders).filter(([name]) => allowed.has(name.toLowerCase()))),
    authoritativeBalance,
  };
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
  await ensurePlayers(page);
  evidence.playerLocated = true;

  const before = await readCash(page);
  evidence.beforeBalance = before;
  const adjust = playerRow(page).locator('[data-admin-terminal-action="adjust-player-balance"]');
  await adjust.waitFor({ state: "visible", timeout: 30_000 });
  await adjust.click();
  const modal = await visibleModal(page);
  evidence.modalOpened = true;
  evidence.controlInventory = await inventoryControls(modal);
  await fillBalanceModal(modal);
  const original = await submitBalanceMutation(page, modal);
  evidence.authoritativeBalance = original.authoritativeBalance;
  evidence.mutation.applied = true;

  await waitForAdminConsole(page);
  const after = await readCash(page);
  evidence.renderedBalance = after;
  if (Math.abs(after - original.authoritativeBalance) > 0.001) {
    throw new Error(`Rendered cash did not match the authoritative ledger balance: ${original.authoritativeBalance} -> ${after}.`);
  }
  if (Math.abs(after - before) < 0.001) {
    throw new Error(`Rendered cash did not change after the committed adjustment: ${before} -> ${after}.`);
  }

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForAdminConsole(page);
  const persisted = await readCash(page);
  if (Math.abs(persisted - original.authoritativeBalance) > 0.001) {
    throw new Error(`Admin ledger adjustment did not persist after reload: ${original.authoritativeBalance} -> ${persisted}.`);
  }
  evidence.mutation.persistedAfterReload = true;

  const replay = await request(original.url, {
    method: "POST",
    headers: original.headers,
    body: original.body,
  });
  const replayResult = responseData(replay.payload);
  const replayBalance = Number(replayResult?.ledgerEntry?.balance ?? replayResult?.balance ?? replayResult?.currentBalance);
  if (replay.status !== 200 || replayResult?.adjusted !== true || replayResult?.outcome !== "replayed" || Math.abs(replayBalance - original.authoritativeBalance) > 0.001) {
    throw new Error(`Idempotent replay was not recognized: ${replay.status} ${redact(JSON.stringify(replay.payload))}`);
  }
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForAdminConsole(page);
  const afterReplay = await readCash(page);
  if (Math.abs(afterReplay - original.authoritativeBalance) > 0.001) {
    throw new Error(`Idempotent replay duplicated the balance mutation: ${original.authoritativeBalance} -> ${afterReplay}.`);
  }
  evidence.mutation.replayedWithoutDuplication = true;

  const unauthorized = await request(new URL(original.url).pathname, {
    method: "POST",
    headers: platformHeaders(auth.publishableKey),
    body: original.body,
  });
  if (![401, 403].includes(unauthorized.status)) {
    throw new Error(`Unauthenticated ledger mutation was not rejected: ${unauthorized.status}.`);
  }
  evidence.mutation.unauthenticatedRejected = true;

  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`Admin mutation browser errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
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
console.log(JSON.stringify({
  ok: true,
  playerLocated: evidence.playerLocated,
  beforeBalance: evidence.beforeBalance,
  authoritativeBalance: evidence.authoritativeBalance,
  mutation: evidence.mutation,
  requestCount: evidence.requests.length,
}));
