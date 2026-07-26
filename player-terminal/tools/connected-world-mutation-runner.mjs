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
const PLAYER_ID = "BROWSER-PLAYER-ALPHA";
const ACCESS_CODE = "BROWSER-ALPHA-ACCESS-001";
const JOURNEY_ID = /^trj_[0-9a-f]{32}$/;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  arrivalClass: { submitted: false, persisted: false },
  travel: {
    quoted: false,
    executed: false,
    fastForwarded: false,
    completed: false,
    persisted: false,
  },
  residency: { submitted: false, persisted: false, replaySafe: false, unauthenticatedRejected: false },
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

async function request(path, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
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
  const gameCode = String(game?.gameCode || game?.joinCode || "");
  if (!gameCode) throw new Error("Connected game code was not available.");
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
  await page.waitForURL(/\/player-terminal\/(?:index\.html)?(?:#.*)?$/, { timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  return { context, page };
}

async function openWorld(page) {
  const control = page.locator('[data-route="world"]:visible').first();
  await control.waitFor({ state: "visible", timeout: 30_000 });
  await control.click();
  await page.waitForFunction(() => location.hash === "#world", undefined, { timeout: 30_000 });
  await page.locator(".player-world-page").waitFor({ state: "visible", timeout: 60_000 });
  await page.locator(".player-world-loading").waitFor({ state: "detached", timeout: 60_000 }).catch(() => {});
}

async function reloadWorld(page) {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  await openWorld(page);
}

async function captureRequest(response) {
  const requestRecord = response.request();
  const headers = await requestRecord.allHeaders();
  const allowed = new Set(["accept", "apikey", "authorization", "content-type", "idempotency-key", "x-idempotency-key", "x-player-session-token", "x-request-id"]);
  return {
    url: response.url(),
    method: requestRecord.method(),
    body: requestRecord.postData() || "{}",
    headers: Object.fromEntries(Object.entries(headers).filter(([name]) => allowed.has(name.toLowerCase()))),
  };
}

async function submitArrival(page) {
  const form = page.locator('form[data-world-form="arrivalClass"]');
  await form.waitFor({ state: "visible", timeout: 30_000 });
  const fieldsets = form.locator("fieldset");
  if (await fieldsets.count() < 6) throw new Error("Arrival Class did not render six required questions.");
  for (let index = 0; index < await fieldsets.count(); index += 1) {
    await fieldsets.nth(index).locator('input[type="radio"]').first().check();
  }
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/arrival-class") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  if (![200, 201].includes(response.status())) throw new Error(`Arrival Class returned ${response.status()}.`);
  evidence.arrivalClass.submitted = true;
  await page.locator('form[data-world-form="arrivalClass"]').waitFor({ state: "detached", timeout: 60_000 });
  await reloadWorld(page);
  if (await page.locator('form[data-world-form="arrivalClass"]').count()) throw new Error("Arrival Class assignment did not persist after reload.");
  evidence.arrivalClass.persisted = true;
}

async function quoteAndExecuteTravel(page) {
  const quoteForm = page.locator('form[data-world-form="travelQuote"]');
  await quoteForm.waitFor({ state: "visible", timeout: 30_000 });
  const destinationOptions = await quoteForm.locator('select[name="toLocationId"] option').evaluateAll((options) => options.map((option) => option.value).filter(Boolean));
  if (!destinationOptions.length) throw new Error("World did not provide an open travel destination.");
  const destination = destinationOptions[0];
  await quoteForm.locator('select[name="toLocationId"]').selectOption(destination);
  const quoteResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/travel/quotes") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await quoteForm.locator('button[type="submit"]').click();
  const quoteResponse = await quoteResponsePromise;
  if (![200, 201].includes(quoteResponse.status())) throw new Error(`Travel quote returned ${quoteResponse.status()}.`);
  evidence.travel.quoted = true;

  const executeForm = page.locator('form[data-world-form="travelExecute"]');
  await executeForm.waitFor({ state: "visible", timeout: 30_000 });
  const executeResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/travel") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await executeForm.locator('button[type="submit"]').click();
  const executeResponse = await executeResponsePromise;
  if (![200, 201].includes(executeResponse.status())) throw new Error(`Travel execution returned ${executeResponse.status()}.`);
  evidence.travel.executed = true;

  const completeForm = page.locator('form[data-world-form="travelComplete"]');
  await completeForm.waitFor({ state: "visible", timeout: 60_000 });
  const journeyId = String(await completeForm.getAttribute("data-journey-id") || "").trim().toLowerCase();
  if (!JOURNEY_ID.test(journeyId)) throw new Error("Travel execution did not expose a bounded public journey ID.");
  return { destination, journeyId };
}

function fastForwardJourney(journeyId) {
  if (!JOURNEY_ID.test(journeyId)) throw new Error("Refusing to fast-forward an invalid journey ID.");
  const sql = `
    with updated_journey as (
      update public.player_travel_journeys
      set departed_at = now() - interval '2 minutes',
          arrival_at = now() - interval '1 minute',
          updated_at = now()
      where public_id = '${journeyId}'
        and status = 'in_transit'
      returning id, player_id
    )
    update public.player_travel_states as state
    set arrival_at = now() - interval '1 minute',
        updated_at = now()
    from updated_journey as journey
    where state.player_id = journey.player_id
      and state.active_journey_id = journey.id;
  `;
  execFileSync("psql", [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "pipe" });
  evidence.travel.fastForwarded = true;
}

async function completeTravel(page, destination, journeyId) {
  await reloadWorld(page);
  const form = page.locator(`form[data-world-form="travelComplete"][data-journey-id="${journeyId}"]`);
  await form.waitFor({ state: "visible", timeout: 30_000 });
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/players/me/travel/${journeyId}/complete`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  if (response.status() !== 200) throw new Error(`Travel completion returned ${response.status()}.`);
  evidence.travel.completed = true;
  await reloadWorld(page);
  if (await page.locator('form[data-world-form="travelComplete"]').count()) throw new Error("Completed journey remained active after reload.");
  const currentLocation = page.locator(".player-world-facts dd").first();
  await currentLocation.waitFor({ state: "visible", timeout: 30_000 });
  if (String(await currentLocation.textContent() || "").trim() !== destination) {
    throw new Error(`Completed travel did not persist the destination ${destination}.`);
  }
  evidence.travel.persisted = true;
}

async function submitResidency(page, fixtureData) {
  const form = page.locator('form[data-world-form="residencyRequest"]');
  await form.waitFor({ state: "visible", timeout: 30_000 });
  const options = await form.locator('select[name="countryId"] option').evaluateAll((nodes) => nodes.map((node) => node.value).filter(Boolean));
  if (!options.length) throw new Error("Residency did not provide an eligible destination.");
  await form.locator('select[name="countryId"]').selectOption(options[0]);
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/residency") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  if (![200, 201].includes(response.status())) throw new Error(`Residency request returned ${response.status()}.`);
  const original = await captureRequest(response);
  evidence.residency.submitted = true;
  await reloadWorld(page);
  await page.getByText("Request pending", { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  evidence.residency.persisted = true;

  const replay = await page.evaluate(async ({ url, method, headers, body }) => {
    const response = await fetch(url, { method, headers, body, cache: "no-store" });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }, original);
  if (replay.status !== 200 || replay.payload?.ok !== true) throw new Error(`Residency replay returned ${replay.status}.`);
  evidence.residency.replaySafe = true;

  const unauthorized = await request(new URL(original.url).pathname, {
    method: original.method,
    headers: platformHeaders(fixtureData.key),
    body: JSON.parse(original.body),
  });
  if (![401, 403].includes(unauthorized.status)) throw new Error(`Unauthenticated residency request returned ${unauthorized.status}.`);
  evidence.residency.unauthenticatedRejected = true;
}

let browser;
let context;
let failure;
try {
  const fixtureData = await fixture();
  browser = await chromium.launch({ headless: true });
  ({ context, page: globalThis.__worldPage } = await login(browser, fixtureData.gameCode));
  const page = globalThis.__worldPage;
  await openWorld(page);
  await submitArrival(page);
  const travel = await quoteAndExecuteTravel(page);
  fastForwardJourney(travel.journeyId);
  await completeTravel(page, travel.destination, travel.journeyId);
  await submitResidency(page, fixtureData);

  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`World browser journey emitted errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
  }
  if (evidence.responseUuidLeak) throw new Error("World responses exposed a raw UUID.");
  const incomplete = [
    ...Object.values(evidence.arrivalClass),
    ...Object.values(evidence.travel),
    ...Object.values(evidence.residency),
  ].some((value) => value !== true);
  if (incomplete) throw new Error("Connected World mutation evidence is incomplete.");
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(`${OUTPUT_DIR}/player-world-mutation-browser-acceptance.json`, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  delete globalThis.__worldPage;
}

if (failure) throw failure;
console.log(JSON.stringify({ ok: true, arrivalClass: evidence.arrivalClass, travel: evidence.travel, residency: evidence.residency }));
