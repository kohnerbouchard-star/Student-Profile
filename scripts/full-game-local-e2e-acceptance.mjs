#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const DATABASE_URL = process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PACK_PATH = process.env.PHYSICAL_ECONOMY_PACK ||
  "/tmp/physical-economy-runtime-pack.json";
const STAFF_ID = "10000000-0000-4000-8000-000000000001";
const SOURCE_GAME_ID = "10000000-0000-4000-8000-000000000003";
const TARGET_GAME_NAME = "Full Game E2E Target";
const IDEMPOTENCY_KEY = "game.create.full-e2e.acceptance.001";

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
    `econovaria-full-game-e2e-${randomUUID()}.sql`,
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

async function activateCraftingSource(pack) {
  const imported = parseJsonLine(await runSql(`
    select public.import_physical_economy_pack_v1(
      ${sqlLiteral(SOURCE_GAME_ID)}::uuid,
      ${sqlLiteral(STAFF_ID)}::uuid,
      ${jsonSql(pack, "pack")},
      ${sqlLiteral(pack.contentDigest)},
      'full-game-e2e.pack.import.v1'
    )::text;
  `, "Crafting source import"), "Crafting source import");
  requireCondition(
    ["imported", "replayed"].includes(imported.outcome),
    `Unexpected Crafting import outcome ${imported.outcome}`,
  );

  const activated = parseJsonLine(await runSql(`
    select public.activate_physical_economy_pack_v1(
      ${sqlLiteral(SOURCE_GAME_ID)}::uuid,
      ${sqlLiteral(STAFF_ID)}::uuid,
      ${sqlLiteral(pack.packKey)},
      ${sqlLiteral(pack.contentVersion)},
      'full-game-e2e.pack.activate.v1'
    )::text;
  `, "Crafting source activation"), "Crafting source activation");
  requireCondition(activated.status === "active", "Crafting source pack is not active");
  requireCondition(activated.durabilityEnabled === false, "Durability unexpectedly enabled");
  requireCondition(activated.repairEnabled === false, "Repair unexpectedly enabled");
}

async function createFullGame() {
  const result = parseJsonLine(await runSql(`
    select public.create_provisioned_game_v2(
      ${sqlLiteral(STAFF_ID)}::uuid,
      ${sqlLiteral(TARGET_GAME_NAME)},
      '{"difficulty_preset":"hard","stock_market_window":{"timezone":"Asia/Seoul"}}'::jsonb,
      ${sqlLiteral(IDEMPOTENCY_KEY)},
      'econovaria.beta-seed-pack.v1'
    )::text;
  `, "V2 full-game provisioning"), "V2 full-game provisioning");

  requireCondition(result.outcome === "created", `V2 provisioning returned ${result.outcome}`);
  requireCondition(result.provisioningStatus === "ready", "V2 game is not ready");
  requireCondition(typeof result.gameSessionId === "string", "V2 game ID is missing");
  requireCondition(typeof result.joinCode === "string" && result.joinCode.length >= 8, "V2 Game Code is missing");
  requireCondition(result.activationVersion === "full-game-feature-activation-v2", "Activation version is incorrect");

  const gates = result.contentGates || {};
  for (const gate of ["crafting", "story", "arrivalGrantProcessor", "progressionInitialization"]) {
    requireCondition(gates[gate] === "active", `${gate} gate is ${gates[gate]}`);
  }

  const expectedCounts = {
    marketAssets: 240,
    contracts: 30,
    storeItems: 50,
    worldLocations: 50,
    worldRoutes: 13,
    storylines: 1,
    storyEvents: 3,
    arrivalPackages: 10,
    arrivalClassGrants: 8,
    craftingItems: 144,
    craftingRecipes: 60,
  };
  for (const [key, value] of Object.entries(expectedCounts)) {
    requireCondition(
      result.counts?.[key] === value,
      `${key} expected ${value}, received ${result.counts?.[key]}`,
    );
  }
  return result;
}

