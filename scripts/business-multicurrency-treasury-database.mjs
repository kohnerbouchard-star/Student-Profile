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

const gameOne = Object.freeze({
  ...FIXTURE.games.one,
  businessId: "50000000-0000-4000-8000-000000000001",
  businessKey: `biz_${"a".repeat(32)}`,
});
const gameTwo = Object.freeze({
  ...FIXTURE.games.two,
  businessId: "50000000-0000-4000-8000-000000000002",
  businessKey: `biz_${"b".repeat(32)}`,
});

function serviceJson(sql) {
  return runJson(`begin; set local role service_role; ${sql}; commit;`);
}

function procurementAtomicState(game, input) {
  return runJson(`select jsonb_build_object(
    'sourceAccount', (select jsonb_build_object(
      'balance', balance_row.balance,
      'lastLedgerEntryId', balance_row.last_ledger_entry_id,
      'updatedAt', balance_row.updated_at
    )
    from public.account_balances balance_row
    join public.bank_accounts account_row
      on account_row.id = balance_row.bank_account_id
     and account_row.game_session_id = balance_row.game_session_id
    where account_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and account_row.public_key = ${sqlLiteral(input.sourceAccountKey)}),
    'targetAccount', (select jsonb_build_object(
      'balance', balance_row.balance,
      'lastLedgerEntryId', balance_row.last_ledger_entry_id,
      'updatedAt', balance_row.updated_at
    )
    from public.account_balances balance_row
    join public.bank_accounts account_row
      on account_row.id = balance_row.bank_account_id
     and account_row.game_session_id = balance_row.game_session_id
    where account_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and account_row.public_key = ${sqlLiteral(input.targetAccountKey)}),
    'bankTransactions', (select count(*) from public.bank_transactions
      where game_session_id = ${sqlLiteral(game.id)}::uuid),
    'ledgerEntries', (select count(*) from public.ledger_entries
      where game_session_id = ${sqlLiteral(game.id)}::uuid),
    'fundingReceipts', (select count(*) from public.purchase_funding_receipts
      where game_session_id = ${sqlLiteral(game.id)}::uuid),
    'storeQuotes', (select count(*) from public.business_store_purchase_quotes
      where game_session_id = ${sqlLiteral(game.id)}::uuid),
    'storePurchases', (select count(*) from public.business_store_purchases
      where game_session_id = ${sqlLiteral(game.id)}::uuid),
    'specificPurchaseRows', (select count(*)
      from public.business_store_purchases
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and idempotency_key = ${sqlLiteral(input.purchaseIdempotencyKey)}),
    'inventoryTransactions', (select count(*)
      from public.inventory_transactions
      where game_session_id = ${sqlLiteral(game.id)}::uuid),
    'inventoryTransactionLines', (select count(*)
      from public.inventory_transaction_lines
      where game_session_id = ${sqlLiteral(game.id)}::uuid),
    'inventoryEvents', (select count(*) from public.inventory_events
      where game_session_id = ${sqlLiteral(game.id)}::uuid),
    'activityRows', (select count(*) from public.business_activity_events
      where game_session_id = ${sqlLiteral(game.id)}::uuid),
    'auditRows', (select count(*) from public.audit_log
      where game_session_id = ${sqlLiteral(game.id)}::uuid),
    'quoteState', (select jsonb_build_object(
      'status', quote_row.status,
      'usedAt', quote_row.used_at,
      'cancelledAt', quote_row.cancelled_at,
      'allFundingBindingsNull',
        quote_row.funding_quote_id is null
        and quote_row.funding_context_hash is null
        and quote_row.target_bank_account_id is null
        and quote_row.funding_idempotency_key is null
        and quote_row.funding_allocations is null
    ) from public.business_store_purchase_quotes quote_row
      where quote_row.game_session_id = ${sqlLiteral(game.id)}::uuid
        and quote_row.public_key = ${sqlLiteral(input.quoteKey)}),
    'storeState', (select jsonb_build_object(
      'stockQuantity', store_row.stock_quantity,
      'updatedAt', store_row.updated_at
    ) from public.store_items store_row
      where store_row.id = ${sqlLiteral(game.storeItemId)}::uuid),
    'storeHolding', (select jsonb_build_object(
      'quantityOwned', holding_row.quantity_owned,
      'quantityReserved', holding_row.quantity_reserved,
      'averageUnitCost', holding_row.average_unit_cost,
      'costCurrencyCode', holding_row.cost_currency_code,
      'version', holding_row.version,
      'updatedAt', holding_row.updated_at
    )
    from public.store_items store_row
    join public.inventory_holdings holding_row
      on holding_row.game_session_id = store_row.game_session_id
     and holding_row.inventory_account_id = store_row.inventory_account_id
     and holding_row.game_item_id = store_row.game_item_id
    where store_row.id = ${sqlLiteral(game.storeItemId)}::uuid),
    'warehouseHolding', (select jsonb_build_object(
      'quantityOwned', holding_row.quantity_owned,
      'quantityReserved', holding_row.quantity_reserved,
      'averageUnitCost', holding_row.average_unit_cost,
      'costCurrencyCode', holding_row.cost_currency_code,
      'version', holding_row.version,
      'updatedAt', holding_row.updated_at
    )
    from public.inventory_holdings holding_row
    join public.inventory_accounts account_row
      on account_row.id = holding_row.inventory_account_id
     and account_row.game_session_id = holding_row.game_session_id
    join public.economic_parties party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    where holding_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and party_row.party_kind = 'business'
      and party_row.business_id = ${sqlLiteral(game.businessId)}::uuid
      and account_row.account_kind = 'warehouse'
      and holding_row.game_item_id = ${sqlLiteral(game.gameItemId)}::uuid)
  )::text;`);
}

