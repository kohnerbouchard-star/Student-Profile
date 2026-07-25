#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const DATABASE_URL = process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const STAFF_ID = "10000000-0000-4000-8000-000000000001";
const TARGET_GAME_NAME = "Runtime Stabilization Onboarding Target";
const IDEMPOTENCY_KEY = "game.create.runtime-stabilization-onboarding.001";
const ACTIVATION_VERSION = "full-game-feature-activation-v2";
const PLAYERS = ["analyst", "builder"];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonSql(value, tag) {
  const serialized = JSON.stringify(value);
  requireCondition(!serialized.includes(`$${tag}$`), `Reserved ${tag} delimiter`);
  return `$${tag}$${serialized}$${tag}$::jsonb`;
}

async function runSql(sql, label) {
  const file = path.join("/tmp", `econovaria-onboarding-${randomUUID()}.sql`);
  await writeFile(file, `${sql.trim()}\n`, "utf8");
  try {
    const result = spawnSync(
      "psql",
      [DATABASE_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", file],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    if (result.status !== 0) {
      const error = String(result.stderr || "")
        .replace(
          /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
          "[uuid-redacted]",
        )
        .slice(0, 4000);
      throw new Error(`${label} failed: ${error || `psql exited ${result.status}`}`);
    }
    return String(result.stdout || "").trim();
  } finally {
    await unlink(file).catch(() => {});
  }
}

function parseJson(output, label) {
  const line = String(output).split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).at(-1);
  requireCondition(line, `${label} returned no JSON`);
  try {
    return JSON.parse(line);
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

async function provisionGame() {
  const result = parseJson(await runSql(`
    select public.create_provisioned_game_v2(
      ${sqlLiteral(STAFF_ID)}::uuid,
      ${sqlLiteral(TARGET_GAME_NAME)},
      '{"difficulty_preset":"hard","stock_market_window":{"timezone":"Asia/Seoul"}}'::jsonb,
      ${sqlLiteral(IDEMPOTENCY_KEY)},
      'econovaria.beta-seed-pack.v1'
    )::text;
  `, "V2 game provisioning"), "V2 game provisioning");

  requireCondition(result.outcome === "created", `V2 returned ${result.outcome}`);
  requireCondition(result.provisioningStatus === "ready", "V2 game is not ready");
  requireCondition(typeof result.joinCode === "string" && result.joinCode.length >= 8, "V2 Game Code is missing");
  return result.joinCode;
}

async function verifyActivation() {
  const state = parseJson(await runSql(`
    select jsonb_build_object(
      'activationVersion', evidence_row.activation_version,
      'storyStatus', evidence_row.story_status,
      'craftingStatus', evidence_row.crafting_status,
      'arrivalGrantStatus', evidence_row.arrival_grant_status,
      'progressionStatus', evidence_row.progression_status,
      'storylines', (
        select count(*) from public.game_session_storylines
        where game_session_id = game_row.id and status = 'active'
      ),
      'arrivalPackages', (
        select count(*) from public.world_country_runtime as country_row
        join public.arrival_package_runtime_definitions as package_row
          on package_row.arrival_package_definition_id = country_row.arrival_package_definition_id
         and package_row.country_id = country_row.country_id
         and package_row.status = 'active'
        where country_row.game_session_id = game_row.id
      ),
      'arrivalClassGrants', (
        select count(*) from public.arrival_class_grant_runtime
        where game_session_id = game_row.id
      )
    )::text
    from public.game_sessions as game_row
    join public.game_feature_activation_evidence as evidence_row
      on evidence_row.game_session_id = game_row.id
    where game_row.name = ${sqlLiteral(TARGET_GAME_NAME)};
  `, "activation verification"), "activation verification");

  requireCondition(state.activationVersion === ACTIVATION_VERSION, "Activation version is incorrect");
  requireCondition(state.storyStatus === "active", "Story is not active");
  requireCondition(["active", "blocked"].includes(state.craftingStatus), "Crafting status is invalid");
  requireCondition(state.arrivalGrantStatus === "active", "Arrival grants are not active");
  requireCondition(state.progressionStatus === "active", "Progression is not active");
  requireCondition(Number(state.storylines) >= 1, "No active Storyline exists");
  requireCondition(Number(state.arrivalPackages) === 10, "Arrival package bindings are incomplete");
  requireCondition(Number(state.arrivalClassGrants) === 8, "Arrival Class bindings are incomplete");
  return state;
}

async function createAndOnboardPlayer(index, classId) {
  const player = parseJson(await runSql(`
    select row_to_json(player_result)::text
    from public.create_player_with_balanced_country_assignment(
      (select id from public.game_sessions where name = ${sqlLiteral(TARGET_GAME_NAME)}),
      ${sqlLiteral(`Runtime Player ${index}`)},
      ${sqlLiteral(`RUNTIME-${String(index).padStart(2, "0")}`)},
      ${jsonSql({ source: "runtime_stabilization_onboarding", index }, `player${index}`)}
    ) as player_result;
  `, `Player ${index} creation`), `Player ${index} creation`);
  requireCondition(typeof player.player_id === "string", `Player ${index} ID is missing`);

  const binding = parseJson(await runSql(`
    select jsonb_build_object(
      'countryId', country_row.country_id,
      'currencyCode', country_row.currency_code,
      'startingLocationId', country_row.arrival_location_id,
      'packageId', country_row.arrival_package_definition_id,
      'grantId', grant_row.grant_definition_id,
      'approvedBalance', package_row.approved_starting_balance
    )::text
    from public.players as player_row
    join public.world_country_runtime as country_row
      on country_row.game_session_id = player_row.game_session_id
     and country_row.country_uuid = player_row.country_id
    join public.arrival_package_runtime_definitions as package_row
      on package_row.arrival_package_definition_id = country_row.arrival_package_definition_id
     and package_row.status = 'active'
    join public.arrival_class_grant_runtime as grant_row
      on grant_row.game_session_id = player_row.game_session_id
     and grant_row.class_id = ${sqlLiteral(classId)}
    where player_row.id = ${sqlLiteral(player.player_id)}::uuid;
  `, `Player ${index} binding`), `Player ${index} binding`);

  const assignedAt = `2026-07-25T${String(10 + index).padStart(2, "0")}:00:00.000Z`;
  const assignment = parseJson(await runSql(`
    select row_to_json(assignment_result)::text
    from public.assign_arrival_class_atomic_v2(
      (select id from public.game_sessions where name = ${sqlLiteral(TARGET_GAME_NAME)}),
      ${sqlLiteral(player.player_id)}::uuid,
      ${sqlLiteral(binding.countryId)},
      ${sqlLiteral(classId)},
      'arrival-class-questionnaire.v1',
      '1.0.0',
      ${jsonSql({ selectedClass: classId, acceptancePlayer: index }, `score${index}`)},
      ${sqlLiteral(`arrival.assignment.runtime.${index}`)},
      ${sqlLiteral(binding.packageId)},
      ${sqlLiteral(binding.grantId)},
      ${sqlLiteral(`arrival.grant.runtime.${index}`)},
      ${sqlLiteral(assignedAt)}::timestamptz
    ) as assignment_result;
  `, `Player ${index} assignment`), `Player ${index} assignment`);
  requireCondition(typeof assignment.grant_command_id === "string", `Player ${index} grant command is missing`);

  const state = parseJson(await runSql(`
    select jsonb_build_object(
      'grantStatus', command_row.status,
      'receiptCount', (select count(*) from public.player_arrival_grant_receipts where grant_command_id = command_row.id),
      'ledgerCount', (
        select count(*) from public.ledger_entries
        where game_session_id = command_row.game_session_id
          and player_id = command_row.player_id
          and source_domain = 'arrival'
          and source_action = 'arrival_package_grant'
      ),
      'cashBalance', (
        select balance from public.account_balances
        where game_session_id = command_row.game_session_id
          and player_id = command_row.player_id
          and account_type = 'cash'
          and currency_code = ${sqlLiteral(binding.currencyCode)}
      ),
      'progressionTitle', (
        select public_title from public.player_progression_profiles
        where game_session_id = command_row.game_session_id and player_id = command_row.player_id
      ),
      'travelLocation', (
        select current_location_id from public.player_travel_states
        where game_session_id = command_row.game_session_id and player_id = command_row.player_id
      ),
      'travelStatus', (
        select status from public.player_travel_states
        where game_session_id = command_row.game_session_id and player_id = command_row.player_id
      ),
      'residencyCountry', (
        select current_country_id from public.player_residency_states
        where game_session_id = command_row.game_session_id and player_id = command_row.player_id
      ),
      'residencyCurrency', (
        select currency_code from public.player_residency_states
        where game_session_id = command_row.game_session_id and player_id = command_row.player_id
      )
    )::text
    from public.arrival_grant_commands as command_row
    where command_row.public_id = ${sqlLiteral(assignment.grant_command_id)};
  `, `Player ${index} state`), `Player ${index} state`);

  requireCondition(state.grantStatus === "completed", `Player ${index} grant did not complete`);
  requireCondition(Number(state.receiptCount) === 1, `Player ${index} receipt count is incorrect`);
  requireCondition(Number(state.ledgerCount) === 1, `Player ${index} ledger count is incorrect`);
  requireCondition(Number(state.cashBalance) === Number(binding.approvedBalance), `Player ${index} starting balance is incorrect`);
  requireCondition(typeof state.progressionTitle === "string" && state.progressionTitle.length > 0, `Player ${index} progression is missing`);
  requireCondition(state.travelLocation === binding.startingLocationId, `Player ${index} location is incorrect`);
  requireCondition(state.travelStatus === "available", `Player ${index} travel is unavailable`);
  requireCondition(state.residencyCountry === binding.countryId, `Player ${index} residency country is incorrect`);
  requireCondition(state.residencyCurrency === binding.currencyCode, `Player ${index} residency currency is incorrect`);

  const replay = parseJson(await runSql(`
    select row_to_json(grant_result)::text
    from public.apply_arrival_grant_command_v1(
      (select id from public.game_sessions where name = ${sqlLiteral(TARGET_GAME_NAME)}),
      ${sqlLiteral(assignment.grant_command_id)},
      ${sqlLiteral(assignedAt)}::timestamptz
    ) as grant_result;
  `, `Player ${index} replay`), `Player ${index} replay`);
  requireCondition(replay.grant_outcome === "replayed", `Player ${index} replay was not idempotent`);

  const ledgerCount = Number(await runSql(`
    select count(*) from public.ledger_entries
    where player_id = ${sqlLiteral(player.player_id)}::uuid
      and source_domain = 'arrival'
      and source_action = 'arrival_package_grant';
  `, `Player ${index} replay ledger count`));
  requireCondition(ledgerCount === 1, `Player ${index} replay duplicated the ledger`);

  return {
    classId,
    countryId: binding.countryId,
    currencyCode: binding.currencyCode,
    startingBalance: Number(binding.approvedBalance),
    exactOnceLedger: true,
  };
}

async function main() {
  const gameCode = await provisionGame();
  const activation = await verifyActivation();
  const players = [];
  for (let index = 0; index < PLAYERS.length; index += 1) {
    players.push(await createAndOnboardPlayer(index + 1, PLAYERS[index]));
  }

  const report = {
    schemaVersion: "econovaria-runtime-stabilization-onboarding-v1",
    activationVersion: activation.activationVersion,
    verification: {
      storyStatus: activation.storyStatus,
      craftingStatus: activation.craftingStatus,
      arrivalGrantStatus: activation.arrivalGrantStatus,
      progressionStatus: activation.progressionStatus,
      players,
    },
    safety: {
      disposableDatabase: true,
      productionTouched: false,
      plaintextGameCodeRecorded: false,
      rawInternalIdentifiersRecorded: false,
    },
  };
  const serialized = JSON.stringify(report);
  requireCondition(!serialized.includes(gameCode), "Report contains the plaintext Game Code");
  requireCondition(
    !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized),
    "Report contains a raw UUID",
  );
  await writeFile(
    "/tmp/game-feature-activation-v2-local-acceptance.json",
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify({
    freshV2GameProvisioned: true,
    playerOnboardingVerified: players.length,
    exactOnceArrivalLedgerVerified: true,
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
    credentialsRecorded: false,
  }));
  process.exitCode = 1;
});
