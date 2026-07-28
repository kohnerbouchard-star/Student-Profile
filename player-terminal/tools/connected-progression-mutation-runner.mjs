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
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

await mkdir(OUTPUT_DIR, { recursive: true });

const evidence = {
  generatedAt: new Date().toISOString(),
  fixturePrepared: false,
  skill: {
    unlocked: false,
    persisted: false,
    replaySafe: false,
    unauthenticatedRejected: false,
  },
  reward: {
    claimed: false,
    persisted: false,
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
        raise exception 'Connected Progression fixture player is unavailable.';
      end if;

      perform public.ensure_player_progression_profile_v1(v_game_id, v_player_id);
      delete from public.progression_command_audit
      where game_session_id = v_game_id and player_id = v_player_id and actor_type = 'player';
      delete from public.player_progression_skills
      where game_session_id = v_game_id and player_id = v_player_id;
      delete from public.player_progression_reward_grants
      where game_session_id = v_game_id and player_id = v_player_id;
      delete from public.player_achievement_progress
      where game_session_id = v_game_id and player_id = v_player_id;
      delete from public.player_progression_counters
      where game_session_id = v_game_id and player_id = v_player_id;

      update public.player_progression_profiles
      set experience = 250,
          level = 3,
          earned_skill_points = 2,
          spent_skill_points = 0,
          bonus_skill_points = 0,
          public_title = 'Developing Professional',
          updated_at = now()
      where game_session_id = v_game_id and player_id = v_player_id;

      insert into public.player_progression_counters (
        game_session_id, player_id, counter_key, counter_value
      ) values (
        v_game_id, v_player_id, 'events.total', 1
      );
      perform public.evaluate_player_progression_achievements_v1(v_game_id, v_player_id);
    end;
    $$;
    select jsonb_build_object(
      'pendingRewards', count(*)
    )::text
    from public.player_progression_reward_grants reward
    join public.game_sessions game on game.id = reward.game_session_id
    join public.players player on player.game_session_id = reward.game_session_id and player.id = reward.player_id
    where game.name = ${sqlLiteral(GAME_NAME)}
      and player.player_identifier = ${sqlLiteral(PLAYER_ID)}
      and reward.status = 'pending';
  `);
  const last = result.split(/\r?\n/).filter(Boolean).at(-1) || "{}";
  const parsed = JSON.parse(last);
  if (Number(parsed.pendingRewards) < 1) throw new Error("Connected Progression fixture did not create a pending reward.");
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
  if (signIn.status !== 200 || !signIn.payload?.access_token) throw new Error(`Progression fixture Admin sign-in returned ${signIn.status}.`);
  const bootstrap = await request("/functions/v1/classroom-api/staff/bootstrap", {
    headers: platformHeaders(key, signIn.payload.access_token),
  });
  const sessions = Array.isArray(bootstrap.payload?.activeGameSessions) ? bootstrap.payload.activeGameSessions : [];
  const game = sessions.find((item) => item?.name === GAME_NAME) || sessions[0];
  const code = String(game?.gameCode || game?.joinCode || "").trim();
  if (!/^ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}$/.test(code)) throw new Error("Progression fixture could not resolve the connected Game Code.");
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

async function login(browser, code) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  instrument(page);
  await page.goto(`${BASE_URL}/?mode=player&gameCode=${encodeURIComponent(code)}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("#gameCode").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#playerId").fill(PLAYER_ID);
  await page.locator("#playerAccessCode").fill(ACCESS_CODE);
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/functions/v1/classroom-api/players/login") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.locator("#playerForm button[type='submit']").click();
  const response = await responsePromise;
  if (response.status() !== 200) throw new Error(`Progression Player login returned ${response.status()}.`);
  await page.waitForURL(/\/player-terminal\/(?:index\.html)?(?:#.*)?$/, { timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  return { context, page };
}

async function openProgression(page) {
  const route = page.locator('[data-route="progression"]:visible').first();
  await route.waitFor({ state: "visible", timeout: 30_000 });
  await route.click();
  await page.waitForFunction(() => location.hash === "#progression", undefined, { timeout: 30_000 });
  await page.locator(".player-terminal-progression-page").waitFor({ state: "visible", timeout: 30_000 });
}

async function capture(response) {
  const requestRecord = response.request();
  const headers = await requestRecord.allHeaders();
  const allowed = new Set([
    "accept", "apikey", "authorization", "content-type", "idempotency-key",
    "x-idempotency-key", "x-player-session-token", "x-request-id",
  ]);
  return {
    url: response.url(),
    method: requestRecord.method(),
    body: requestRecord.postData() || "{}",
    headers: Object.fromEntries(Object.entries(headers).filter(([name]) => allowed.has(name.toLowerCase()))),
  };
}

async function replay(page, original) {
  return page.evaluate(async ({ url, method, headers, body }) => {
    const response = await fetch(url, { method, headers, body, cache: "no-store" });
    return { status: response.status, payload: await response.json().catch(() => null) };
  }, original);
}

async function assertUnauthorized(key, original, label) {
  const result = await request(new URL(original.url).pathname, {
    method: original.method,
    headers: platformHeaders(key),
    body: JSON.parse(original.body),
  });
  if (![401, 403].includes(result.status)) throw new Error(`Unauthenticated ${label} returned ${result.status}.`);
}

async function unlockSkill(page, key) {
  await page.locator('[data-player-progression-tab="Skills"]').click();
  const button = page.locator('[data-player-skill-unlock]:not([disabled]):visible').first();
  await button.waitFor({ state: "visible", timeout: 30_000 });
  const skillId = String(await button.getAttribute("data-player-skill-unlock") || "").trim();
  if (!/^skl_[a-z0-9_]{3,64}_v1$/.test(skillId)) throw new Error("Progression Unlock did not expose a public skill ID.");
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/players/me/progression/skills/${skillId}/unlock`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await button.click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  if (response.status() !== 200 || payload?.ok !== true || payload?.outcome !== "applied") {
    throw new Error(`Progression skill unlock returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  const original = await capture(response);
  evidence.skill.unlocked = true;

  await page.locator('[data-player-progression-tab="Skills"]').click();
  await page.locator(`[data-player-skill-unlock="${skillId}"]`).waitFor({ state: "visible", timeout: 30_000 });
  const current = page.locator(`[data-player-skill-unlock="${skillId}"]`);
  if (!(await current.isDisabled()) || !/Unlocked/i.test(await current.innerText())) {
    throw new Error("Progression skill did not reconcile to the unlocked state.");
  }
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  await openProgression(page);
  await page.locator('[data-player-progression-tab="Skills"]').click();
  if (!(await page.locator(`[data-player-skill-unlock="${skillId}"]`).isDisabled())) {
    throw new Error("Progression skill unlock did not persist after reload.");
  }
  evidence.skill.persisted = true;

  const replayed = await replay(page, original);
  if (replayed.status !== 200 || replayed.payload?.outcome !== "replayed") {
    throw new Error(`Progression skill replay was not recognized: ${replayed.status} ${redact(JSON.stringify(replayed.payload))}`);
  }
  evidence.skill.replaySafe = true;
  await assertUnauthorized(key, original, "Progression skill unlock");
  evidence.skill.unauthenticatedRejected = true;
}

async function claimReward(page, key) {
  await page.locator('[data-player-progression-tab="Achievements"]').click();
  const button = page.locator('[data-player-reward-claim]:visible').first();
  await button.waitFor({ state: "visible", timeout: 30_000 });
  const rewardId = String(await button.getAttribute("data-player-reward-claim") || "").trim();
  if (!/^rwd_[0-9a-f]{32}$/.test(rewardId)) throw new Error("Progression Claim did not expose a public reward ID.");
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/players/me/progression/rewards/${rewardId}/claim`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await button.click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  if (response.status() !== 200 || payload?.ok !== true || payload?.outcome !== "applied") {
    throw new Error(`Progression reward claim returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  const original = await capture(response);
  evidence.reward.claimed = true;

  await page.locator('[data-player-progression-tab="Achievements"]').click();
  if (await page.locator(`[data-player-reward-claim="${rewardId}"]`).count()) {
    throw new Error("Claimed Progression reward remained actionable after refresh.");
  }
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  await openProgression(page);
  await page.locator('[data-player-progression-tab="Achievements"]').click();
  if (await page.locator(`[data-player-reward-claim="${rewardId}"]`).count()) {
    throw new Error("Claimed Progression reward returned after reload.");
  }
  evidence.reward.persisted = true;

  const replayed = await replay(page, original);
  if (replayed.status !== 200 || replayed.payload?.outcome !== "replayed") {
    throw new Error(`Progression reward replay was not recognized: ${replayed.status} ${redact(JSON.stringify(replayed.payload))}`);
  }
  evidence.reward.replaySafe = true;
  await assertUnauthorized(key, original, "Progression reward claim");
  evidence.reward.unauthenticatedRejected = true;
}

let browser;
let context;
let failure;
try {
  prepareFixture();
  const key = await runtimeKey();
  const code = await gameCode(key);
  browser = await chromium.launch({ headless: true });
  ({ context, page: globalThis.__progressionPage } = await login(browser, code));
  const page = globalThis.__progressionPage;
  await openProgression(page);
  await unlockSkill(page, key);
  await claimReward(page, key);

  if (evidence.responseUuidLeak) throw new Error("Progression responses exposed a raw internal UUID.");
  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`Progression browser journey emitted errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
  }
  const incomplete = [...Object.values(evidence.skill), ...Object.values(evidence.reward)].some((value) => value !== true);
  if (incomplete) throw new Error("Connected Progression mutation evidence is incomplete.");
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(`${OUTPUT_DIR}/player-progression-mutation-browser-acceptance.json`, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  delete globalThis.__progressionPage;
}

if (failure) throw failure;
console.log(JSON.stringify({ ok: true, skill: evidence.skill, reward: evidence.reward }));