function initializeFx(game) {
  runSql(`
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
      statement_timestamp() - interval '2 minutes',
      'C4 Business Treasury disposable acceptance', difficulty_row.id,
      difficulty_row.preset_key,
      jsonb_build_object('source', 'business-multicurrency-treasury-database'),
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
  const state = runJson(`select jsonb_build_object(
    'ready', runtime.cutover_status = 'ready',
    'fixing', fixing_row.public_key,
    'values', (select count(*) from public.fx_fixing_currency_values value_row
      where value_row.game_session_id = runtime.game_session_id
        and value_row.fixing_id = fixing_row.id),
    'caps', (select count(*) from public.fx_liquidity_cap_snapshots cap_row
      where cap_row.game_session_id = runtime.game_session_id
        and cap_row.fixing_id = fixing_row.id)
  )::text
  from private.fx_runtime_state runtime
  join public.fx_fixings fixing_row
    on fixing_row.id = runtime.current_fixing_id
   and fixing_row.game_session_id = runtime.game_session_id
  where runtime.game_session_id = ${sqlLiteral(game.id)}::uuid;`);
  assert.equal(state.ready, true);
  assert.match(state.fixing, /^fxf_[0-9a-f]{32}$/u);
  assert.equal(Number(state.values), 11);
  assert.equal(Number(state.caps), 11);
}

function accountKey(game, currencyCode) {
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
      and account_row.currency_code = ${sqlLiteral(currencyCode)}
      and account_row.status = 'active';`).output;
}

function openAccount(game, currencyCode, idempotencyKey) {
  return serviceJson(`select public.ensure_business_banking_account_v1(
    ${sqlLiteral(game.id)}::uuid, ${sqlLiteral(game.ownerId)}::uuid,
    ${sqlLiteral(currencyCode)}, ${sqlLiteral(idempotencyKey)}
  )::text`);
}

function seedBusiness(game, currencyCode, amount, suffix) {
  runSql(`select * from public.record_business_ledger_entry_v2(
    ${sqlLiteral(game.id)}::uuid, ${sqlLiteral(game.businessId)}::uuid,
    ${amount}, ${sqlLiteral(currencyCode)}, 'credit', 'business',
    'capital_contribution_in', ${sqlLiteral(game.businessId)}::uuid,
    'system', null,
    jsonb_build_object('bankTransactionIdempotencyKey', ${sqlLiteral(`c4-${suffix}`)})
  );`);
}

function balance(game, key) {
  return Number(runSql(`select balance_row.balance::text
    from public.account_balances balance_row
    join public.bank_accounts account_row
      on account_row.id = balance_row.bank_account_id
     and account_row.game_session_id = balance_row.game_session_id
    where account_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and account_row.public_key = ${sqlLiteral(key)};`).output);
}

function balanceText(game, key) {
  return runSql(`select balance_row.balance::text
    from public.account_balances balance_row
    join public.bank_accounts account_row
      on account_row.id = balance_row.bank_account_id
     and account_row.game_session_id = balance_row.game_session_id
    where account_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and account_row.public_key = ${sqlLiteral(key)};`).output;
}

resetFixture();

// The shared Phase 10 fixture predates owner-position resolution. C4 resolves
// controller authority through canonical active v2 ownership evidence.
runSql(`insert into public.business_entities (
  id, public_key, game_session_id, owner_player_id, legal_name, entity_type,
  industry_code, country_code, currency_code, status, capitalization, valuation,
  tax_classification, formation_state, ownership_model_version
) values
  (${sqlLiteral(gameOne.businessId)}::uuid, ${sqlLiteral(gameOne.businessKey)},
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    'C4 Treasury One LLC', 'llc', 'manufacturing', 'TST', 'ECO', 'active',
    100, 100, 'disregarded', 'operational', 2),
  (${sqlLiteral(gameTwo.businessId)}::uuid, ${sqlLiteral(gameTwo.businessKey)},
    ${sqlLiteral(gameTwo.id)}::uuid, ${sqlLiteral(gameTwo.ownerId)}::uuid,
    'C4 Treasury Two LLC', 'llc', 'manufacturing', 'TST', 'ECO', 'active',
    100, 100, 'disregarded', 'operational', 2);

insert into public.business_ownership_positions (
  game_session_id, business_id, player_id, ownership_kind, units,
  voting_units, status, effective_at
)
select business_row.game_session_id, business_row.id,
  business_row.owner_player_id,
  public.business_ownership_kind_v2(business_row.entity_type),
  10000, 10000, 'active', business_row.created_at
from public.business_entities business_row
where business_row.id in (
  ${sqlLiteral(gameOne.businessId)}::uuid,
  ${sqlLiteral(gameTwo.businessId)}::uuid
)
and not exists (
  select 1 from public.business_ownership_positions position_row
  where position_row.game_session_id = business_row.game_session_id
    and position_row.business_id = business_row.id
    and position_row.player_id = business_row.owner_player_id
    and position_row.status = 'active'
);`);

