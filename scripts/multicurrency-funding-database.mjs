#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  FIXTURE,
  expectSqlError,
  resetFixture,
  runJson,
  runSql,
  sqlLiteral,
} from "./business-phase10-atomic-settlement-database-support.mjs";

const gameOne = FIXTURE.games.one;
const gameTwo = FIXTURE.games.two;
const buyerOne = gameOne.buyerOneId;
const CONTEXT_HASH_ONE = "a".repeat(64);
const CONTEXT_HASH_TWO = "b".repeat(64);
const CONTEXT_HASH_ROLLBACK = "c".repeat(64);

function serviceJson(sql) {
  return runJson(`begin; set local role service_role; ${sql}; commit;`);
}

function accountKey(gameId, playerId, currencyCode) {
  return runSql(`
    select account_row.public_key
    from public.bank_accounts as account_row
    join public.economic_parties as party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    where account_row.game_session_id = ${sqlLiteral(gameId)}::uuid
      and account_row.account_kind = 'checking'
      and account_row.status = 'active'
      and account_row.currency_code = ${sqlLiteral(currencyCode)}
      and party_row.party_kind = 'player'
      and party_row.player_id = ${sqlLiteral(playerId)}::uuid
      and party_row.status = 'active';
  `).output;
}

function accountBalanceByKey(gameId, key) {
  return Number(runSql(`
    select balance_row.balance::text
    from public.account_balances as balance_row
    join public.bank_accounts as account_row
      on account_row.id = balance_row.bank_account_id
     and account_row.game_session_id = balance_row.game_session_id
    where balance_row.game_session_id = ${sqlLiteral(gameId)}::uuid
      and account_row.public_key = ${sqlLiteral(key)};
  `).output);
}

function businessBalance(game) {
  return Number(runSql(`
    select balance_row.balance::text
    from public.account_balances as balance_row
    where balance_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and balance_row.business_id = ${sqlLiteral(game.businessId)}::uuid
      and balance_row.currency_code = 'ECO';
  `).output);
}

function normalizeFxCountryFixture() {
  // The retained Phase 10A Store fixture adds one synthetic active TST country
  // for Store/Business identity. Canonical B1 deliberately requires exactly
  // ten active national countries, so C0 disables only that disposable helper
  // country before bootstrapping real B1/B2 FX state.
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
  assert.equal(activeCount, 10, "C0 fixture must expose the canonical ten-country FX cohort.");
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
      statement_timestamp() - interval '2 minutes',
      'C0 multi-currency funding acceptance',
      difficulty_row.id,
      difficulty_row.preset_key,
      jsonb_build_object('source', 'multicurrency-funding-database'),
      statement_timestamp() - interval '3 minutes'
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

  const state = runJson(`
    select jsonb_build_object(
      'runtimeReady', runtime.cutover_status = 'ready',
      'fixingKey', fixing_row.public_key,
      'fixingValues', (
        select count(*)
        from public.fx_fixing_currency_values as value_row
        where value_row.fixing_id = fixing_row.id
          and value_row.game_session_id = runtime.game_session_id
      ),
      'capCount', (
        select count(*)
        from public.fx_liquidity_cap_snapshots as cap_row
        where cap_row.game_session_id = runtime.game_session_id
          and cap_row.fixing_id = fixing_row.id
      ),
      'nextDueFuture', runtime.next_due_at > clock_timestamp()
    )::text
    from private.fx_runtime_state as runtime
    join public.fx_fixings as fixing_row
      on fixing_row.id = runtime.current_fixing_id
     and fixing_row.game_session_id = runtime.game_session_id
    where runtime.game_session_id = ${sqlLiteral(game.id)}::uuid;
  `);
  assert.equal(state.runtimeReady, true, "FX runtime did not become ready.");
  assert.match(state.fixingKey, /^fxf_[0-9a-f]{32}$/u);
  assert.equal(Number(state.fixingValues), 11, "Bootstrap fixing did not contain 11 currencies.");
  assert.equal(Number(state.capCount), 11, "B2 did not synchronize 11 liquidity caps from the fixing.");
  assert.equal(state.nextDueFuture, true, "FX runtime next fixing boundary is not in the future.");
}

