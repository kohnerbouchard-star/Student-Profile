#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const CANONICAL_STAGING_PROJECT_REF = "eecvbssdvarfcykcfrny";
const GAME_NAME = "Econovaria Golden Five";
const GAME_JOIN_CODE = "ECO-GOLDEN-FIVE-584";
const EXPECTED_PLAYERS = Object.freeze([
  { playerId: "GOLD-ALPHA", arrivalClass: "analyst" },
  { playerId: "GOLD-BRAVO", arrivalClass: "builder" },
  { playerId: "GOLD-CHARLIE", arrivalClass: "trader" },
  { playerId: "GOLD-DELTA", arrivalClass: "maker" },
  { playerId: "GOLD-ECHO", arrivalClass: "navigator" },
]);
const REQUIRED_MIGRATIONS = Object.freeze([
  "add_staff_security_state_v2",
  "persist_memorable_game_join_codes_v1",
  "fix_arrival_grant_checking_account_v1",
  "revoke_player_sessions_on_credential_rotation_v2",
  "add_versioned_player_access_credentials_v2",
]);
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const projectRef = required("SUPABASE_PROJECT_REF");
const expectedProjectRef = String(
  process.env.EXPECTED_STAGING_PROJECT_REF || CANONICAL_STAGING_PROJECT_REF,
).trim();
const productionProjectRef = required("PRODUCTION_PROJECT_REF");
const poolerUrl = required("POOLER_URL");
const dbPassword = required("SUPABASE_DB_PASSWORD");
const evidencePath = String(
  process.env.ECONOVARIA_GOLDEN_EVIDENCE_PATH ||
    "/tmp/econovaria-golden-five/fixture-verification.json",
).trim();

if (expectedProjectRef !== CANONICAL_STAGING_PROJECT_REF) {
  throw new Error("The expected staging binding does not match the repository-owned project reference.");
}
if (projectRef !== expectedProjectRef) {
  throw new Error("Golden Five verification is not bound to the exact staging project.");
}
if (projectRef === productionProjectRef) {
  throw new Error("Production project selection is prohibited.");
}
if (!poolerUrl.includes(projectRef)) {
  throw new Error("POOLER_URL is not visibly bound to the selected staging project.");
}

function safeError(error) {
  return String(error?.message ?? error ?? "Unknown staging verification error")
    .replaceAll(dbPassword, "[database-password-redacted]")
    .replaceAll(poolerUrl, "[pooler-url-redacted]")
    .replace(UUID_PATTERN, "[uuid-redacted]");
}