// B1 fixes exactly ten canonical national countries. The legacy TST fixture is
// disabled only for bootstrap, then restored with an immutable pricing snapshot.
runSql(`update public.country_profiles set status = 'disabled'
  where id = ${sqlLiteral(FIXTURE.countryId)}::uuid;`);
assert.equal(Number(runSql("select count(*) from public.country_profiles where status = 'active';").output), 10);
initializeFx(gameOne);
initializeFx(gameTwo);
runSql(`
  update public.country_profiles set status = 'active'
  where id = ${sqlLiteral(FIXTURE.countryId)}::uuid;
  update public.game_sessions set lifecycle_state = 'active', status = 'active'
  where id in (${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameTwo.id)}::uuid);
  insert into public.country_economic_snapshots (
    game_session_id, country_profile_id, snapshot_sequence, effective_at,
    snapshot_label, difficulty_policy_profile_id, difficulty_preset,
    metadata, created_at
  )
  select game_row.game_id, ${sqlLiteral(FIXTURE.countryId)}::uuid, 0,
    statement_timestamp() - interval '1 minute', 'C4 TST Store pricing',
    difficulty_row.id, difficulty_row.preset_key,
    jsonb_build_object('source', 'business-multicurrency-treasury-database'),
    statement_timestamp() - interval '2 minutes'
  from (values
    (${sqlLiteral(gameOne.id)}::uuid), (${sqlLiteral(gameTwo.id)}::uuid)
  ) as game_row(game_id)
  join public.difficulty_policy_profiles difficulty_row
    on difficulty_row.preset_key = 'standard';
`);

const openedNrc = openAccount(gameOne, "NRC", "c4-open-nrc-account-one");
assert.equal(openedNrc.outcome, "applied");
assert.match(openedNrc.account.account_key, /^bac_[0-9a-f]{32}$/u);
assert.equal(Number(openedNrc.account.posted_amount), 0);
const replayedNrc = openAccount(gameOne, "NRC", "c4-open-nrc-account-one");
assert.equal(replayedNrc.outcome, "replayed");
assert.equal(replayedNrc.account.account_key, openedNrc.account.account_key);
const openedNrcTwo = openAccount(gameTwo, "NRC", "c4-open-nrc-account-two");
assert.equal(openedNrcTwo.outcome, "applied");

seedBusiness(gameOne, "ECO", 200, "game-one-eco-seed");
seedBusiness(gameTwo, "ECO", 200, "game-two-eco-seed");
const ecoOne = accountKey(gameOne, "ECO");
const nrcOne = accountKey(gameOne, "NRC");
const nrcTwo = accountKey(gameTwo, "NRC");
for (const key of [ecoOne, nrcOne, nrcTwo]) assert.match(key, /^bac_[0-9a-f]{32}$/u);

// Business capital is denominated in its reporting currency. Fund the foreign
// account only through the canonical C4 FX authority.
const bootstrapNrcQuote = serviceJson(`select public.create_business_fx_quote_v1(
  ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
  ${sqlLiteral(ecoOne)}, 'NRC', 20, 'instant', 'c4-bootstrap-nrc-quote',
  ${sqlLiteral(nrcOne)}
)::text`);
const bootstrapNrc = serviceJson(`select public.execute_business_instant_fx_v1(
  ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
  ${sqlLiteral(bootstrapNrcQuote.quote.quote_key)}, 'c4-bootstrap-nrc-order'
)::text`);
assert.equal(bootstrapNrc.order.status, "settled");
assert.ok(balance(gameOne, nrcOne) > 0);

const overview = serviceJson(`select public.get_business_treasury_overview_v1(
  ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid
)::text`);
assert.equal(overview.business_key, gameOne.businessKey);
assert.equal(overview.accounts.length, 2);
assert.ok(overview.accounts.every((account) => /^bac_[0-9a-f]{32}$/u.test(account.account_key)));
assert.ok(JSON.stringify(overview).includes("fxf_"));
assert.doesNotMatch(JSON.stringify(overview), /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu);

const instantQuote = serviceJson(`select public.create_business_fx_quote_v1(
  ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
  ${sqlLiteral(nrcOne)}, 'ECO', 1, 'instant', 'c4-instant-quote-one',
  ${sqlLiteral(ecoOne)}
)::text`);
assert.equal(instantQuote.outcome, "applied");
assert.equal(Number(instantQuote.quote.spread_rate), 0.005);
assert.equal(Number(instantQuote.quote.fee_rate), 0.02);
const ecoBeforeInstant = balance(gameOne, ecoOne);
const instant = serviceJson(`select public.execute_business_instant_fx_v1(
  ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
  ${sqlLiteral(instantQuote.quote.quote_key)}, 'c4-instant-order-one'
)::text`);
assert.equal(instant.outcome, "applied");
assert.equal(instant.order.status, "settled");
assert.ok(balance(gameOne, ecoOne) > ecoBeforeInstant);
const instantReplay = serviceJson(`select public.execute_business_instant_fx_v1(
  ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
  ${sqlLiteral(instantQuote.quote.quote_key)}, 'c4-instant-order-one'
)::text`);
assert.equal(instantReplay.outcome, "replayed");
assert.equal(instantReplay.order.order_key, instant.order.order_key);

