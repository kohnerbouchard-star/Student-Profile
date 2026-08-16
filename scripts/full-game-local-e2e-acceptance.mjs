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
const CONTROL_GAME_NAME = "Full Game E2E Story Control";
const IDEMPOTENCY_KEY = "game.create.full-e2e.acceptance.001";
const CONTROL_IDEMPOTENCY_KEY = "game.create.full-e2e.acceptance.control.001";
const ARRIVAL_PROBE_IDEMPOTENCY_KEY = "full-game-e2e-first-arrival-v1";
const MEMORABLE_GAME_CODE = /^ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}$/;
const CONTINUATION_EVENT_KEYS = [
  "meridian_competing_models",
  "meridian_competing_models_recommendation_followup",
  "meridian_customs_security_intrusion",
  "meridian_security_center_attack",
  "meridian_emergency_response",
  "meridian_outbreak_of_war",
  "meridian_fortune_during_war",
  "meridian_question_of_belonging",
  "meridian_reckoning",
  "meridian_local_friend_introductions",
  "meridian_local_friend_fracture_reactions",
  "meridian_local_friend_wartime_reactions",
  "meridian_local_friend_belonging_reactions",
];

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

function sqlTextList(values) {
  return values.map((value) => sqlLiteral(value)).join(", ");
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

async function createFullGame(
  gameName = TARGET_GAME_NAME,
  idempotencyKey = IDEMPOTENCY_KEY,
) {
  const result = parseJsonLine(await runSql(`
    select public.create_provisioned_game_v2(
      ${sqlLiteral(STAFF_ID)}::uuid,
      ${sqlLiteral(gameName)},
      '{"difficulty_preset":"hard","stock_market_window":{"timezone":"Asia/Seoul"}}'::jsonb,
      ${sqlLiteral(idempotencyKey)},
      'econovaria.beta-seed-pack.v1'
    )::text;
  `, "V2 full-game provisioning"), "V2 full-game provisioning");

  requireCondition(result.outcome === "created", `V2 provisioning returned ${result.outcome}`);
  requireCondition(result.provisioningStatus === "ready", "V2 game is not ready");
  requireCondition(typeof result.gameSessionId === "string", "V2 game ID is missing");
  requireCondition(
    typeof result.joinCode === "string" && MEMORABLE_GAME_CODE.test(result.joinCode),
    "V2 memorable Game Code is missing or invalid",
  );
  requireCondition(result.joinCodeStatus === "active", "V2 Game Code is not active");
  requireCondition(result.joinCodeReissueRequired === false, "V2 Game Code unexpectedly requires reissue");
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
    storyEvents: 43,
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
      'globalActiveStoryEvents', (
        select count(*)
        from public.game_session_storylines as activation_row
        join public.storyline_events as event_row
          on event_row.storyline_id = activation_row.storyline_id
        where activation_row.game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and activation_row.status = 'active'
          and event_row.is_active
      ),
      'effectiveStoryEvents', (
        select count(*)
        from public.game_session_storylines as activation_row
        join public.storyline_events as event_row
          on event_row.storyline_id = activation_row.storyline_id
        left join public.game_session_story_event_overrides as override_row
          on override_row.game_session_id = activation_row.game_session_id
         and override_row.storyline_event_id = event_row.id
        where activation_row.game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and activation_row.status = 'active'
          and coalesce(override_row.enabled, event_row.is_active)
      ),
      'enabledStoryOverrides', (
        select count(*)
        from public.game_session_story_event_overrides as override_row
        join public.storyline_events as event_row
          on event_row.id = override_row.storyline_event_id
        join public.game_session_storylines as activation_row
          on activation_row.storyline_id = event_row.storyline_id
         and activation_row.game_session_id = override_row.game_session_id
        where override_row.game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and activation_row.status = 'active'
          and override_row.enabled
      ),
      'continuationDefinitions', (
        select count(*)
        from public.game_session_storylines as activation_row
        join public.storyline_events as event_row
          on event_row.storyline_id = activation_row.storyline_id
        where activation_row.game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and activation_row.status = 'active'
          and event_row.event_key in (${sqlTextList(CONTINUATION_EVENT_KEYS)})
      ),
      'continuationOverrides', (
        select count(*)
        from public.game_session_story_event_overrides as override_row
        join public.storyline_events as event_row
          on event_row.id = override_row.storyline_event_id
        where override_row.game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and override_row.enabled
          and event_row.event_key in (${sqlTextList(CONTINUATION_EVENT_KEYS)})
      ),
      'relationshipDefinitions', (
        select count(*)
        from public.game_session_storylines as activation_row
        join public.storyline_events as event_row
          on event_row.storyline_id = activation_row.storyline_id
        where activation_row.game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and activation_row.status = 'active'
          and (
            event_row.event_key like 'relationship_%_sponsor_followup'
            or event_row.event_key like 'meridian_fracture_%_sponsor_reaction'
          )
      ),
      'relationshipOverrides', (
        select count(*)
        from public.game_session_story_event_overrides as override_row
        join public.storyline_events as event_row
          on event_row.id = override_row.storyline_event_id
        where override_row.game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and override_row.enabled
          and (
            event_row.event_key like 'relationship_%_sponsor_followup'
            or event_row.event_key like 'meridian_fracture_%_sponsor_reaction'
          )
      ),
      'arrivalClockMode', (
        select flag_row.value #>> '{}'
        from public.game_session_story_flags as flag_row
        where flag_row.game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and flag_row.flag_key = 'meridian_arrival_clock_mode_v1'
        limit 1
      ),
      'arrivalProbeImpacts', (
        select count(*)
        from public.player_story_impacts as impact
        where impact.game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and impact.idempotency_key = ${sqlLiteral(ARRIVAL_PROBE_IDEMPOTENCY_KEY)}
          and impact.effect_type = 'character_message'
          and impact.payload -> 'payload' ->> 'phase' = 'arrival'
      ),
      'storyClockAnchoredToArrival', (
        select exists (
          select 1
          from public.game_session_storylines as activation_row
          join public.storylines as storyline_row
            on storyline_row.id = activation_row.storyline_id
          join public.player_story_impacts as impact
            on impact.game_session_id = activation_row.game_session_id
           and impact.idempotency_key = ${sqlLiteral(ARRIVAL_PROBE_IDEMPOTENCY_KEY)}
          where activation_row.game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
            and lower(storyline_row.key) = lower('econovaria_demo_act_1')
            and activation_row.story_started_at = impact.created_at
        )
      ),
      'continuationOverridesBoundToArrival', (
        select case
          when count(*) = 0 then false
          else bool_and(override_row.source_player_story_impact_id = impact.id)
        end
        from public.game_session_story_event_overrides as override_row
        join public.storyline_events as event_row
          on event_row.id = override_row.storyline_event_id
        join public.player_story_impacts as impact
          on impact.game_session_id = override_row.game_session_id
         and impact.idempotency_key = ${sqlLiteral(ARRIVAL_PROBE_IDEMPOTENCY_KEY)}
        where override_row.game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and override_row.enabled
          and event_row.event_key in (${sqlTextList(CONTINUATION_EVENT_KEYS)})
      ),
      'storyStartedAt', (
        select activation_row.story_started_at::text
        from public.game_session_storylines as activation_row
        join public.storylines as storyline_row
          on storyline_row.id = activation_row.storyline_id
        where activation_row.game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
          and lower(storyline_row.key) = lower('econovaria_demo_act_1')
        limit 1
      ),
      'persistedGameCode', (
        select game_join_code from public.game_sessions
        where id = ${sqlLiteral(created.gameSessionId)}::uuid
      ),
      'persistedHashMatches', (
        select game_join_code_hash = encode(extensions.digest(game_join_code, 'sha256'), 'hex')
        from public.game_sessions
        where id = ${sqlLiteral(created.gameSessionId)}::uuid
      )
    )::text;
  `, "V2 database verification"), "V2 database verification");
}

async function createFirstArrivalImpact(created) {
  return parseJsonLine(await runSql(`
    with created_player as (
      select *
      from public.create_player_with_balanced_country_assignment(
        ${sqlLiteral(created.gameSessionId)}::uuid,
        'Full Game Story Arrival Probe',
        'E2E-STORY-ARRIVAL',
        '{"source":"full_game_e2e","purpose":"arrival_clock_acceptance"}'::jsonb
      )
    ),
    arrival_effect as (
      select
        event_row.id as storyline_event_id,
        effect_row.value as effect_payload
      from public.game_session_storylines as activation_row
      join public.storyline_events as event_row
        on event_row.storyline_id = activation_row.storyline_id
      cross join created_player as player_row
      cross join lateral jsonb_array_elements(event_row.player_rules) as rule_row(value)
      cross join lateral jsonb_array_elements(
        coalesce(rule_row.value -> 'effects', '[]'::jsonb)
      ) as effect_row(value)
      where activation_row.game_session_id = ${sqlLiteral(created.gameSessionId)}::uuid
        and activation_row.status = 'active'
        and rule_row.value -> 'condition' ->> 'type' = 'player_current_country_is'
        and rule_row.value -> 'condition' ->> 'countryCode' = player_row.country_code
        and effect_row.value ->> 'type' = 'character_message'
        and effect_row.value -> 'payload' ->> 'phase' = 'arrival'
      order by event_row.scheduled_offset_seconds asc nulls last, event_row.sequence asc
      limit 1
    ),
    inserted as (
      insert into public.player_story_impacts (
        game_session_id,
        player_id,
        storyline_event_id,
        effect_type,
        impact_label,
        impact_reason,
        amount,
        payload,
        idempotency_key,
        created_at
      )
      select
        ${sqlLiteral(created.gameSessionId)}::uuid,
        player_row.player_id,
        arrival_effect.storyline_event_id,
        'character_message',
        'Canonical first-arrival acceptance probe',
        'Exercises first-arrival Story clock anchoring through the canonical character-message payload.',
        null,
        arrival_effect.effect_payload,
        ${sqlLiteral(ARRIVAL_PROBE_IDEMPOTENCY_KEY)},
        clock_timestamp()
      from created_player as player_row
      cross join arrival_effect
      returning created_at
    )
    select jsonb_build_object(
      'arrivalInserted', (select count(*) from inserted) = 1,
      'arrivalCreatedAt', (select max(created_at)::text from inserted)
    )::text;
  `, "First-arrival Story activation"), "First-arrival Story activation");
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
  requireCondition(replay.joinCode === created.joinCode, "V2 replay did not return the persisted Game Code");
  requireCondition(replay.joinCodeStatus === "active", "V2 replay Game Code is not active");
  requireCondition(replay.joinCodeReissueRequired === false, "V2 replay unexpectedly requires code rotation");

  const gameCount = Number(await runSql(`
    select count(*) from public.game_sessions
    where name = ${sqlLiteral(TARGET_GAME_NAME)};
  `, "V2 replay game count"));
  requireCondition(gameCount === 1, `V2 replay created ${gameCount} games`);
}

function assertBaselineStoryState(state, label) {
  const expectedState = {
    activationEvidence: 1,
    activeCraftingPacks: 1,
    availableRecipes: 60,
    storylines: 1,
    persistedHashMatches: true,
    enabledStoryOverrides: 0,
    continuationOverrides: 0,
    relationshipOverrides: 0,
    arrivalProbeImpacts: 0,
    storyClockAnchoredToArrival: false,
    continuationOverridesBoundToArrival: false,
  };
  for (const [key, value] of Object.entries(expectedState)) {
    requireCondition(state[key] === value, `${label} ${key} expected ${value}, received ${state[key]}`);
  }
  requireCondition(
    state.globalActiveStoryEvents === 43,
    `${label} globalActiveStoryEvents expected 43, received ${state.globalActiveStoryEvents}`,
  );
  requireCondition(
    state.effectiveStoryEvents === state.globalActiveStoryEvents,
    `${label} pre-arrival effective Story count diverged from the global baseline`,
  );
  requireCondition(
    state.continuationDefinitions === CONTINUATION_EVENT_KEYS.length,
    `${label} continuationDefinitions expected ${CONTINUATION_EVENT_KEYS.length}, received ${state.continuationDefinitions}`,
  );
  requireCondition(
    state.relationshipDefinitions > 0,
    `${label} relationship follow-up definitions are missing`,
  );
  requireCondition(
    state.arrivalClockMode === null,
    `${label} arrival clock mode should be unset before first arrival`,
  );
}

function assertPostArrivalStoryState(before, after, controlBefore, controlAfter) {
  requireCondition(
    after.arrivalClockMode === "arrival_anchored",
    `Target arrivalClockMode expected arrival_anchored, received ${after.arrivalClockMode}`,
  );
  requireCondition(
    after.arrivalProbeImpacts === 1,
    `Target arrival probe impact expected 1, received ${after.arrivalProbeImpacts}`,
  );
  requireCondition(
    after.storyClockAnchoredToArrival === true,
    "Target Story clock was not anchored to the first-arrival impact timestamp",
  );
  requireCondition(
    after.continuationOverrides === before.continuationDefinitions,
    `Target continuation overrides expected ${before.continuationDefinitions}, received ${after.continuationOverrides}`,
  );
  requireCondition(
    after.relationshipOverrides === before.relationshipDefinitions,
    `Target relationship overrides expected ${before.relationshipDefinitions}, received ${after.relationshipOverrides}`,
  );
  requireCondition(
    after.continuationOverridesBoundToArrival === true,
    "Target continuation overrides are not bound to the first-arrival Story impact",
  );
  requireCondition(
    after.globalActiveStoryEvents === before.globalActiveStoryEvents,
    "First arrival mutated shared global Story activation",
  );
  requireCondition(
    after.effectiveStoryEvents ===
      before.globalActiveStoryEvents +
        before.continuationDefinitions +
        before.relationshipDefinitions,
    `Target effective Story count after arrival was ${after.effectiveStoryEvents}; expected game-scoped baseline plus continuation and relationship definitions`,
  );

  for (const key of [
    "globalActiveStoryEvents",
    "effectiveStoryEvents",
    "enabledStoryOverrides",
    "continuationOverrides",
    "relationshipOverrides",
    "arrivalProbeImpacts",
  ]) {
    requireCondition(
      controlAfter[key] === controlBefore[key],
      `Control game ${key} changed after another game's first arrival`,
    );
  }
  requireCondition(
    controlAfter.arrivalClockMode === null,
    "Control game received another game's arrival clock mode",
  );
  requireCondition(
    controlAfter.storyStartedAt === controlBefore.storyStartedAt,
    "Control game Story clock changed after another game's first arrival",
  );
  requireCondition(
    controlAfter.storyClockAnchoredToArrival === false,
    "Control game incorrectly reports an arrival-anchored Story clock",
  );
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
  const control = await createFullGame(CONTROL_GAME_NAME, CONTROL_IDEMPOTENCY_KEY);

  const beforeArrival = await verifyDatabase(created);
  const controlBeforeArrival = await verifyDatabase(control);
  assertBaselineStoryState(beforeArrival, "Target");
  assertBaselineStoryState(controlBeforeArrival, "Control");
  requireCondition(beforeArrival.persistedGameCode === created.joinCode, "Database did not persist the target Game Code");
  requireCondition(controlBeforeArrival.persistedGameCode === control.joinCode, "Database did not persist the control Game Code");

  const arrival = await createFirstArrivalImpact(created);
  requireCondition(arrival.arrivalInserted === true, "Canonical first-arrival Story impact was not inserted");

  const afterArrival = await verifyDatabase(created);
  const controlAfterArrival = await verifyDatabase(control);
  assertPostArrivalStoryState(
    beforeArrival,
    afterArrival,
    controlBeforeArrival,
    controlAfterArrival,
  );

  await verifyReplay(created);

  const report = {
    schemaVersion: "econovaria-full-game-local-e2e-v1",
    verification: {
      canonicalCraftingPackActive: true,
      targetGameProvisionedThroughV2: true,
      allContentGatesActive: true,
      exactContentCountsVerified: true,
      databaseActivationEvidenceVerified: true,
      preArrivalStoryDormancyVerified: true,
      firstArrivalStoryClockAnchored: true,
      gameScopedContinuationOverridesVerified: true,
      crossGameStoryIsolationVerified: true,
      persistentMemorableGameCodeVerified: true,
      committedSuccessReplayVerified: true,
    },
    safety: {
      disposableDatabase: true,
      productionAuthorized: false,
      productionTouched: false,
      plaintextGameCodeRecordedInEvidence: false,
      rawInternalIdentifiersRecorded: false,
    },
  };
  const serialized = JSON.stringify(report);
  requireCondition(!serialized.includes(created.joinCode), "Report contains the plaintext target Game Code");
  requireCondition(!serialized.includes(control.joinCode), "Report contains the plaintext control Game Code");
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
    preArrivalStoryDormancyVerified: true,
    firstArrivalStoryClockAnchored: true,
    gameScopedContinuationOverridesVerified: true,
    crossGameStoryIsolationVerified: true,
    persistentMemorableGameCodeVerified: true,
    committedSuccessReplayVerified: true,
    productionTouched: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: String(error?.message || error)
      .replace(
        /ECO-[A-Z]{3,12}-[A-Z]{3,12}-[0-9]{3}/g,
        "[game-code-redacted]",
      )
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