function seedForeignChecking(game, playerId, currencyCode, amount, suffix) {
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
        'bankTransactionIdempotencyKey', ${sqlLiteral(`c0-${suffix}`)}
      )
    );
  `);
}

function createFundingQuote({
  game,
  playerId,
  targetAmount,
  contextKey,
  contextHash,
  allocations,
  idempotencyKey,
}) {
  return serviceJson(`
    select public.create_purchase_funding_quote_v1(
      ${sqlLiteral(game.id)}::uuid,
      ${sqlLiteral(playerId)}::uuid,
      'ECO',
      ${targetAmount},
      'acceptance_bill',
      ${sqlLiteral(contextKey)},
      ${sqlLiteral(contextHash)},
      ${sqlLiteral(JSON.stringify(allocations))}::jsonb,
      ${sqlLiteral(idempotencyKey)}
    )::text
  `);
}

resetFixture();
normalizeFxCountryFixture();
initializeFx(gameOne);
initializeFx(gameTwo);

seedForeignChecking(gameOne, buyerOne, "NRC", 100, "g1-buyer-nrc");
seedForeignChecking(gameOne, buyerOne, "YRC", 100, "g1-buyer-yrc");
seedForeignChecking(gameTwo, gameTwo.buyerOneId, "NRC", 100, "g2-buyer-nrc");

const ecoKey = accountKey(gameOne.id, buyerOne, "ECO");
const nrcKey = accountKey(gameOne.id, buyerOne, "NRC");
const yrcKey = accountKey(gameOne.id, buyerOne, "YRC");
for (const key of [ecoKey, nrcKey, yrcKey]) {
  assert.match(key, /^bac_[0-9a-f]{32}$/u);
}

// Two distinct quote commands in one transaction must not share pg_temp
// staging rows. This is the regression for the command-local stage wrapper.
runSql(`
  begin;
  set local role service_role;
  select public.create_purchase_funding_quote_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyerOne)}::uuid,
    'ECO', 4, 'acceptance_bill', 'c0-stage-isolation-a',
    ${sqlLiteral("7".repeat(64))},
    ${sqlLiteral(JSON.stringify([
      { sourceAccountKey: ecoKey, targetAmount: 4 },
    ]))}::jsonb,
    'c0-stage-isolation-quote-a'
  );
  select public.create_purchase_funding_quote_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyerOne)}::uuid,
    'ECO', 6, 'acceptance_bill', 'c0-stage-isolation-b',
    ${sqlLiteral("8".repeat(64))},
    ${sqlLiteral(JSON.stringify([
      { sourceAccountKey: nrcKey, targetAmount: 6 },
    ]))}::jsonb,
    'c0-stage-isolation-quote-b'
  );
  commit;
`);
const stageIsolation = runJson(`
  select jsonb_build_object(
    'quoteCount', count(*),
    'lineCounts', jsonb_object_agg(quote_row.idempotency_key, (
      select count(*)
      from public.purchase_funding_quote_lines as line_row
      where line_row.quote_id = quote_row.id
        and line_row.game_session_id = quote_row.game_session_id
    )),
    'targetAmounts', jsonb_object_agg(quote_row.idempotency_key, quote_row.target_amount)
  )::text
  from public.purchase_funding_quotes as quote_row
  where quote_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and quote_row.idempotency_key in (
      'c0-stage-isolation-quote-a',
      'c0-stage-isolation-quote-b'
    );