const standardQuote = serviceJson(`select public.create_business_fx_quote_v1(
  ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
  ${sqlLiteral(ecoOne)}, 'NRC', 1, 'standard', 'c4-standard-quote-one',
  ${sqlLiteral(nrcOne)}
)::text`);
assert.equal(Number(standardQuote.quote.spread_rate), 0.005);
assert.equal(Number(standardQuote.quote.fee_rate), 0);
const standard = serviceJson(`select public.submit_business_standard_fx_order_v1(
  ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
  ${sqlLiteral(standardQuote.quote.quote_key)}, 'c4-standard-order-one'
)::text`);
assert.equal(standard.order.status, "pending");
const cancelled = serviceJson(`select public.cancel_business_standard_fx_order_v1(
  ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
  ${sqlLiteral(standard.order.order_key)}, 'c4-standard-cancel-one'
)::text`);
assert.equal(cancelled.order.status, "cancelled");

expectSqlError(`begin; set local role service_role;
  select public.create_business_fx_quote_v1(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    ${sqlLiteral(ecoOne)}, 'ECO', 1, 'instant',
    'c4-same-currency-rejected', ${sqlLiteral(ecoOne)}
  ); commit;`, /FX_SAME_CURRENCY_NOT_REQUIRED/u);
assert.equal(Number(runSql(`select count(*) from public.fx_quotes
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and business_id = ${sqlLiteral(gameOne.businessId)}::uuid
    and idempotency_key = 'c4-same-currency-rejected';`).output), 0);

runSql(`update public.bank_accounts set status = 'restricted'
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and public_key = ${sqlLiteral(nrcOne)};`);
const restrictedBefore = runJson(`select jsonb_build_object(
  'status', (select status from public.bank_accounts
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and public_key = ${sqlLiteral(nrcOne)}),
  'balance', (select balance_row.balance from public.account_balances balance_row
    join public.bank_accounts account_row on account_row.id = balance_row.bank_account_id
    where account_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and account_row.public_key = ${sqlLiteral(nrcOne)}),
  'auditRows', (select count(*) from public.audit_log
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid),
  'fxRows', (select count(*) from public.fx_quotes
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid)
)::text;`);
expectSqlError(`begin; set local role service_role;
  select public.ensure_business_banking_account_v1(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    'NRC', 'c4-restricted-account-open'
  ); commit;`, /BANK_ACCOUNT_NOT_ACTIVE/u);
expectSqlError(`begin; set local role service_role;
  select public.create_business_fx_quote_v1(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    ${sqlLiteral(ecoOne)}, 'NRC', 1, 'instant',
    'c4-restricted-target-implicit', null
  ); commit;`, /BANK_ACCOUNT_NOT_ACTIVE/u);
expectSqlError(`begin; set local role service_role;
  select public.create_business_fx_quote_v1(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    ${sqlLiteral(ecoOne)}, 'NRC', 1, 'instant',
    'c4-restricted-target-explicit', ${sqlLiteral(nrcOne)}
  ); commit;`, /BANK_ACCOUNT_NOT_FOUND/u);
const restrictedAfter = runJson(`select jsonb_build_object(
  'status', (select status from public.bank_accounts
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and public_key = ${sqlLiteral(nrcOne)}),
  'balance', (select balance_row.balance from public.account_balances balance_row
    join public.bank_accounts account_row on account_row.id = balance_row.bank_account_id
    where account_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and account_row.public_key = ${sqlLiteral(nrcOne)}),
  'auditRows', (select count(*) from public.audit_log
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid),
  'fxRows', (select count(*) from public.fx_quotes
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid)
)::text;`);
assert.deepEqual(restrictedAfter, restrictedBefore);
runSql(`update public.bank_accounts set status = 'active'
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and public_key = ${sqlLiteral(nrcOne)};`);

expectSqlError(`begin; set local role service_role;
  select public.create_business_fx_quote_v1(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    ${sqlLiteral(nrcTwo)}, 'ECO', 1, 'instant', 'c4-cross-game-fx', null
  ); commit;`, /BANK_ACCOUNT_NOT_FOUND/u);
expectSqlError(`begin; set local role service_role;
  select public.create_business_store_quote_v2(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    'fixture_widget_one', 1, 'c4-retired-unbound', statement_timestamp()
  ); commit;`, /BUSINESS_STORE_PROCUREMENT_PAYMENT_RETIRED/u);

runSql(`update public.store_items set stock_quantity = 10
  where id = ${sqlLiteral(gameOne.storeItemId)}::uuid;`);
