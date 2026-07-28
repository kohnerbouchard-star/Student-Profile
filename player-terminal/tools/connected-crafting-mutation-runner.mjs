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
  startAndCancel: {
    started: false,
    startReplaySafe: false,
    startUnauthenticatedRejected: false,
    cancelled: false,
    cancelPersisted: false,
    cancelReplaySafe: false,
    cancelUnauthenticatedRejected: false,
  },
  claim: {
    started: false,
    startReplaySafe: false,
    startUnauthenticatedRejected: false,
    claimed: false,
    persisted: false,
    replaySafe: false,
    unauthenticatedRejected: false,
  },
  equipment: {
    equipped: false,
    equipPersisted: false,
    equipReplaySafe: false,
    equipUnauthenticatedRejected: false,
    salvaged: false,
    salvagePersisted: false,
    salvageReplaySafe: false,
    salvageUnauthenticatedRejected: false,
  },
  effect: {
    applied: false,
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
      v_pack_id uuid;
      v_recipe_id uuid;
      v_effect_item_key text;
      v_store_item_id uuid;
      v_input record;
    begin
      select game.id, player.id, pack.pack_id
      into v_game_id, v_player_id, v_pack_id
      from public.game_sessions game
      join public.players player on player.game_session_id = game.id
      join public.game_session_physical_economy_packs pack
        on pack.game_session_id = game.id and pack.status = 'active'
      where game.name = ${sqlLiteral(GAME_NAME)}
        and player.player_identifier = ${sqlLiteral(PLAYER_ID)}
        and player.status = 'active'
      order by game.created_at desc
      limit 1;
      if v_game_id is null or v_player_id is null or v_pack_id is null then
        raise exception 'Connected Crafting fixture scope is unavailable.';
      end if;

      insert into public.game_difficulty_policy_settings (
        game_session_id, difficulty_policy_profile_id, difficulty_preset,
        custom_label, source, price_modifier, event_volatility_modifier,
        scarcity_modifier, income_modifier, trade_modifier, credit_modifier,
        status
      ) values (
        v_game_id, null, 'custom', 'Connected Crafting', 'custom',
        1, 1, 1, 1, 1, 1, 'active'
      )
      on conflict (game_session_id) do update set
        difficulty_policy_profile_id = null,
        difficulty_preset = 'custom',
        custom_label = 'Connected Crafting',
        source = 'custom',
        price_modifier = 1,
        event_volatility_modifier = 1,
        scarcity_modifier = 1,
        income_modifier = 1,
        trade_modifier = 1,
        credit_modifier = 1,
        status = 'active',
        updated_at = now();

      select recipe.id into v_recipe_id
      from public.physical_economy_recipe_definitions recipe
      join public.game_session_recipe_availability availability
        on availability.recipe_id = recipe.id
        and availability.game_session_id = v_game_id
      join public.physical_economy_recipe_outputs output
        on output.recipe_id = recipe.id and output.output_kind = 'equipment'
      join public.physical_economy_item_definitions definition
        on definition.pack_id = v_pack_id and definition.item_key = output.item_key
        and definition.item_class = 'equipment' and definition.status = 'active'
      join public.physical_economy_salvage_rules salvage
        on salvage.pack_id = v_pack_id and salvage.equipment_item_key = output.item_key
        and salvage.enabled = true
      join public.store_items output_item
        on output_item.game_session_id = v_game_id and output_item.item_key = output.item_key
        and output_item.status = 'active'
      where recipe.pack_id = v_pack_id
        and recipe.status = 'active'
        and availability.enabled = true
        and availability.scarcity_band <> 'unavailable'
        and availability.unlocked_by_default = true
        and (
          cardinality(availability.country_codes) = 0
          or exists (
            select 1
            from public.player_country_assignments assignment
            join public.country_profiles country on country.id = assignment.country_profile_id
            where assignment.game_session_id = v_game_id
              and assignment.player_id = v_player_id
              and assignment.status = 'active'
              and country.country_code = any(availability.country_codes)
          )
        )
        and not exists (
          select 1
          from public.physical_economy_recipe_inputs input
          left join public.store_items item
            on item.game_session_id = v_game_id
            and item.item_key = input.item_key
            and item.status = 'active'
          where input.recipe_id = recipe.id and item.id is null
        )
      order by recipe.base_duration_seconds, recipe.recipe_key
      limit 1;
      if v_recipe_id is null then
        raise exception 'Connected Crafting fixture found no active equipment recipe with salvage authority.';
      end if;

      for v_input in
        select input.item_key, item.id as store_item_id
        from public.physical_economy_recipe_inputs input
        join public.store_items item
          on item.game_session_id = v_game_id
          and item.item_key = input.item_key
          and item.status = 'active'
        where input.recipe_id = v_recipe_id
      loop
        insert into public.inventory_holdings (
          game_session_id, player_id, store_item_id, quantity_owned, quantity_reserved
        ) values (
          v_game_id, v_player_id, v_input.store_item_id, 100000, 0
        )
        on conflict (game_session_id, player_id, store_item_id) do update set
          quantity_owned = greatest(
            public.inventory_holdings.quantity_owned,
            public.inventory_holdings.quantity_reserved + 100000
          ),
          updated_at = now();
      end loop;

      select definition.item_key, item.id
      into v_effect_item_key, v_store_item_id
      from public.physical_economy_item_definitions definition
      join public.physical_economy_effect_definitions effect
        on effect.pack_id = definition.pack_id
        and effect.effect_code = definition.effect_code
        and effect.enabled = true
        and effect.effect_kind <> 'disabled_repair'
      join public.store_items item
        on item.game_session_id = v_game_id
        and item.item_key = definition.item_key
        and item.status = 'active'
        and item.visibility = 'visible'
      where definition.pack_id = v_pack_id
        and definition.item_class = 'consumable'
        and definition.effect_enabled = true
        and definition.status = 'active'
        and public.physical_economy_safe_effect_handler_v1(effect.effect_code) is not null
      order by definition.item_key
      limit 1;
      if v_effect_item_key is null or v_store_item_id is null then
        raise exception 'Connected Crafting fixture found no enabled safe-effect consumable.';
      end if;

      insert into public.inventory_holdings (
        game_session_id, player_id, store_item_id, quantity_owned, quantity_reserved
      ) values (
        v_game_id, v_player_id, v_store_item_id, 2, 0
      )
      on conflict (game_session_id, player_id, store_item_id) do update set
        quantity_owned = greatest(
          public.inventory_holdings.quantity_owned,
          public.inventory_holdings.quantity_reserved + 2
        ),
        updated_at = now();
    end;
    $$;

    with scope as (
      select game.id as game_id, player.id as player_id, pack.pack_id
      from public.game_sessions game
      join public.players player on player.game_session_id = game.id
      join public.game_session_physical_economy_packs pack
        on pack.game_session_id = game.id and pack.status = 'active'
      where game.name = ${sqlLiteral(GAME_NAME)}
        and player.player_identifier = ${sqlLiteral(PLAYER_ID)}
        and player.status = 'active'
      order by game.created_at desc
      limit 1
    ), selected_recipe as (
      select recipe.id, recipe.recipe_key, output.item_key as output_item_key,
        definition.equipment_slot
      from scope
      join public.physical_economy_recipe_definitions recipe on recipe.pack_id = scope.pack_id
      join public.game_session_recipe_availability availability
        on availability.recipe_id = recipe.id and availability.game_session_id = scope.game_id
      join public.physical_economy_recipe_outputs output
        on output.recipe_id = recipe.id and output.output_kind = 'equipment'
      join public.physical_economy_item_definitions definition
        on definition.pack_id = scope.pack_id and definition.item_key = output.item_key
        and definition.item_class = 'equipment' and definition.status = 'active'
      join public.physical_economy_salvage_rules salvage
        on salvage.pack_id = scope.pack_id and salvage.equipment_item_key = output.item_key
        and salvage.enabled = true
      join public.store_items output_item
        on output_item.game_session_id = scope.game_id and output_item.item_key = output.item_key
        and output_item.status = 'active'
      where recipe.status = 'active'
        and availability.enabled = true
        and availability.scarcity_band <> 'unavailable'
        and availability.unlocked_by_default = true
        and (
          cardinality(availability.country_codes) = 0
          or exists (
            select 1 from public.player_country_assignments assignment
            join public.country_profiles country on country.id = assignment.country_profile_id
            where assignment.game_session_id = scope.game_id
              and assignment.player_id = scope.player_id
              and assignment.status = 'active'
              and country.country_code = any(availability.country_codes)
          )
        )
        and not exists (
          select 1 from public.physical_economy_recipe_inputs input
          left join public.store_items item
            on item.game_session_id = scope.game_id and item.item_key = input.item_key
            and item.status = 'active'
          where input.recipe_id = recipe.id and item.id is null
        )
      order by recipe.base_duration_seconds, recipe.recipe_key
      limit 1
    ), selected_effect as (
      select definition.item_key, effect.public_summary
      from scope
      join public.physical_economy_item_definitions definition on definition.pack_id = scope.pack_id
      join public.physical_economy_effect_definitions effect
        on effect.pack_id = definition.pack_id and effect.effect_code = definition.effect_code
        and effect.enabled = true and effect.effect_kind <> 'disabled_repair'
      join public.store_items item
        on item.game_session_id = scope.game_id and item.item_key = definition.item_key
        and item.status = 'active' and item.visibility = 'visible'
      where definition.item_class = 'consumable'
        and definition.effect_enabled = true
        and definition.status = 'active'
        and public.physical_economy_safe_effect_handler_v1(effect.effect_code) is not null
      order by definition.item_key
      limit 1
    )
    select jsonb_build_object(
      'recipeKey', selected_recipe.recipe_key,
      'outputItemKey', selected_recipe.output_item_key,
      'equipmentSlot', selected_recipe.equipment_slot,
      'effectItemKey', selected_effect.item_key,
      'effectSummary', selected_effect.public_summary
    )::text
    from selected_recipe cross join selected_effect;
  `);
  const line = result.split(/\r?\n/).filter(Boolean).at(-1) || "{}";
  const fixture = JSON.parse(line);
  if (!/^recipe\.[a-z0-9][a-z0-9._-]{2,127}$/.test(fixture.recipeKey)) {
    throw new Error("Connected Crafting fixture did not return a public recipe key.");
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(fixture.effectItemKey)) {
    throw new Error("Connected Crafting fixture did not return a public effect item key.");
  }
  if (!new Set(["field", "utility", "analysis", "operations"]).has(fixture.equipmentSlot)) {
    throw new Error("Connected Crafting fixture returned an invalid equipment slot.");
  }
  evidence.fixturePrepared = true;
  return fixture;
}

async function parseJson(response) {
  return response.json().catch(() => null);
}

function resultBody(payload) {
  return payload?.data && typeof payload.data === "object" ? payload.data : payload;
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
  if (signIn.status !== 200 || !signIn.payload?.access_token) {
    throw new Error(`Crafting fixture Admin sign-in returned ${signIn.status}.`);
  }
  const bootstrap = await request("/functions/v1/classroom-api/staff/bootstrap", {
    headers: platformHeaders(key, signIn.payload.access_token),
  });
  const sessions = Array.isArray(bootstrap.payload?.activeGameSessions) ? bootstrap.payload.activeGameSessions : [];
  const game = sessions.find((item) => item?.name === GAME_NAME) || sessions[0];
  const code = String(game?.gameCode || game?.joinCode || "").trim();
  if (!/^ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}$/.test(code)) {
    throw new Error("Crafting fixture could not resolve the connected Game Code.");
  }
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
  if (response.status() !== 200) throw new Error(`Crafting Player login returned ${response.status()}.`);
  await page.waitForURL(/\/player-terminal\/(?:index\.html)?(?:#.*)?$/, { timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  return { context, page };
}

async function openCrafting(page, recipeKey = "") {
  const route = page.locator('[data-route="crafting"]:visible').first();
  await route.waitFor({ state: "visible", timeout: 30_000 });
  await route.click();
  await page.waitForFunction(() => location.hash === "#crafting", undefined, { timeout: 30_000 });
  await page.locator(".player-terminal-crafting-page").waitFor({ state: "visible", timeout: 30_000 });
  if (recipeKey) {
    const recipe = page.locator(`[data-player-crafting-recipe="${recipeKey}"]`);
    await recipe.waitFor({ state: "visible", timeout: 30_000 });
    await recipe.click();
    await page.locator(`form[data-endpoint="craftItem"][data-recipe-id="${recipeKey}"]`).waitFor({ state: "visible", timeout: 30_000 });
  }
}

async function reloadCrafting(page, recipeKey = "") {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator(".player-terminal-app-root").waitFor({ state: "visible", timeout: 120_000 });
  await openCrafting(page, recipeKey);
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

async function replay(page, original, expectedStatus, expectedOutcome, label) {
  const response = await page.evaluate(async ({ url, method, headers, body }) => {
    const result = await fetch(url, { method, headers, body, cache: "no-store" });
    return { status: result.status, payload: await result.json().catch(() => null) };
  }, original);
  const result = resultBody(response.payload);
  if (response.status !== expectedStatus || response.payload?.ok !== true || result?.outcome !== expectedOutcome) {
    throw new Error(`${label} replay failed: ${response.status} ${redact(JSON.stringify(response.payload))}`);
  }
}

async function assertUnauthorized(key, original, label) {
  const response = await request(new URL(original.url).pathname, {
    method: original.method,
    headers: platformHeaders(key),
    body: JSON.parse(original.body),
  });
  if (![401, 403].includes(response.status)) throw new Error(`Unauthenticated ${label} returned ${response.status}.`);
}

function hiddenForm(page, endpoint, name, value) {
  return page.locator(`form[data-endpoint="${endpoint}"]:has(input[name="${name}"][value="${value}"])`);
}

async function startJob(page, recipeKey, quantity) {
  await openCrafting(page, recipeKey);
  const form = page.locator(`form[data-endpoint="craftItem"][data-recipe-id="${recipeKey}"]`);
  await form.locator('input[name="quantity"]').fill(String(quantity));
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith("/players/me/crafting/jobs") && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  const result = resultBody(payload);
  if (response.status() !== 201 || payload?.ok !== true || result?.outcome !== "created" || !/^cft_[0-9a-f]{32}$/.test(result?.jobKey || "")) {
    throw new Error(`Crafting start returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  return { jobKey: result.jobKey, original: await capture(response) };
}

