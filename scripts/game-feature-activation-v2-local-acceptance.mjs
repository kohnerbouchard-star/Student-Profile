#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const DATABASE_URL = process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const STAFF_ID = "10000000-0000-4000-8000-000000000001";
const TARGET_GAME_NAME = "Provisioning Acceptance Target";
const PACK_ID = "econovaria.beta-seed-pack.v1";
const ACTIVATION_VERSION = "full-game-feature-activation-v2";
const PLAYER_CLASSES = ["analyst", "builder"];

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

async function runSql(sql, { label = "database operation" } = {}) {
  const file = path.join(
    "/tmp",
    `econovaria-feature-activation-${randomUUID()}.sql`,
  );
  await writeFile(file, `${sql.trim()}\n`, "utf8");
  try {
    const result = spawnSync(
      "psql",
      [DATABASE_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", file],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    if (result.status !== 0) {
      const stderr = String(result.stderr || "")
        .replace(
          /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
          "[uuid-redacted]",
        )
        .slice(0, 3000);
      throw new Error(
        `${label} failed: ${stderr || `psql exited ${result.status}`}`,
      );
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

async function activateTargetGame() {
  const output = await runSql(`
    select public.create_provisioned_game_v2(
      ${sqlLiteral(STAFF_ID)}::uuid,
      ${sqlLiteral(TARGET_GAME_NAME)},
      '{"difficulty_preset":"hard","stock_market_window":{"timezone":"Asia/Seoul"}}'::jsonb,
      'game.create.local.acceptance.001',
      ${sqlLiteral(PACK_ID)}
    )::text;
  `, { label: "full feature activation V2" });
  const result = parseJsonLine(output, "full feature activation V2");

  requireCondition(result.outcome === "replayed", `V2 returned ${result.outcome}`);
  requireCondition(result.activationVersion === ACTIVATION_VERSION, "V2 activation version is missing");
  requireCondition(result.contentGates?.story === "active", "Story was not activated");
  requireCondition(
    result.contentGates?.arrivalGrantProcessor === "active",
    "Arrival grant processor was not activated",
  );
  requireCondition(
    result.contentGates?.progressionInitialization === "active",
    "Progression initialization was not activated",
  );
  requireCondition(
    ["active", "blocked"].includes(result.contentGates?.crafting),
    "Crafting returned an invalid authority state",
  );
  requireCondition(result.counts?.storylines >= 1, "No active Storyline was provisioned");
  requireCondition(result.counts?.storyEvents >= 1, "No active Story event was provisioned");
  requireCondition(result.counts?.arrivalPackages === 10, "Arrival package count is incorrect");
  requireCondition(result.counts?.arrivalClassGrants === 8, "Arrival Class grant count is incorrect");
  requireCondition(result.joinCode === null, "V2 replay exposed the original Game Code");
  return result;
}

async function verifyGameActivation() {
  const output = await runSql(`
    select jsonb_build_object(
      'featureEvidence', (
        select count(*) from public.game_feature_activation_evidence
        where game_session_id = game_row.id
          and activation_version = ${sqlLiteral(ACTIVATION_VERSION)}
          and story_status = 'active'
          and arrival_grant_status = 'active'
          and progression_status = 'active'
      ),
      'storylines', (
        select count(*)
        from public.game_session_storylines as activation_row
        join public.storylines as storyline_row
          on storyline_row.id = activation_row.storyline_id
        where activation_row.game_session_id = game_row.id
          and activation_row.status = 'active'
          and storyline_row.is_active
      ),
      'storyEvents', (
        select count(*)
        from public.game_session_storylines as activation_row
        join public.storyline_events as event_row
          on event_row.storyline_id = activation_row.storyline_id
        where activation_row.game_session_id = game_row.id
          and activation_row.status = 'active'
          and event_row.is_active
      ),
      'arrivalPackages', (
        select count(*)
        from public.world_country_runtime as country_row
        join public.arrival_package_runtime_definitions as package_row
          on package_row.arrival_package_definition_id = country_row.arrival_package_definition_id
         and package_row.country_id = country_row.country_id
         and package_row.currency_code = country_row.currency_code
         and package_row.starting_location_id = country_row.arrival_location_id
         and package_row.status = 'active'
        where country_row.game_session_id = game_row.id
      ),
      'arrivalClassGrants', (
        select count(*)
        from public.arrival_class_grant_runtime as runtime_row
        join public.arrival_class_grant_definitions as grant_row
          on grant_row.grant_definition_id = runtime_row.grant_definition_id
         and grant_row.class_id = runtime_row.class_id
         and grant_row.status = 'active'
        where runtime_row.game_session_id = game_row.id
      )
    )::text
    from public.game_sessions as game_row
    where game_row.name = ${sqlLiteral(TARGET_GAME_NAME)};
  `, { label: "game feature activation verification" });
  const state = parseJsonLine(output, "game feature activation verification");

  requireCondition(state.featureEvidence === 1, "Feature activation evidence is missing");
  requireCondition(state.storylines >= 1, "Storyline activation is missing");
  requireCondition(state.storyEvents >= 1, "Story event activation is missing");
  requireCondition(state.arrivalPackages === 10, "Arrival package binding is incomplete");
  requireCondition(state.arrivalClassGrants === 8, "Arrival Class binding is incomplete");
  return state;
}

async function createPlayer(index, classId) {
  const output = await runSql(`
    select row_to_json(player_result)::text
    from public.create_player_with_balanced_country_assignment(
      (select id from public.game_sessions where name = ${sqlLiteral(TARGET_GAME_NAME)}),
      ${sqlLiteral(`Activation Player ${index}`)},
      ${sqlLiteral(`ACT-${String(index).padStart(2, "0")}`)},
      ${jsonSql({ source: "full_feature_activation_v2_acceptance", playerIndex: index }, `player${index}`)}
    ) as player_result;
  `, { label: `Player ${index} creation` });
  const player = parseJsonLine(output, `Player ${index} creation`);
  requireCondition(typeof player.player_id === "string", `Player ${index} ID is missing`);

  const bindingOutput = await runSql(`
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
  `, { label: `Player ${index} Arrival binding` });
  const binding = parseJsonLine(bindingOutput, `Player ${index} Arrival binding`);

  const assignedAt = `2026-07-24T${String(12 + index).padStart(2, "0")}:00:00.000Z`;
  const assignmentKey = `arrival.assignment.acceptance.${String(index).padStart(3, "0")}`;
  const grantKey = `arrival.grant.acceptance.${String(index).padStart(3, "0")}`;
  const assignmentOutput = await runSql(`
    select row_to_json(assignment_result)::text
    from public.assign_arrival_class_atomic_v2(
      (select id from public.game_sessions where name = ${sqlLiteral(TARGET_GAME_NAME)}),
      ${sqlLiteral(player.player_id)}::uuid,
      ${sqlLiteral(binding.countryId)},
      ${sqlLiteral(classId)},
      'arrival-class-questionnaire.v1',
      '1.0.0',
      ${jsonSql({ selectedClass: classId, acceptancePlayer: index }, `score${index}`)},
      ${sqlLiteral(assignmentKey)},
      ${sqlLiteral(binding.packageId)},
      ${sqlLiteral(binding.grantId)},
      ${sqlLiteral(grantKey)},
      ${sqlLiteral(assignedAt)}::timestamptz
    ) as assignment_result;
  `, { label: `Player ${index} Arrival assignment` });
  const assignment = parseJsonLine(assignmentOutput, `Player ${index} Arrival assignment`);
  requireCondition(typeof assignment.grant_command_id === "string", `Player ${index} grant command is missing`);

  const stateOutput = await runSql(`
    select jsonb_build_object(
      'grantStatus', command_row.status,
      'grantCompleted', command_row.completed_at is not null,
      'receiptCount', (
        select count(*) from public.player_arrival_grant_receipts
        where grant_command_id = command_row.id
      ),
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
      'progressionProfiles', (
        select count(*) from public.player_progression_profiles
        where game_session_id = command_row.game_session_id
          and player_id = command_row.player_id
      ),
      'progressionTitle', (
        select public_title from public.player_progression_profiles
        where game_session_id = command_row.game_session_id
          and player_id = command_row.player_id
      ),
      'travelLocation', (
        select current_location_id from public.player_travel_states
        where game_session_id = command_row.game_session_id
          and player_id = command_row.player_id
      ),
      'travelStatus', (
        select status from public.player_travel_states
        where game_session_id = command_row.game_session_id
          and player_id = command_row.player_id
      ),
      'residencyCountry', (
        select current_country_id from public.player_residency_states
        where game_session_id = command_row.game_session_id
          and player_id = command_row.player_id
      ),
      'residencyCurrency', (
        select currency_code from public.player_residency_states
        where game_session_id = command_row.game_session_id
          and player_id = command_row.player_id
      )
    )::text
    from public.arrival_grant_commands as command_row
    where command_row.public_id = ${sqlLiteral(assignment.grant_command_id)};
  `, { label: `Player ${index} Arrival state verification` });
  const state = parseJsonLine(stateOutput, `Player ${index} Arrival state verification`);

  requireCondition(state.grantStatus === "completed", `Player ${index} Arrival grant did not complete`);
  requireCondition(state.grantCompleted === true, `Player ${index} Arrival completion time is missing`);
  requireCondition(state.receiptCount === 1, `Player ${index} Arrival receipt count is incorrect`);
  requireCondition(state.ledgerCount === 1, `Player ${index} Arrival ledger count is incorrect`);
  requireCondition(Number(state.cashBalance) === Number(binding.approvedBalance), `Player ${index} starting balance is incorrect`);
  requireCondition(state.progressionProfiles === 1, `Player ${index} Progression profile is missing`);
  requireCondition(typeof state.progressionTitle === "string" && state.progressionTitle.length > 0, `Player ${index} Progression title is missing`);
  requireCondition(state.travelLocation === binding.startingLocationId, `Player ${index} starting location is incorrect`);
  requireCondition(state.travelStatus === "available", `Player ${index} travel state is unavailable`);
  requireCondition(state.residencyCountry === binding.countryId, `Player ${index} residency country is incorrect`);
  requireCondition(state.residencyCurrency === binding.currencyCode, `Player ${index} residency currency is incorrect`);

  const replayOutput = await runSql(`
    select row_to_json(grant_result)::text
    from public.apply_arrival_grant_command_v1(
      (select id from public.game_sessions where name = ${sqlLiteral(TARGET_GAME_NAME)}),
      ${sqlLiteral(assignment.grant_command_id)},
      ${sqlLiteral(assignedAt)}::timestamptz
    ) as grant_result;
  `, { label: `Player ${index} Arrival replay` });
  const replay = parseJsonLine(replayOutput, `Player ${index} Arrival replay`);
  requireCondition(replay.grant_outcome === "replayed", `Player ${index} Arrival replay was not idempotent`);

  const ledgerCount = Number(await runSql(`
    select count(*)
    from public.ledger_entries
    where player_id = ${sqlLiteral(player.player_id)}::uuid
      and source_domain = 'arrival'
      and source_action = 'arrival_package_grant';
  `, { label: `Player ${index} replay ledger verification` }));
  requireCondition(ledgerCount === 1, `Player ${index} replay duplicated the ledger entry`);

  return {
    classId,
    countryId: binding.countryId,
    currencyCode: binding.currencyCode,
    startingBalance: Number(binding.approvedBalance),
    grantCompleted: true,
    replayDeniedDuplicateLedger: true,
  };
}

async function main() {
  const activation = await activateTargetGame();
  const game = await verifyGameActivation();
  const players = [];
  for (let index = 0; index < PLAYER_CLASSES.length; index += 1) {
    players.push(await createPlayer(index + 1, PLAYER_CLASSES[index]));
  }

  const report = {
    schemaVersion: "econovaria-full-game-feature-activation-v2-acceptance",
    activationVersion: ACTIVATION_VERSION,
    verification: {
      ...game,
      storyActive: activation.contentGates.story === "active",
      arrivalGrantProcessorActive: activation.contentGates.arrivalGrantProcessor === "active",
      progressionInitializationActive: activation.contentGates.progressionInitialization === "active",
      craftingAuthorityState: activation.contentGates.crafting,
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
  requireCondition(
    !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(serialized),
    "Activation report contains a raw UUID",
  );
  await writeFile(
    "/tmp/game-feature-activation-v2-local-acceptance.json",
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify({
    storyActivated: true,
    arrivalGrantProcessorActivated: true,
    progressionInitializationActivated: true,
    playerOnboardingVerified: players.length,
    exactOnceArrivalLedgerVerified: true,
    craftingAuthorityState: activation.contentGates.crafting,
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
      .slice(0, 3000),
    productionTouched: false,
    credentialsRecorded: false,
  }));
  process.exitCode = 1;
});
