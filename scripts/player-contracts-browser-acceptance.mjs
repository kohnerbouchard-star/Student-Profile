#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE_URL = process.env.ECONOVARIA_BROWSER_BASE_URL || "http://127.0.0.1:4173";
const OUTPUT_DIR = process.env.ECONOVARIA_PLAYER_BROWSER_OUTPUT_DIR || "/tmp/econovaria-player-browser";
const ADMIN_EMAIL = process.env.ECONOVARIA_BROWSER_ADMIN_EMAIL || "player.e2e@example.test";
const ADMIN_PASSWORD = process.env.ECONOVARIA_BROWSER_ADMIN_PASSWORD || "Player-E2E-Admin-2026!";
const GAME_NAME = process.env.ECONOVARIA_BROWSER_GAME_NAME || "Player Multiplayer E2E";
const PLAYER = Object.freeze({
  playerIdentifier: "BROWSER-PLAYER-ALPHA",
  accessCode: "BROWSER-ALPHA-ACCESS-001",
});
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const SUBMISSION_NOTE = "Connected browser Contract evidence verified through the secure public-key route.";

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  contractKey: "",
  contractTitle: "",
  accepted: false,
  acceptancePersisted: false,
  acceptanceReplaySafe: false,
  submitted: false,
  submissionPersisted: false,
  submissionReplaySafe: false,
  unauthenticatedAcceptRejected: false,
  unauthenticatedSubmitRejected: false,
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

async function resolveGameCode() {
  const key = await runtimeKey();
  const signIn = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: platformHeaders(key),
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (signIn.status !== 200 || !signIn.payload?.access_token) {
    throw new Error(`Admin fixture sign-in returned ${signIn.status}.`);
  }
  const bootstrap = await request("/functions/v1/classroom-api/staff/bootstrap", {
    headers: platformHeaders(key, signIn.payload.access_token),
  });
  if (bootstrap.status !== 200 || bootstrap.payload?.ok !== true) {
    throw new Error(`Admin fixture bootstrap returned ${bootstrap.status}.`);
  }
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
    evidence.requests.push({
      method: response.request().method(),
      path: redact(new URL(url).pathname),
      status: response.status(),
    });
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

async function openContracts(page) {
  await page.locator('[data-route="contracts"]:visible').first().click();
  await page.waitForFunction(() => location.hash === "#contracts", undefined, { timeout: 30_000 });
  await page.locator(".player-terminal-contracts-page").waitFor({ state: "visible", timeout: 30_000 });
}

async function reloadContracts(page) {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  await openContracts(page);
}

async function captureRequest(response) {
  const requestRecord = response.request();
  const allHeaders = await requestRecord.allHeaders();
  const allowed = new Set([
    "accept", "apikey", "authorization", "content-type", "idempotency-key",
    "x-player-session-token", "x-request-id",
  ]);
  return {
    url: response.url(),
    body: requestRecord.postData() || "",
    headers: Object.fromEntries(Object.entries(allHeaders).filter(([name]) => allowed.has(name.toLowerCase()))),
  };
}

async function replay(page, original) {
  return page.evaluate(async ({ url, headers, body }) => {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: body || undefined,
      cache: "no-store",
    });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }, original);
}

function assertBrowserBoundary(original, kind) {
  const url = new URL(original.url);
  if (UUID_PATTERN.test(url.pathname)) throw new Error(`${kind} path exposed an internal UUID.`);
  UUID_PATTERN.lastIndex = 0;
  for (const forbidden of ["x-econovaria-game-id", "x-econovaria-game-session-id", "x-player-id"]) {
    if (Object.keys(original.headers).some((name) => name.toLowerCase() === forbidden)) {
      throw new Error(`${kind} forwarded forbidden browser scope header ${forbidden}.`);
    }
  }
  if (original.body) {
    const body = JSON.parse(original.body);
    const serialized = JSON.stringify(body);
    for (const field of ["gameSessionId", "gameId", "playerId", "playerUuid", "playerSessionId"]) {
      if (Object.prototype.hasOwnProperty.call(body, field)) throw new Error(`${kind} forwarded forbidden field ${field}.`);
    }
    UUID_PATTERN.lastIndex = 0;
    if (UUID_PATTERN.test(serialized)) throw new Error(`${kind} body exposed an internal UUID.`);
  }
}

async function selectAvailableContract(page) {
  const tab = page.locator('[data-player-contract-tab="Available"]');
  if (await tab.count()) await tab.click();
  const accept = page.locator("[data-player-contract-accept]:visible").first();
  await accept.waitFor({ state: "visible", timeout: 30_000 });
  const contractKey = String(await accept.getAttribute("data-player-contract-accept"));
  const detail = accept.locator("xpath=ancestor::section[contains(@class,'player-terminal-contract-detail')][1]");
  const title = String(await detail.locator("h3").innerText());
  if (!contractKey || UUID_PATTERN.test(contractKey)) throw new Error("Rendered Contract control did not use a public Contract key.");
  UUID_PATTERN.lastIndex = 0;
  evidence.contractKey = contractKey;
  evidence.contractTitle = title;
  return { accept, contractKey, title };
}

function contractDetailHeading(page, title) {
  return page.locator(".player-terminal-contract-detail h3").filter({ hasText: title }).first();
}