function runPsql(sql) {
  const result = spawnSync(
    "psql",
    [poolerUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
    {
      encoding: "utf8",
      input: sql,
      env: {
        ...process.env,
        PGPASSWORD: dbPassword,
        PGSSLMODE: "require",
      },
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new Error(`Connected staging verification failed: ${safeError(result.stderr || result.stdout)}`);
  }
  return String(result.stdout || "").trim();
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const requiredMigrationSql = REQUIRED_MIGRATIONS.map(sqlText).join(",");
const raw = runPsql(`
with target_game as (
  select *
  from public.game_sessions
  where name = ${sqlText(GAME_NAME)}
), player_rows as (
  select
    player_row.player_identifier as player_id,
    country_row.country_id as country,
    assignment_row.class_id as arrival_class,
    balance_row.account_type,
    balance_row.balance,
    balance_row.currency_code,
    credential_row.credential_version,
    grant_row.status as grant_status
  from target_game as game_row
  join public.players as player_row
    on player_row.game_session_id = game_row.id
   and player_row.status = 'active'
  join public.world_country_runtime as country_row
    on country_row.game_session_id = game_row.id
   and country_row.country_uuid = player_row.country_id
  join public.arrival_class_assignments as assignment_row
    on assignment_row.game_session_id = game_row.id
   and assignment_row.player_id = player_row.id
  join public.account_balances as balance_row
    on balance_row.game_session_id = game_row.id
   and balance_row.player_id = player_row.id
   and balance_row.account_type = 'checking'
  join public.player_access_credentials as credential_row
    on credential_row.game_session_id = game_row.id
   and credential_row.player_id = player_row.id
   and credential_row.status = 'active'
  join public.arrival_grant_commands as grant_row
    on grant_row.game_session_id = game_row.id
   and grant_row.player_id = player_row.id
), migration_state as (
  select
    count(distinct name)::integer as applied_count,
    coalesce(jsonb_agg(distinct name order by name), '[]'::jsonb) as applied
  from supabase_migrations.schema_migrations
  where name in (${requiredMigrationSql})
)
select jsonb_build_object(
  'schemaVersion', 1,
  'evidenceType', 'econovaria-golden-five-fixture-verification',
  'capturedAt', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'environment', jsonb_build_object(
    'projectRef', ${sqlText(projectRef)},
    'productionSelected', false,
    'dataPolicy', 'staging-synthetic-fixture'
  ),
  'game', jsonb_build_object(
    'name', coalesce((select name from target_game), ''),
    'unique', (select count(*) from target_game) = 1,
    'status', coalesce((select status from target_game), ''),
    'lifecycleState', coalesce((select lifecycle_state from target_game), ''),
    'provisioningStatus', coalesce((select provisioning_status from target_game), ''),
    'joinCodeMatches', coalesce((select game_join_code = ${sqlText(GAME_JOIN_CODE)} from target_game), false)
  ),
  'migrations', jsonb_build_object(
    'requiredCount', ${REQUIRED_MIGRATIONS.length},
    'appliedCount', (select applied_count from migration_state),
    'applied', (select applied from migration_state)
  ),
  'content', jsonb_build_object(
    'marketAssets', coalesce((select count(*) from public.game_session_stock_assets where game_session_id = (select id from target_game) and is_active), 0),
    'contracts', coalesce((select count(*) from public.game_session_contracts where game_session_id = (select id from target_game) and status = 'active' and visibility = 'public'), 0),
    'storeItems', coalesce((select count(*) from public.store_items where game_session_id = (select id from target_game) and status = 'active' and visibility = 'visible'), 0),
    'craftingItems', coalesce((select count(*) from public.game_session_item_supply where game_session_id = (select id from target_game)), 0),
    'craftingRecipes', coalesce((select count(*) from public.game_session_recipe_availability where game_session_id = (select id from target_game)), 0),
    'worldCountries', coalesce((select count(*) from public.world_country_runtime where game_session_id = (select id from target_game)), 0),
    'worldLocations', coalesce((select count(*) from public.world_location_states where game_session_id = (select id from target_game)), 0),
    'worldRoutes', coalesce((select count(*) from public.world_route_states where game_session_id = (select id from target_game)), 0),
    'arrivalClassGrants', coalesce((select count(*) from public.arrival_class_grant_runtime where game_session_id = (select id from target_game)), 0),
    'storylines', coalesce((select count(*) from public.game_session_storylines where game_session_id = (select id from target_game)), 0),
    'storyEvents', coalesce((select count(*) from public.game_session_story_flags where game_session_id = (select id from target_game)), 0)
  ),
  'players', coalesce((
    select jsonb_agg(jsonb_build_object(
      'playerId', player_id,
      'country', country,
      'arrivalClass', arrival_class,
      'accountType', account_type,
      'balance', balance,
      'currencyCode', currency_code,
      'credentialVersion', credential_version,
      'grantStatus', grant_status
    ) order by player_id)
    from player_rows
  ), '[]'::jsonb)
)::text;
`);

const evidence = JSON.parse(raw);
const failures = [];

if (evidence.game?.unique !== true) failures.push("The golden game did not resolve uniquely.");
if (evidence.game?.status !== "active") failures.push("The golden game is not active.");
if (evidence.game?.lifecycleState !== "active") failures.push("The golden game lifecycle is not active.");
if (evidence.game?.provisioningStatus !== "ready") failures.push("The golden game is not provisioned.");
if (evidence.game?.joinCodeMatches !== true) failures.push("The golden game code does not match the fixture contract.");
if (evidence.migrations?.appliedCount !== REQUIRED_MIGRATIONS.length) failures.push("Required staging migrations are missing.");

const expectedContent = {
  marketAssets: 240,
  contracts: 30,
  storeItems: 50,
  craftingItems: 144,
  craftingRecipes: 60,
  worldCountries: 10,
  worldLocations: 50,
  worldRoutes: 13,
  arrivalClassGrants: 8,
  storylines: 1,
  storyEvents: 3,
};
for (const [name, expected] of Object.entries(expectedContent)) {
  if (Number(evidence.content?.[name]) !== expected) {
    failures.push(`${name} expected ${expected}, received ${evidence.content?.[name] ?? "missing"}.`);
  }
}

const players = Array.isArray(evidence.players) ? evidence.players : [];
if (players.length !== EXPECTED_PLAYERS.length) failures.push("The golden fixture does not contain exactly five complete players.");
const countries = new Set();
for (const expected of EXPECTED_PLAYERS) {
  const player = players.find((candidate) => candidate?.playerId === expected.playerId);
  if (!player) {
    failures.push(`${expected.playerId} is missing.`);
    continue;
  }
  if (player.arrivalClass !== expected.arrivalClass) failures.push(`${expected.playerId} has the wrong Arrival class.`);
  if (player.accountType !== "checking" || Number(player.balance) <= 0) failures.push(`${expected.playerId} does not have a funded checking account.`);
  if (player.grantStatus !== "completed") failures.push(`${expected.playerId} does not have a completed Arrival grant.`);
  if (!/^[A-Z]{3}$/.test(String(player.currencyCode || ""))) failures.push(`${expected.playerId} has an invalid currency.`);
  if (!/^[a-z0-9_-]+$/.test(String(player.country || ""))) failures.push(`${expected.playerId} has an invalid country binding.`);
  if (!["sha256-v1", "pbkdf2-sha256-v2"].includes(player.credentialVersion)) failures.push(`${expected.playerId} has an invalid credential version.`);
  countries.add(player.country);
}
if (countries.size !== EXPECTED_PLAYERS.length) failures.push("The five golden players are not distributed across five countries.");

const serialized = JSON.stringify(evidence);
if (UUID_PATTERN.test(serialized)) failures.push("Sanitized fixture evidence contains a raw UUID.");
if (/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/.test(serialized)) failures.push("Sanitized fixture evidence contains a Supabase key.");

const finalEvidence = {
  ...evidence,
  checks: {
    exactStagingBinding: true,
    productionDenied: true,
    migrationContractComplete: evidence.migrations?.appliedCount === REQUIRED_MIGRATIONS.length,
    fixtureComplete: failures.length === 0,
    sanitized: !UUID_PATTERN.test(serialized),
  },
  decision: failures.length === 0 ? "PASS" : "FAIL",
  failures,
};

await mkdir(dirname(evidencePath), { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(finalEvidence, null, 2)}\n`, "utf8");

if (failures.length > 0) {
  throw new Error(`Golden Five verification failed: ${failures.join(" ")}`);
}

console.log(JSON.stringify({
  ok: true,
  game: GAME_NAME,
  players: players.length,
  countries: countries.size,
  decision: finalEvidence.decision,
  evidencePath,
}));
