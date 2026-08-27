#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  FIXTURE,
  openPsqlSession,
  pollForDatabaseWait,
  resetFixture,
  runJson,
  runSql,
  sqlLiteral,
} from "./business-phase10-atomic-settlement-database-support.mjs";

const gameOne = FIXTURE.games.one;
const gameTwo = FIXTURE.games.two;
const sessions = new Set();
const CONTEXT_HASH = "a".repeat(64);

function serviceJson(sql) {
  return runJson(`begin; set local role service_role; ${sql}; commit;`);
}

function normalizeFxCountryFixture() {
  runSql(`
    update public.country_profiles
    set status = 'disabled'
    where id = ${sqlLiteral(FIXTURE.countryId)}::uuid
      and country_code = 'TST'
      and currency_code = 'ECO';
  `);
  const activeCount = Number(runSql(`
    select count(*) from public.country_profiles where status = 'active';
  `).output);
  assert.equal(activeCount, 10, "C0 concurrency fixture must expose the canonical ten-country FX cohort.");
}

function initializeFx(game) {
  runSql(`
    insert into public.game_settings(game_session_id, stock_market_window)
    values (
      ${sqlLiteral(game.id)}::uuid,
      jsonb_build_object('timezone', 'UTC')
    )
    on conflict (game_session_id) do update
    set stock_market_window = excluded.stock_market_window;

    insert into public.country_economic_snapshots (
      game_session_id,
      country_profile_id,
      snapshot_sequence,
      effective_at,
      snapshot_label,
      difficulty_policy_profile_id,
      difficulty_preset,
      metadata,
      created_at
    )
    select
      ${sqlLiteral(game.id)}::uuid,
      country_row.id,
      0,
      clock_timestamp() - interval '2 minutes',
      'C0 multi-currency funding concurrency',
      difficulty_row.id,
      difficulty_row.preset_key,
      jsonb_build_object('source', 'multicurrency-funding-concurrency'),
      clock_timestamp() - interval '3 minutes'
    from public.country_profiles as country_row
    join public.difficulty_policy_profiles as difficulty_row
      on difficulty_row.preset_key = 'standard'
    where country_row.status = 'active';

    select public.initialize_fx_authority_for_game_v1(
      ${sqlLiteral(game.id)}::uuid,
      clock_timestamp() - interval '1 minute',
      true
    )::text;
  `);
}

function seedChecking(game, playerId, currencyCode, amount, suffix) {
  runSql(`
    select *
    from public.record_player_ledger_entry(
      ${sqlLiteral(game.id)}::uuid,
      ${sqlLiteral(playerId)}::uuid,
      'checking',
      ${amount},
      ${sqlLiteral(currencyCode)},
      'credit',
      'setup',
      'initial_balance_seed',
      ${sqlLiteral(playerId)}::uuid,
      'system',
      null,
      jsonb_build_object(
        'bankTransactionIdempotencyKey', ${sqlLiteral(`c0-concurrency-${suffix}`)}
      )
    );
  `);
}

function accountKey(game, playerId, currencyCode) {
  const key = runSql(`
    select account_row.public_key
    from public.bank_accounts as account_row
    join public.economic_parties as party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    where account_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and account_row.account_kind = 'checking'
      and account_row.status = 'active'
      and account_row.currency_code = ${sqlLiteral(currencyCode)}
      and party_row.party_kind = 'player'
      and party_row.player_id = ${sqlLiteral(playerId)}::uuid
      and party_row.status = 'active';
  `).output;
  assert.match(key, /^bac_[0-9a-f]{32}$/u);
  return key;
}

function businessAccountId(game) {
  const id = runSql(`
    select private.ensure_business_bank_account_identity_v1(
      ${sqlLiteral(game.id)}::uuid,
      ${sqlLiteral(game.businessId)}::uuid,
      'ECO'
    )::text;
  `).output;
  assert.match(id, /^[0-9a-f-]{36}$/u);
  return id;
}

