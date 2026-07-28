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
const REQUIRED_TITLE = "Connected Required Briefing";
const OPTIONAL_TITLE = "Connected Optional Briefing";
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  fixturePrepared: false,
  required: {
    seen: false,
    acknowledged: false,
    replaySafe: false,
    unauthenticatedRejected: false,
  },
  optional: {
    seen: false,
    dismissed: false,
    replaySafe: false,
    unauthenticatedRejected: false,
  },
  persistedAfterReload: false,
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

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function psql(sql) {
  return execFileSync("psql", [DATABASE_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function prepareFixture() {
  const result = psql(`
    do $$
    declare
      v_game_id uuid;
      v_player_id uuid;
      v_required_id uuid;
      v_optional_id uuid;
    begin
      select g.id, p.id into v_game_id, v_player_id
      from public.game_sessions g
      join public.players p on p.game_session_id = g.id
      where g.name = ${sqlLiteral(GAME_NAME)}
        and p.player_identifier = ${sqlLiteral(PLAYER_ID)}
        and p.status = 'active'
      order by g.created_at desc
      limit 1;
      if v_game_id is null or v_player_id is null then
        raise exception 'Connected story fixture player is unavailable.';
      end if;

      delete from public.notification_deliveries delivery
      using public.notifications notification
      where delivery.notification_id = notification.id
        and delivery.game_session_id = v_game_id
        and delivery.player_id = v_player_id
        and notification.notification_type = 'story_cutscene';
      delete from public.notifications
      where game_session_id = v_game_id and notification_type = 'story_cutscene';

      insert into public.notifications (
        game_session_id, source_type, source_id, notification_type, title, summary,
        priority, display_mode, payload, published_at
      ) values (
        v_game_id, 'connected_e2e', 'story-required', 'story_cutscene',
        ${sqlLiteral(REQUIRED_TITLE)}, 'A required connected story briefing.',
        'critical', 'modal_immediate',
        jsonb_build_object(
          'requiresAcknowledgement', true,
          'videoAssetKey', 'connected-required',
          'tone', 'briefing',
          'act', 1,
          'sequence', 1
        ),
        now()
      ) returning id into v_required_id;

      insert into public.notifications (
        game_session_id, source_type, source_id, notification_type, title, summary,
        priority, display_mode, payload, published_at
      ) values (
        v_game_id, 'connected_e2e', 'story-optional', 'story_cutscene',
        ${sqlLiteral(OPTIONAL_TITLE)}, 'An optional connected story briefing.',
        'major', 'modal_on_next_login',
        jsonb_build_object(
          'requiresAcknowledgement', false,
          'videoAssetKey', 'connected-optional',
          'tone', 'briefing',
          'act', 1,
          'sequence', 2
        ),
        now() - interval '1 second'
      ) returning id into v_optional_id;

      insert into public.notification_deliveries (
        notification_id, game_session_id, player_id, delivered_at
      ) values
        (v_required_id, v_game_id, v_player_id, now()),
        (v_optional_id, v_game_id, v_player_id, now());
    end;
    $$;
    select count(*)
    from public.notification_deliveries delivery
    join public.notifications notification on notification.id = delivery.notification_id
    join public.game_sessions game on game.id = delivery.game_session_id
    join public.players player on player.game_session_id = delivery.game_session_id and player.id = delivery.player_id
    where game.name = ${sqlLiteral(GAME_NAME)}
      and player.player_identifier = ${sqlLiteral(PLAYER_ID)}
      and notification.notification_type = 'story_cutscene'
      and delivery.dismissed_at is null
      and delivery.acknowledged_at is null;
  `);
  const count = Number(result.split(/\r?\n/).filter(Boolean).at(-1));
  if (count !== 2) throw new Error(`Connected story fixture expected two pending deliveries, found ${count}.`);
  evidence.fixturePrepared = true;
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

async function gameCode(key) {
  const signIn = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: platformHeaders(key),
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (signIn.status !== 200 || !signIn.payload?.access_token) throw new Error(`Story fixture Admin sign-in returned ${signIn.status}.`);
  const bootstrap = await request("/functions/v1/classroom-api/staff/bootstrap", {
    headers: platformHeaders(key, signIn.payload.access_token),
  });
  const sessions = Array.isArray(bootstrap.payload?.activeGameSessions) ? bootstrap.payload.activeGameSessions : [];
  const game = sessions.find((item) => item?.name === GAME_NAME) || sessions[0];
  const code = String(game?.gameCode || game?.joinCode || "").trim();
  if (!/^ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}$/.test(code)) throw new Error("Story fixture could not resolve the connected Game Code.");
  return code;
}

function instrument(page) {
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(redact(message.text()));
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(redact(error?.message || error)));
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/functions/v1/classroom-api/")) return;
    evidence.requests.push({ method: response.request().method(), path: redact(new URL(url).pathname), status: response.status() });
    if (!(response.headers()["content-type"] || "").includes("application/json")) return;
    const body = await response.text().catch(() => "");
    UUID_PATTERN.lastIndex = 0;
    if (UUID_PATTERN.test(body)) evidence.responseUuidLeak = true;
  });
}

function stateResponse(page, action) {
  return page.waitForResponse((response) => {
    if (!/\/players\/me\/story-deliveries\/ndl_[0-9a-f]{32}\/state$/.test(new URL(response.url()).pathname)) return false;
    if (response.request().method() !== "POST") return false;
    try {
      return response.request().postDataJSON()?.action === action;
    } catch {
      return false;
    }
  }, { timeout: 60_000 });
}

