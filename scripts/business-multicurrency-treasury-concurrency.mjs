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

const game = Object.freeze({
  ...FIXTURE.games.one,
  businessId: "50000000-0000-4000-8000-000000000011",
  businessKey: `biz_${"c".repeat(32)}`,
});
const sessions = new Set();

function initializeFixture() {
  resetFixture();
  runSql(`
    insert into public.business_entities (
      id, public_key, game_session_id, owner_player_id, legal_name, entity_type,
      industry_code, country_code, currency_code, status, capitalization,
      valuation, tax_classification, formation_state, ownership_model_version
    ) values (
      ${sqlLiteral(game.businessId)}::uuid, ${sqlLiteral(game.businessKey)},
      ${sqlLiteral(game.id)}::uuid, ${sqlLiteral(game.ownerId)}::uuid,
      'C4 Concurrency LLC', 'llc', 'manufacturing', 'TST', 'ECO', 'active',
      100, 100, 'disregarded', 'operational', 2
    );
    insert into public.business_ownership_positions (
      game_session_id, business_id, player_id, ownership_kind, units,
      voting_units, status, effective_at
    )
    select business_row.game_session_id, business_row.id,
      business_row.owner_player_id,
      public.business_ownership_kind_v2(business_row.entity_type),
      10000, 10000, 'active', business_row.created_at
    from public.business_entities business_row
    where business_row.id = ${sqlLiteral(game.businessId)}::uuid
      and not exists (
        select 1 from public.business_ownership_positions position_row
        where position_row.game_session_id = business_row.game_session_id
          and position_row.business_id = business_row.id
          and position_row.player_id = business_row.owner_player_id
          and position_row.status = 'active'
      );
    update public.country_profiles set status = 'disabled'
    where id = ${sqlLiteral(FIXTURE.countryId)}::uuid;
    insert into public.game_settings(game_session_id, stock_market_window)
    values (${sqlLiteral(game.id)}::uuid, jsonb_build_object('timezone', 'UTC'))
    on conflict (game_session_id) do update
    set stock_market_window = excluded.stock_market_window;
    insert into public.country_economic_snapshots (
      game_session_id, country_profile_id, snapshot_sequence, effective_at,
      snapshot_label, difficulty_policy_profile_id, difficulty_preset,
      metadata, created_at
    )
    select ${sqlLiteral(game.id)}::uuid, country_row.id, 0,
      statement_timestamp() - interval '2 minutes', 'C4 concurrency',
      difficulty_row.id, difficulty_row.preset_key,
      jsonb_build_object('source', 'business-multicurrency-treasury-concurrency'),
      statement_timestamp() - interval '3 minutes'
    from public.country_profiles country_row
    join public.difficulty_policy_profiles difficulty_row
      on difficulty_row.preset_key = 'standard'
    where country_row.status = 'active';
    select public.initialize_fx_authority_for_game_v1(
      ${sqlLiteral(game.id)}::uuid, clock_timestamp() - interval '1 minute', true
    );
    update public.country_profiles set status = 'active'
    where id = ${sqlLiteral(FIXTURE.countryId)}::uuid;
    update public.game_sessions set lifecycle_state = 'active', status = 'active'
    where id = ${sqlLiteral(game.id)}::uuid;
    insert into public.country_economic_snapshots (
      game_session_id, country_profile_id, snapshot_sequence, effective_at,
      snapshot_label, difficulty_policy_profile_id, difficulty_preset,
      metadata, created_at
    )
    select ${sqlLiteral(game.id)}::uuid, ${sqlLiteral(FIXTURE.countryId)}::uuid,
      0, statement_timestamp() - interval '1 minute', 'C4 TST concurrency',
      difficulty_row.id, difficulty_row.preset_key,
      jsonb_build_object('source', 'business-multicurrency-treasury-concurrency'),
      statement_timestamp() - interval '2 minutes'
    from public.difficulty_policy_profiles difficulty_row
    where difficulty_row.preset_key = 'standard';
    update public.store_items set stock_quantity = 40
    where id = ${sqlLiteral(game.storeItemId)}::uuid;
    select * from public.record_business_ledger_entry_v2(
      ${sqlLiteral(game.id)}::uuid, ${sqlLiteral(game.businessId)}::uuid,
      400, 'ECO', 'credit', 'business', 'capital_contribution_in',
      ${sqlLiteral(game.businessId)}::uuid, 'system', null,
      jsonb_build_object('bankTransactionIdempotencyKey', 'c4-concurrency-eco')
    );
  `);
}

