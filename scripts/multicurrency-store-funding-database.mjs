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
const buyer = gameOne.buyerOneId;

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
  assert.equal(activeCount, 10);
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
      'C1 Store funding acceptance',
      difficulty_row.id,
      difficulty_row.preset_key,
      jsonb_build_object('source', 'multicurrency-store-funding-database'),
      statement_timestamp() - interval '3 minutes'
    from public.country_profiles as country_row
    join public.difficulty_policy_profiles as difficulty_row
      on difficulty_row.preset_key = 'standard'
    where country_row.status = 'active';

    select public.initialize_fx_authority_for_game_v1(
      ${sqlLiteral(game.id)}::uuid,
      clock_timestamp() - interval '1 minute',
      true
    );
  `);

  const state = runJson(`
    select jsonb_build_object(
      'ready', runtime.cutover_status = 'ready',
      'nextDueFuture', runtime.next_due_at > clock_timestamp(),
      'fixingValues', (
        select count(*)
        from public.fx_fixing_currency_values as value_row
        where value_row.game_session_id = runtime.game_session_id
          and value_row.fixing_id = runtime.current_fixing_id
      )
    )::text
    from private.fx_runtime_state as runtime
    where runtime.game_session_id = ${sqlLiteral(game.id)}::uuid;
  `);
  assert.equal(state.ready, true);
  assert.equal(state.nextDueFuture, true);
  assert.equal(Number(state.fixingValues), 11);
}

function restoreFixtureCountrySnapshots() {
  runSql(`
    update public.country_profiles
    set status = 'active'
    where id = ${sqlLiteral(FIXTURE.countryId)}::uuid;

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
      game_row.id,
      ${sqlLiteral(FIXTURE.countryId)}::uuid,
      0,
      statement_timestamp() - interval '2 minutes',
      'C1 disposable TST Store pricing',
      difficulty_row.id,
      difficulty_row.preset_key,
      jsonb_build_object('source', 'multicurrency-store-funding-database'),
      statement_timestamp() - interval '3 minutes'
    from public.game_sessions as game_row
    join public.difficulty_policy_profiles as difficulty_row
      on difficulty_row.preset_key = 'standard'
    where game_row.id in (
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameTwo.id)}::uuid
    );
  `);
}

function activateFixtureGames() {
  runSql(`
    update public.game_sessions
    set
      lifecycle_state = 'active',
      status = 'active'
    where id in (
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameTwo.id)}::uuid
    )
      and lifecycle_state = 'draft'
      and status = 'disabled';
  `);

  const state = runJson(`
    select jsonb_build_object(
      'activeCount', count(*) filter (
        where lifecycle_state = 'active' and status = 'active'
      ),
      'totalCount', count(*)
    )::text
    from public.game_sessions
    where id in (
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameTwo.id)}::uuid
    );
  `);
  assert.equal(Number(state.activeCount), 2);
  assert.equal(Number(state.totalCount), 2);
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
        'bankTransactionIdempotencyKey', ${sqlLiteral(`c1-${suffix}`)}
      )
    );
  `);
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

function seedSeededStock(game, quantity) {
  const state = runJson(`
    select jsonb_build_object(
      'accountId', item_row.inventory_account_id,
      'gameItemId', item_row.game_item_id,
      'storeItemId', item_row.id,
      'currencyCode', item_row.currency_code,
      'unitCost', item_row.price
    )::text
    from public.store_items as item_row
    where item_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and item_row.id = ${sqlLiteral(game.storeItemId)}::uuid;
  `);
  assert.ok(state.accountId);
  assert.ok(state.gameItemId);

  runSql(`
  update public.store_items
  set stock_quantity = ${quantity}
  where game_session_id = ${sqlLiteral(game.id)}::uuid
    and id = ${sqlLiteral(game.storeItemId)}::uuid;
`);

const canonicalQuantity = Number(runSql(`
  select holding_row.quantity_owned
  from public.inventory_holdings as holding_row
  where holding_row.game_session_id = ${sqlLiteral(game.id)}::uuid
    and holding_row.inventory_account_id = ${sqlLiteral(state.accountId)}::uuid
    and holding_row.game_item_id = ${sqlLiteral(state.gameItemId)}::uuid;
`).output);
assert.equal(
  canonicalQuantity,
  quantity,
  "Canonical Store holding did not follow the Store stock root.",
);
}