async function verifyDatabase(created) {
  return parseJsonLine(await runSql(`
    select jsonb_build_object(
      'activationEvidence', (
        select count(*) from public.game_feature_activation_evidence
        where game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and story_status = 'active'
          and crafting_status = 'active'
          and arrival_grant_status = 'active'
          and progression_status = 'active'
      ),
      'activeCraftingPacks', (
        select count(*) from public.game_session_physical_economy_packs
        where game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and status = 'active'
      ),
      'availableRecipes', (
        select count(*) from public.game_session_recipe_availability
        where game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and enabled
      ),
      'storylines', (
        select count(*) from public.game_session_storylines
        where game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and status = 'active'
      ),
      'storyEvents', (
        select count(*)
        from public.game_session_storylines as activation_row
        join public.storyline_events as event_row
          on event_row.storyline_id = activation_row.storyline_id
        where activation_row.game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and activation_row.status = 'active'
          and event_row.is_active
      )
    )::text;
  `, "V2 database verification"), "V2 database verification");
}

async function verifyReplay(created) {
  const replay = parseJsonLine(await runSql(`
    select public.create_provisioned_game_v2(
      ${sqlLiteral(STAFF_ID)}::uuid,
      ${sqlLiteral(TARGET_GAME_NAME)},
      '{"difficulty_preset":"hard","stock_market_window":{"timezone":"Asia/Seoul"}}'::jsonb,
      ${sqlLiteral(IDEMPOTENCY_KEY)},
      'econovaria.beta-seed-pack.v1'
    )::text;
  `, "V2 provisioning replay"), "V2 provisioning replay");
  requireCondition(replay.outcome === "replayed", `V2 replay returned ${replay.outcome}`);
  requireCondition(replay.gameSessionId === created.gameSessionId, "V2 replay resolved another game");
  requireCondition(replay.joinCode === null, "V2 replay exposed the Game Code");

  const gameCount = Number(await runSql(`
    select count(*) from public.game_sessions
    where name = ${sqlLiteral(TARGET_GAME_NAME)};
  `, "V2 replay game count"));
  requireCondition(gameCount === 1, `V2 replay created ${gameCount} games`);
}

async function main() {
  const pack = JSON.parse(await readFile(PACK_PATH, "utf8"));
  requireCondition(
    pack.schemaVersion === "econovaria-physical-economy-runtime-pack-v1",
    "Physical-economy pack schema is invalid",
  );
  requireCondition(pack.activationAuthorization?.productionAuthorized === false, "Production authorization must remain false");

  await activateCraftingSource(pack);
  const created = await createFullGame();
  const state = await verifyDatabase(created);
  const expectedState = {
    activationEvidence: 1,
    activeCraftingPacks: 1,
    availableRecipes: 60,
    storylines: 1,
    storyEvents: 3,
  };
  for (const [key, value] of Object.entries(expectedState)) {
    requireCondition(state[key] === value, `${key} expected ${value}, received ${state[key]}`);
  }
  await verifyReplay(created);

  const report = {
    schemaVersion: "econovaria-full-game-local-e2e-v1",
    verification: {
      canonicalCraftingPackActive: true,
      targetGameProvisionedThroughV2: true,
      allContentGatesActive: true,
      exactContentCountsVerified: true,
      databaseActivationEvidenceVerified: true,
      committedSuccessReplayVerified: true,
    },
    safety: {
      disposableDatabase: true,
      productionAuthorized: false,
      productionTouched: false,
      plaintextGameCodeRecorded: false,
      rawInternalIdentifiersRecorded: false,
    },
  };
  const serialized = JSON.stringify(report);
  requireCondition(!serialized.includes(created.joinCode), "Report contains the plaintext Game Code");
  requireCondition(
    !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized),
    "Report contains a raw UUID",
  );
  await writeFile(
    "/tmp/full-game-local-e2e-acceptance.json",
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify({
    canonicalCraftingPackActive: true,
    targetGameProvisionedThroughV2: true,
    allContentGatesActive: true,
    exactContentCountsVerified: true,
    committedSuccessReplayVerified: true,
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