`);
assert.equal(Number(stageIsolation.quoteCount), 2);
assert.equal(Number(stageIsolation.lineCounts["c0-stage-isolation-quote-a"]), 1);
assert.equal(Number(stageIsolation.lineCounts["c0-stage-isolation-quote-b"]), 1);
assert.equal(Number(stageIsolation.targetAmounts["c0-stage-isolation-quote-a"]), 4);
assert.equal(Number(stageIsolation.targetAmounts["c0-stage-isolation-quote-b"]), 6);

const quoteResult = createFundingQuote({
  game: gameOne,
  playerId: buyerOne,
  targetAmount: 60,
  contextKey: "c0-acceptance-bill-one",
  contextHash: CONTEXT_HASH_ONE,
  allocations: [
    { sourceAccountKey: yrcKey, targetAmount: 20 },
    { sourceAccountKey: ecoKey, targetAmount: 20 },
    { sourceAccountKey: nrcKey, targetAmount: 20 },
  ],
  idempotencyKey: "c0-quote-three-account",
});
assert.equal(quoteResult.outcome, "applied");
assert.match(quoteResult.quote.quote_key, /^pfq_[0-9a-f]{32}$/u);
assert.equal(quoteResult.quote.target_currency_code, "ECO");
assert.equal(Number(quoteResult.quote.target_amount), 60);
assert.equal(quoteResult.quote.lines.length, 3);
assert.equal(quoteResult.quote.requires_fx, true);

const quoteKey = quoteResult.quote.quote_key;
const lineByCurrency = Object.fromEntries(
  quoteResult.quote.lines.map((line) => [line.source_currency_code, line]),
);
assert.equal(Number(lineByCurrency.ECO.target_contribution), 20);
assert.equal(Number(lineByCurrency.ECO.source_debit), 20);
assert.equal(Number(lineByCurrency.ECO.spread_rate), 0);
assert.equal(lineByCurrency.ECO.requires_fx, false);
for (const code of ["NRC", "YRC"]) {
  assert.equal(Number(lineByCurrency[code].target_contribution), 20);
  assert.equal(Number(lineByCurrency[code].spread_rate), 0.01);
  assert.equal(lineByCurrency[code].requires_fx, true);
  assert.ok(Number(lineByCurrency[code].customer_rate) < Number(lineByCurrency[code].reference_rate));
  assert.ok(Number(lineByCurrency[code].effective_rate) <= Number(lineByCurrency[code].customer_rate) + 1e-12);
}

const quoteFacts = runJson(`
  select jsonb_build_object(
    'quoteCount', count(distinct quote_row.id),
    'lineCount', count(line_row.id),
    'targetSum', sum(line_row.target_contribution),
    'foreignTargetSum', sum(line_row.target_contribution) filter (where line_row.requires_fx),
    'holdCount', (
      select count(*) from public.bank_account_holds
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and source_domain = 'purchase_funding'
    )
  )::text
  from public.purchase_funding_quotes as quote_row
  join public.purchase_funding_quote_lines as line_row
    on line_row.quote_id = quote_row.id
   and line_row.game_session_id = quote_row.game_session_id
  where quote_row.public_key = ${sqlLiteral(quoteKey)};
`);
assert.equal(Number(quoteFacts.quoteCount), 1);
assert.equal(Number(quoteFacts.lineCount), 3);
assert.equal(Number(quoteFacts.targetSum), 60);
assert.equal(Number(quoteFacts.foreignTargetSum), 40);
assert.equal(Number(quoteFacts.holdCount), 0, "Quote creation must not reserve funds.");

const replayQuote = createFundingQuote({
  game: gameOne,
  playerId: buyerOne,
  targetAmount: 60,
  contextKey: "c0-acceptance-bill-one",
  contextHash: CONTEXT_HASH_ONE,
  allocations: [
    { sourceAccountKey: nrcKey, targetAmount: 20 },
    { sourceAccountKey: yrcKey, targetAmount: 20 },
    { sourceAccountKey: ecoKey, targetAmount: 20 },
  ],
  idempotencyKey: "c0-quote-three-account",
});
assert.equal(replayQuote.outcome, "replayed");
assert.equal(replayQuote.quote.quote_key, quoteKey);

expectSqlError(`
  begin; set local role service_role;
  select public.create_purchase_funding_quote_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyerOne)}::uuid,
    'ECO', 60, 'acceptance_bill', 'c0-acceptance-bill-one',
    ${sqlLiteral(CONTEXT_HASH_ONE)},
    ${sqlLiteral(JSON.stringify([
      { sourceAccountKey: ecoKey, targetAmount: 10 },
      { sourceAccountKey: nrcKey, targetAmount: 20 },
      { sourceAccountKey: yrcKey, targetAmount: 30 },
    ]))}::jsonb,
    'c0-quote-three-account'
  );
  commit;
