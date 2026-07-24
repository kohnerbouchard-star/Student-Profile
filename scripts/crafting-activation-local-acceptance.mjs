#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const DATABASE_URL = process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PACK_PATH = process.env.PHYSICAL_ECONOMY_PACK ||
  "/tmp/physical-economy-runtime-pack.json";
const STAFF_ID = "20000000-0000-4000-8000-000000000001";
const AUTH_ID = "20000000-0000-4000-8000-000000000002";
const GAME_ID = "20000000-0000-4000-8000-000000000003";
const PLAYER_ID = "20000000-0000-4000-8000-000000000004";
const PACK_KEY = "econovaria.beta-seed-pack.v1";
const PACK_VERSION = "1.0.0-beta";

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonSql(value, tag = "json") {
  const serialized = JSON.stringify(value);
  requireCondition(
    !serialized.includes(`$${tag}$`),
    `JSON payload contains reserved ${tag} delimiter`,
  );
  return `$${tag}$${serialized}$${tag}$::jsonb`;
}

async function runSql(sql, label) {
  const file = path.join(
    "/tmp",
    `econovaria-crafting-activation-${randomUUID()}.sql`,
  );
  await writeFile(file, `${sql.trim()}\n`, "utf8");
  try {
    const result = spawnSync(
      "psql",
      [DATABASE_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", file],
      { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 },
    );
    if (result.status !== 0) {
      const stderr = String(result.stderr || "")
        .replace(
          /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
          "[uuid-redacted]",
        )
        .slice(0, 4000);
      throw new Error(`${label} failed: ${stderr || `psql exited ${result.status}`}`);
    }
    return String(result.stdout || "").trim();
  } finally {
    await unlink(file).catch(() => {});
  }
}

function parseJsonLine(output, label) {
  const lines = String(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  requireCondition(lines.length > 0, `${label} returned no JSON`);
  try {
    return JSON.parse(lines.at(-1));
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

async function setupGame() {
  await runSql(`
    insert into public.staff_users (
      id, supabase_auth_user_id, email, display_name
    ) values (
      ${sqlLiteral(STAFF_ID)}::uuid,
      ${sqlLiteral(AUTH_ID)}::uuid,
      'crafting-activation@example.test',
      'Crafting Activation Admin'
    );

    insert into public.game_sessions (
      id, owner_staff_user_id, name, status, lifecycle_state
    ) values (
      ${sqlLiteral(GAME_ID)}::uuid,
      ${sqlLiteral(STAFF_ID)}::uuid,
      'Crafting Activation Acceptance',
      'active',
      'active'
    );

    insert into public.game_settings (
      game_session_id, difficulty_preset, stock_market_window
    ) values (
      ${sqlLiteral(GAME_ID)}::uuid,
      'moderate',
      '{"timezone":"Asia/Seoul"}'::jsonb
    );

    insert into public.players (
      id, game_session_id, display_name, roster_label, status, created_at, updated_at
    ) values (
      ${sqlLiteral(PLAYER_ID)}::uuid,
      ${sqlLiteral(GAME_ID)}::uuid,
      'Crafting Acceptance Player',
      'CRAFT-01',
      'active',
      now(),
      now()
    );
  `, "Crafting acceptance setup");
}

async function importPack(pack) {
  const output = await runSql(`
    select public.import_physical_economy_pack_v1(
      ${sqlLiteral(GAME_ID)}::uuid,
      ${sqlLiteral(STAFF_ID)}::uuid,
      ${jsonSql(pack, "pack")},
      ${sqlLiteral(pack.contentDigest)},
      'crafting.pack.import.v3.acceptance'
    )::text;
  `, "Crafting pack import");
  const result = parseJsonLine(output, "Crafting pack import");
  requireCondition(
    ["imported", "replayed"].includes(result.outcome),
    `Unexpected Crafting import outcome ${result.outcome}`,
  );
  return result;
}

async function activatePack() {
  const output = await runSql(`
    select public.activate_physical_economy_pack_v1(
      ${sqlLiteral(GAME_ID)}::uuid,
      ${sqlLiteral(STAFF_ID)}::uuid,
      ${sqlLiteral(PACK_KEY)},
      ${sqlLiteral(PACK_VERSION)},
      'crafting.pack.activate.v3.acceptance'
    )::text;
  `, "Crafting pack activation");
  const result = parseJsonLine(output, "Crafting pack activation");
  requireCondition(result.status === "active", "Crafting pack did not become active");
  requireCondition(result.durabilityEnabled === false, "Durability was enabled");
  requireCondition(result.repairEnabled === false, "Repair was enabled");
  return result;
}

async function verifyActiveState() {
  const output = await runSql(`
    select jsonb_build_object(
      'activePackCount', (
        select count(*)
        from public.game_session_physical_economy_packs as game_pack
        join public.physical_economy_content_packs as pack_row
          on pack_row.id = game_pack.pack_id
        where game_pack.game_session_id = ${sqlLiteral(GAME_ID)}::uuid
          and game_pack.status = 'active'
          and pack_row.status = 'active'
          and pack_row.pack_key = ${sqlLiteral(PACK_KEY)}
          and pack_row.content_version = ${sqlLiteral(PACK_VERSION)}
      ),
      'items', (
        select count(*)
        from public.physical_economy_item_definitions as item_row
        join public.physical_economy_content_packs as pack_row
          on pack_row.id = item_row.pack_id
        where pack_row.pack_key = ${sqlLiteral(PACK_KEY)}
          and pack_row.content_version = ${sqlLiteral(PACK_VERSION)}
          and item_row.status = 'active'
      ),
      'recipes', (
        select count(*)
        from public.physical_economy_recipe_definitions as recipe_row
        join public.physical_economy_content_packs as pack_row
          on pack_row.id = recipe_row.pack_id
        where pack_row.pack_key = ${sqlLiteral(PACK_KEY)}
          and pack_row.content_version = ${sqlLiteral(PACK_VERSION)}
          and recipe_row.status = 'active'
      ),
      'substitutions', (
        select count(*)
        from public.physical_economy_substitution_options as substitution_row
        join public.physical_economy_content_packs as pack_row
          on pack_row.id = substitution_row.pack_id
        where pack_row.pack_key = ${sqlLiteral(PACK_KEY)}
          and pack_row.content_version = ${sqlLiteral(PACK_VERSION)}
          and substitution_row.enabled
      ),
      'salvageRules', (
        select count(*)
        from public.physical_economy_salvage_rules as salvage_row
        join public.physical_economy_content_packs as pack_row
          on pack_row.id = salvage_row.pack_id
        where pack_row.pack_key = ${sqlLiteral(PACK_KEY)}
          and pack_row.content_version = ${sqlLiteral(PACK_VERSION)}
          and salvage_row.enabled
      ),
      'recipeAvailability', (
        select count(*)
        from public.game_session_recipe_availability as availability_row
        join public.physical_economy_recipe_definitions as recipe_row
          on recipe_row.id = availability_row.recipe_id
        join public.physical_economy_content_packs as pack_row
          on pack_row.id = recipe_row.pack_id
        where availability_row.game_session_id = ${sqlLiteral(GAME_ID)}::uuid
          and availability_row.enabled
          and pack_row.pack_key = ${sqlLiteral(PACK_KEY)}
      ),
      'productionAuthorized', (
        select (pack_row.metadata #>> '{activationAuthorization,productionAuthorized}')::boolean
        from public.physical_economy_content_packs as pack_row
        where pack_row.pack_key = ${sqlLiteral(PACK_KEY)}
          and pack_row.content_version = ${sqlLiteral(PACK_VERSION)}
      ),
      'authorizationId', (
        select pack_row.metadata #>> '{activationAuthorization,authorizationId}'
        from public.physical_economy_content_packs as pack_row
        where pack_row.pack_key = ${sqlLiteral(PACK_KEY)}
          and pack_row.content_version = ${sqlLiteral(PACK_VERSION)}
      ),
      'failedCalibrationGates', (
        select jsonb_array_length(
          coalesce(
            pack_row.metadata #> '{calibrationEvidence,balanceGateSummary,failures}',
            '[]'::jsonb
          )
        )
        from public.physical_economy_content_packs as pack_row
        where pack_row.pack_key = ${sqlLiteral(PACK_KEY)}
          and pack_row.content_version = ${sqlLiteral(PACK_VERSION)}
      ),
      'playerRecipeCount', (
        select jsonb_array_length(
          coalesce(
            public.read_player_crafting_v1(
              ${sqlLiteral(GAME_ID)}::uuid,
              ${sqlLiteral(PLAYER_ID)}::uuid
            )->'recipes',
            '[]'::jsonb
          )
        )
      )
    )::text;
  `, "Crafting active-state verification");
  const state = parseJsonLine(output, "Crafting active-state verification");
  const expected = {
    activePackCount: 1,
    items: 144,
    recipes: 60,
    substitutions: 44,
    salvageRules: 30,
    recipeAvailability: 60,
    productionAuthorized: false,
    authorizationId: "crafting.activation.v3.20260724",
    failedCalibrationGates: 0,
    playerRecipeCount: 60,
  };
  for (const [key, value] of Object.entries(expected)) {
    requireCondition(
      state[key] === value,
      `${key} expected ${value}, received ${state[key]}`,
    );
  }
  return state;
}

async function verifyReplays(pack) {
  const imported = await importPack(pack);
  requireCondition(imported.replayed === true, "Crafting import replay was not reported");
  const activated = await activatePack();
  requireCondition(activated.replayed === true, "Crafting activation replay was not reported");

  const eventCount = Number(await runSql(`
    select count(*)
    from public.physical_economy_admin_events
    where game_session_id = ${sqlLiteral(GAME_ID)}::uuid
      and action in ('pack.import', 'pack.activate');
  `, "Crafting replay event verification"));
  requireCondition(eventCount === 2, "Crafting replay created duplicate Admin events");
}

async function verifyTamperDenial(pack) {
  const tampered = {
    ...pack,
    activationAuthorization: {
      ...pack.activationAuthorization,
      productionAuthorized: true,
    },
  };
  const output = await runSql(`
    do $block$
    begin
      begin
        perform public.import_physical_economy_pack_v1(
          ${sqlLiteral(GAME_ID)}::uuid,
          ${sqlLiteral(STAFF_ID)}::uuid,
          ${jsonSql(tampered, "tampered")},
          ${sqlLiteral(pack.contentDigest)},
          'crafting.pack.import.tampered'
        );
        raise exception 'TAMPERED_PACK_ACCEPTED';
      exception
        when others then
          if sqlerrm = 'TAMPERED_PACK_ACCEPTED' then raise; end if;
          if sqlerrm not like '%PHYSICAL_ECONOMY_PACK_IDENTITY_MISMATCH%' then
            raise;
          end if;
      end;
    end
    $block$;
    select jsonb_build_object('tamperedProductionAuthorizationDenied', true)::text;
  `, "Crafting tamper denial");
  const result = parseJsonLine(output, "Crafting tamper denial");
  requireCondition(
    result.tamperedProductionAuthorizationDenied === true,
    "Tampered production authorization was not denied",
  );
}

async function main() {
  const pack = JSON.parse(await readFile(PACK_PATH, "utf8"));
  requireCondition(
    pack.schemaVersion === "econovaria-physical-economy-runtime-pack-v1",
    "Crafting runtime pack schema is invalid",
  );
  requireCondition(pack.packKey === PACK_KEY, "Crafting pack key is invalid");
  requireCondition(pack.contentVersion === PACK_VERSION, "Crafting pack version is invalid");
  requireCondition(
    pack.activationAuthorization?.productionAuthorized === false,
    "Production authorization must remain false",
  );

  await setupGame();
  const imported = await importPack(pack);
  const activated = await activatePack();
  const state = await verifyActiveState();
  await verifyReplays(pack);
  await verifyTamperDenial(pack);

  const report = {
    schemaVersion: "econovaria-crafting-activation-local-acceptance-v2",
    verification: {
      importOutcome: imported.outcome,
      activationStatus: activated.status,
      ...state,
      importReplay: true,
      activationReplay: true,
      duplicateAdminEvents: false,
      tamperedProductionAuthorizationDenied: true,
    },
    safety: {
      disposableDatabase: true,
      productionTouched: false,
      productionAuthorized: false,
      rawInternalIdentifiersRecorded: false,
      credentialsRecorded: false,
    },
  };
  const serialized = JSON.stringify(report);
  requireCondition(
    !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized),
    "Crafting acceptance report contains a raw UUID",
  );
  await writeFile(
    "/tmp/crafting-activation-local-acceptance.json",
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify({
    craftingPackImported: true,
    craftingPackActivated: true,
    playerRecipesVisible: state.playerRecipeCount,
    importReplayVerified: true,
    activationReplayVerified: true,
    productionAuthorizationDenied: true,
    productionTouched: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: String(error?.message || error)
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
        "[uuid-redacted]",
      )
      .slice(0, 4000),
    productionTouched: false,
    productionAuthorized: false,
  }));
  process.exitCode = 1;
});