function inventoryQuantity(game, playerId) {
  return Number(runSql(`
    select coalesce(holding_row.quantity_owned, 0)
    from public.economic_parties as party_row
    join public.inventory_accounts as account_row
      on account_row.game_session_id = party_row.game_session_id
     and account_row.party_id = party_row.id
     and account_row.account_kind = 'personal'
     and account_row.location_key is null
    left join public.inventory_holdings as holding_row
      on holding_row.game_session_id = account_row.game_session_id
     and holding_row.inventory_account_id = account_row.id
     and holding_row.game_item_id = ${sqlLiteral(game.gameItemId)}::uuid
    where party_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and party_row.party_kind = 'player'
      and party_row.player_id = ${sqlLiteral(playerId)}::uuid;
  `).output || 0);
}

function listingQuantity(game) {
  return Number(runSql(`
    select holding_row.quantity_owned
    from public.store_seller_offers as offer_row
    join public.inventory_holdings as holding_row
      on holding_row.game_session_id = offer_row.game_session_id
     and holding_row.inventory_account_id = offer_row.inventory_account_id
     and holding_row.game_item_id = offer_row.game_item_id
    where offer_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and offer_row.id = ${sqlLiteral(game.offerId)}::uuid;
  `).output);
}

resetFixture();
normalizeFxCountryFixture();
initializeFx(gameOne);
initializeFx(gameTwo);
activateFixtureGames();
restoreFixtureCountrySnapshots();
seedForeignChecking(gameOne, buyer, "NRC", 100, "buyer-nrc");
seedForeignChecking(gameOne, buyer, "YRC", 100, "buyer-yrc");
seedForeignChecking(gameTwo, gameTwo.buyerOneId, "NRC", 100, "game-two-nrc");
seedSeededStock(gameOne, 20);

const ecoKey = accountKey(gameOne.id, buyer, "ECO");
const nrcKey = accountKey(gameOne.id, buyer, "NRC");
const yrcKey = accountKey(gameOne.id, buyer, "YRC");
for (const key of [ecoKey, nrcKey, yrcKey]) {
  assert.match(key, /^bac_[0-9a-f]{32}$/u);
}

// Seeded/NPC Store: one same-currency Checking account, exact system credit,
// canonical inventory delivery, immutable Store/C0 linkage, and replay.
const seededPricing = runJson(`
  select jsonb_build_object(
    'currencyCode', pricing.item_currency_code,
    'decimalPlaces', currency_row.decimal_places,
    'unitPrice', round(
      pricing.item_local_final_unit_price,
      currency_row.decimal_places
    ),
    'finalTotal', round(
      round(pricing.item_local_final_unit_price, currency_row.decimal_places) * 2,
      currency_row.decimal_places
    )
  )::text
  from public.resolve_store_quote_pricing_v2(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.storeItemId)}::uuid,
    ${sqlLiteral(FIXTURE.countryId)}::uuid,
    (select currency_code from public.store_items
     where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
       and id = ${sqlLiteral(gameOne.storeItemId)}::uuid),
    2,
    statement_timestamp()
  ) as pricing
  join public.currencies as currency_row
    on currency_row.code = pricing.item_currency_code;
`);
const seededTotal = String(seededPricing.finalTotal);
const seededSourceKey = accountKey(
  gameOne.id,
  buyer,
  seededPricing.currencyCode,
);
assert.match(seededSourceKey, /^bac_[0-9a-f]{32}$/u);
assert.equal(Number(seededTotal) > 0, true);