function accountKey(currencyCode) {
  return runSql(`select account_row.public_key
    from public.bank_accounts account_row
    join public.economic_parties party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    where account_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and party_row.business_id = ${sqlLiteral(game.businessId)}::uuid
      and party_row.party_kind = 'business'
      and account_row.account_kind = 'checking'
      and account_row.legacy_account_type is null
      and account_row.currency_code = ${sqlLiteral(currencyCode)};`).output;
}

function quote({ quantity, allocations, idempotencyKey }) {
  return runJson(`begin; set local role service_role;
    select public.create_business_store_quote_v2(
      ${sqlLiteral(game.id)}::uuid, ${sqlLiteral(game.ownerId)}::uuid,
      'fixture_widget_one', ${quantity}, ${sqlLiteral(JSON.stringify(allocations))}::jsonb,
      ${sqlLiteral(idempotencyKey)}, statement_timestamp()
    )::text; commit;`);
}

function purchaseCall(quoteKey, idempotencyKey) {
  return `public.purchase_business_store_quote_v2(
    ${sqlLiteral(game.id)}::uuid, ${sqlLiteral(game.ownerId)}::uuid,
    ${sqlLiteral(quoteKey)}, ${sqlLiteral(idempotencyKey)},
    statement_timestamp(), '{}'::jsonb
  )`;
}

async function session(name) {
  const value = openPsqlSession(name);
  sessions.add(value);
  await value.waitFor("SESSION_READY:");
  return value;
}

function close(value) {
  if (value.child.exitCode === null) value.close();
  sessions.delete(value);
}

function heldCall(call, resultMarker, holdMarker) {
  return `begin; set local role service_role;
    select ${sqlLiteral(`${resultMarker}:`)} || (${call})::text;
    select ${sqlLiteral(holdMarker)};`;
}

function committedCall(call, resultMarker, doneMarker) {
  return `begin; set local role service_role;
    select ${sqlLiteral(`${resultMarker}:`)} || (${call})::text;
    commit; select ${sqlLiteral(doneMarker)};`;
}

function parseResult(value, marker) {
  const prefix = `${marker}:`;
  const line = value.output.split(/\r?\n/u).find((entry) => entry.startsWith(prefix));
  assert.ok(line, `Missing ${marker}: ${value.output}\n${value.errors}`);
  return JSON.parse(line.slice(prefix.length));
}

async function sameIdempotencyRace(ecoKey) {
  const funded = quote({
    quantity: 2,
    allocations: [{ sourceAccountKey: ecoKey, targetAmount: null }],
    idempotencyKey: "c4-concurrency-same-quote",
  });
  const call = purchaseCall(funded.quote_key, "c4-concurrency-same-purchase");
  const first = await session("c4_same_idempotency_first");
  const second = await session("c4_same_idempotency_second");
  try {
    first.write(heldCall(call, "C4_SAME_FIRST_RESULT", "C4_SAME_FIRST_HOLD"));
    await first.waitFor("C4_SAME_FIRST_HOLD");
    second.write(committedCall(call, "C4_SAME_SECOND_RESULT", "C4_SAME_SECOND_DONE"));
    const wait = await pollForDatabaseWait("c4_same_idempotency_second");
    assert.equal(wait.waitEventType, "Lock");
    first.write("commit; select 'C4_SAME_FIRST_DONE';");
    await first.waitFor("C4_SAME_FIRST_DONE");
    await second.waitFor("C4_SAME_SECOND_DONE");
    const firstResult = parseResult(first, "C4_SAME_FIRST_RESULT");
    const secondResult = parseResult(second, "C4_SAME_SECOND_RESULT");
    assert.equal(firstResult.already_completed, false);
    assert.equal(secondResult.already_completed, true);
    assert.equal(secondResult.receipt_key, firstResult.receipt_key);
    const facts = runJson(`select jsonb_build_object(
      'purchases', (select count(*) from public.business_store_purchases
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and idempotency_key = 'c4-concurrency-same-purchase'),
      'fundingReceipts', (select count(*) from public.purchase_funding_receipts
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and business_id = ${sqlLiteral(game.businessId)}::uuid
          and idempotency_key = 'c4-concurrency-same-purchase'),
      'inventoryTransactions', (select count(*) from public.inventory_transactions
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and source_action = 'store_procurement_purchase'
          and idempotency_key = 'business-store-funded:c4-concurrency-same-purchase')
    )::text;`);
    assert.deepEqual(facts, { purchases: 1, fundingReceipts: 1, inventoryTransactions: 1 });
  } finally {
    close(first);
    close(second);
  }
}