function createQuote({
  game,
  playerId,
  sourceAccountKey,
  targetAmount,
  contextKey,
  contextHash = CONTEXT_HASH,
  idempotencyKey,
}) {
  return serviceJson(`
    select public.create_purchase_funding_quote_v1(
      ${sqlLiteral(game.id)}::uuid,
      ${sqlLiteral(playerId)}::uuid,
      'ECO',
      ${targetAmount},
      'concurrency_bill',
      ${sqlLiteral(contextKey)},
      ${sqlLiteral(contextHash)},
      ${sqlLiteral(JSON.stringify([
        { sourceAccountKey, targetAmount },
      ]))}::jsonb,
      ${sqlLiteral(idempotencyKey)}
    )::text
  `);
}

function quoteCall({
  game,
  playerId,
  sourceAccountKey,
  targetAmount,
  contextKey,
  contextHash = CONTEXT_HASH,
  idempotencyKey,
}) {
  return `public.create_purchase_funding_quote_v1(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(playerId)}::uuid,
    'ECO',
    ${targetAmount},
    'concurrency_bill',
    ${sqlLiteral(contextKey)},
    ${sqlLiteral(contextHash)},
    ${sqlLiteral(JSON.stringify([
      { sourceAccountKey, targetAmount },
    ]))}::jsonb,
    ${sqlLiteral(idempotencyKey)}
  )`;
}

function composeCall({
  game,
  playerId,
  quoteKey,
  targetAccountId,
  contextKey,
  contextHash = CONTEXT_HASH,
  idempotencyKey,
}) {
  return `private.compose_purchase_funding_v1(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(playerId)}::uuid,
    ${sqlLiteral(quoteKey)},
    'concurrency_bill',
    ${sqlLiteral(contextKey)},
    ${sqlLiteral(contextHash)},
    ${sqlLiteral(targetAccountId)}::uuid,
    'purchase_funding_concurrency',
    'settle_bill',
    null,
    ${sqlLiteral(idempotencyKey)},
    'system',
    null,
    clock_timestamp()
  )`;
}

function session(name) {
  const value = openPsqlSession(name);
  sessions.add(value);
  return value;
}

function closeSession(value) {
  if (value.child.exitCode === null) value.close();
  sessions.delete(value);
}

function parseMarkedJson(value, marker) {
  const prefix = `${marker}:`;
  const line = value.output.split(/\r?\n/u).find((entry) => entry.startsWith(prefix));
  assert.ok(line, `Missing ${marker} in psql output: ${value.output}\n${value.errors}`);
  return JSON.parse(line.slice(prefix.length));
}

function heldCallSql(call, resultMarker, holdMarker, { serviceRole = false } = {}) {
  return `begin;${serviceRole ? " set local role service_role;" : ""}
select ${sqlLiteral(`${resultMarker}:`)} || (${call})::text;
select ${sqlLiteral(holdMarker)};`;
}

function committedCallSql(call, resultMarker, doneMarker, { serviceRole = false } = {}) {
  return `begin;${serviceRole ? " set local role service_role;" : ""}
select ${sqlLiteral(`${resultMarker}:`)} || (${call})::text;
commit;
select ${sqlLiteral(doneMarker)};`;
}

function failingCallSql(call, { serviceRole = false } = {}) {
  return `begin;${serviceRole ? " set local role service_role;" : ""}
select (${call})::text;
commit;`;
}