async function cancelJob(page, key, jobKey) {
  const form = hiddenForm(page, "craftCancel", "jobKey", jobKey);
  await form.waitFor({ state: "visible", timeout: 30_000 });
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/players/me/crafting/jobs/${jobKey}/cancel`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  if (response.status() !== 200 || payload?.ok !== true || resultBody(payload)?.outcome !== "cancelled") {
    throw new Error(`Crafting cancel returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  const original = await capture(response);
  evidence.startAndCancel.cancelled = true;
  await replay(page, original, 200, "replayed", "Crafting cancel");
  evidence.startAndCancel.cancelReplaySafe = true;
  await assertUnauthorized(key, original, "Crafting cancel");
  evidence.startAndCancel.cancelUnauthenticatedRejected = true;
  await reloadCrafting(page);
  if (await hiddenForm(page, "craftCancel", "jobKey", jobKey).count() || await hiddenForm(page, "craftClaim", "jobKey", jobKey).count()) {
    throw new Error("Cancelled Crafting job remained actionable after reload.");
  }
  evidence.startAndCancel.cancelPersisted = true;
}

function fastForwardJob(jobKey) {
  const count = Number(psql(`
    update public.crafting_jobs job
    set completes_at = now() - interval '1 second', updated_at = now()
    from public.game_sessions game, public.players player
    where job.game_session_id = game.id
      and job.player_id = player.id
      and player.game_session_id = game.id
      and game.name = ${sqlLiteral(GAME_NAME)}
      and player.player_identifier = ${sqlLiteral(PLAYER_ID)}
      and job.public_id = ${sqlLiteral(jobKey)}
      and job.status = 'in_progress';
    select count(*) from public.crafting_jobs job
    join public.game_sessions game on game.id = job.game_session_id
    join public.players player on player.game_session_id = job.game_session_id and player.id = job.player_id
    where game.name = ${sqlLiteral(GAME_NAME)}
      and player.player_identifier = ${sqlLiteral(PLAYER_ID)}
      and job.public_id = ${sqlLiteral(jobKey)}
      and job.completes_at <= now();
  `).split(/\r?\n/).filter(Boolean).at(-1));
  if (count !== 1) throw new Error("Connected Crafting job could not be fast-forwarded.");
}