async function stockOverspendRace(ecoKey) {
  const firstQuote = quote({
    quantity: 20,
    allocations: [{ sourceAccountKey: ecoKey, targetAmount: null }],
    idempotencyKey: "c4-concurrency-stock-quote-a",
  });
  const secondQuote = quote({
    quantity: 20,
    allocations: [{ sourceAccountKey: ecoKey, targetAmount: null }],
    idempotencyKey: "c4-concurrency-stock-quote-b",
  });
  const first = await session("c4_stock_first");
  const second = await session("c4_stock_second");
  try {
    first.write(heldCall(
      purchaseCall(firstQuote.quote_key, "c4-concurrency-stock-purchase-a"),
      "C4_STOCK_FIRST_RESULT",
      "C4_STOCK_FIRST_HOLD",
    ));
    await first.waitFor("C4_STOCK_FIRST_HOLD");
    second.write(`begin; set local role service_role;
      do $c4$
      begin
        perform ${purchaseCall(secondQuote.quote_key, "c4-concurrency-stock-purchase-b")};
        raise exception 'C4_EXPECTED_STOCK_REJECTION_MISSING';
      exception when others then
        if position('INSUFFICIENT_STOCK' in sqlerrm) = 0 then
          raise;
        end if;
        raise notice 'C4_STOCK_SECOND_EXPECTED:INSUFFICIENT_STOCK';
      end
      $c4$;
      rollback; select 'C4_STOCK_SECOND_ROLLED_BACK';`);
    const wait = await pollForDatabaseWait("c4_stock_second");
    assert.equal(wait.waitEventType, "Lock");
    first.write("commit; select 'C4_STOCK_FIRST_DONE';");
    await first.waitFor("C4_STOCK_FIRST_DONE");
    await second.waitFor("C4_STOCK_SECOND_ROLLED_BACK");
    assert.match(second.errors, /INSUFFICIENT_STOCK/u);
    const facts = runJson(`select jsonb_build_object(
      'stock', (select stock_quantity from public.store_items
        where id = ${sqlLiteral(game.storeItemId)}::uuid),
      'applied', (select count(*) from public.business_store_purchases
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and idempotency_key in (
            'c4-concurrency-stock-purchase-a', 'c4-concurrency-stock-purchase-b'
          )),
      'failedReceipts', (select count(*) from public.purchase_funding_receipts
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and idempotency_key = 'c4-concurrency-stock-purchase-b')
    )::text;`);
    assert.deepEqual(facts, { stock: 18, applied: 1, failedReceipts: 0 });
  } finally {
    close(first);
    close(second);
  }
}