`, /PURCHASE_FUNDING_QUOTE_CONFLICT/u);

expectSqlError(`
  begin; set local role service_role;
  select public.create_purchase_funding_quote_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyerOne)}::uuid,
    'ECO', 60, 'acceptance_bill', 'c0-invalid-total',
    ${sqlLiteral("d".repeat(64))},
    ${sqlLiteral(JSON.stringify([
      { sourceAccountKey: ecoKey, targetAmount: 20 },
      { sourceAccountKey: nrcKey, targetAmount: 20 },
    ]))}::jsonb,
    'c0-invalid-total'
  );
  commit;
`, /PURCHASE_FUNDING_TOTAL_MISMATCH/u);

expectSqlError(`
  begin; set local role service_role;
  select public.create_purchase_funding_quote_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyerOne)}::uuid,
    'ECO', 60, 'acceptance_bill', 'c0-duplicate-account',
    ${sqlLiteral("e".repeat(64))},
    ${sqlLiteral(JSON.stringify([
      { sourceAccountKey: ecoKey, targetAmount: 20 },
      { sourceAccountKey: ecoKey, targetAmount: 40 },
    ]))}::jsonb,
    'c0-duplicate-account'
  );
  commit;
`, /PURCHASE_FUNDING_DUPLICATE_ACCOUNT/u);

expectSqlError(`
  begin; set local role service_role;
  select public.create_purchase_funding_quote_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyerOne)}::uuid,
    'ECO', 60, 'acceptance_bill', 'c0-four-account',
    ${sqlLiteral("f".repeat(64))},
    ${sqlLiteral(JSON.stringify([
      { sourceAccountKey: ecoKey, targetAmount: 15 },
      { sourceAccountKey: nrcKey, targetAmount: 15 },
      { sourceAccountKey: yrcKey, targetAmount: 15 },
      { sourceAccountKey: `bac_${"9".repeat(32)}`, targetAmount: 15 },
    ]))}::jsonb,
    'c0-four-account'
  );
  commit;
`, /PURCHASE_FUNDING_QUOTE_REQUEST_INVALID/u);

const targetAccountId = runSql(`
  select private.ensure_business_bank_account_identity_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.businessId)}::uuid,
    'ECO'
  )::text;
`).output;
assert.match(targetAccountId, /^[0-9a-f-]{36}$/u);

const balancesBefore = Object.fromEntries(
  [ecoKey, nrcKey, yrcKey].map((key) => [key, accountBalanceByKey(gameOne.id, key)]),
);
const businessBefore = businessBalance(gameOne);
const bankTransactionsBefore = Number(runSql(`
  select count(*) from public.bank_transactions
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid;
`).output);

const settlement = runJson(`
  begin;
  select private.compose_purchase_funding_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyerOne)}::uuid,
    ${sqlLiteral(quoteKey)},
    'acceptance_bill',
    'c0-acceptance-bill-one',
    ${sqlLiteral(CONTEXT_HASH_ONE)},
    ${sqlLiteral(targetAccountId)}::uuid,
    'purchase_funding_test',
    'settle_bill',
    null,
    'c0-settle-three-account',
    'system',
    null,
    clock_timestamp()
  )::text;
  commit;
