#!/usr/bin/env node

import { readFile, writeFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCountryRuntime,
  buildWorldPublication,
  sha256,
} from "./world-staging-provision-lib.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const PACK_ROOT = path.join(REPO_ROOT, "docs", "seed-content", "executable", "beta-pack-v1");
const DOWNSTREAM_CONTRACT_PATH = path.join(
  REPO_ROOT,
  "docs",
  "operations",
  "contracts",
  "beta-seed-downstream-consumer-contract-v1.json",
);
const DATABASE_URL = process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const STAFF_ID = "10000000-0000-4000-8000-000000000001";
const AUTH_ID = "10000000-0000-4000-8000-000000000002";
const SOURCE_GAME_ID = "10000000-0000-4000-8000-000000000003";
const SOURCE_GAME_NAME = "Provisioning Canonical Source";
const TARGET_GAME_NAME = "Provisioning Acceptance Target";
const FAILED_GAME_NAME = "Provisioning Acceptance Failure";
const SOURCE_COMMIT = /^[0-9a-f]{40}$/i.test(process.env.RELEASE_COMMIT || "")
  ? process.env.RELEASE_COMMIT.toLowerCase()
  : "a".repeat(40);

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonSql(value, tag = "json") {
  const serialized = JSON.stringify(value);
  requireCondition(!serialized.includes(`$${tag}$`), `JSON payload contains reserved ${tag} delimiter`);
  return `$${tag}$${serialized}$${tag}$::jsonb`;
}