async function reverseAllocationRace(ecoKey, nrcKey) {
  const firstQuote = quote({
    quantity: 1,
    allocations: [
      { sourceAccountKey: ecoKey, targetAmount: "3" },
      { sourceAccountKey: nrcKey, targetAmount: null },
    ],
    idempotencyKey: "c4-concurrency-reverse-quote-a",
  });
  const secondQuote = quote({
    quantity: 1,
    allocations: [
      { sourceAccountKey: nrcKey, targetAmount: "3" },
      { sourceAccountKey: ecoKey, targetAmount: null },
    ],
    idempotencyKey: "c4-concurrency-reverse-quote-b",
  });
  const first = await session("c4_reverse_accounts_first");
  const second = await session("c4_reverse_accounts_second");
  try {
    first.write(heldCall(
      purchaseCall(firstQuote.quote_key, "c4-concurrency-reverse-purchase-a"),
      "C4_REVERSE_FIRST_RESULT",
      "C4_REVERSE_FIRST_HOLD",
    ));
    await first.waitFor("C4_REVERSE_FIRST_HOLD");
    second.write(committedCall(
      purchaseCall(secondQuote.quote_key, "c4-concurrency-reverse-purchase-b"),
      "C4_REVERSE_SECOND_RESULT",
      "C4_REVERSE_SECOND_DONE",
    ));
    const wait = await pollForDatabaseWait("c4_reverse_accounts_second");
    assert.equal(wait.waitEventType, "Lock");
    first.write("commit; select 'C4_REVERSE_FIRST_DONE';");
    await first.waitFor("C4_REVERSE_FIRST_DONE");
    await second.waitFor("C4_REVERSE_SECOND_DONE");
    assert.equal(parseResult(first, "C4_REVERSE_FIRST_RESULT").already_completed, false);
    assert.equal(parseResult(second, "C4_REVERSE_SECOND_RESULT").already_completed, false);
    const facts = runJson(`select jsonb_build_object(
      'purchases', count(*),
      'distinctFundingReceipts', count(distinct funding_receipt_id),
      'completed', count(*) filter (where status = 'COMPLETED')
    )::text from public.business_store_purchases
    where game_session_id = ${sqlLiteral(game.id)}::uuid
      and idempotency_key in (
        'c4-concurrency-reverse-purchase-a', 'c4-concurrency-reverse-purchase-b'
      );`);
    assert.deepEqual(facts, { purchases: 2, distinctFundingReceipts: 2, completed: 2 });
  } finally {
    close(first);
    close(second);
  }
}

async function accountOverspendRace(ecoKey) {
  // Both purchases remain independently stock-feasible after the winner. Their
  // combined debit exceeds cash, so the Banking lock—not Store stock—rejects
  // the loser and the enclosing command must roll all provisional rows back.
  runSql(`update public.store_items set stock_quantity = 40
    where id = ${sqlLiteral(game.storeItemId)}::uuid;`);
  const firstQuote = quote({
    quantity: 20,
    allocations: [{ sourceAccountKey: ecoKey, targetAmount: null }],
    idempotencyKey: "c4-concurrency-cash-quote-a",
  });
  const secondQuote = quote({
    quantity: 20,
    allocations: [{ sourceAccountKey: ecoKey, targetAmount: null }],
    idempotencyKey: "c4-concurrency-cash-quote-b",
  });
  const balanceBeforeText = runSql(`select balance_row.balance::text
    from public.account_balances balance_row
    join public.bank_accounts account_row
      on account_row.id = balance_row.bank_account_id
     and account_row.game_session_id = balance_row.game_session_id
    where account_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and account_row.public_key = ${sqlLiteral(ecoKey)};`).output;
  const balanceBefore = Number(balanceBeforeText);
  assert.ok(balanceBefore >= 150 && balanceBefore < 300);
  const inventoryBefore = Number(runSql(`select count(*)
    from public.inventory_transactions
    where game_session_id = ${sqlLiteral(game.id)}::uuid;`).output);
  const first = await session("c4_cash_first");
  const second = await session("c4_cash_second");
  try {
    first.write(heldCall(
      purchaseCall(firstQuote.quote_key, "c4-concurrency-cash-purchase-a"),
      "C4_CASH_FIRST_RESULT",
      "C4_CASH_FIRST_HOLD",
    ));
    await first.waitFor("C4_CASH_FIRST_HOLD");
    second.write(`begin; set local role service_role;
      do $c4$
      begin
        perform ${purchaseCall(secondQuote.quote_key, "c4-concurrency-cash-purchase-b")};
        raise exception 'C4_EXPECTED_FUNDING_REJECTION_MISSING';
      exception when others then
        if position('FUNDING_INSUFFICIENT' in sqlerrm) = 0 then
          raise;
        end if;
        raise notice 'C4_CASH_SECOND_EXPECTED:FUNDING_INSUFFICIENT';
      end
      $c4$;
      rollback; select 'C4_CASH_SECOND_ROLLED_BACK';`);
    const wait = await pollForDatabaseWait("c4_cash_second");
    assert.equal(wait.waitEventType, "Lock");
    first.write("commit; select 'C4_CASH_FIRST_DONE';");
    await first.waitFor("C4_CASH_FIRST_DONE");
    await second.waitFor("C4_CASH_SECOND_ROLLED_BACK");
    assert.match(second.errors, /FUNDING_INSUFFICIENT/u);
    const facts = runJson(`select jsonb_build_object(
      'stock', (select stock_quantity from public.store_items
        where id = ${sqlLiteral(game.storeItemId)}::uuid),
      'balance', (select balance_row.balance from public.account_balances balance_row
        join public.bank_accounts account_row
          on account_row.id = balance_row.bank_account_id
         and account_row.game_session_id = balance_row.game_session_id
        where account_row.game_session_id = ${sqlLiteral(game.id)}::uuid
          and account_row.public_key = ${sqlLiteral(ecoKey)}),
      'balanceMatches', (select balance_row.balance =
          ${sqlLiteral(balanceBeforeText)}::numeric - 150
        from public.account_balances balance_row
        join public.bank_accounts account_row
          on account_row.id = balance_row.bank_account_id
         and account_row.game_session_id = balance_row.game_session_id
        where account_row.game_session_id = ${sqlLiteral(game.id)}::uuid
          and account_row.public_key = ${sqlLiteral(ecoKey)}),
      'purchases', (select count(*) from public.business_store_purchases
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and idempotency_key in (
            'c4-concurrency-cash-purchase-a', 'c4-concurrency-cash-purchase-b'
          )),
      'loserPurchase', (select count(*) from public.business_store_purchases
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and idempotency_key = 'c4-concurrency-cash-purchase-b'),
      'loserFundingReceipt', (select count(*) from public.purchase_funding_receipts
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and idempotency_key = 'c4-concurrency-cash-purchase-b'),
      'newInventoryTransactions', (select count(*) from public.inventory_transactions
        where game_session_id = ${sqlLiteral(game.id)}::uuid) - ${inventoryBefore}
    )::text;`);
    assert.equal(facts.stock, 20, "Stock must be ample for the losing debit attempt.");
    assert.equal(facts.purchases, 1);
    assert.equal(facts.loserPurchase, 0);
    assert.equal(facts.loserFundingReceipt, 0);
    assert.equal(facts.newInventoryTransactions, 1);
    assert.equal(facts.balanceMatches, true);
    assert.ok(Number(facts.balance) >= 0);
  } finally {
    close(first);
    close(second);
  }
}