const procurementQuote = serviceJson(`select public.create_business_store_quote_v2(
  ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
  'fixture_widget_one', 2,
  ${sqlLiteral(JSON.stringify([{ sourceAccountKey: ecoOne, targetAmount: null }]))}::jsonb,
  'c4-procurement-quote-one', statement_timestamp()
)::text`);
assert.match(procurementQuote.quote_key, /^bsq_[0-9a-f]{32}$/u);
assert.match(procurementQuote.funding_quote.quote_key, /^pfq_[0-9a-f]{32}$/u);
assert.equal(procurementQuote.funding_quote.lines.length, 1);
assert.equal(Number(procurementQuote.funding_quote.lines[0].target_contribution), 15);
const sourceBeforeProcurement = balance(gameOne, ecoOne);
const purchase = serviceJson(`select public.purchase_business_store_quote_v2(
  ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
  ${sqlLiteral(procurementQuote.quote_key)}, 'c4-procurement-purchase-one',
  statement_timestamp(), '{}'::jsonb
)::text`);
assert.equal(purchase.already_completed, false);
assert.match(purchase.receipt_key, /^bsr_[0-9a-f]{32}$/u);
assert.match(purchase.funding_receipt_key, /^pfr_[0-9a-f]{32}$/u);
assert.equal(Number(purchase.final_total_amount), 15);
assert.equal(balance(gameOne, ecoOne), sourceBeforeProcurement - 15);
const purchaseReplay = serviceJson(`select public.purchase_business_store_quote_v2(
  ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
  ${sqlLiteral(procurementQuote.quote_key)}, 'c4-procurement-purchase-one',
  statement_timestamp(), '{}'::jsonb
)::text`);
assert.equal(purchaseReplay.already_completed, true);
assert.equal(purchaseReplay.receipt_key, purchase.receipt_key);

const facts = runJson(`select jsonb_build_object(
  'stock', (select stock_quantity from public.store_items
    where id = ${sqlLiteral(gameOne.storeItemId)}::uuid),
  'purchaseRows', (select count(*) from public.business_store_purchases
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and idempotency_key = 'c4-procurement-purchase-one'),
  'fundingReceipts', (select count(*) from public.purchase_funding_receipts
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and business_id = ${sqlLiteral(gameOne.businessId)}::uuid
      and idempotency_key = 'c4-procurement-purchase-one'),
  'warehouseQuantity', (select holding_row.quantity_owned
    from public.inventory_holdings holding_row
    join public.inventory_accounts account_row
      on account_row.id = holding_row.inventory_account_id
     and account_row.game_session_id = holding_row.game_session_id
    join public.economic_parties party_row
      on party_row.id = account_row.party_id
     and party_row.game_session_id = account_row.game_session_id
    where holding_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and party_row.party_kind = 'business'
      and party_row.business_id = ${sqlLiteral(gameOne.businessId)}::uuid
      and account_row.account_kind = 'warehouse'
      and holding_row.game_item_id = ${sqlLiteral(gameOne.gameItemId)}::uuid),
  'activityRows', (select count(*) from public.business_activity_events
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and event_type = 'business.store.procurement.completed')
)::text;`);
assert.deepEqual(facts, {
  stock: 8,
  purchaseRows: 1,
  fundingReceipts: 1,
  warehouseQuantity: 2,
  activityRows: 1,
});

// A persisted pre-C4 quote has no C0 binding. The purchase command must retire
// that exact row with a stable error before any economic family changes.
const legacyQuoteKey = `bsq_${"d".repeat(32)}`;
runSql(`insert into public.business_store_purchase_quotes(
  public_key, game_session_id, business_id, created_by_player_id,
  store_item_id, country_profile_id, country_snapshot_id, snapshot_sequence,
  quantity, item_currency_code, settlement_currency_code, base_unit_price,
  inflation_multiplier, location_multiplier, scarcity_multiplier,
  item_local_final_unit_price, item_local_final_total_price, exchange_rate,
  final_unit_price, final_total_price, pricing_version, idempotency_key,
  request_hash, status, created_at, expires_at, used_at, cancelled_at
)
select
  ${sqlLiteral(legacyQuoteKey)}, quote_row.game_session_id,
  quote_row.business_id, quote_row.created_by_player_id, quote_row.store_item_id,
  quote_row.country_profile_id, quote_row.country_snapshot_id,
  quote_row.snapshot_sequence, quote_row.quantity, quote_row.item_currency_code,
  quote_row.settlement_currency_code, quote_row.base_unit_price,
  quote_row.inflation_multiplier, quote_row.location_multiplier,
  quote_row.scarcity_multiplier, quote_row.item_local_final_unit_price,
  quote_row.item_local_final_total_price, quote_row.exchange_rate,
  quote_row.final_unit_price, quote_row.final_total_price,
  quote_row.pricing_version, 'c4-persisted-legacy-unbound', repeat('d', 64),
  'CREATED', statement_timestamp(), statement_timestamp() + interval '5 minutes',
  null, null
from public.business_store_purchase_quotes quote_row
where quote_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
  and quote_row.public_key = ${sqlLiteral(procurementQuote.quote_key)};`);
const legacyPurchaseIdempotency = "c4-persisted-legacy-purchase";
const legacyBefore = procurementAtomicState(gameOne, {
  sourceAccountKey: ecoOne,
  targetAccountKey: procurementQuote.funding_target_account_key,
  quoteKey: legacyQuoteKey,
  purchaseIdempotencyKey: legacyPurchaseIdempotency,
});
assert.deepEqual(legacyBefore.quoteState, {
  status: "CREATED",
  usedAt: null,
  cancelledAt: null,
  allFundingBindingsNull: true,
});
assert.equal(legacyBefore.specificPurchaseRows, 0);
expectSqlError(`begin; set local role service_role;
  select public.purchase_business_store_quote_v2(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    ${sqlLiteral(legacyQuoteKey)}, ${sqlLiteral(legacyPurchaseIdempotency)},
    statement_timestamp(), '{}'::jsonb
  ); commit;`, /BUSINESS_STORE_PROCUREMENT_PAYMENT_RETIRED/u);