`);
assert.equal(settlement.outcome, "applied");
assert.match(settlement.receipt.receipt_key, /^pfr_[0-9a-f]{32}$/u);
assert.equal(settlement.receipt.quote_key, quoteKey);
assert.equal(Number(settlement.receipt.target_amount), 60);
assert.equal(settlement.receipt.target_currency_code, "ECO");

const businessAfter = businessBalance(gameOne);
assert.equal(businessAfter - businessBefore, 60, "Recipient did not receive the exact bill once.");
for (const code of ["ECO", "NRC", "YRC"]) {
  const line = lineByCurrency[code];
  const key = line.source_account_key;
  const after = accountBalanceByKey(gameOne.id, key);
  const delta = balancesBefore[key] - after;
  assert.ok(Math.abs(delta - Number(line.source_debit)) < 1e-9, `${code} source debit did not match the quote.`);
}

const receiptKey = settlement.receipt.receipt_key;
const settlementFacts = runJson(`
  with receipt as (
    select * from public.purchase_funding_receipts
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and public_key = ${sqlLiteral(receiptKey)}
  )
  select jsonb_build_object(
    'receiptCount', (select count(*) from receipt),
    'transactionCount', (
      select count(*) from public.bank_transactions as tx
      join receipt on receipt.bank_transaction_id = tx.id
      where tx.posting_version = 'balanced_v2'
    ),
    'currencyNetsZero', not exists (
      select 1
      from public.ledger_entries as ledger_row
      join receipt on receipt.bank_transaction_id = ledger_row.bank_transaction_id
      group by ledger_row.currency_code
      having sum(ledger_row.amount) <> 0
    ),
    'recipientCreditCount', (
      select count(*) from public.ledger_entries as ledger_row
      join receipt on receipt.bank_transaction_id = ledger_row.bank_transaction_id
      where ledger_row.bank_account_id = receipt.target_account_id
        and ledger_row.amount = receipt.target_amount
        and ledger_row.line_metadata ->> 'lineRole' = 'purchase_funding_recipient_credit'
    ),
    'compatibilityOffsetLines', (
      select count(*) from public.ledger_entries as ledger_row
      join receipt on receipt.bank_transaction_id = ledger_row.bank_transaction_id
      join public.bank_accounts as account_row on account_row.id = ledger_row.bank_account_id
      where account_row.account_kind = 'compatibility_offset'
    ),
    'playerFxOrders', (
      select count(*) from public.fx_orders
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    ),
    'playerFxReceipts', (
      select count(*) from public.fx_settlement_receipts
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    )
  )::text;
`);
assert.equal(Number(settlementFacts.receiptCount), 1);
assert.equal(Number(settlementFacts.transactionCount), 1);
assert.equal(settlementFacts.currencyNetsZero, true);
assert.equal(Number(settlementFacts.recipientCreditCount), 1);
assert.equal(Number(settlementFacts.compatibilityOffsetLines), 0);
assert.equal(Number(settlementFacts.playerFxOrders), 0, "Checkout funding must not create a bank FX order.");
assert.equal(Number(settlementFacts.playerFxReceipts), 0, "Checkout funding must not create a bank FX receipt.");

const replayBefore = runJson(`
  select jsonb_build_object(
    'receiptCount', (select count(*) from public.purchase_funding_receipts where game_session_id = ${sqlLiteral(gameOne.id)}::uuid),
    'transactionCount', (select count(*) from public.bank_transactions where game_session_id = ${sqlLiteral(gameOne.id)}::uuid),
    'businessBalance', ${businessAfter},
    'eco', ${accountBalanceByKey(gameOne.id, ecoKey)},
    'nrc', ${accountBalanceByKey(gameOne.id, nrcKey)},
    'yrc', ${accountBalanceByKey(gameOne.id, yrcKey)}
  )::text;