async function claimJob(page, key, jobKey) {
  const form = hiddenForm(page, "craftClaim", "jobKey", jobKey);
  await form.waitFor({ state: "visible", timeout: 30_000 });
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/players/me/crafting/jobs/${jobKey}/claim`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  const result = resultBody(payload);
  if (response.status() !== 200 || payload?.ok !== true || result?.outcome !== "claimed") {
    throw new Error(`Crafting claim returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  const original = await capture(response);
  evidence.claim.claimed = true;
  await replay(page, original, 200, "replayed", "Crafting claim");
  evidence.claim.replaySafe = true;
  await assertUnauthorized(key, original, "Crafting claim");
  evidence.claim.unauthenticatedRejected = true;
  await reloadCrafting(page);
  if (await hiddenForm(page, "craftClaim", "jobKey", jobKey).count()) {
    throw new Error("Claimed Crafting job remained claimable after reload.");
  }
  evidence.claim.persisted = true;
}

function equipmentKeysForJob(jobKey) {
  const value = psql(`
    select coalesce(jsonb_agg(equipment.public_id order by equipment.public_id), '[]'::jsonb)::text
    from public.equipment_instances equipment
    join public.crafting_jobs job on job.id = equipment.source_job_id
    join public.game_sessions game on game.id = equipment.game_session_id
    join public.players player on player.game_session_id = equipment.game_session_id and player.id = equipment.player_id
    where game.name = ${sqlLiteral(GAME_NAME)}
      and player.player_identifier = ${sqlLiteral(PLAYER_ID)}
      and job.public_id = ${sqlLiteral(jobKey)}
      and equipment.status = 'active';
  `);
  const keys = JSON.parse(value || "[]");
  if (!Array.isArray(keys) || keys.length !== 2 || keys.some((key) => !/^eqp_[0-9a-f]{32}$/.test(key))) {
    throw new Error(`Connected Crafting claim expected two equipment instances: ${redact(value)}`);
  }
  return keys;
}

