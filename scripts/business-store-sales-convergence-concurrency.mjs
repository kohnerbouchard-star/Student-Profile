#!/usr/bin/env node

import assert from "node:assert/strict";

// The retained D acceptance creates two isolated games and post-cutover Store
// receipts on a freshly rebuilt disposable database.
import "./business-player-store-fx-final-database.mjs";
import {
  FIXTURE,
  openPsqlSession,
  pollForDatabaseWait,
  runJson,
  runSql,
  sqlLiteral,
} from "./business-phase10-atomic-settlement-database-support.mjs";

const game = FIXTURE.games.one;
const otherGame = FIXTURE.games.two;
const policyRaceGame = Object.freeze({
  id: "20000000-0000-4000-8000-000000000011",
  createdAt: "2026-01-01T00:00:00.000Z",
  firstOpenedAt: "2026-01-01T02:00:00.000Z",
  secondOpenedAt: "2026-01-01T01:00:00.000Z",
});
const closureBoundaryBusiness = Object.freeze({
  id: otherGame.id,
  ownerId: otherGame.ownerId,
  businessId: "51000000-0000-4000-8000-000000000099",
  businessKey: "biz_99999999999999999999999999999999",
});
const sessions = new Set();

function serviceJson(expressionSql) {
  return runJson(`
    begin;
    set local role service_role;
    select (${expressionSql})::text;
    commit;
  `);
}

function playerCheckingKey(targetGame = game) {
  const key = runSql(`
    select account_row.public_key
    from public.economic_parties as party_row
    join public.bank_accounts as account_row
      on account_row.game_session_id = party_row.game_session_id
     and account_row.party_id = party_row.id
    where party_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
      and party_row.party_kind = 'player'
      and party_row.player_id = ${sqlLiteral(targetGame.buyerOneId)}::uuid
      and account_row.account_kind = 'checking'
      and account_row.currency_code = 'ECO'
      and account_row.status = 'active';
  `).output;
  assert.match(key, /^bac_[0-9a-f]{32}$/u);
  return key;
}

function quoteCall(
  sourceAccountKey,
  targetGame = game,
  idempotencyKey = "phase11-concurrency-purchase-quote",
) {
  const version = Number(runSql(`
    select version
    from public.store_seller_offers
    where game_session_id = ${sqlLiteral(targetGame.id)}::uuid
      and public_key = ${sqlLiteral(targetGame.offerKey)};
  `).output);
  return `public.create_business_store_offer_funding_quote_v1(
    ${sqlLiteral(targetGame.id)}::uuid,
    ${sqlLiteral(targetGame.buyerOneId)}::uuid,
    ${sqlLiteral(targetGame.offerKey)},
    1,
    ${version},
    ${sqlLiteral(JSON.stringify([
      { sourceAccountKey, targetAmount: null },
    ]))}::jsonb,
    ${sqlLiteral(idempotencyKey)}
  )`;
}

function settlementCall(
  quoteKey,
  targetGame = game,
  idempotencyKey = "phase11-concurrency-purchase-settle",
) {
  return `public.settle_business_store_offer_funding_v2(
    ${sqlLiteral(targetGame.id)}::uuid,
    ${sqlLiteral(targetGame.buyerOneId)}::uuid,
    ${sqlLiteral(quoteKey)},
    ${sqlLiteral(idempotencyKey)}
  )`;
}

function claimRowsSql(marker, doneMarker) {
  return `begin;
set local role service_role;
select ${sqlLiteral(`${marker}:`)} || coalesce(
  (
    select jsonb_agg(to_jsonb(claim_row) order by claim_row.business_key)::text
    from public.claim_due_business_operating_periods_v1(10) as claim_row
  ),
  '[]'
);
commit;
select ${sqlLiteral(doneMarker)};`;
}

function heldClaimSql(marker, holdMarker) {
  return `begin;
set local role service_role;
select ${sqlLiteral(`${marker}:`)} || coalesce(
  (
    select jsonb_agg(to_jsonb(claim_row) order by claim_row.business_key)::text
    from public.claim_due_business_operating_periods_v1(10) as claim_row
  ),
  '[]'
);
select ${sqlLiteral(holdMarker)};`;
}

function heldCloseSql(claim, resultMarker, holdMarker) {
  return `begin;
set local role service_role;
select ${sqlLiteral(`${resultMarker}:`)} || row_to_json(close_row)::text
from public.close_claimed_business_operating_period_v1(
  ${sqlLiteral(claim.claim_key)},
  ${sqlLiteral(claim.lease_token)}::uuid,
  'phase11-concurrency-close'
) as close_row;
select ${sqlLiteral(holdMarker)};`;
}

function committedSettlementSql(quoteKey, resultMarker, doneMarker) {
  return `begin;
set local role service_role;
select ${sqlLiteral(`${resultMarker}:`)} || (
  ${settlementCall(quoteKey)}
)::text;
commit;
select ${sqlLiteral(doneMarker)};`;
}

function heldSettlementSql(
  quoteKey,
  targetGame,
  idempotencyKey,
  resultMarker,
  holdMarker,
) {
  return `begin;
set local role service_role;
select ${sqlLiteral(`${resultMarker}:`)} || (
  ${settlementCall(quoteKey, targetGame, idempotencyKey)}
)::text;
select ${sqlLiteral(holdMarker)};`;
}

function heldPolicyEnsureSql(openedAt, resultMarker, holdMarker) {
  return `begin;
select ${sqlLiteral(`${resultMarker}:`)} || row_to_json(policy_row)::text
from private.ensure_business_operating_period_policy_v1(
  ${sqlLiteral(policyRaceGame.id)}::uuid,
  ${sqlLiteral(openedAt)}::timestamptz
) as policy_row;
select ${sqlLiteral(holdMarker)};`;
}

function committedPolicyEnsureSql(openedAt, resultMarker, doneMarker) {
  return `begin;
select ${sqlLiteral(`${resultMarker}:`)} || row_to_json(policy_row)::text
from private.ensure_business_operating_period_policy_v1(
  ${sqlLiteral(policyRaceGame.id)}::uuid,
  ${sqlLiteral(openedAt)}::timestamptz
) as policy_row;
commit;
select ${sqlLiteral(doneMarker)};`;
}

function formationCall(
  targetGame,
  playerId,
  legalName,
  idempotencyKey,
) {
  return `public.create_or_acquire_player_business_v1(
    ${sqlLiteral(targetGame.id)}::uuid,
    ${sqlLiteral(playerId)}::uuid,
    ${sqlLiteral(legalName)},
    'sole_proprietorship',
    'manufacturing',
    'TST',
    'ECO',
    0,
    null,
    ${sqlLiteral(idempotencyKey)}
  )`;
}

function heldFormationSql(
  targetGame,
  playerId,
  legalName,
  idempotencyKey,
  resultMarker,
  holdMarker,
) {
  return `begin;
set local role service_role;
select ${sqlLiteral(`${resultMarker}:`)} || row_to_json(formation_row)::text
from ${formationCall(
    targetGame,
    playerId,
    legalName,
    idempotencyKey,
  )} as formation_row;
select ${sqlLiteral(holdMarker)};`;
}