const legacyAfter = procurementAtomicState(gameOne, {
  sourceAccountKey: ecoOne,
  targetAccountKey: procurementQuote.funding_target_account_key,
  quoteKey: legacyQuoteKey,
  purchaseIdempotencyKey: legacyPurchaseIdempotency,
});
assert.deepEqual(
  legacyAfter,
  legacyBefore,
  "Persisted pre-C4 quote retirement mutated an economic family.",
);

// Deliberately desynchronize only the disposable Store holding while retaining
// sufficient Store stock. Funding therefore posts first and canonical Inventory
// rejects the debit afterward; the outer command must roll every write back.
const rollbackQuote = serviceJson(`select public.create_business_store_quote_v2(
  ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
  'fixture_widget_one', 1,
  ${sqlLiteral(JSON.stringify([{ sourceAccountKey: ecoOne, targetAmount: null }]))}::jsonb,
  'c4-procurement-rollback-quote', statement_timestamp()
)::text`);
runSql(`update public.inventory_holdings holding_row
  set quantity_owned = 0, quantity_reserved = 0
  from public.store_items store_row
  where store_row.id = ${sqlLiteral(gameOne.storeItemId)}::uuid
    and holding_row.game_session_id = store_row.game_session_id
    and holding_row.inventory_account_id = store_row.inventory_account_id
    and holding_row.game_item_id = store_row.game_item_id;`);
const rollbackBefore = procurementAtomicState(gameOne, {
  sourceAccountKey: ecoOne,
  targetAccountKey: rollbackQuote.funding_target_account_key,
  quoteKey: rollbackQuote.quote_key,
  purchaseIdempotencyKey: "c4-procurement-rollback-purchase",
});
assert.equal(rollbackBefore.storeState.stockQuantity, 8);
assert.equal(rollbackBefore.storeHolding.quantityOwned, 0);
assert.equal(rollbackBefore.quoteState.status, "CREATED");
assert.equal(rollbackBefore.quoteState.allFundingBindingsNull, false);
assert.equal(rollbackBefore.specificPurchaseRows, 0);
expectSqlError(`begin; set local role service_role;
  select public.purchase_business_store_quote_v2(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    ${sqlLiteral(rollbackQuote.quote_key)}, 'c4-procurement-rollback-purchase',
    statement_timestamp(), '{}'::jsonb
  ); commit;`, /INVENTORY_TRANSACTION_BALANCE_INVALID:1/u);
const rollbackAfter = procurementAtomicState(gameOne, {
  sourceAccountKey: ecoOne,
  targetAccountKey: rollbackQuote.funding_target_account_key,
  quoteKey: rollbackQuote.quote_key,
  purchaseIdempotencyKey: "c4-procurement-rollback-purchase",
});
assert.deepEqual(
  rollbackAfter,
  rollbackBefore,
  "Post-funding Inventory rejection did not roll back every economic family.",
);
assert.equal(rollbackAfter.specificPurchaseRows, 0);

// Re-run the retained Store projection trigger so later precision fixtures see
// canonical Store stock again after the deliberate test-only desynchronization.
runSql(`update public.store_items set stock_quantity = stock_quantity
  where id = ${sqlLiteral(gameOne.storeItemId)}::uuid;`);
const restoredStore = runJson(`select jsonb_build_object(
  'stockQuantity', store_row.stock_quantity,
  'holdingQuantity', holding_row.quantity_owned
)::text
from public.store_items store_row
join public.inventory_holdings holding_row
  on holding_row.game_session_id = store_row.game_session_id
 and holding_row.inventory_account_id = store_row.inventory_account_id
 and holding_row.game_item_id = store_row.game_item_id
where store_row.id = ${sqlLiteral(gameOne.storeItemId)}::uuid;`);
assert.deepEqual(restoredStore, { stockQuantity: 8, holdingQuantity: 8 });
expectSqlError(`begin; set local role service_role;
  select public.create_business_store_quote_v2(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    'fixture_widget_one', 1,
    ${sqlLiteral(JSON.stringify([{ sourceAccountKey: nrcTwo, targetAmount: null }]))}::jsonb,
    'c4-cross-game-procurement', statement_timestamp()
  ); commit;`, /BANK_ACCOUNT_NOT_FOUND/u);
const crossGameRows = Number(runSql(`select count(*) from public.business_store_purchase_quotes
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and idempotency_key = 'c4-cross-game-procurement';`).output);
assert.equal(crossGameRows, 0);