async function equipItem(page, key, equipmentKey, slot) {
  const form = hiddenForm(page, "equipmentEquip", "equipmentKey", equipmentKey);
  await form.waitFor({ state: "visible", timeout: 30_000 });
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/players/me/equipment/${equipmentKey}/equip`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  const result = resultBody(payload);
  if (response.status() !== 200 || payload?.ok !== true || result?.outcome !== "applied" || result?.slot !== slot) {
    throw new Error(`Equipment equip returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  const original = await capture(response);
  evidence.equipment.equipped = true;
  await replay(page, original, 200, "replayed", "Equipment equip");
  evidence.equipment.equipReplaySafe = true;
  await assertUnauthorized(key, original, "Equipment equip");
  evidence.equipment.equipUnauthenticatedRejected = true;
  await reloadCrafting(page);
  const current = hiddenForm(page, "equipmentEquip", "equipmentKey", equipmentKey);
  await current.waitFor({ state: "visible", timeout: 30_000 });
  const article = current.locator("xpath=ancestor::article[1]");
  if (!new RegExp(slot, "i").test(await article.innerText()) || await hiddenForm(page, "itemSalvage", "equipmentKey", equipmentKey).count()) {
    throw new Error("Equipped item did not persist in its authoritative slot.");
  }
  evidence.equipment.equipPersisted = true;
}