function committedFormationSql(
  targetGame,
  playerId,
  legalName,
  idempotencyKey,
  resultMarker,
  doneMarker,
) {
  return `begin;
set local role service_role;
select ${sqlLiteral(`${resultMarker}:`)} || row_to_json(formation_row)::text
from ${formationCall(
    targetGame,
    playerId,
    legalName,
    idempotencyKey,
  )} as formation_row;
commit;
select ${sqlLiteral(doneMarker)};`;
}

function guardedFormationSql(
  targetGame,
  playerId,
  legalName,
  idempotencyKey,
  resultMarker,
  doneMarker,
) {
  return `begin;
set local role service_role;
do $phase11_formation$
declare
  v_error text;
begin
  begin
    perform *
    from ${formationCall(
    targetGame,
    playerId,
    legalName,
    idempotencyKey,
  )} as formation_row;
  exception when others then
    v_error := sqlerrm;
  end;

  if v_error is distinct from 'BUSINESS_ALREADY_OWNED' then
    raise exception 'PHASE11_FORMATION_GUARD_UNEXPECTED: %',
      coalesce(v_error, 'formation unexpectedly succeeded');
  end if;
  perform pg_catalog.set_config('app.phase11_formation_error', v_error, true);
end;
$phase11_formation$;
select ${sqlLiteral(`${resultMarker}:`)}
  || current_setting('app.phase11_formation_error');
commit;
select ${sqlLiteral(doneMarker)};`;
}

function guardedClosureSql(
  targetGame,
  resultMarker,
  doneMarker,
  expectedError = "BUSINESS_OPERATING_PERIOD_CLOSE_PENDING",
  idempotencyKey = "phase11-concurrency-close-business",
) {
  return `begin;
set local role service_role;
set local lock_timeout = '30s';
set local statement_timeout = '45s';
do $phase11_closure$
declare
  v_error text;
begin
  begin
    perform *
    from public.transition_business_status_v1(
      ${sqlLiteral(targetGame.id)}::uuid,
      ${sqlLiteral(targetGame.ownerId)}::uuid,
      ${sqlLiteral(targetGame.businessKey)},
      'close',
      'Phase 11 concurrency closure guard',
      ${sqlLiteral(idempotencyKey)}
    );
  exception when others then
    v_error := sqlerrm;
  end;

  if v_error is distinct from ${sqlLiteral(expectedError)} then
    raise exception 'PHASE11_CLOSURE_GUARD_UNEXPECTED: %',
      coalesce(v_error, 'closure unexpectedly succeeded');
  end if;
  perform pg_catalog.set_config('app.phase11_closure_error', v_error, true);
end;
$phase11_closure$;
select ${sqlLiteral(`${resultMarker}:`)}
  || current_setting('app.phase11_closure_error');
commit;
select ${sqlLiteral(doneMarker)};`;
}

function heldBusinessLockSql(targetBusiness, holdMarker) {
  return `begin;
set local role service_role;
select business_row.id
from public.business_entities as business_row
where business_row.game_session_id = ${sqlLiteral(targetBusiness.id)}::uuid
  and business_row.id = ${sqlLiteral(targetBusiness.businessId)}::uuid
for update;
select ${sqlLiteral(holdMarker)};`;
}

function heldGameDeactivationSql(targetGame, holdMarker) {
  return `begin;
set local lock_timeout = '30s';
set local statement_timeout = '45s';
update public.game_sessions
set lifecycle_state = 'paused',
    status = 'disabled'
where id = ${sqlLiteral(targetGame.id)}::uuid;
select ${sqlLiteral(holdMarker)};`;
}

function guardedPeriodCloseSql(
  claim,
  resultMarker,
  doneMarker,
  expectedError,
) {
  return `begin;
set local role service_role;
set local lock_timeout = '30s';
set local statement_timeout = '45s';
do $phase11_period_close$
declare
  v_error text;
begin
  begin
    perform *
    from public.close_claimed_business_operating_period_v1(
      ${sqlLiteral(claim.claim_key)},
      ${sqlLiteral(claim.lease_token)}::uuid,
      'phase11-concurrency-inactive-game-close'
    );
  exception when others then
    v_error := sqlerrm;
  end;

  if v_error is distinct from ${sqlLiteral(expectedError)} then
    raise exception 'PHASE11_PERIOD_CLOSE_UNEXPECTED: %',
      coalesce(v_error, 'close unexpectedly succeeded');
  end if;
  perform pg_catalog.set_config('app.phase11_period_close_error', v_error, true);
end;
$phase11_period_close$;
select ${sqlLiteral(`${resultMarker}:`)}
  || current_setting('app.phase11_period_close_error');
commit;
select ${sqlLiteral(doneMarker)};`;
}

function claimDueRows() {
  return runJson(`
    begin;
    set local role service_role;
    select coalesce(
      jsonb_agg(to_jsonb(claim_row) order by claim_row.business_key),
      '[]'::jsonb
    )::text
    from public.claim_due_business_operating_periods_v1(10) as claim_row;
    commit;
  `);
}