const precisionEvidence = [];
let lastPrecisionTargetKey;
for (const precision of [0, 3, 18]) {
  runSql(`update public.currencies set decimal_places = ${precision}
    where code = 'ECO';`);
  const quoteIdempotency = `c4-store-precision-${precision}-quote`;
  const purchaseIdempotency = `c4-store-precision-${precision}-purchase`;
  const quantity = precision === 0 ? 2 : 1;
  const precisionQuote = serviceJson(`select public.create_business_store_quote_v2(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    'fixture_widget_one', ${quantity},
    ${sqlLiteral(JSON.stringify([{ sourceAccountKey: ecoOne, targetAmount: null }]))}::jsonb,
    ${sqlLiteral(quoteIdempotency)}, statement_timestamp()
  )::text`);
  assert.equal(precisionQuote.settlement_minor_unit, precision);
  lastPrecisionTargetKey = precisionQuote.funding_target_account_key;
  assert.equal(precisionQuote.funding_quote.target_minor_unit, precision);
  assert.equal(
    precisionQuote.final_total_amount,
    precisionQuote.funding_quote.target_amount,
  );
  assert.equal(
    Number(precisionQuote.final_unit_amount) * quantity,
    Number(precisionQuote.final_total_amount),
  );
  assert.equal(
    precisionQuote.funding_quote.lines[0].target_contribution,
    precisionQuote.final_total_amount,
  );

  const binding = runJson(`select jsonb_build_object(
    'atPrecision', quote_row.final_total_price = round(
      quote_row.final_total_price, ${precision}
    ),
    'fundingMatches', funding_row.target_amount = quote_row.final_total_price,
    'linesMatch', funding_row.target_amount = (
      select sum(line_row.target_contribution)
      from public.purchase_funding_quote_lines line_row
      where line_row.quote_id = funding_row.id
    ),
    'contextMatches', quote_row.funding_context_hash =
      private.business_store_funding_context_hash_v1(
        quote_row.id, quote_row.target_bank_account_id
      )
  )::text
  from public.business_store_purchase_quotes quote_row
  join public.purchase_funding_quotes funding_row
    on funding_row.id = quote_row.funding_quote_id
  where quote_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and quote_row.public_key = ${sqlLiteral(precisionQuote.quote_key)};`);
  assert.deepEqual(binding, {
    atPrecision: true,
    fundingMatches: true,
    linesMatch: true,
    contextMatches: true,
  });

  const targetBefore = balanceText(
    gameOne,
    precisionQuote.funding_target_account_key,
  );
  const precisionPurchase = serviceJson(`select public.purchase_business_store_quote_v2(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    ${sqlLiteral(precisionQuote.quote_key)}, ${sqlLiteral(purchaseIdempotency)},
    statement_timestamp(), '{}'::jsonb
  )::text`);
  assert.equal(
    precisionPurchase.final_total_amount,
    precisionQuote.final_total_amount,
  );
  assert.equal(
    precisionPurchase.funding_receipt.target_amount,
    precisionQuote.final_total_amount,
  );
  assert.equal(precisionPurchase.settlement_minor_unit, precision);
  const settled = runJson(`select jsonb_build_object(
    'targetCreditMatches', balance_row.balance - ${sqlLiteral(targetBefore)}::numeric
      = purchase_row.final_total_price,
    'receiptMatches', funding_receipt.target_amount = purchase_row.final_total_price
  )::text
  from public.business_store_purchases purchase_row
  join public.purchase_funding_receipts funding_receipt
    on funding_receipt.id = purchase_row.funding_receipt_id
  join public.account_balances balance_row
    on balance_row.bank_account_id = purchase_row.target_bank_account_id
   and balance_row.game_session_id = purchase_row.game_session_id
  where purchase_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and purchase_row.public_key = ${sqlLiteral(precisionPurchase.receipt_key)};`);
  assert.deepEqual(settled, {
    targetCreditMatches: true,
    receiptMatches: true,
  });
  const precisionReplay = serviceJson(`select public.purchase_business_store_quote_v2(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    ${sqlLiteral(precisionQuote.quote_key)}, ${sqlLiteral(purchaseIdempotency)},
    statement_timestamp(), '{}'::jsonb
  )::text`);
  assert.equal(precisionReplay.already_completed, true);
  assert.equal(precisionReplay.receipt_key, precisionPurchase.receipt_key);
  precisionEvidence.push({ precision, amount: precisionPurchase.final_total_amount });
}
assert.deepEqual(precisionEvidence, [
  { precision: 0, amount: "16" },
  { precision: 3, amount: "7.5" },
  { precision: 18, amount: "7.5" },
]);
runSql(`update public.currencies set decimal_places = 2 where code = 'ECO';`);

assert.match(lastPrecisionTargetKey, /^bac_[0-9a-f]{32}$/u);
runSql(`update public.bank_accounts set status = 'restricted'
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and public_key = ${sqlLiteral(lastPrecisionTargetKey)};`);
const restrictedTargetBefore = runJson(`select jsonb_build_object(
  'accountStatus', account_row.status,
  'partyStatus', party_row.status,
  'balance', balance_row.balance,
  'quoteRows', (select count(*) from public.business_store_purchase_quotes
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid),
  'fundingRows', (select count(*) from public.purchase_funding_quotes
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid)
)::text
from public.bank_accounts account_row
join public.economic_parties party_row
  on party_row.id = account_row.party_id
 and party_row.game_session_id = account_row.game_session_id
join public.account_balances balance_row
  on balance_row.bank_account_id = account_row.id
 and balance_row.game_session_id = account_row.game_session_id
where account_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
  and account_row.public_key = ${sqlLiteral(lastPrecisionTargetKey)};`);