`);
const replaySettlement = runJson(`
  begin;
  select private.compose_purchase_funding_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyerOne)}::uuid,
    ${sqlLiteral(quoteKey)},
    'acceptance_bill', 'c0-acceptance-bill-one', ${sqlLiteral(CONTEXT_HASH_ONE)},
    ${sqlLiteral(targetAccountId)}::uuid,
    'purchase_funding_test', 'settle_bill', null,
    'c0-settle-three-account', 'system', null, clock_timestamp()
  )::text;
  commit;
`);
assert.equal(replaySettlement.outcome, "replayed");
assert.equal(replaySettlement.receipt.receipt_key, receiptKey);
const replayAfter = runJson(`
  select jsonb_build_object(
    'receiptCount', (select count(*) from public.purchase_funding_receipts where game_session_id = ${sqlLiteral(gameOne.id)}::uuid),
    'transactionCount', (select count(*) from public.bank_transactions where game_session_id = ${sqlLiteral(gameOne.id)}::uuid),
    'businessBalance', (select balance from public.account_balances where game_session_id = ${sqlLiteral(gameOne.id)}::uuid and business_id = ${sqlLiteral(gameOne.businessId)}::uuid and currency_code = 'ECO'),
    'eco', (select balance from public.account_balances b join public.bank_accounts a on a.id=b.bank_account_id where a.public_key=${sqlLiteral(ecoKey)}),
    'nrc', (select balance from public.account_balances b join public.bank_accounts a on a.id=b.bank_account_id where a.public_key=${sqlLiteral(nrcKey)}),
    'yrc', (select balance from public.account_balances b join public.bank_accounts a on a.id=b.bank_account_id where a.public_key=${sqlLiteral(yrcKey)})
  )::text;
`);
assert.deepEqual(replayAfter, replayBefore, "Composer replay changed authoritative state.");

const rollbackQuote = createFundingQuote({
  game: gameOne,
  playerId: buyerOne,
  targetAmount: 10,
  contextKey: "c0-rollback-bill",
  contextHash: CONTEXT_HASH_ROLLBACK,
  allocations: [{ sourceAccountKey: ecoKey, targetAmount: 10 }],
  idempotencyKey: "c0-rollback-quote",
});
const rollbackQuoteKey = rollbackQuote.quote.quote_key;
const rollbackBefore = runJson(`
  select jsonb_build_object(
    'receipts', (select count(*) from public.purchase_funding_receipts where game_session_id = ${sqlLiteral(gameOne.id)}::uuid),
    'transactions', (select count(*) from public.bank_transactions where game_session_id = ${sqlLiteral(gameOne.id)}::uuid),
    'buyer', (select balance from public.account_balances b join public.bank_accounts a on a.id=b.bank_account_id where a.public_key=${sqlLiteral(ecoKey)}),
    'business', (select balance from public.account_balances where game_session_id=${sqlLiteral(gameOne.id)}::uuid and business_id=${sqlLiteral(gameOne.businessId)}::uuid and currency_code='ECO')
  )::text;
`);
runSql(`
  do $rollback$
  begin
    begin
      perform private.compose_purchase_funding_v1(
        ${sqlLiteral(gameOne.id)}::uuid,
        ${sqlLiteral(buyerOne)}::uuid,
        ${sqlLiteral(rollbackQuoteKey)},
        'acceptance_bill', 'c0-rollback-bill', ${sqlLiteral(CONTEXT_HASH_ROLLBACK)},
        ${sqlLiteral(targetAccountId)}::uuid,
        'purchase_funding_test', 'rollback_probe', null,
        'c0-rollback-settlement', 'system', null, clock_timestamp()
      );
      raise exception 'C0_FORCED_DOMAIN_ROLLBACK';
    exception
      when others then
        if sqlerrm <> 'C0_FORCED_DOMAIN_ROLLBACK' then
          raise;
        end if;
    end;
  end;
  $rollback$;