async function capture(response) {
  const requestRecord = response.request();
  const headers = await requestRecord.allHeaders();
  const allowed = new Set([
    "accept", "apikey", "authorization", "content-type",
    "x-player-session-token", "x-request-id",
  ]);
  return {
    url: response.url(),
    method: requestRecord.method(),
    body: requestRecord.postData() || "{}",
    headers: Object.fromEntries(Object.entries(headers).filter(([name]) => allowed.has(name.toLowerCase()))),
  };
}

async function replay(page, original, expectedAction) {
  const result = await page.evaluate(async ({ url, method, headers, body }) => {
    const response = await fetch(url, { method, headers, body, cache: "no-store" });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }, original);
  if (result.status !== 200 || result.payload?.ok !== true || result.payload?.action !== expectedAction) {
    throw new Error(`Story ${expectedAction} replay failed: ${result.status} ${redact(JSON.stringify(result.payload))}`);
  }
}

async function assertUnauthorized(key, original, label) {
  const result = await request(new URL(original.url).pathname, {
    method: original.method,
    headers: platformHeaders(key),
    body: JSON.parse(original.body),
  });
  if (![401, 403].includes(result.status)) throw new Error(`Unauthenticated ${label} returned ${result.status}.`);
}

let browser;
let context;
let failure;
try {
  prepareFixture();
  const key = await runtimeKey();
  const code = await gameCode(key);
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  instrument(page);

  const requiredSeenPromise = stateResponse(page, "seen");
  await page.goto(`${BASE_URL}/?mode=player&gameCode=${encodeURIComponent(code)}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("#gameCode").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#playerId").fill(PLAYER_ID);
  await page.locator("#playerAccessCode").fill(ACCESS_CODE);
  const loginPromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/classroom-api/players/login") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.locator("#playerForm button[type='submit']").click();
  const login = await loginPromise;
  if (login.status() !== 200) throw new Error(`Story Player login returned ${login.status()}.`);
  await page.waitForURL(/\/player-terminal\/(?:index\.html)?(?:#.*)?$/, { timeout: 120_000 });
  await page.getByRole("dialog").getByRole("heading", { name: REQUIRED_TITLE }).waitFor({ state: "visible", timeout: 60_000 });
  const requiredSeen = await requiredSeenPromise;
  if (requiredSeen.status() !== 200) throw new Error(`Required story seen returned ${requiredSeen.status()}.`);
  evidence.required.seen = true;

  const optionalSeenPromise = stateResponse(page, "seen");
  const acknowledgementPromise = stateResponse(page, "acknowledged");
  await page.locator('[data-player-story-action="acknowledged"]:visible').click();
  const acknowledged = await acknowledgementPromise;
  if (acknowledged.status() !== 200) throw new Error(`Required story acknowledgement returned ${acknowledged.status()}.`);
  const acknowledgedRequest = await capture(acknowledged);
  evidence.required.acknowledged = true;
  await replay(page, acknowledgedRequest, "acknowledged");
  evidence.required.replaySafe = true;
  await assertUnauthorized(key, acknowledgedRequest, "story acknowledgement");
  evidence.required.unauthenticatedRejected = true;

  await page.getByRole("dialog").getByRole("heading", { name: OPTIONAL_TITLE }).waitFor({ state: "visible", timeout: 60_000 });
  const optionalSeen = await optionalSeenPromise;
  if (optionalSeen.status() !== 200) throw new Error(`Optional story seen returned ${optionalSeen.status()}.`);
  evidence.optional.seen = true;

  const dismissalPromise = stateResponse(page, "dismissed");
  await page.locator('[data-player-story-action="dismissed"]:visible').last().click();
  const dismissed = await dismissalPromise;
  if (dismissed.status() !== 200) throw new Error(`Optional story dismissal returned ${dismissed.status()}.`);
  const dismissedRequest = await capture(dismissed);
  evidence.optional.dismissed = true;
  await replay(page, dismissedRequest, "dismissed");
  evidence.optional.replaySafe = true;
  await assertUnauthorized(key, dismissedRequest, "story dismissal");
  evidence.optional.unauthenticatedRejected = true;
  await page.locator(".player-story-cutscene-modal").waitFor({ state: "detached", timeout: 30_000 });

  const reloadList = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/story-deliveries") && response.request().method() === "GET",
    { timeout: 60_000 },
  );
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  const listResponse = await reloadList;
  const listPayload = await parseJson(listResponse);
  if (listResponse.status() !== 200 || listPayload?.ok !== true || !Array.isArray(listPayload.items) || listPayload.items.length !== 0) {
    throw new Error(`Completed story deliveries remained pending after reload: ${redact(JSON.stringify(listPayload))}`);
  }
  if (await page.locator(".player-story-cutscene-modal").count()) {
    throw new Error("A completed story cutscene reopened after reload.");
  }
  evidence.persistedAfterReload = true;

  if (evidence.responseUuidLeak) throw new Error("Story delivery responses exposed a raw internal UUID.");
  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`Story delivery browser journey emitted errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
  }
  const incomplete = [
    ...Object.values(evidence.required),
    ...Object.values(evidence.optional),
    evidence.persistedAfterReload,
  ].some((value) => value !== true);
  if (incomplete) throw new Error("Connected story delivery mutation evidence is incomplete.");
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(`${OUTPUT_DIR}/player-story-delivery-mutation-browser-acceptance.json`, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}

if (failure) throw failure;
console.log(JSON.stringify({ ok: true, required: evidence.required, optional: evidence.optional }));