expectSqlError(`begin; set local role service_role;
  select public.create_business_store_quote_v2(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    'fixture_widget_one', 1,
    ${sqlLiteral(JSON.stringify([{ sourceAccountKey: ecoOne, targetAmount: null }]))}::jsonb,
    'c4-restricted-store-target', statement_timestamp()
  ); commit;`, /BANK_ACCOUNT_NOT_ACTIVE/u);
const restrictedTargetAfter = runJson(`select jsonb_build_object(
  'accountStatus', account_row.status,
  'partyStatus', party_row.status,
  'balance', balance_row.balance,
  'quoteRows', (select count(*) from public.business_store_purchase_quotes
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid),
  'fundingRows', (select count(*) from public.purchase_funding_quotes
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid)
)::text
from public.bank_accounts account_row
join public.economic_parties party_row
  on party_row.id = account_row.party_id
 and party_row.game_session_id = account_row.game_session_id
join public.account_balances balance_row
  on balance_row.bank_account_id = account_row.id
 and balance_row.game_session_id = account_row.game_session_id
where account_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
  and account_row.public_key = ${sqlLiteral(lastPrecisionTargetKey)};`);
assert.deepEqual(restrictedTargetAfter, restrictedTargetBefore);
runSql(`update public.bank_accounts set status = 'active'
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and public_key = ${sqlLiteral(lastPrecisionTargetKey)};
  update public.economic_parties set status = 'disabled'
  where id = (
    select party_id from public.bank_accounts
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and public_key = ${sqlLiteral(lastPrecisionTargetKey)}
  );`);
expectSqlError(`begin; set local role service_role;
  select public.create_business_store_quote_v2(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    'fixture_widget_one', 1,
    ${sqlLiteral(JSON.stringify([{ sourceAccountKey: ecoOne, targetAmount: null }]))}::jsonb,
    'c4-disabled-store-target', statement_timestamp()
  ); commit;`, /BANK_ACCOUNT_NOT_ACTIVE/u);
assert.equal(runSql(`select party_row.status
  from public.economic_parties party_row
  join public.bank_accounts account_row on account_row.party_id = party_row.id
  where account_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and account_row.public_key = ${sqlLiteral(lastPrecisionTargetKey)};`).output, "disabled");
runSql(`update public.economic_parties set status = 'active'
  where id = (
    select party_id from public.bank_accounts
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and public_key = ${sqlLiteral(lastPrecisionTargetKey)}
  );`);

const partyId = runSql(`select id::text from public.economic_parties
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and party_kind = 'business'
    and business_id = ${sqlLiteral(gameOne.businessId)}::uuid;`).output;
runSql(`update public.economic_parties set status = 'disabled'
  where id = ${sqlLiteral(partyId)}::uuid;`);
const disabledPartyBefore = runJson(`select jsonb_build_object(
  'partyStatus', (select status from public.economic_parties
    where id = ${sqlLiteral(partyId)}::uuid),
  'accountStatuses', (select jsonb_agg(status order by public_key)
    from public.bank_accounts where party_id = ${sqlLiteral(partyId)}::uuid),
  'auditRows', (select count(*) from public.audit_log
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid)
)::text;`);
expectSqlError(`begin; set local role service_role;
  select public.ensure_business_banking_account_v1(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.ownerId)}::uuid,
    'ECO', 'c4-disabled-party-open'
  ); commit;`, /BANK_ACCOUNT_NOT_ACTIVE/u);
const disabledPartyAfter = runJson(`select jsonb_build_object(
  'partyStatus', (select status from public.economic_parties
    where id = ${sqlLiteral(partyId)}::uuid),
  'accountStatuses', (select jsonb_agg(status order by public_key)
    from public.bank_accounts where party_id = ${sqlLiteral(partyId)}::uuid),
  'auditRows', (select count(*) from public.audit_log
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid)
)::text;`);
assert.deepEqual(disabledPartyAfter, disabledPartyBefore);

const ownerEvidence = runJson(`select jsonb_build_object(
  'badFxQuotes', (select count(*) from public.fx_quotes
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and ((player_id is null) = (business_id is null))),
  'badFxOrders', (select count(*) from public.fx_orders
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and ((player_id is null) = (business_id is null))),
  'badFundingQuotes', (select count(*) from public.purchase_funding_quotes
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and ((player_id is null) = (business_id is null))),
  'badFundingReceipts', (select count(*) from public.purchase_funding_receipts
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and ((player_id is null) = (business_id is null)))
)::text;`);
assert.deepEqual(ownerEvidence, {
  badFxQuotes: 0,
  badFxOrders: 0,
  badFundingQuotes: 0,
  badFundingReceipts: 0,
});

process.stdout.write(`${JSON.stringify({
  ok: true,
  phase: "BUSINESS-V2-10A4C4",
  businessAccountReplay: true,
  instantFxReplay: true,
  standardFxCancel: true,
  atomicProcurementReplay: true,
  atomicRollback: true,
  currencyPrecisions: precisionEvidence.map(({ precision }) => precision),
  restrictedAccountsPreserved: true,
  restrictedStoreTargetPreserved: true,
  twoGameIsolation: true,
})}\n`);