const seededQuote = serviceJson(`
  select public.create_seeded_store_funding_quote_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyer)}::uuid,
    'fixture_widget_one',
    2,
    ${sqlLiteral(JSON.stringify([
      { sourceAccountKey: seededSourceKey, targetAmount: seededTotal },
    ]))}::jsonb,
    'c1-seeded-quote-0001',
    statement_timestamp()
  )::text
`);
assert.match(seededQuote.quoteKey, /^quote_[0-9a-f]{32}$/u);
assert.match(seededQuote.fundingQuote.quote_key, /^pfq_[0-9a-f]{32}$/u);
assert.equal(seededQuote.currencyCode, seededPricing.currencyCode);
assert.equal(Number(seededQuote.finalTotalPrice), Number(seededTotal));
assert.equal(seededQuote.fundingQuote.lines.length, 1);
assert.equal(seededQuote.fundingQuote.lines[0].requires_fx, false);

const seededTargetKey = runSql(`
  select account_row.public_key
  from public.store_purchase_quotes as quote_row
  join public.bank_accounts as account_row
    on account_row.id = quote_row.target_bank_account_id
   and account_row.game_session_id = quote_row.game_session_id
  where quote_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and quote_row.public_quote_key = ${sqlLiteral(seededQuote.quoteKey)};
`).output;
const seededTargetBefore = accountBalanceByKey(gameOne.id, seededTargetKey);
const buyerInventoryBeforeSeeded = inventoryQuantity(gameOne, buyer);

const seededReceipt = serviceJson(`
  select public.settle_seeded_store_funding_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyer)}::uuid,
    ${sqlLiteral(seededQuote.quoteKey)},
    'c1-seeded-purchase-0001',
    statement_timestamp(),
    '{}'::jsonb
  )::text
`);
assert.match(seededReceipt.receiptKey, /^receipt_[0-9a-f]{32}$/u);
assert.match(seededReceipt.fundingReceipt.receipt_key, /^pfr_[0-9a-f]{32}$/u);
assert.match(seededReceipt.fundingReceipt.bank_transaction_key, /^btx_[0-9a-f]{32}$/u);
assert.equal(
  accountBalanceByKey(gameOne.id, seededTargetKey),
  seededTargetBefore + Number(seededTotal),
);
assert.equal(inventoryQuantity(gameOne, buyer), buyerInventoryBeforeSeeded + 2);

const seededStateAfter = runJson(`
  select jsonb_build_object(
    'purchaseCount', (
      select count(*) from public.store_purchases
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and player_id = ${sqlLiteral(buyer)}::uuid
        and idempotency_key = 'c1-seeded-purchase-0001'
    ),
    'fundingReceiptCount', (
      select count(*) from public.purchase_funding_receipts
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and source_action = 'seeded_store_purchase_funding'
        and idempotency_key like 'seeded-store-purchase:%'
    ),
    'quoteUsed', (
      select status = 'USED' from public.store_purchase_quotes
      where public_quote_key = ${sqlLiteral(seededQuote.quoteKey)}
    )
  )::text;
`);
assert.equal(Number(seededStateAfter.purchaseCount), 1);
assert.equal(Number(seededStateAfter.fundingReceiptCount), 1);
assert.equal(seededStateAfter.quoteUsed, true);

const seededReplay = serviceJson(`
  select public.settle_seeded_store_funding_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyer)}::uuid,
    ${sqlLiteral(seededQuote.quoteKey)},
    'c1-seeded-purchase-0001',
    statement_timestamp(),
    '{}'::jsonb
  )::text
`);
assert.equal(seededReplay.receiptKey, seededReceipt.receiptKey);
assert.equal(seededReplay.alreadyCompleted, true);
assert.equal(
  accountBalanceByKey(gameOne.id, seededTargetKey),
  seededTargetBefore + Number(seededTotal),
);