async function waitUntilDatabaseTime(boundary, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const reached = runJson(`
      select jsonb_build_object(
        'reached', clock_timestamp() >= ${sqlLiteral(boundary)}::timestamptz,
        'now', clock_timestamp()
      )::text;
    `);
    if (reached.reached) return reached.now;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Database clock did not reach ${boundary}.`);
}

async function session(name) {
  const value = openPsqlSession(name);
  sessions.add(value);
  await value.waitFor("SESSION_READY:");
  return value;
}

function closeSession(value) {
  if (value.child.exitCode === null) value.close();
  sessions.delete(value);
}

function markedJson(value, marker) {
  const prefix = `${marker}:`;
  const line = value.output.split(/\r?\n/u).find((entry) =>
    entry.startsWith(prefix)
  );
  assert.ok(
    line,
    `Missing ${marker} in psql output: ${value.output}\n${value.errors}`,
  );
  return JSON.parse(line.slice(prefix.length));
}

function markedText(value, marker) {
  const prefix = `${marker}:`;
  const line = value.output.split(/\r?\n/u).find((entry) =>
    entry.startsWith(prefix)
  );
  assert.ok(
    line,
    `Missing ${marker} in psql output: ${value.output}\n${value.errors}`,
  );
  return line.slice(prefix.length);
}

async function lazyPolicyInitializationRace() {
  runSql(`
    insert into public.game_sessions (
      id, owner_staff_user_id, name, lifecycle_state, provisioning_status,
      created_at
    ) values (
      ${sqlLiteral(policyRaceGame.id)}::uuid,
      ${sqlLiteral(FIXTURE.staffId)}::uuid,
      'Phase 11 Lazy Policy Race',
      'draft',
      'pending',
      ${sqlLiteral(policyRaceGame.createdAt)}::timestamptz
    );
  `);

  const first = await session("phase11_policy_first");
  const second = await session("phase11_policy_second");
  try {
    first.write(heldPolicyEnsureSql(
      policyRaceGame.firstOpenedAt,
      "POLICY_FIRST_RESULT",
      "POLICY_FIRST_HOLD",
    ));
    await first.waitFor("POLICY_FIRST_HOLD");

    second.write(committedPolicyEnsureSql(
      policyRaceGame.secondOpenedAt,
      "POLICY_SECOND_RESULT",
      "POLICY_SECOND_DONE",
    ));
    const wait = await pollForDatabaseWait("phase11_policy_second", 15_000);
    assert.equal(wait.waitEventType, "Lock");

    first.write("commit; select 'POLICY_FIRST_DONE';");
    await first.waitFor("POLICY_FIRST_DONE");
    await second.waitFor("POLICY_SECOND_DONE", 30_000);

    const firstPolicy = markedJson(first, "POLICY_FIRST_RESULT");
    const secondPolicy = markedJson(second, "POLICY_SECOND_RESULT");
    assert.equal(firstPolicy.id, secondPolicy.id);
    assert.equal(firstPolicy.policy_version, 1);
    assert.equal(secondPolicy.policy_version, 1);
    assert.equal(
      new Date(firstPolicy.effective_for_periods_opened_at).toISOString(),
      policyRaceGame.createdAt,
    );
    assert.equal(Number(runSql(`
      select count(*)
      from public.business_operating_period_policies
      where game_session_id = ${sqlLiteral(policyRaceGame.id)}::uuid;
    `).output), 1);
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

await lazyPolicyInitializationRace();

runSql(`
  begin;
  insert into public.business_operating_period_policies (
    game_session_id, policy_version, period_duration_seconds,
    gross_receipts_tax_rate, claim_lease_seconds,
    effective_for_periods_opened_at, source_type, metadata
  ) values
    (
      ${sqlLiteral(game.id)}::uuid, 1, 604800, 0.08, 300,
      '2000-01-01T00:00:00Z'::timestamptz,
      'phase11_concurrency',
      '{"fixture":"business-store-sales-convergence-v2"}'::jsonb
    ),
    (
      ${sqlLiteral(otherGame.id)}::uuid, 1, 604800, 0.08, 300,
      '2000-01-01T00:00:00Z'::timestamptz,
      'phase11_concurrency',
      '{"fixture":"business-store-sales-convergence-v2"}'::jsonb
    );
  set local role service_role;
  select public.ensure_business_payroll_clock_v2(
    ${sqlLiteral(game.id)}::uuid, ${sqlLiteral(game.businessId)}::uuid
  );
  select public.ensure_business_payroll_clock_v2(
    ${sqlLiteral(otherGame.id)}::uuid,
    ${sqlLiteral(otherGame.businessId)}::uuid
  );
  commit;

  update public.business_payroll_clocks
  set period_started_at = statement_timestamp()
        - make_interval(secs => period_duration_seconds),
      next_due_at = statement_timestamp(),
      version = version + 1
  where game_session_id = ${sqlLiteral(game.id)}::uuid
    and business_id = ${sqlLiteral(game.businessId)}::uuid;
`);

const sourceAccountKey = playerCheckingKey();
const quote = serviceJson(quoteCall(sourceAccountKey));
assert.match(quote.quoteKey, /^quote_[0-9a-f]{32}$/u);

async function exactlyOneClaimRace() {
  const first = await session("phase11_claim_first");
  const second = await session("phase11_claim_second");
  try {
    first.write(heldClaimSql(
      "CLAIM_FIRST_RESULT",
      "CLAIM_FIRST_HOLD",
    ));
    await first.waitFor("CLAIM_FIRST_HOLD");

    second.write(claimRowsSql(
      "CLAIM_SECOND_RESULT",
      "CLAIM_SECOND_DONE",
    ));
    await second.waitFor("CLAIM_SECOND_DONE");

    const firstClaims = markedJson(first, "CLAIM_FIRST_RESULT");
    const secondClaims = markedJson(second, "CLAIM_SECOND_RESULT");
    assert.equal(firstClaims.length, 1);
    assert.equal(firstClaims[0].business_key, game.businessKey);
    assert.deepEqual(secondClaims, []);

    first.write("commit; select 'CLAIM_FIRST_DONE';");
    await first.waitFor("CLAIM_FIRST_DONE");
    assert.equal(Number(runSql(`
      select count(*)
      from public.business_operating_period_claims
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and business_id = ${sqlLiteral(game.businessId)}::uuid
        and period_number = 1
        and status = 'claimed';
    `).output), 1);
    return firstClaims[0];
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

async function closeFirstPurchaseRace(claim) {
  const close = await session("phase11_close_first");
  const purchase = await session("phase11_purchase_after_close");
  try {
    const assignedBefore = Number(runSql(`
      select count(*)
      from public.business_operating_period_store_receipts
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and business_id = ${sqlLiteral(game.businessId)}::uuid;
    `).output);
    const receiptsBefore = Number(runSql(`
      select count(*)
      from public.store_offer_purchase_receipts
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and business_id = ${sqlLiteral(game.businessId)}::uuid
        and business_sales_authority_version = 1;
    `).output);
    assert.ok(receiptsBefore > 0);

    close.write(heldCloseSql(
      claim,
      "CLOSE_FIRST_RESULT",
      "CLOSE_FIRST_HOLD",
    ));
    await close.waitFor("CLOSE_FIRST_HOLD", 30_000);

    purchase.write(committedSettlementSql(
      quote.quoteKey,
      "PURCHASE_AFTER_CLOSE_RESULT",
      "PURCHASE_AFTER_CLOSE_DONE",
    ));
    const wait = await pollForDatabaseWait(
      "phase11_purchase_after_close",
      15_000,
    );
    assert.equal(wait.waitEventType, "Lock");

    close.write("commit; select 'CLOSE_FIRST_DONE';");
    await close.waitFor("CLOSE_FIRST_DONE");
    await purchase.waitFor("PURCHASE_AFTER_CLOSE_DONE", 30_000);

    const closeResult = markedJson(close, "CLOSE_FIRST_RESULT");
    const purchaseResult = markedJson(
      purchase,
      "PURCHASE_AFTER_CLOSE_RESULT",
    );
    assert.equal(closeResult.replayed, false);
    assert.equal(closeResult.business_key, game.businessKey);
    assert.equal(Number(closeResult.store_receipt_count), receiptsBefore);
    assert.match(purchaseResult.receiptKey, /^spr_[0-9a-f]{32}$/u);

    const facts = runJson(`
      select jsonb_build_object(
        'closeCount', (select count(*)
          from public.business_operating_period_close_receipts
          where game_session_id = ${sqlLiteral(game.id)}::uuid
            and business_id = ${sqlLiteral(game.businessId)}::uuid),
        'assignedAfter', (select count(*)
          from public.business_operating_period_store_receipts
          where game_session_id = ${sqlLiteral(game.id)}::uuid
            and business_id = ${sqlLiteral(game.businessId)}::uuid),
        'newReceiptCount', (select count(*)
          from public.store_offer_purchase_receipts
          where game_session_id = ${sqlLiteral(game.id)}::uuid
            and business_id = ${sqlLiteral(game.businessId)}::uuid
            and request_idempotency_key =
              'phase11-concurrency-purchase-settle'),
        'newReceiptAssigned', (select count(*)
          from public.business_operating_period_store_receipts as source_row
          join public.store_offer_purchase_receipts as receipt_row
            on receipt_row.game_session_id = source_row.game_session_id
           and receipt_row.id = source_row.store_purchase_receipt_id
          where receipt_row.game_session_id = ${sqlLiteral(game.id)}::uuid
            and receipt_row.request_idempotency_key =
              'phase11-concurrency-purchase-settle'),
        'successorPeriod', (select current_period_number
          from public.business_payroll_clocks
          where game_session_id = ${sqlLiteral(game.id)}::uuid
            and business_id = ${sqlLiteral(game.businessId)}::uuid),
        'successorFutureDue', (select next_due_at > clock_timestamp()
          from public.business_payroll_clocks
          where game_session_id = ${sqlLiteral(game.id)}::uuid
            and business_id = ${sqlLiteral(game.businessId)}::uuid),
        'otherGameCloseCount', (select count(*)
          from public.business_operating_period_close_receipts
          where game_session_id = ${sqlLiteral(otherGame.id)}::uuid)
      )::text;
    `);
    assert.equal(Number(facts.closeCount), 1);
    assert.equal(Number(facts.assignedAfter), assignedBefore + receiptsBefore);
    assert.equal(Number(facts.newReceiptCount), 1);
    assert.equal(Number(facts.newReceiptAssigned), 0);
    assert.equal(Number(facts.successorPeriod), 2);
    assert.equal(facts.successorFutureDue, true);
    assert.equal(Number(facts.otherGameCloseCount), 0);
  } finally {
    closeSession(close);
    closeSession(purchase);
  }
}

function prepareNearFutureClaim(targetGame) {
  const dueClock = runJson(`
    with prior_policy as (
      select policy_row.*
      from public.business_operating_period_policies as policy_row
      where policy_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
        and policy_row.policy_version = 1
    ), inserted_policy as (
      insert into public.business_operating_period_policies (
        game_session_id, policy_version, period_duration_seconds,
        gross_receipts_tax_rate, claim_lease_seconds,
        effective_for_periods_opened_at, supersedes_policy_id,
        source_type, metadata
      )
      select
        prior_policy.game_session_id, 2, 3600,
        prior_policy.gross_receipts_tax_rate,
        prior_policy.claim_lease_seconds,
        clock_timestamp(), prior_policy.id,
        'phase11_concurrency_boundary',
        '{"fixture":"purchase-first-boundary"}'::jsonb
      from prior_policy
      returning *
    ), boundary as materialized (
      select clock_timestamp() as due_at
    ), updated_clock as (
      update public.business_payroll_clocks as clock_row
      set period_policy_id = inserted_policy.id,
          period_opened_at = clock_timestamp(),
          period_duration_seconds = inserted_policy.period_duration_seconds,
          gross_receipts_tax_rate = inserted_policy.gross_receipts_tax_rate,
          period_started_at = boundary.due_at - interval '1 hour',
          next_due_at = boundary.due_at,
          version = clock_row.version + 1,
          updated_at = clock_timestamp()
      from inserted_policy, boundary
      where clock_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
        and clock_row.business_id = ${sqlLiteral(targetGame.businessId)}::uuid
      returning clock_row.*
    )
    select jsonb_build_object(
      'periodNumber', updated_clock.current_period_number,
      'periodStartedAt', updated_clock.period_started_at,
      'dueAt', updated_clock.next_due_at,
      'policyVersion', inserted_policy.policy_version
    )::text
    from updated_clock, inserted_policy;
  `);
  assert.equal(dueClock.periodNumber, 1);
  assert.equal(dueClock.policyVersion, 2);

  const claims = claimDueRows();
  assert.equal(claims.length, 1);
  assert.equal(claims[0].business_key, targetGame.businessKey);

  // The production claim is obtained only after its canonical clock is due.
  // For this narrow race fixture, move that already-matched clock/claim pair
  // to a near-future boundary. Disabling triggers is fixture-only; the serial
  // acceptance separately proves a future clock cannot be claimed at runtime.
  const boundary = runJson(`
    begin;
    set local session_replication_role = replica;
    with boundary as materialized (
      select clock_timestamp() + interval '2 seconds' as due_at
    ), updated_clock as (
      update public.business_payroll_clocks as clock_row
      set period_started_at = boundary.due_at - interval '1 hour',
          next_due_at = boundary.due_at,
          version = clock_row.version + 1,
          updated_at = clock_timestamp()
      from boundary
      where clock_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
        and clock_row.business_id = ${sqlLiteral(targetGame.businessId)}::uuid
      returning clock_row.*
    ), updated_claim as (
      update public.business_operating_period_claims as claim_row
      set period_started_at = updated_clock.period_started_at,
          due_at = updated_clock.next_due_at,
          payroll_clock_version = updated_clock.version,
          updated_at = clock_timestamp()
      from updated_clock
      where claim_row.public_key = ${sqlLiteral(claims[0].claim_key)}
      returning claim_row.*
    )
    select jsonb_build_object(
      'periodNumber', updated_clock.current_period_number,
      'periodStartedAt', updated_clock.period_started_at,
      'dueAt', updated_clock.next_due_at,
      'policyVersion', 2,
      'claimKey', updated_claim.public_key,
      'leaseToken', updated_claim.lease_token
    )::text
    from updated_clock, updated_claim;
    commit;
  `);
  return {
    ...boundary,
    claim: {
      ...claims[0],
      due_at: boundary.dueAt,
      period_started_at: boundary.periodStartedAt,
      lease_token: boundary.leaseToken,
    },
  };
}

async function purchaseFirstBoundaryRace() {
  const sourceAccountKey = playerCheckingKey(otherGame);
  const quote = serviceJson(quoteCall(
    sourceAccountKey,
    otherGame,
    "phase11-concurrency-purchase-first-quote",
  ));
  assert.match(quote.quoteKey, /^quote_[0-9a-f]{32}$/u);

  const purchase = await session("phase11_purchase_first");
  const close = await session("phase11_purchase_first_close");
  try {
    const boundary = prepareNearFutureClaim(otherGame);
    assert.equal(boundary.periodNumber, 1);
    assert.equal(boundary.policyVersion, 2);
    assert.equal(Number(runSql(`
      select count(*)
      from public.store_offer_purchase_receipts as receipt_row
      where receipt_row.game_session_id = ${sqlLiteral(otherGame.id)}::uuid
        and receipt_row.business_id = ${sqlLiteral(otherGame.businessId)}::uuid
        and receipt_row.business_sales_authority_version = 1
        and receipt_row.business_sales_authority_committed_at
          >= ${sqlLiteral(boundary.periodStartedAt)}::timestamptz
        and receipt_row.business_sales_authority_committed_at
          < ${sqlLiteral(boundary.dueAt)}::timestamptz;
    `).output), 0);

    purchase.write(heldSettlementSql(
      quote.quoteKey,
      otherGame,
      "phase11-concurrency-purchase-first-settle",
      "PURCHASE_FIRST_RESULT",
      "PURCHASE_FIRST_HOLD",
    ));
    await purchase.waitFor("PURCHASE_FIRST_HOLD", 30_000);
    const purchaseResult = markedJson(purchase, "PURCHASE_FIRST_RESULT");
    assert.match(purchaseResult.receiptKey, /^spr_[0-9a-f]{32}$/u);
    assert.equal(runJson(`
      select jsonb_build_object(
        'beforeDue', clock_timestamp()
          < ${sqlLiteral(boundary.dueAt)}::timestamptz
      )::text;
    `).beforeDue, true);

    await waitUntilDatabaseTime(boundary.dueAt);

    close.write(heldCloseSql(
      boundary.claim,
      "PURCHASE_FIRST_CLOSE_RESULT",
      "PURCHASE_FIRST_CLOSE_HOLD",
    ));
    const wait = await pollForDatabaseWait(
      "phase11_purchase_first_close",
      15_000,
    );
    assert.equal(wait.waitEventType, "Lock");

    purchase.write(
      "commit; select 'PURCHASE_FIRST_DONE:' || clock_timestamp()::text;",
    );
    await purchase.waitFor("PURCHASE_FIRST_DONE", 30_000);
    const commitObservedAt = markedText(purchase, "PURCHASE_FIRST_DONE");

    await close.waitFor("PURCHASE_FIRST_CLOSE_HOLD", 30_000);
    const closeResult = markedJson(close, "PURCHASE_FIRST_CLOSE_RESULT");
    close.write("commit; select 'PURCHASE_FIRST_CLOSE_DONE';");
    await close.waitFor("PURCHASE_FIRST_CLOSE_DONE", 30_000);

    assert.equal(closeResult.replayed, false);
    assert.equal(closeResult.business_key, otherGame.businessKey);
    assert.equal(Number(closeResult.store_receipt_count), 1);

    const facts = runJson(`
      select jsonb_build_object(
        'purchaseCommittedAfterDue',
          ${sqlLiteral(commitObservedAt)}::timestamptz
            >= ${sqlLiteral(boundary.dueAt)}::timestamptz,
        'authorityAcceptedBeforeDue',
          receipt_row.business_sales_authority_committed_at
            < ${sqlLiteral(boundary.dueAt)}::timestamptz,
        'authorityAcceptedInsidePeriod',
          receipt_row.business_sales_authority_committed_at
            >= ${sqlLiteral(boundary.periodStartedAt)}::timestamptz,
        'authorityTimestampAdvanced',
          receipt_row.business_sales_authority_committed_at
            > receipt_row.completed_at,
        'assignmentCount', count(source_row.id),
        'assignedClaimKey', max(claim_row.public_key),
        'unassignedEligibleCount', (select count(*)
          from public.store_offer_purchase_receipts as eligible_row
          where eligible_row.game_session_id = ${sqlLiteral(otherGame.id)}::uuid
            and eligible_row.business_id = ${sqlLiteral(otherGame.businessId)}::uuid
            and eligible_row.business_sales_authority_version = 1
            and eligible_row.business_sales_authority_committed_at
              >= ${sqlLiteral(boundary.periodStartedAt)}::timestamptz
            and eligible_row.business_sales_authority_committed_at
              < ${sqlLiteral(boundary.dueAt)}::timestamptz
            and not exists (
              select 1
              from public.business_operating_period_store_receipts as assigned_row
              where assigned_row.game_session_id = eligible_row.game_session_id
                and assigned_row.store_purchase_receipt_id = eligible_row.id
            ))
      )::text
      from public.store_offer_purchase_receipts as receipt_row
      left join public.business_operating_period_store_receipts as source_row
        on source_row.game_session_id = receipt_row.game_session_id
       and source_row.store_purchase_receipt_id = receipt_row.id
      left join public.business_operating_period_claims as claim_row
        on claim_row.id = source_row.operating_period_claim_id
      where receipt_row.game_session_id = ${sqlLiteral(otherGame.id)}::uuid
        and receipt_row.public_key = ${sqlLiteral(purchaseResult.receiptKey)}
      group by receipt_row.id;
    `);
    assert.equal(facts.purchaseCommittedAfterDue, true);
    assert.equal(facts.authorityAcceptedBeforeDue, true);
    assert.equal(facts.authorityAcceptedInsidePeriod, true);
    assert.equal(facts.authorityTimestampAdvanced, true);
    assert.equal(Number(facts.assignmentCount), 1);
    assert.equal(facts.assignedClaimKey, boundary.claim.claim_key);
    assert.equal(Number(facts.unassignedEligibleCount), 0);
  } finally {
    closeSession(purchase);
    closeSession(close);
  }
}

async function purchaseBeforeBusinessClosureRace() {
  const sourceAccountKey = playerCheckingKey(otherGame);
  const quote = serviceJson(quoteCall(
    sourceAccountKey,
    otherGame,
    "phase11-concurrency-closure-quote",
  ));
  assert.match(quote.quoteKey, /^quote_[0-9a-f]{32}$/u);

  const purchase = await session("phase11_closure_purchase");
  const closure = await session("phase11_closure_guard");
  try {
    purchase.write(heldSettlementSql(
      quote.quoteKey,
      otherGame,
      "phase11-concurrency-closure-settle",
      "CLOSURE_PURCHASE_RESULT",
      "CLOSURE_PURCHASE_HOLD",
    ));
    await purchase.waitFor("CLOSURE_PURCHASE_HOLD", 30_000);
    const purchaseResult = markedJson(purchase, "CLOSURE_PURCHASE_RESULT");
    assert.match(purchaseResult.receiptKey, /^spr_[0-9a-f]{32}$/u);

    closure.write(guardedClosureSql(
      otherGame,
      "CLOSURE_GUARD_RESULT",
      "CLOSURE_GUARD_DONE",
    ));
    const wait = await pollForDatabaseWait("phase11_closure_guard", 15_000);
    assert.equal(wait.waitEventType, "Lock");

    purchase.write("commit; select 'CLOSURE_PURCHASE_DONE';");
    await purchase.waitFor("CLOSURE_PURCHASE_DONE", 30_000);
    await closure.waitFor("CLOSURE_GUARD_DONE", 30_000);
    assert.equal(
      markedText(closure, "CLOSURE_GUARD_RESULT"),
      "BUSINESS_OPERATING_PERIOD_CLOSE_PENDING",
    );

    const facts = runJson(`
      select jsonb_build_object(
        'businessStatus', business_row.status,
        'receiptCount', count(receipt_row.id),
        'unassignedReceiptCount', count(receipt_row.id) filter (
          where source_row.id is null
        ),
        'closureAuditCount', (select count(*)
          from public.audit_log as audit_row
          where audit_row.game_session_id = ${sqlLiteral(otherGame.id)}::uuid
            and audit_row.target_id = ${sqlLiteral(otherGame.businessId)}::uuid
            and audit_row.action = 'business.status.transition'
            and audit_row.metadata ->> 'idempotency_key' =
              'phase11-concurrency-close-business')
      )::text
      from public.business_entities as business_row
      join public.store_offer_purchase_receipts as receipt_row
        on receipt_row.game_session_id = business_row.game_session_id
       and receipt_row.business_id = business_row.id
       and receipt_row.request_idempotency_key =
         'phase11-concurrency-closure-settle'
      left join public.business_operating_period_store_receipts as source_row
        on source_row.game_session_id = receipt_row.game_session_id
       and source_row.store_purchase_receipt_id = receipt_row.id
      where business_row.game_session_id = ${sqlLiteral(otherGame.id)}::uuid
        and business_row.id = ${sqlLiteral(otherGame.businessId)}::uuid
      group by business_row.id;
    `);
    assert.equal(facts.businessStatus, "active");
    assert.equal(Number(facts.receiptCount), 1);
    assert.equal(Number(facts.unassignedReceiptCount), 1);
    assert.equal(Number(facts.closureAuditCount), 0);
  } finally {
    closeSession(purchase);
    closeSession(closure);
  }
}

function prepareClosureDueBoundary() {
  runSql(`
    begin;
    insert into public.business_entities (
      id, public_key, game_session_id, owner_player_id, legal_name,
      entity_type, industry_code, country_code, currency_code, status,
      tax_classification, formation_state, ownership_model_version
    )
    select
      ${sqlLiteral(closureBoundaryBusiness.businessId)}::uuid,
      ${sqlLiteral(closureBoundaryBusiness.businessKey)},
      business_row.game_session_id,
      business_row.owner_player_id,
      'Phase 11 Closure Boundary LLC',
      'llc', business_row.industry_code, business_row.country_code,
      business_row.currency_code, 'active', 'disregarded', 'operational', 2
    from public.business_entities as business_row
    where business_row.game_session_id = ${sqlLiteral(otherGame.id)}::uuid
      and business_row.id = ${sqlLiteral(otherGame.businessId)}::uuid;

    set local role service_role;
    select public.ensure_business_payroll_clock_v2(
      ${sqlLiteral(closureBoundaryBusiness.id)}::uuid,
      ${sqlLiteral(closureBoundaryBusiness.businessId)}::uuid
    );
    commit;
  `);

  return runJson(`
    with boundary as materialized (
      select clock_timestamp() + interval '15 seconds' as due_at
    ), updated_clock as (
      update public.business_payroll_clocks as clock_row
      set period_started_at = boundary.due_at
            - make_interval(secs => clock_row.period_duration_seconds),
          next_due_at = boundary.due_at,
          version = clock_row.version + 1,
          updated_at = clock_timestamp()
      from boundary
      where clock_row.game_session_id =
            ${sqlLiteral(closureBoundaryBusiness.id)}::uuid
        and clock_row.business_id =
            ${sqlLiteral(closureBoundaryBusiness.businessId)}::uuid
      returning clock_row.*
    )
    select jsonb_build_object(
      'dueAt', updated_clock.next_due_at,
      'periodNumber', updated_clock.current_period_number
    )::text
    from updated_clock;
  `);
}

async function closureWaitsAcrossDueBoundaryRace() {
  const boundary = prepareClosureDueBoundary();
  assert.equal(boundary.periodNumber, 1);

  const blocker = await session("phase11_closure_boundary_blocker");
  const closure = await session("phase11_closure_boundary_guard");
  try {
    blocker.write(heldBusinessLockSql(
      closureBoundaryBusiness,
      "CLOSURE_BOUNDARY_BLOCKER_HOLD",
    ));
    await blocker.waitFor("CLOSURE_BOUNDARY_BLOCKER_HOLD", 30_000);

    closure.write(guardedClosureSql(
      closureBoundaryBusiness,
      "CLOSURE_BOUNDARY_RESULT",
      "CLOSURE_BOUNDARY_DONE",
      "BUSINESS_OPERATING_PERIOD_CLOSE_REQUIRED",
      "phase11-concurrency-close-due-boundary",
    ));
    const wait = await pollForDatabaseWait(
      "phase11_closure_boundary_guard",
      15_000,
    );
    assert.equal(wait.waitEventType, "Lock");

    const waiting = runJson(`
      select jsonb_build_object(
        'queryStartedBeforeDue', activity_row.query_start
          < ${sqlLiteral(boundary.dueAt)}::timestamptz,
        'observedBeforeDue', clock_timestamp()
          < ${sqlLiteral(boundary.dueAt)}::timestamptz
      )::text
      from pg_catalog.pg_stat_activity as activity_row
      where activity_row.application_name =
            'phase11_closure_boundary_guard'
      order by activity_row.pid desc
      limit 1;
    `);
    assert.equal(waiting.queryStartedBeforeDue, true);
    assert.equal(waiting.observedBeforeDue, true);

    await waitUntilDatabaseTime(boundary.dueAt, 30_000);
    blocker.write("commit; select 'CLOSURE_BOUNDARY_BLOCKER_DONE';");
    await blocker.waitFor("CLOSURE_BOUNDARY_BLOCKER_DONE", 30_000);
    await closure.waitFor("CLOSURE_BOUNDARY_DONE", 30_000);
    assert.equal(
      markedText(closure, "CLOSURE_BOUNDARY_RESULT"),
      "BUSINESS_OPERATING_PERIOD_CLOSE_REQUIRED",
    );

    const facts = runJson(`
      select jsonb_build_object(
        'boundaryReached', clock_timestamp()
          >= ${sqlLiteral(boundary.dueAt)}::timestamptz,
        'businessStatus', business_row.status,
        'activeEmployeeCount', (select count(*)
          from public.business_employees as employee_row
          where employee_row.game_session_id = business_row.game_session_id
            and employee_row.business_id = business_row.id
            and employee_row.status = 'active'),
        'unassignedReceiptCount', (select count(*)
          from public.store_offer_purchase_receipts as receipt_row
          where receipt_row.game_session_id = business_row.game_session_id
            and receipt_row.business_id = business_row.id
            and receipt_row.business_sales_authority_version = 1
            and not exists (
              select 1
              from public.business_operating_period_store_receipts as source_row
              where source_row.game_session_id = receipt_row.game_session_id
                and source_row.store_purchase_receipt_id = receipt_row.id
            )),
        'closureAuditCount', (select count(*)
          from public.audit_log as audit_row
          where audit_row.game_session_id = business_row.game_session_id
            and audit_row.target_id = business_row.id
            and audit_row.action = 'business.status.transition'
            and audit_row.metadata ->> 'idempotency_key' =
              'phase11-concurrency-close-due-boundary')
      )::text
      from public.business_entities as business_row
      where business_row.game_session_id =
            ${sqlLiteral(closureBoundaryBusiness.id)}::uuid
        and business_row.id =
            ${sqlLiteral(closureBoundaryBusiness.businessId)}::uuid;
    `);
    assert.equal(facts.boundaryReached, true);
    assert.equal(facts.businessStatus, "active");
    assert.equal(Number(facts.activeEmployeeCount), 0);
    assert.equal(Number(facts.unassignedReceiptCount), 0);
    assert.equal(Number(facts.closureAuditCount), 0);
  } finally {
    closeSession(blocker);
    closeSession(closure);
  }
}

async function inactiveGameCloseRace() {
  const claims = claimDueRows();
  assert.equal(claims.length, 1);
  assert.equal(claims[0].business_key, closureBoundaryBusiness.businessKey);

  const deactivation = await session("phase11_game_deactivation");
  const close = await session("phase11_inactive_game_close");
  try {
    deactivation.write(heldGameDeactivationSql(
      closureBoundaryBusiness,
      "INACTIVE_GAME_DEACTIVATION_HOLD",
    ));
    await deactivation.waitFor("INACTIVE_GAME_DEACTIVATION_HOLD", 30_000);

    close.write(guardedPeriodCloseSql(
      claims[0],
      "INACTIVE_GAME_CLOSE_RESULT",
      "INACTIVE_GAME_CLOSE_DONE",
      "BUSINESS_OPERATING_PERIOD_GAME_INACTIVE",
    ));
    const wait = await pollForDatabaseWait(
      "phase11_inactive_game_close",
      15_000,
    );
    assert.equal(wait.waitEventType, "Lock");

    deactivation.write("commit; select 'INACTIVE_GAME_DEACTIVATION_DONE';");
    await deactivation.waitFor("INACTIVE_GAME_DEACTIVATION_DONE", 30_000);
    await close.waitFor("INACTIVE_GAME_CLOSE_DONE", 30_000);
    assert.equal(
      markedText(close, "INACTIVE_GAME_CLOSE_RESULT"),
      "BUSINESS_OPERATING_PERIOD_GAME_INACTIVE",
    );

    const facts = runJson(`
      select jsonb_build_object(
        'gameStatus', game_row.status,
        'gameLifecycle', game_row.lifecycle_state,
        'claimStatus', claim_row.status,
        'clockPeriod', clock_row.current_period_number,
        'payrollRunCount', (select count(*)
          from public.business_payroll_runs as payroll_row
          where payroll_row.game_session_id = claim_row.game_session_id
            and payroll_row.operating_period_claim_id = claim_row.id),
        'taxAssessmentCount', (select count(*)
          from public.business_gross_receipts_tax_assessments as tax_row
          where tax_row.game_session_id = claim_row.game_session_id
            and tax_row.operating_period_claim_id = claim_row.id),
        'storeAssignmentCount', (select count(*)
          from public.business_operating_period_store_receipts as source_row
          where source_row.game_session_id = claim_row.game_session_id
            and source_row.operating_period_claim_id = claim_row.id),
        'closeReceiptCount', (select count(*)
          from public.business_operating_period_close_receipts as close_row
          where close_row.game_session_id = claim_row.game_session_id
            and close_row.operating_period_claim_id = claim_row.id)
      )::text
      from public.business_operating_period_claims as claim_row
      join public.game_sessions as game_row
        on game_row.id = claim_row.game_session_id
      join public.business_payroll_clocks as clock_row
        on clock_row.game_session_id = claim_row.game_session_id
       and clock_row.business_id = claim_row.business_id
      where claim_row.public_key = ${sqlLiteral(claims[0].claim_key)};
    `);
    assert.equal(facts.gameStatus, "disabled");
    assert.equal(facts.gameLifecycle, "paused");
    assert.equal(facts.claimStatus, "claimed");
    assert.equal(Number(facts.clockPeriod), Number(claims[0].period_number));
    assert.equal(Number(facts.payrollRunCount), 0);
    assert.equal(Number(facts.taxAssessmentCount), 0);
    assert.equal(Number(facts.storeAssignmentCount), 0);
    assert.equal(Number(facts.closeReceiptCount), 0);
  } finally {
    closeSession(deactivation);
    closeSession(close);
    runSql(`
      update public.game_sessions
      set lifecycle_state = 'active',
          status = 'active'
      where id = ${sqlLiteral(closureBoundaryBusiness.id)}::uuid;
    `);
  }

  const released = runJson(`
    begin;
    set local role service_role;
    select row_to_json(release_row)::text
    from public.release_business_operating_period_lease_v1(
      ${sqlLiteral(claims[0].claim_key)},
      ${sqlLiteral(claims[0].lease_token)}::uuid,
      'INACTIVE_GAME_TEST_COMPLETE',
      'phase11-concurrency-inactive-game-release'
    ) as release_row;
    commit;
  `);
  assert.equal(released.claim_status, "released");
}

async function sameKeySamePayloadFormationRace() {
  const targetGame = game;
  const playerId = game.buyerTwoId;
  const legalName = "Phase 11 Replay Formation";
  const idempotencyKey = "phase11-concurrency-formation-replay";
  const before = runJson(`
    select jsonb_build_object(
      'businessCount', (select count(*)
        from public.business_entities as business_row
        where business_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
          and business_row.owner_player_id = ${sqlLiteral(playerId)}::uuid),
      'auditCount', (select count(*)
        from public.audit_log as audit_row
        where audit_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
          and audit_row.actor_id = ${sqlLiteral(playerId)}::uuid
          and audit_row.action = 'business.create_or_acquire')
    )::text;
  `);
  assert.equal(Number(before.businessCount), 0);
  assert.equal(Number(before.auditCount), 0);

  const first = await session("phase11_formation_replay_first");
  const second = await session("phase11_formation_replay_second");
  try {
    first.write(heldFormationSql(
      targetGame,
      playerId,
      legalName,
      idempotencyKey,
      "FORMATION_REPLAY_FIRST_RESULT",
      "FORMATION_REPLAY_FIRST_HOLD",
    ));
    await first.waitFor("FORMATION_REPLAY_FIRST_HOLD", 30_000);

    second.write(committedFormationSql(
      targetGame,
      playerId,
      legalName,
      idempotencyKey,
      "FORMATION_REPLAY_SECOND_RESULT",
      "FORMATION_REPLAY_SECOND_DONE",
    ));
    const wait = await pollForDatabaseWait(
      "phase11_formation_replay_second",
      15_000,
    );
    assert.equal(wait.waitEventType, "Lock");

    const firstResult = markedJson(first, "FORMATION_REPLAY_FIRST_RESULT");
    first.write("commit; select 'FORMATION_REPLAY_FIRST_DONE';");
    await first.waitFor("FORMATION_REPLAY_FIRST_DONE", 30_000);
    await second.waitFor("FORMATION_REPLAY_SECOND_DONE", 30_000);
    const secondResult = markedJson(
      second,
      "FORMATION_REPLAY_SECOND_RESULT",
    );

    assert.equal(firstResult.replayed, false);
    assert.equal(secondResult.replayed, true);
    assert.match(firstResult.business_key, /^biz_[0-9a-f]{32}$/u);
    assert.equal(secondResult.business_key, firstResult.business_key);
    assert.equal(secondResult.status, firstResult.status);
    assert.equal(secondResult.owner_player_id, firstResult.owner_player_id);
    assert.equal(firstResult.owner_player_id, playerId);
    assert.equal(Number(firstResult.capitalization), 0);
    assert.equal(Number(secondResult.capitalization), 0);
    assert.equal(Number(firstResult.valuation), 0);
    assert.equal(Number(secondResult.valuation), 0);

    const facts = runJson(`
      select jsonb_build_object(
        'businessCount', (select count(*)
          from public.business_entities as business_row
          where business_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
            and business_row.owner_player_id = ${sqlLiteral(playerId)}::uuid),
        'auditCount', (select count(*)
          from public.audit_log as audit_row
          where audit_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
            and audit_row.actor_id = ${sqlLiteral(playerId)}::uuid
            and audit_row.action = 'business.create_or_acquire'
            and audit_row.metadata ->> 'idempotency_key' =
              ${sqlLiteral(idempotencyKey)}),
        'auditTargetCount', (select count(*)
          from public.audit_log as audit_row
          join public.business_entities as business_row
            on business_row.game_session_id = audit_row.game_session_id
           and business_row.id = audit_row.target_id
          where audit_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
            and audit_row.actor_id = ${sqlLiteral(playerId)}::uuid
            and audit_row.action = 'business.create_or_acquire'
            and audit_row.metadata ->> 'idempotency_key' =
              ${sqlLiteral(idempotencyKey)}
            and audit_row.metadata ->> 'result_business_key' =
              business_row.public_key)
      )::text;
    `);
    assert.equal(Number(facts.businessCount), 1);
    assert.equal(Number(facts.auditCount), 1);
    assert.equal(Number(facts.auditTargetCount), 1);
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

async function distinctKeySamePlayerFormationRace() {
  const targetGame = otherGame;
  const playerId = otherGame.buyerTwoId;
  const winningKey = "phase11-concurrency-formation-winner";
  const losingKey = "phase11-concurrency-formation-loser";
  const before = runJson(`
    select jsonb_build_object(
      'businessCount', (select count(*)
        from public.business_entities as business_row
        where business_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
          and business_row.owner_player_id = ${sqlLiteral(playerId)}::uuid),
      'auditCount', (select count(*)
        from public.audit_log as audit_row
        where audit_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
          and audit_row.actor_id = ${sqlLiteral(playerId)}::uuid
          and audit_row.action = 'business.create_or_acquire')
    )::text;
  `);
  assert.equal(Number(before.businessCount), 0);
  assert.equal(Number(before.auditCount), 0);

  const first = await session("phase11_formation_distinct_first");
  const second = await session("phase11_formation_distinct_second");
  try {
    first.write(heldFormationSql(
      targetGame,
      playerId,
      "Phase 11 Winning Formation",
      winningKey,
      "FORMATION_DISTINCT_FIRST_RESULT",
      "FORMATION_DISTINCT_FIRST_HOLD",
    ));
    await first.waitFor("FORMATION_DISTINCT_FIRST_HOLD", 30_000);

    second.write(guardedFormationSql(
      targetGame,
      playerId,
      "Phase 11 Losing Formation",
      losingKey,
      "FORMATION_DISTINCT_SECOND_RESULT",
      "FORMATION_DISTINCT_SECOND_DONE",
    ));
    const wait = await pollForDatabaseWait(
      "phase11_formation_distinct_second",
      15_000,
    );
    assert.equal(wait.waitEventType, "Lock");

    const firstResult = markedJson(first, "FORMATION_DISTINCT_FIRST_RESULT");
    first.write("commit; select 'FORMATION_DISTINCT_FIRST_DONE';");
    await first.waitFor("FORMATION_DISTINCT_FIRST_DONE", 30_000);
    await second.waitFor("FORMATION_DISTINCT_SECOND_DONE", 30_000);

    assert.equal(firstResult.replayed, false);
    assert.match(firstResult.business_key, /^biz_[0-9a-f]{32}$/u);
    assert.equal(firstResult.owner_player_id, playerId);
    assert.equal(
      markedText(second, "FORMATION_DISTINCT_SECOND_RESULT"),
      "BUSINESS_ALREADY_OWNED",
    );

    const facts = runJson(`
      select jsonb_build_object(
        'businessCount', (select count(*)
          from public.business_entities as business_row
          where business_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
            and business_row.owner_player_id = ${sqlLiteral(playerId)}::uuid),
        'businessKey', (select min(business_row.public_key)
          from public.business_entities as business_row
          where business_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
            and business_row.owner_player_id = ${sqlLiteral(playerId)}::uuid),
        'auditCount', (select count(*)
          from public.audit_log as audit_row
          where audit_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
            and audit_row.actor_id = ${sqlLiteral(playerId)}::uuid
            and audit_row.action = 'business.create_or_acquire'),
        'winningAuditCount', (select count(*)
          from public.audit_log as audit_row
          where audit_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
            and audit_row.actor_id = ${sqlLiteral(playerId)}::uuid
            and audit_row.action = 'business.create_or_acquire'
            and audit_row.metadata ->> 'idempotency_key' =
              ${sqlLiteral(winningKey)}),
        'losingAuditCount', (select count(*)
          from public.audit_log as audit_row
          where audit_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
            and audit_row.actor_id = ${sqlLiteral(playerId)}::uuid
            and audit_row.action = 'business.create_or_acquire'
            and audit_row.metadata ->> 'idempotency_key' =
              ${sqlLiteral(losingKey)}),
        'auditTargetCount', (select count(*)
          from public.audit_log as audit_row
          join public.business_entities as business_row
            on business_row.game_session_id = audit_row.game_session_id
           and business_row.id = audit_row.target_id
          where audit_row.game_session_id = ${sqlLiteral(targetGame.id)}::uuid
            and audit_row.actor_id = ${sqlLiteral(playerId)}::uuid
            and audit_row.action = 'business.create_or_acquire'
            and audit_row.metadata ->> 'idempotency_key' =
              ${sqlLiteral(winningKey)}
            and audit_row.metadata ->> 'result_business_key' =
              business_row.public_key)
      )::text;
    `);
    assert.equal(Number(facts.businessCount), 1);
    assert.equal(facts.businessKey, firstResult.business_key);
    assert.equal(Number(facts.auditCount), 1);
    assert.equal(Number(facts.winningAuditCount), 1);
    assert.equal(Number(facts.losingAuditCount), 0);
    assert.equal(Number(facts.auditTargetCount), 1);
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

try {
  const winningClaim = await exactlyOneClaimRace();
  await closeFirstPurchaseRace(winningClaim);
  await purchaseFirstBoundaryRace();
  await purchaseBeforeBusinessClosureRace();
  await closureWaitsAcrossDueBoundaryRace();
  await inactiveGameCloseRace();
  await sameKeySamePayloadFormationRace();
  await distinctKeySamePlayerFormationRace();
} finally {
  for (const value of sessions) closeSession(value);
}

console.log(JSON.stringify({
  ok: true,
  exactlyOneDueClaim: true,
  skipLockedLoserObserved: true,
  closeFirstPurchaseSerialized: true,
  purchaseDeferredToSuccessor: true,
  purchaseFirstBoundaryIncluded: true,
  committedAuthorityTimestampProved: true,
  lazyPolicyInitializationRaceSafe: true,
  businessClosureGuardSerialized: true,
  businessClosureDueBoundarySafe: true,
  inactiveGameCloseSerializedAndDenied: true,
  sameKeyFormationRaceConverged: true,
  distinctKeyFormationRaceSerialized: true,
  canonicalBankingLockObserved: true,
  twoGameIsolation: true,
}));