async function runSql(sql, { label = "database operation" } = {}) {
  const file = path.join("/tmp", `econovaria-game-provision-${randomUUID()}.sql`);
  await writeFile(file, `${sql.trim()}\n`, "utf8");
  try {
    const result = spawnSync(
      "psql",
      [DATABASE_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", file],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    if (result.status !== 0) {
      const stderr = String(result.stderr || "")
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[uuid-redacted]")
        .slice(0, 3000);
      throw new Error(`${label} failed: ${stderr || `psql exited ${result.status}`}`);
    }
    return String(result.stdout || "").trim();
  } finally {
    await unlink(file).catch(() => {});
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function parseJsonLine(output, label) {
  const lines = String(output).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  requireCondition(lines.length > 0, `${label} returned no JSON`);
  try {
    return JSON.parse(lines.at(-1));
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

async function prepareSourceGame() {
  await runSql(`
    insert into public.staff_users (
      id, supabase_auth_user_id, email, display_name
    ) values (
      ${sqlLiteral(STAFF_ID)}::uuid,
      ${sqlLiteral(AUTH_ID)}::uuid,
      'provisioning-acceptance@example.test',
      'Provisioning Acceptance Admin'
    );

    insert into public.game_sessions (
      id, owner_staff_user_id, name, status, lifecycle_state,
      game_join_code_status, provisioning_status
    ) values (
      ${sqlLiteral(SOURCE_GAME_ID)}::uuid,
      ${sqlLiteral(STAFF_ID)}::uuid,
      ${sqlLiteral(SOURCE_GAME_NAME)},
      'active',
      'active',
      'pending',
      'pending'
    );

    insert into public.game_settings (
      game_session_id, difficulty_preset, stock_market_window
    ) values (
      ${sqlLiteral(SOURCE_GAME_ID)}::uuid,
      'moderate',
      '{"timezone":"Asia/Seoul"}'::jsonb
    );
  `, { label: "source game setup" });
}

async function applyCanonicalSeed() {
  const [pack, market, contracts, store, integrity] = await Promise.all([
    readJson(path.join(PACK_ROOT, "pack-v1.json")),
    readJson(path.join(PACK_ROOT, "market-templates-v1.json")),
    readJson(path.join(PACK_ROOT, "tutorial-contract-chains-v1.json")),
    readJson(path.join(PACK_ROOT, "store-catalog-v1.json")),
    readJson(path.join(PACK_ROOT, "integrity-manifest-v1.json")),
  ]);

  const output = await runSql(`
    select public.apply_seed_content_release_v1(
      ${sqlLiteral(SOURCE_GAME_ID)}::uuid,
      ${sqlLiteral(pack.packId)},
      ${sqlLiteral(pack.version)},
      ${sqlLiteral(integrity.packSha256)},
      'local',
      true,
      'local-game-provisioning-acceptance',
      'Disposable database acceptance',
      ${jsonSql(market.templates, "market")},
      ${jsonSql(contracts.templates, "contracts")},
      ${jsonSql(store.items, "store")},
      null
    )::text;
  `, { label: "canonical seed activation" });
  const outcome = parseJsonLine(output, "canonical seed activation");
  requireCondition(
    ["applied", "replayed", "resumed"].includes(outcome.outcome),
    `Canonical seed activation returned ${outcome.outcome}`,
  );
  requireCondition(outcome.activated === true, "Canonical seed release is not active");
  return { pack, integrity };
}

async function publishCanonicalWorld() {
  const [downstreamContract, locationRegistry, calibration] = await Promise.all([
    readJson(DOWNSTREAM_CONTRACT_PATH),
    readJson(path.join(PACK_ROOT, "location-registry-verified-v1.json")),
    readJson(path.join(PACK_ROOT, "calibration-scenarios-v1.json")),
  ]);
  const publication = buildWorldPublication({
    downstreamContract,
    locations: locationRegistry,
    calibration,
  });

  await runSql(`
    select row_to_json(runtime_result)::text
    from public.initialize_world_runtime_v1(
      ${sqlLiteral(SOURCE_GAME_ID)}::uuid,
      ${sqlLiteral(publication.definition.packId)},
      ${sqlLiteral(publication.definition.packVersion)},
      ${sqlLiteral(publication.definition.definitionDigest)},
      ${jsonSql(publication.locations, "locations")},
      ${jsonSql(publication.routes, "routes")},
      now()
    ) as runtime_result;
  `, { label: "canonical World publication" });

  const countryProfilesOutput = await runSql(`
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'country_code', country_code,
      'country_name', country_name,
      'capital_name', capital_name,
      'currency_code', currency_code,
      'status', status
    ) order by country_code), '[]'::jsonb)::text
    from public.country_profiles
    where status = 'active';
  `, { label: "country profile read" });
  const countryProfiles = parseJsonLine(countryProfilesOutput, "country profile read");
  requireCondition(countryProfiles.length === 10, `Expected ten active country profiles, received ${countryProfiles.length}`);

  const runtime = buildCountryRuntime({
    downstreamContract,
    locationRegistry,
    countryProfiles,
  });
  await runSql(`
    select row_to_json(country_result)::text
    from public.initialize_world_country_runtime_v2(
      ${sqlLiteral(SOURCE_GAME_ID)}::uuid,
      ${jsonSql(runtime.countries, "countries")},
      ${jsonSql(runtime.classGrants, "grants")}
    ) as country_result;
  `, { label: "World country publication" });
}

async function createTargetGame() {
  const output = await runSql(`
    select public.create_provisioned_game_v1(
      ${sqlLiteral(STAFF_ID)}::uuid,
      ${sqlLiteral(TARGET_GAME_NAME)},
      '{"difficulty_preset":"hard","stock_market_window":{"timezone":"Asia/Seoul"}}'::jsonb,
      'game.create.local.acceptance.001',
      'econovaria.beta-seed-pack.v1'
    )::text;
  `, { label: "target game provisioning" });
  const result = parseJsonLine(output, "target game provisioning");
  requireCondition(result.outcome === "created", `Target provisioning returned ${result.outcome}`);
  requireCondition(result.provisioningStatus === "ready", "Target game did not reach ready state");
  requireCondition(typeof result.gameSessionId === "string", "Target game ID is missing");
  requireCondition(typeof result.joinCode === "string" && result.joinCode.length >= 8, "One-time Game Code is missing");
  requireCondition(result.counts?.marketAssets === 240, "Target market asset count is incorrect");
  requireCondition(result.counts?.contracts === 30, "Target Contract count is incorrect");
  requireCondition(result.counts?.storeItems === 50, "Target Store count is incorrect");
  requireCondition(result.counts?.worldLocations === 50, "Target World location count is incorrect");
  requireCondition(result.counts?.worldRoutes === 13, "Target World route count is incorrect");
  return result;
}

async function verifyTargetGame(created) {
  const output = await runSql(`
    with target as (
      select * from public.game_sessions where id = ${sqlLiteral(created.gameSessionId)}::uuid
    )
    select jsonb_build_object(
      'gameRows', (select count(*) from target),
      'status', (select status from target),
      'lifecycleState', (select lifecycle_state from target),
      'provisioningStatus', (select provisioning_status from target),
      'sourceSeparated', (select provisioning_source_game_session_id <> id from target),
      'joinHashMatches', (
        select game_join_code_hash = encode(extensions.digest(${sqlLiteral(created.joinCode)}, 'sha256'), 'hex')
        from target
      ),
      'joinCodeStatus', (select game_join_code_status from target),
      'marketAssets', (select count(*) from public.game_session_stock_assets where game_session_id=(select id from target) and is_active),
      'contracts', (select count(*) from public.game_session_contracts where game_session_id=(select id from target) and status='active' and visibility='public'),
      'storeItems', (select count(*) from public.store_items where game_session_id=(select id from target) and status='active' and visibility='visible'),
      'worldRuntime', (select count(*) from public.world_runtime_instances where game_session_id=(select id from target)),
      'worldLocations', (select count(*) from public.world_location_states where game_session_id=(select id from target)),
      'worldRoutes', (select count(*) from public.world_route_states where game_session_id=(select id from target)),
      'worldCountries', (select count(*) from public.world_country_runtime where game_session_id=(select id from target)),
      'arrivalClassGrants', (select count(*) from public.arrival_class_grant_runtime where game_session_id=(select id from target)),
      'messagingPolicies', (select count(*) from public.message_game_policies where game_session_id=(select id from target)),
      'marketplacePolicies', (select count(*) from public.marketplace_policies where game_session_id=(select id from target)),
      'players', (select count(*) from public.players where game_session_id=(select id from target)),
      'balances', (select count(*) from public.account_balances where game_session_id=(select id from target)),
      'inventory', (select count(*) from public.inventory_holdings where game_session_id=(select id from target)),
      'progressionProfiles', (select count(*) from public.player_progression_profiles where game_session_id=(select id from target)),
      'businesses', (select count(*) from public.business_entities where game_session_id=(select id from target))
    )::text;
  `, { label: "target game verification" });
  const state = parseJsonLine(output, "target game verification");
  const expected = {
    gameRows: 1,
    status: "active",
    lifecycleState: "active",
    provisioningStatus: "ready",
    sourceSeparated: true,
    joinHashMatches: true,
    joinCodeStatus: "active",
    marketAssets: 240,
    contracts: 30,
    storeItems: 50,
    worldRuntime: 1,
    worldLocations: 50,
    worldRoutes: 13,
    worldCountries: 10,
    arrivalClassGrants: 8,
    messagingPolicies: 1,
    marketplacePolicies: 1,
    players: 0,
    balances: 0,
    inventory: 0,
    progressionProfiles: 0,
    businesses: 0,
  };
  for (const [key, value] of Object.entries(expected)) {
    requireCondition(state[key] === value, `${key} expected ${value}, received ${state[key]}`);
  }
  return state;
}

async function verifyReplay(created) {
  const output = await runSql(`
    select public.create_provisioned_game_v1(
      ${sqlLiteral(STAFF_ID)}::uuid,
      ${sqlLiteral(TARGET_GAME_NAME)},
      '{"difficulty_preset":"hard","stock_market_window":{"timezone":"Asia/Seoul"}}'::jsonb,
      'game.create.local.acceptance.001',
      'econovaria.beta-seed-pack.v1'
    )::text;
  `, { label: "provisioning replay" });
  const replay = parseJsonLine(output, "provisioning replay");
  requireCondition(replay.outcome === "replayed", `Replay returned ${replay.outcome}`);
  requireCondition(replay.gameSessionId === created.gameSessionId, "Replay resolved a different game");
  requireCondition(replay.joinCode === null, "Replay exposed the original plaintext Game Code");
  requireCondition(replay.joinCodeReissueRequired === true, "Replay did not require Game Code reissue");

  const count = Number(await runSql(`
    select count(*) from public.game_sessions where name = ${sqlLiteral(TARGET_GAME_NAME)};
  `, { label: "replay game count" }));
  requireCondition(count === 1, `Replay created ${count} games`);
}

async function verifyFailureRollback() {
  const output = await runSql(`
    select public.create_provisioned_game_v1(
      ${sqlLiteral(STAFF_ID)}::uuid,
      ${sqlLiteral(FAILED_GAME_NAME)},
      '{"difficulty_preset":"moderate","stock_market_window":{"timezone":"Asia/Seoul"}}'::jsonb,
      'game.create.local.acceptance.failure',
      'missing.canonical.pack'
    )::text;
  `, { label: "provisioning failure" });
  const failure = parseJsonLine(output, "provisioning failure");
  requireCondition(failure.outcome === "failed", `Failure path returned ${failure.outcome}`);
  requireCondition(failure.transactionRolledBack === true, "Failure did not report transaction rollback");
  requireCondition(failure.joinCode === null, "Failure returned a Game Code");

  const state = parseJsonLine(await runSql(`
    select jsonb_build_object(
      'games', (select count(*) from public.game_sessions where name=${sqlLiteral(FAILED_GAME_NAME)}),
      'requests', (select count(*) from public.game_creation_provisioning_requests where idempotency_key='game.create.local.acceptance.failure' and status='failed')
    )::text;
  `, { label: "failure rollback verification" }), "failure rollback verification");
  requireCondition(state.games === 0, "Failed provisioning left a game row");
  requireCondition(state.requests === 1, "Failed provisioning did not retain sanitized failure evidence");
}

async function main() {
  await prepareSourceGame();
  const { pack, integrity } = await applyCanonicalSeed();
  await publishCanonicalWorld();
  const created = await createTargetGame();
  const state = await verifyTargetGame(created);
  await verifyReplay(created);
  await verifyFailureRollback();

  const report = {
    schemaVersion: "econovaria-game-creation-local-acceptance-v1",
    sourceCommit: SOURCE_COMMIT,
    canonicalPack: {
      id: pack.packId,
      version: pack.version,
      sha256: integrity.packSha256,
    },
    verification: {
      ...state,
      oneTimeGameCodeObserved: true,
      oneTimeGameCodeRecorded: false,
      replayDeniedPlaintextCode: true,
      failureRolledBack: true,
    },
    safety: {
      disposableDatabase: true,
      productionTouched: false,
      playerHistoryFabricated: false,
      credentialsRecorded: false,
      rawInternalIdentifiersRecorded: false,
    },
  };
  const serialized = JSON.stringify(report);
  requireCondition(!serialized.includes(created.joinCode), "Report contains the plaintext Game Code");
  requireCondition(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized), "Report contains a raw UUID");
  await writeFile("/tmp/game-creation-provisioning-local-acceptance.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    canonicalSeedActivated: true,
    canonicalWorldPublished: true,
    targetGameProvisioned: true,
    targetGameReadyAndJoinable: true,
    exactGameScopedCountsVerified: true,
    noPlayerStateFabricated: true,
    idempotentReplayVerified: true,
    failureRollbackVerified: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: String(error?.message || error)
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[uuid-redacted]")
      .slice(0, 3000),
    productionTouched: false,
    credentialsRecorded: false,
  }));
  process.exitCode = 1;
});