// Business Store offer: three Checking accounts, mixed same/foreign funding,
// exact Business credit, offer-first stock transfer, purchase-price Buyer basis,
// COGS/margin evidence, and replay.
const businessBefore = businessBalance(gameOne);
const listingBefore = listingQuantity(gameOne);
const inventoryBeforeBusiness = inventoryQuantity(gameOne, buyer);
const businessQuote = serviceJson(`
  select public.create_business_store_offer_funding_quote_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyer)}::uuid,
    ${sqlLiteral(gameOne.offerKey)},
    2,
    ${gameOne.expectedOfferVersion},
    ${sqlLiteral(JSON.stringify([
      { sourceAccountKey: ecoKey, targetAmount: 3 },
      { sourceAccountKey: nrcKey, targetAmount: 4 },
      { sourceAccountKey: yrcKey, targetAmount: 8 },
    ]))}::jsonb,
    'c1-business-quote-0001'
  )::text
`);
assert.match(businessQuote.quoteKey, /^quote_[0-9a-f]{32}$/u);
assert.match(businessQuote.fundingQuote.quote_key, /^pfq_[0-9a-f]{32}$/u);
assert.equal(businessQuote.fundingQuote.lines.length, 3);
assert.equal(businessQuote.fundingQuote.requires_fx, true);
assert.equal(Number(businessQuote.finalTotalPrice), 15);

const businessReceipt = serviceJson(`
  select public.settle_business_store_offer_funding_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyer)}::uuid,
    ${sqlLiteral(gameOne.offerKey)},
    ${sqlLiteral(businessQuote.quoteKey)},
    2,
    ${gameOne.expectedOfferVersion},
    'c1-business-purchase-0001'
  )::text
`);
assert.match(businessReceipt.receiptKey, /^spr_[0-9a-f]{32}$/u);
assert.match(businessReceipt.fundingReceipt.receipt_key, /^pfr_[0-9a-f]{32}$/u);
assert.equal(businessBalance(gameOne), businessBefore + 15);
assert.equal(listingQuantity(gameOne), listingBefore - 2);
assert.equal(inventoryQuantity(gameOne, buyer), inventoryBeforeBusiness + 2);
assert.equal(Number(businessReceipt.grossRevenue), 15);
assert.equal(Number(businessReceipt.costOfGoodsSold), 5);
assert.equal(Number(businessReceipt.grossMargin), 10);

const buyerBasis = runJson(`
  select jsonb_build_object(
    'averageUnitCost', holding_row.average_unit_cost,
    'currencyCode', holding_row.cost_currency_code
  )::text
  from public.economic_parties as party_row
  join public.inventory_accounts as account_row
    on account_row.game_session_id = party_row.game_session_id
   and account_row.party_id = party_row.id
   and account_row.account_kind = 'personal'
   and account_row.location_key is null
  join public.inventory_holdings as holding_row
    on holding_row.game_session_id = account_row.game_session_id
   and holding_row.inventory_account_id = account_row.id
   and holding_row.game_item_id = ${sqlLiteral(gameOne.gameItemId)}::uuid
  where party_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and party_row.player_id = ${sqlLiteral(buyer)}::uuid;
`);
assert.equal(buyerBasis.currencyCode, "ECO");
assert.equal(Number(buyerBasis.averageUnitCost) > 2.5, true);

const businessReplay = serviceJson(`
  select public.settle_business_store_offer_funding_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyer)}::uuid,
    ${sqlLiteral(gameOne.offerKey)},
    ${sqlLiteral(businessQuote.quoteKey)},
    2,
    ${gameOne.expectedOfferVersion},
    'c1-business-purchase-0001'
  )::text
`);
assert.equal(businessReplay.receiptKey, businessReceipt.receiptKey);
assert.equal(businessReplay.replayed, true);
assert.equal(businessBalance(gameOne), businessBefore + 15);

// Conflicting quote idempotency fails before another Store or C0 quote appears.
expectSqlError(`
  begin;
  set local role service_role;
  select public.create_business_store_offer_funding_quote_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyer)}::uuid,
    ${sqlLiteral(gameOne.offerKey)},
    1,
    ${gameOne.expectedOfferVersion + 1},
    ${sqlLiteral(JSON.stringify([
      { sourceAccountKey: ecoKey, targetAmount: 7.5 },
    ]))}::jsonb,
    'c1-business-quote-0001'
  );
  commit;
`, /STORE_OFFER_FUNDED_QUOTE_IDEMPOTENCY_CONFLICT/u);