initializeFixture();
const openedNrc = runJson(`begin; set local role service_role;
  select public.ensure_business_banking_account_v1(
    ${sqlLiteral(game.id)}::uuid, ${sqlLiteral(game.ownerId)}::uuid,
    'NRC', 'c4-concurrency-open-nrc'
  )::text; commit;`);
assert.equal(openedNrc.outcome, "applied");
const ecoKey = accountKey("ECO");
const nrcKey = accountKey("NRC");
for (const key of [ecoKey, nrcKey]) assert.match(key, /^bac_[0-9a-f]{32}$/u);
const bootstrapNrcQuote = runJson(`begin; set local role service_role;
  select public.create_business_fx_quote_v1(
    ${sqlLiteral(game.id)}::uuid, ${sqlLiteral(game.ownerId)}::uuid,
    ${sqlLiteral(ecoKey)}, 'NRC', 20, 'instant',
    'c4-concurrency-bootstrap-nrc-quote', ${sqlLiteral(nrcKey)}
  )::text; commit;`);
const bootstrapNrc = runJson(`begin; set local role service_role;
  select public.execute_business_instant_fx_v1(
    ${sqlLiteral(game.id)}::uuid, ${sqlLiteral(game.ownerId)}::uuid,
    ${sqlLiteral(bootstrapNrcQuote.quote.quote_key)},
    'c4-concurrency-bootstrap-nrc-order'
  )::text; commit;`);
assert.equal(bootstrapNrc.order.status, "settled");

try {
  await sameIdempotencyRace(ecoKey);
  await stockOverspendRace(ecoKey);
  await reverseAllocationRace(ecoKey, nrcKey);
  await accountOverspendRace(ecoKey);
} finally {
  for (const value of sessions) close(value);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  phase: "BUSINESS-V2-10A4C4",
  sameIdempotencyReplay: true,
  concurrentStockOverspendPrevented: true,
  concurrentAccountOverspendPrevented: true,
  reverseAllocationOrderSerialized: true,
  duplicateProcurementPrevented: true,
})}\n`);