let browser;
let context;
let failure;
try {
  const fixture = await resolveGameCode();
  browser = await chromium.launch({ headless: true });
  const player = await login(browser, fixture.gameCode);
  context = player.context;
  const { page } = player;
  await openContracts(page);

  const selected = await selectAvailableContract(page);
  const acceptResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/players/me/contracts/${selected.contractKey}/accept`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await selected.accept.click();
  const acceptResponse = await acceptResponsePromise;
  const acceptPayload = await parseJson(acceptResponse);
  if (acceptResponse.status() !== 200 || acceptPayload?.ok !== true || acceptPayload?.alreadyAccepted !== false) {
    throw new Error(`Contract acceptance returned ${acceptResponse.status()}: ${redact(JSON.stringify(acceptPayload))}`);
  }
  const acceptRequest = await captureRequest(acceptResponse);
  assertBrowserBoundary(acceptRequest, "Contract acceptance");
  evidence.accepted = true;

  await reloadContracts(page);
  const activeTab = page.locator('[data-player-contract-tab="Active"]');
  if (await activeTab.count()) await activeTab.click();
  await contractDetailHeading(page, selected.title).waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(`form[data-endpoint="contractSubmit"][data-contract-id="${selected.contractKey}"]`).waitFor({ state: "visible", timeout: 30_000 });
  evidence.acceptancePersisted = true;

  const acceptReplay = await replay(page, acceptRequest);
  if (acceptReplay.status !== 200 || acceptReplay.payload?.ok !== true || acceptReplay.payload?.alreadyAccepted !== true) {
    throw new Error(`Contract acceptance replay was not recognized: ${acceptReplay.status} ${redact(JSON.stringify(acceptReplay.payload))}`);
  }
  evidence.acceptanceReplaySafe = true;

  const submitForm = page.locator(`form[data-endpoint="contractSubmit"][data-contract-id="${selected.contractKey}"]`);
  await submitForm.locator('[name="submissionUrl"]').fill("https://example.test/econovaria-contract-evidence");
  await submitForm.locator('[name="note"]').fill(SUBMISSION_NOTE);
  const submitResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/players/me/contracts/${selected.contractKey}/submit`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await submitForm.locator('button[type="submit"]').click();
  const submitResponse = await submitResponsePromise;
  const submitPayload = await parseJson(submitResponse);
  if (submitResponse.status() !== 200 || submitPayload?.ok !== true) {
    throw new Error(`Contract submission returned ${submitResponse.status()}: ${redact(JSON.stringify(submitPayload))}`);
  }
  const submitRequest = await captureRequest(submitResponse);
  assertBrowserBoundary(submitRequest, "Contract submission");
  const submitBody = JSON.parse(submitRequest.body || "{}");
  if (JSON.stringify(submitBody) !== JSON.stringify({
    evidencePayload: {
      submissionUrl: "https://example.test/econovaria-contract-evidence",
      note: SUBMISSION_NOTE,
    },
  })) {
    throw new Error(`Contract submission body was not the bounded evidence payload: ${redact(JSON.stringify(submitBody))}`);
  }
  evidence.requestBoundaryValid = true;
  evidence.submitted = true;

  await reloadContracts(page);
  const submittedTab = page.locator('[data-player-contract-tab="Submitted"]');
  if (await submittedTab.count()) await submittedTab.click();
  await contractDetailHeading(page, selected.title).waitFor({ state: "visible", timeout: 30_000 });
  await page.getByText(SUBMISSION_NOTE, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  evidence.submissionPersisted = true;

  const submitReplay = await replay(page, submitRequest);
  if (submitReplay.status === 200) {
    if (submitReplay.payload?.ok !== true) throw new Error("Contract submission replay returned an invalid success body.");
  } else if (submitReplay.status !== 409) {
    throw new Error(`Contract submission replay was neither idempotent nor denied: ${submitReplay.status}.`);
  }
  await reloadContracts(page);
  if (await contractDetailHeading(page, selected.title).count() < 1) {
    throw new Error("Contract progress disappeared after replay handling.");
  }
  evidence.submissionReplaySafe = true;

  const unauthAccept = await request(new URL(acceptRequest.url).pathname, {
    method: "POST",
    headers: platformHeaders(fixture.key),
  });
  if (![401, 403].includes(unauthAccept.status)) {
    throw new Error(`Unauthenticated Contract acceptance was not rejected: ${unauthAccept.status}.`);
  }
  evidence.unauthenticatedAcceptRejected = true;

  const unauthSubmit = await request(new URL(submitRequest.url).pathname, {
    method: "POST",
    headers: platformHeaders(fixture.key),
    body: JSON.parse(submitRequest.body),
  });
  if (![401, 403].includes(unauthSubmit.status)) {
    throw new Error(`Unauthenticated Contract submission was not rejected: ${unauthSubmit.status}.`);
  }
  evidence.unauthenticatedSubmitRejected = true;

  if (evidence.responseUuidLeak) throw new Error("A connected Contract response exposed a raw internal UUID.");
  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`Contract browser errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
  }
  for (const key of [
    "accepted",
    "acceptancePersisted",
    "acceptanceReplaySafe",
    "submitted",
    "submissionPersisted",
    "submissionReplaySafe",
    "unauthenticatedAcceptRejected",
    "unauthenticatedSubmitRejected",
    "requestBoundaryValid",
  ]) {
    if (evidence[key] !== true) throw new Error(`Contract evidence ${key} is incomplete.`);
  }
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(
    `${OUTPUT_DIR}/player-contracts-browser-acceptance.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}

if (failure) throw failure;

console.log(JSON.stringify({
  ok: true,
  contractKey: evidence.contractKey,
  accepted: evidence.accepted,
  submitted: evidence.submitted,
  requestBoundaryValid: evidence.requestBoundaryValid,
}));