`);
const rollbackAfter = runJson(`
  select jsonb_build_object(
    'receipts', (select count(*) from public.purchase_funding_receipts where game_session_id = ${sqlLiteral(gameOne.id)}::uuid),
    'transactions', (select count(*) from public.bank_transactions where game_session_id = ${sqlLiteral(gameOne.id)}::uuid),
    'buyer', (select balance from public.account_balances b join public.bank_accounts a on a.id=b.bank_account_id where a.public_key=${sqlLiteral(ecoKey)}),
    'business', (select balance from public.account_balances where game_session_id=${sqlLiteral(gameOne.id)}::uuid and business_id=${sqlLiteral(gameOne.businessId)}::uuid and currency_code='ECO')
  )::text;
`);
assert.deepEqual(rollbackAfter, rollbackBefore, "Owning-domain rollback did not erase all funding mutation.");

const gameTwoEcoKey = accountKey(gameTwo.id, gameTwo.buyerOneId, "ECO");
const gameTwoNrcKey = accountKey(gameTwo.id, gameTwo.buyerOneId, "NRC");
const gameTwoQuote = createFundingQuote({
  game: gameTwo,
  playerId: gameTwo.buyerOneId,
  targetAmount: 10,
  contextKey: "c0-game-two-bill",
  contextHash: CONTEXT_HASH_TWO,
  allocations: [
    { sourceAccountKey: gameTwoEcoKey, targetAmount: 5 },
    { sourceAccountKey: gameTwoNrcKey, targetAmount: 5 },
  ],
  idempotencyKey: "c0-game-two-quote",
});
assert.match(gameTwoQuote.quote.quote_key, /^pfq_[0-9a-f]{32}$/u);
assert.notEqual(gameTwoQuote.quote.quote_key, quoteKey);

expectSqlError(`
  select private.compose_purchase_funding_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyerOne)}::uuid,
    ${sqlLiteral(gameTwoQuote.quote.quote_key)},
    'acceptance_bill', 'c0-game-two-bill', ${sqlLiteral(CONTEXT_HASH_TWO)},
    ${sqlLiteral(targetAccountId)}::uuid,
    'purchase_funding_test', 'cross_game_probe', null,
    'c0-cross-game-probe', 'system', null, clock_timestamp()
  );
`, /PURCHASE_FUNDING_QUOTE_NOT_FOUND/u);

const gameIsolation = runJson(`
  select jsonb_build_object(
    'gameOneQuotes', (select count(*) from public.purchase_funding_quotes where game_session_id=${sqlLiteral(gameOne.id)}::uuid),
    'gameTwoQuotes', (select count(*) from public.purchase_funding_quotes where game_session_id=${sqlLiteral(gameTwo.id)}::uuid),
    'crossScopedRows', (
      select count(*)
      from public.purchase_funding_quote_lines as line_row
      join public.purchase_funding_quotes as quote_row on quote_row.id = line_row.quote_id
      where line_row.game_session_id <> quote_row.game_session_id
    )
  )::text;
`);
assert.ok(Number(gameIsolation.gameOneQuotes) >= 4);
assert.equal(Number(gameIsolation.gameTwoQuotes), 1);
assert.equal(Number(gameIsolation.crossScopedRows), 0);

const bankTransactionsAfter = Number(runSql(`
  select count(*) from public.bank_transactions
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid;
`).output);
assert.ok(bankTransactionsAfter > bankTransactionsBefore);

process.stdout.write(`${JSON.stringify({
  ok: true,
  phase: "10A4C0",
  quoteKey,
  receiptKey,
  sourceAccounts: 3,
  targetAmount: 60,
  quoteStageIsolation: true,
  currencyNetsZero: settlementFacts.currencyNetsZero,
  compatibilityOffsetLines: Number(settlementFacts.compatibilityOffsetLines),
  replayZeroDelta: true,
  rollbackZeroDelta: true,
  twoGameIsolation: true,
})}\n`);