// Full outer rollback after C0 funding leaves no Store, Banking, Inventory, or
// quote lifecycle residue.
const rollbackBuyer = gameTwo.buyerOneId;
const rollbackEcoKey = accountKey(gameTwo.id, rollbackBuyer, "ECO");
const rollbackQuote = serviceJson(`
  select public.create_business_store_offer_funding_quote_v1(
    ${sqlLiteral(gameTwo.id)}::uuid,
    ${sqlLiteral(rollbackBuyer)}::uuid,
    ${sqlLiteral(gameTwo.offerKey)},
    1,
    ${gameTwo.expectedOfferVersion},
    ${sqlLiteral(JSON.stringify([
      { sourceAccountKey: rollbackEcoKey, targetAmount: 7.5 },
    ]))}::jsonb,
    'c1-rollback-quote-0001'
  )::text
`);
const rollbackBusinessBefore = businessBalance(gameTwo);
const rollbackListingBefore = listingQuantity(gameTwo);
expectSqlError(`
  begin;
  set local role service_role;
  set local app.business_store_funding_fail_stage = 'after_funding';
  select public.settle_business_store_offer_funding_v1(
    ${sqlLiteral(gameTwo.id)}::uuid,
    ${sqlLiteral(rollbackBuyer)}::uuid,
    ${sqlLiteral(gameTwo.offerKey)},
    ${sqlLiteral(rollbackQuote.quoteKey)},
    1,
    ${gameTwo.expectedOfferVersion},
    'c1-rollback-purchase-0001'
  );
  commit;
`, /STORE_OFFER_FUNDED_SETTLEMENT_INJECTED_FAILURE:after_funding/u);
assert.equal(businessBalance(gameTwo), rollbackBusinessBefore);
assert.equal(listingQuantity(gameTwo), rollbackListingBefore);
const rollbackState = runJson(`
  select jsonb_build_object(
    'storeReceiptCount', (
      select count(*) from public.store_offer_purchase_receipts
      where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
        and request_idempotency_key = 'c1-rollback-purchase-0001'
    ),
    'fundingReceiptCount', (
      select count(*) from public.purchase_funding_receipts
      where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
        and source_action = 'business_offer_purchase_funding'
        and source_id is not null
    ),
    'quoteStillCreated', (
      select status = 'created'
      from public.store_offer_purchase_quotes
      where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
        and public_key = ${sqlLiteral(rollbackQuote.quoteKey)}
    ),
    'offerVersion', (
      select version from public.store_seller_offers
      where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
        and id = ${sqlLiteral(gameTwo.offerId)}::uuid
    )
  )::text;
`);
assert.equal(Number(rollbackState.storeReceiptCount), 0);
assert.equal(Number(rollbackState.fundingReceiptCount), 0);
assert.equal(rollbackState.quoteStillCreated, true);
assert.equal(Number(rollbackState.offerVersion), gameTwo.expectedOfferVersion);

const privacy = runJson(`
  select jsonb_build_object(
    'seededQuoteHasUuid', private.read_seeded_store_funding_quote_result_v1(
      (select id from public.store_purchase_quotes
       where public_quote_key = ${sqlLiteral(seededQuote.quoteKey)}), true
    )::text ~* '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',
    'businessReceiptHasUuid', economy_private.read_store_offer_funding_receipt_result_v1(
      (select id from public.store_offer_purchase_receipts
       where public_key = ${sqlLiteral(businessReceipt.receiptKey)}), true
    )::text ~* '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
  )::text;
`);
assert.equal(privacy.seededQuoteHasUuid, false);
assert.equal(privacy.businessReceiptHasUuid, false);

console.log("Multi-currency Store funding database acceptance passed.");