async function useEffect(page, key, fixture) {
  const form = hiddenForm(page, "itemEffectUse", "itemKey", fixture.effectItemKey);
  await form.waitFor({ state: "visible", timeout: 30_000 });
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/players/me/items/${fixture.effectItemKey}/use`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  if (response.status() !== 200 || payload?.ok !== true || resultBody(payload)?.outcome !== "applied") {
    throw new Error(`Item effect use returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  const original = await capture(response);
  evidence.effect.applied = true;
  await replay(page, original, 200, "replayed", "Item effect use");
  evidence.effect.replaySafe = true;
  await assertUnauthorized(key, original, "Item effect use");
  evidence.effect.unauthenticatedRejected = true;
  await reloadCrafting(page);
  await page.getByText(fixture.effectSummary, { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
  evidence.effect.persisted = true;
}

async function salvageItem(page, key, equipmentKey) {
  const form = hiddenForm(page, "itemSalvage", "equipmentKey", equipmentKey);
  await form.waitFor({ state: "visible", timeout: 30_000 });
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname.endsWith(`/players/me/equipment/${equipmentKey}/salvage`) && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  const payload = await parseJson(response);
  if (response.status() !== 200 || payload?.ok !== true || resultBody(payload)?.outcome !== "settled") {
    throw new Error(`Equipment salvage returned ${response.status()}: ${redact(JSON.stringify(payload))}`);
  }
  const original = await capture(response);
  evidence.equipment.salvaged = true;
  await replay(page, original, 200, "replayed", "Equipment salvage");
  evidence.equipment.salvageReplaySafe = true;
  await assertUnauthorized(key, original, "Equipment salvage");
  evidence.equipment.salvageUnauthenticatedRejected = true;
  await reloadCrafting(page);
  if (await hiddenForm(page, "itemSalvage", "equipmentKey", equipmentKey).count() || await hiddenForm(page, "equipmentEquip", "equipmentKey", equipmentKey).count()) {
    throw new Error("Salvaged equipment remained actionable after reload.");
  }
  evidence.equipment.salvagePersisted = true;
}

let browser;
let context;
let failure;
try {
  const fixture = prepareFixture();
  const key = await runtimeKey();
  const code = await gameCode(key);
  browser = await chromium.launch({ headless: true });
  ({ context, page: globalThis.__craftingPage } = await login(browser, code));
  const page = globalThis.__craftingPage;

  const cancelledJob = await startJob(page, fixture.recipeKey, 1);
  evidence.startAndCancel.started = true;
  await replay(page, cancelledJob.original, 201, "replayed", "Crafting start");
  evidence.startAndCancel.startReplaySafe = true;
  await assertUnauthorized(key, cancelledJob.original, "Crafting start");
  evidence.startAndCancel.startUnauthenticatedRejected = true;
  await cancelJob(page, key, cancelledJob.jobKey);

  const claimedJob = await startJob(page, fixture.recipeKey, 2);
  evidence.claim.started = true;
  await replay(page, claimedJob.original, 201, "replayed", "Crafting start for claim");
  evidence.claim.startReplaySafe = true;
  await assertUnauthorized(key, claimedJob.original, "Crafting start for claim");
  evidence.claim.startUnauthenticatedRejected = true;
  fastForwardJob(claimedJob.jobKey);
  await reloadCrafting(page, fixture.recipeKey);
  await claimJob(page, key, claimedJob.jobKey);

  const [equippedKey, salvageKey] = equipmentKeysForJob(claimedJob.jobKey);
  await equipItem(page, key, equippedKey, fixture.equipmentSlot);
  await useEffect(page, key, fixture);
  await salvageItem(page, key, salvageKey);

  if (evidence.responseUuidLeak) throw new Error("Crafting responses exposed a raw internal UUID.");
  if (evidence.consoleErrors.length || evidence.pageErrors.length) {
    throw new Error(`Crafting browser journey emitted errors: ${JSON.stringify({ consoleErrors: evidence.consoleErrors, pageErrors: evidence.pageErrors })}`);
  }
  const incomplete = [
    ...Object.values(evidence.startAndCancel),
    ...Object.values(evidence.claim),
    ...Object.values(evidence.equipment),
    ...Object.values(evidence.effect),
  ].some((value) => value !== true);
  if (incomplete) throw new Error("Connected Crafting mutation evidence is incomplete.");
} catch (error) {
  failure = error;
  evidence.failure = redact(error?.stack || error);
} finally {
  evidence.finalizedAt = new Date().toISOString();
  await writeFile(`${OUTPUT_DIR}/player-crafting-mutation-browser-acceptance.json`, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  delete globalThis.__craftingPage;
}

if (failure) throw failure;
console.log(JSON.stringify({
  ok: true,
  startAndCancel: evidence.startAndCancel,
  claim: evidence.claim,
  equipment: evidence.equipment,
  effect: evidence.effect,
}));