async function quoteIdempotencyRace(ecoKey) {
  const call = quoteCall({
    game: gameOne,
    playerId: gameOne.buyerOneId,
    sourceAccountKey: ecoKey,
    targetAmount: 5,
    contextKey: "c0-quote-race",
    idempotencyKey: "c0-quote-race-idempotency",
  });
  const first = session("c0_quote_race_first");
  const second = session("c0_quote_race_second");
  try {
    await Promise.all([first.waitFor("SESSION_READY:"), second.waitFor("SESSION_READY:")]);
    first.write(heldCallSql(call, "QUOTE_FIRST_RESULT", "QUOTE_FIRST_HOLD", { serviceRole: true }));
    await first.waitFor("QUOTE_FIRST_HOLD");

    second.write(committedCallSql(call, "QUOTE_SECOND_RESULT", "QUOTE_SECOND_DONE", { serviceRole: true }));
    const wait = await pollForDatabaseWait("c0_quote_race_second");
    assert.equal(wait.waitEventType, "Lock");

    first.write("commit; select 'QUOTE_FIRST_DONE';");
    await first.waitFor("QUOTE_FIRST_DONE");
    await second.waitFor("QUOTE_SECOND_DONE");

    const firstResult = parseMarkedJson(first, "QUOTE_FIRST_RESULT");
    const secondResult = parseMarkedJson(second, "QUOTE_SECOND_RESULT");
    assert.equal(firstResult.outcome, "applied");
    assert.equal(secondResult.outcome, "replayed");
    assert.equal(secondResult.quote.quote_key, firstResult.quote.quote_key);
    assert.equal(
      Number(runSql(`select count(*) from public.purchase_funding_quotes
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and idempotency_key = 'c0-quote-race-idempotency';`).output),
      1,
    );
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

async function settlementReplayRace(ecoKey, targetAccountId) {
  const quote = createQuote({
    game: gameOne,
    playerId: gameOne.buyerOneId,
    sourceAccountKey: ecoKey,
    targetAmount: 10,
    contextKey: "c0-settlement-replay-race",
    idempotencyKey: "c0-settlement-replay-quote",
  });
  const call = composeCall({
    game: gameOne,
    playerId: gameOne.buyerOneId,
    quoteKey: quote.quote.quote_key,
    targetAccountId,
    contextKey: "c0-settlement-replay-race",
    idempotencyKey: "c0-settlement-replay-idem",
  });
  const first = session("c0_settlement_replay_first");
  const second = session("c0_settlement_replay_second");
  try {
    await Promise.all([first.waitFor("SESSION_READY:"), second.waitFor("SESSION_READY:")]);
    first.write(heldCallSql(call, "SETTLE_FIRST_RESULT", "SETTLE_FIRST_HOLD"));
    await first.waitFor("SETTLE_FIRST_HOLD");

    second.write(committedCallSql(call, "SETTLE_SECOND_RESULT", "SETTLE_SECOND_DONE"));
    const wait = await pollForDatabaseWait("c0_settlement_replay_second");
    assert.equal(wait.waitEventType, "Lock");

    first.write("commit; select 'SETTLE_FIRST_DONE';");
    await first.waitFor("SETTLE_FIRST_DONE");
    await second.waitFor("SETTLE_SECOND_DONE");

    const firstResult = parseMarkedJson(first, "SETTLE_FIRST_RESULT");
    const secondResult = parseMarkedJson(second, "SETTLE_SECOND_RESULT");
    assert.equal(firstResult.outcome, "applied");
    assert.equal(secondResult.outcome, "replayed");
    assert.equal(secondResult.receipt.receipt_key, firstResult.receipt.receipt_key);
    assert.equal(
      Number(runSql(`select count(*) from public.purchase_funding_receipts
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and idempotency_key = 'c0-settlement-replay-idem';`).output),
      1,
    );
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

async function sameAccountOverspendRace(ecoKey, targetAccountId) {
  const quoteA = createQuote({
    game: gameOne,
    playerId: gameOne.buyerOneId,
    sourceAccountKey: ecoKey,
    targetAmount: 300,
    contextKey: "c0-overspend-a",
    contextHash: "b".repeat(64),
    idempotencyKey: "c0-overspend-quote-a",
  });
  const quoteB = createQuote({
    game: gameOne,
    playerId: gameOne.buyerOneId,
    sourceAccountKey: ecoKey,
    targetAmount: 300,
    contextKey: "c0-overspend-b",
    contextHash: "c".repeat(64),
    idempotencyKey: "c0-overspend-quote-b",
  });
  const firstCall = composeCall({
    game: gameOne,
    playerId: gameOne.buyerOneId,
    quoteKey: quoteA.quote.quote_key,
    targetAccountId,
    contextKey: "c0-overspend-a",
    contextHash: "b".repeat(64),
    idempotencyKey: "c0-overspend-settle-a",
  });
  const secondCall = composeCall({
    game: gameOne,
    playerId: gameOne.buyerOneId,
    quoteKey: quoteB.quote.quote_key,
    targetAccountId,
    contextKey: "c0-overspend-b",
    contextHash: "c".repeat(64),
    idempotencyKey: "c0-overspend-settle-b",
  });
  const first = session("c0_overspend_first");
  const second = session("c0_overspend_second");
  try {
    await Promise.all([first.waitFor("SESSION_READY:"), second.waitFor("SESSION_READY:")]);
    first.write(heldCallSql(firstCall, "OVERSPEND_FIRST_RESULT", "OVERSPEND_FIRST_HOLD"));
    await first.waitFor("OVERSPEND_FIRST_HOLD");
    second.write(failingCallSql(secondCall));
    const wait = await pollForDatabaseWait("c0_overspend_second");
    assert.equal(wait.waitEventType, "Lock");

    first.write("commit; select 'OVERSPEND_FIRST_DONE';");
    await first.waitFor("OVERSPEND_FIRST_DONE");
    await second.waitFor("FUNDING_INSUFFICIENT");

    const firstResult = parseMarkedJson(first, "OVERSPEND_FIRST_RESULT");
    assert.equal(firstResult.outcome, "applied");
    assert.match(second.errors, /FUNDING_INSUFFICIENT/u);
    assert.equal(
      Number(runSql(`select count(*) from public.purchase_funding_receipts
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and idempotency_key in ('c0-overspend-settle-a','c0-overspend-settle-b');`).output),
      1,
    );
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

async function facilityOversubscriptionRace(nrcKeyOne, nrcKeyTwo, targetAccountId) {
  const cap = runJson(`
    select jsonb_build_object(
      'facilityCap', cap_row.facility_cap,
      'buffer', cap_row.operating_buffer_target,
      'reserveBalance', reserve_balance.balance,
      'clearingBalance', clearing_balance.balance
    )::text
    from private.fx_runtime_state as runtime
    join public.fx_liquidity_cap_snapshots as cap_row
      on cap_row.fixing_id = runtime.current_fixing_id
     and cap_row.game_session_id = runtime.game_session_id
     and cap_row.currency_code = 'ECO'
    join public.bank_accounts as reserve_account
      on reserve_account.game_session_id = runtime.game_session_id
     and reserve_account.account_kind = 'fx_reserve'
     and reserve_account.currency_code = 'ECO'
     and reserve_account.status = 'active'
    join public.economic_parties as reserve_party
      on reserve_party.id = reserve_account.party_id
     and reserve_party.game_session_id = reserve_account.game_session_id
     and reserve_party.system_key = 'fx.central-reserve'
    join public.account_balances as reserve_balance
      on reserve_balance.bank_account_id = reserve_account.id
     and reserve_balance.game_session_id = reserve_account.game_session_id
    join public.bank_accounts as clearing_account
      on clearing_account.game_session_id = runtime.game_session_id
     and clearing_account.account_kind = 'fx_clearing'
     and clearing_account.currency_code = 'ECO'
     and clearing_account.status = 'active'
    join public.economic_parties as clearing_party
      on clearing_party.id = clearing_account.party_id
     and clearing_party.game_session_id = clearing_account.game_session_id
     and clearing_party.system_key = 'fx.clearing-house'
    join public.account_balances as clearing_balance
      on clearing_balance.bank_account_id = clearing_account.id
     and clearing_balance.game_session_id = clearing_account.game_session_id
    where runtime.game_session_id = ${sqlLiteral(gameOne.id)}::uuid;
  `);
  const facilityCap = Number(cap.facilityCap);
  const targetAmount = Math.floor(facilityCap * 0.6 * 100) / 100;
  assert.ok(Number.isFinite(targetAmount) && targetAmount > Number(cap.buffer));
  assert.ok(targetAmount < 1_000_000_000_000_000);

  const quoteA = createQuote({
    game: gameOne,
    playerId: gameOne.buyerOneId,
    sourceAccountKey: nrcKeyOne,
    targetAmount,
    contextKey: "c0-facility-a",
    contextHash: "d".repeat(64),
    idempotencyKey: "c0-facility-quote-a",
  });
  const quoteB = createQuote({
    game: gameOne,
    playerId: gameOne.buyerTwoId,
    sourceAccountKey: nrcKeyTwo,
    targetAmount,
    contextKey: "c0-facility-b",
    contextHash: "e".repeat(64),
    idempotencyKey: "c0-facility-quote-b",
  });
  const firstCall = composeCall({
    game: gameOne,
    playerId: gameOne.buyerOneId,
    quoteKey: quoteA.quote.quote_key,
    targetAccountId,
    contextKey: "c0-facility-a",
    contextHash: "d".repeat(64),
    idempotencyKey: "c0-facility-settle-a",
  });
  const secondCall = composeCall({
    game: gameOne,
    playerId: gameOne.buyerTwoId,
    quoteKey: quoteB.quote.quote_key,
    targetAccountId,
    contextKey: "c0-facility-b",
    contextHash: "e".repeat(64),
    idempotencyKey: "c0-facility-settle-b",
  });
  const first = session("c0_facility_first");
  const second = session("c0_facility_second");
  try {
    await Promise.all([first.waitFor("SESSION_READY:"), second.waitFor("SESSION_READY:")]);
    first.write(heldCallSql(firstCall, "FACILITY_FIRST_RESULT", "FACILITY_FIRST_HOLD"));
    await first.waitFor("FACILITY_FIRST_HOLD");
    second.write(failingCallSql(secondCall));
    const wait = await pollForDatabaseWait("c0_facility_second");
    assert.equal(wait.waitEventType, "Lock");

    first.write("commit; select 'FACILITY_FIRST_DONE';");
    await first.waitFor("FACILITY_FIRST_DONE");
    await second.waitFor("FX_LIQUIDITY_UNAVAILABLE");

    assert.equal(parseMarkedJson(first, "FACILITY_FIRST_RESULT").outcome, "applied");
    assert.match(second.errors, /FX_LIQUIDITY_UNAVAILABLE/u);
    assert.equal(
      Number(runSql(`select count(*) from public.purchase_funding_receipts
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and idempotency_key in ('c0-facility-settle-a','c0-facility-settle-b');`).output),
      1,
    );
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

async function twoGameNonBlockingRace(ecoKeyOne, ecoKeyTwo, targetOne, targetTwo) {
  const quoteOne = createQuote({
    game: gameOne,
    playerId: gameOne.buyerTwoId,
    sourceAccountKey: ecoKeyOne,
    targetAmount: 5,
    contextKey: "c0-game-one-held",
    contextHash: "f".repeat(64),
    idempotencyKey: "c0-game-one-held-quote",
  });
  const quoteTwo = createQuote({
    game: gameTwo,
    playerId: gameTwo.buyerOneId,
    sourceAccountKey: ecoKeyTwo,
    targetAmount: 5,
    contextKey: "c0-game-two-free",
    contextHash: "1".repeat(64),
    idempotencyKey: "c0-game-two-free-quote",
  });
  const held = session("c0_game_one_held");
  try {
    await held.waitFor("SESSION_READY:");
    held.write(heldCallSql(composeCall({
      game: gameOne,
      playerId: gameOne.buyerTwoId,
      quoteKey: quoteOne.quote.quote_key,
      targetAccountId: targetOne,
      contextKey: "c0-game-one-held",
      contextHash: "f".repeat(64),
      idempotencyKey: "c0-game-one-held-settle",
    }), "GAME_ONE_RESULT", "GAME_ONE_HOLD"));
    await held.waitFor("GAME_ONE_HOLD");

    const gameTwoResult = runJson(`begin; select ${composeCall({
      game: gameTwo,
      playerId: gameTwo.buyerOneId,
      quoteKey: quoteTwo.quote.quote_key,
      targetAccountId: targetTwo,
      contextKey: "c0-game-two-free",
      contextHash: "1".repeat(64),
      idempotencyKey: "c0-game-two-free-settle",
    })}::text; commit;`);
    assert.equal(gameTwoResult.outcome, "applied");

    held.write("commit; select 'GAME_ONE_DONE';");
    await held.waitFor("GAME_ONE_DONE");
    assert.equal(parseMarkedJson(held, "GAME_ONE_RESULT").outcome, "applied");
  } finally {
    closeSession(held);
  }
}

resetFixture();
normalizeFxCountryFixture();
initializeFx(gameOne);
initializeFx(gameTwo);

// Seed after fixing/cap creation so fixture money cannot inflate the certified
// current liquidity cap used by the facility-race assertion.
seedChecking(gameOne, gameOne.buyerOneId, "ECO", 500, "g1-buyer1-eco-extra");
seedChecking(gameOne, gameOne.buyerTwoId, "ECO", 100, "g1-buyer2-eco-extra");
seedChecking(gameOne, gameOne.buyerOneId, "NRC", 1_000_000_000, "g1-buyer1-nrc");
seedChecking(gameOne, gameOne.buyerTwoId, "NRC", 1_000_000_000, "g1-buyer2-nrc");
seedChecking(gameTwo, gameTwo.buyerOneId, "ECO", 100, "g2-buyer1-eco-extra");

const ecoOneBuyerOne = accountKey(gameOne, gameOne.buyerOneId, "ECO");
const ecoOneBuyerTwo = accountKey(gameOne, gameOne.buyerTwoId, "ECO");
const nrcOneBuyerOne = accountKey(gameOne, gameOne.buyerOneId, "NRC");
const nrcOneBuyerTwo = accountKey(gameOne, gameOne.buyerTwoId, "NRC");
const ecoTwoBuyerOne = accountKey(gameTwo, gameTwo.buyerOneId, "ECO");
const targetOne = businessAccountId(gameOne);
const targetTwo = businessAccountId(gameTwo);

try {
  await quoteIdempotencyRace(ecoOneBuyerOne);
  await settlementReplayRace(ecoOneBuyerOne, targetOne);
  await sameAccountOverspendRace(ecoOneBuyerOne, targetOne);
  await facilityOversubscriptionRace(nrcOneBuyerOne, nrcOneBuyerTwo, targetOne);
  await twoGameNonBlockingRace(ecoOneBuyerTwo, ecoTwoBuyerOne, targetOne, targetTwo);
} finally {
  for (const value of sessions) closeSession(value);
}

const finalFacts = runJson(`select jsonb_build_object(
  'gameOneReceipts', (select count(*) from public.purchase_funding_receipts
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid),
  'gameTwoReceipts', (select count(*) from public.purchase_funding_receipts
    where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid),
  'compatibilityOffsetLines', (select count(*)
    from public.ledger_entries as ledger_row
    join public.bank_accounts as account_row
      on account_row.id = ledger_row.bank_account_id
     and account_row.game_session_id = ledger_row.game_session_id
    where ledger_row.game_session_id in (
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameTwo.id)}::uuid
    )
      and ledger_row.source_domain = 'purchase_funding_concurrency'
      and account_row.account_kind = 'compatibility_offset')
)::text;`);
assert.ok(Number(finalFacts.gameOneReceipts) >= 4);
assert.equal(Number(finalFacts.gameTwoReceipts), 1);
assert.equal(Number(finalFacts.compatibilityOffsetLines), 0);

console.log(JSON.stringify({
  ok: true,
  quoteIdempotencyRace: true,
  settlementReplayRace: true,
  sameAccountOverspendRace: true,
  facilityOversubscriptionRace: true,
  twoGameNonBlockingRace: true,
  canonicalCountryCohort: 10,
  compatibilityOffsetLines: Number(finalFacts.compatibilityOffsetLines),
}));
