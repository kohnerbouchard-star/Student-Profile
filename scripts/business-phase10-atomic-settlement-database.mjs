#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  FIXTURE,
  createQuote,
  expectSqlError,
  resetFixture,
  runJson,
  runSql,
  settle,
  settlementSql,
  snapshot,
  sqlLiteral,
} from "./business-phase10-atomic-settlement-database-support.mjs";

const gameOne = FIXTURE.games.one;
const gameTwo = FIXTURE.games.two;

function logProof(label) {
  console.log(`ok - ${label}`);
}

function assertNoMutationFailure(
  label,
  sql,
  errorPattern,
  gameIds = [gameOne.id],
) {
  const before = gameIds.map((gameId) => snapshot(gameId));
  expectSqlError(sql, errorPattern);
  const after = gameIds.map((gameId) => snapshot(gameId));
  assert.deepEqual(after, before, `${label} changed durable game state`);
  logProof(label);
}

function quoteHashSql(game, buyerId, quantity, expectedVersion) {
  return `encode(extensions.digest(convert_to(concat_ws('|',
    'business-offer-quote-v2', ${sqlLiteral(game.id)}::uuid::text,
    ${sqlLiteral(buyerId)}::uuid::text, ${sqlLiteral(game.offerKey)},
    ${quantity}::text, ${expectedVersion}::text
  ), 'UTF8'), 'sha256'), 'hex')`;
}

function rawSettlementSql({
  gameId,
  buyerId,
  offerKey,
  quoteKey,
  quantity = 2,
  expectedVersion = 2,
  idempotencyKey,
}) {
  return `begin; set local role service_role;
    select public.settle_business_store_offer_v2(
      ${sqlLiteral(gameId)}::uuid, ${sqlLiteral(buyerId)}::uuid,
      ${sqlLiteral(offerKey)}, ${sqlLiteral(quoteKey)}, ${quantity},
      ${expectedVersion}, ${sqlLiteral(idempotencyKey)})::text;
    commit;`;
}

function withPreSettlementMutation(sql, mutationSql) {
  return sql.replace(
    "begin; set local role service_role;",
    `begin; ${mutationSql}\nset local role service_role;`,
  );
}

function insertManualQuote({
  game = gameOne,
  buyerId,
  publicKey,
  requestIdempotencyKey,
  quantity = 2,
  expectedVersion = game.expectedOfferVersion,
  unitPrice = "7.5000",
  createdAtSql = "statement_timestamp()",
}) {
  runSql(`
    insert into public.store_offer_purchase_quotes(
      public_key, game_session_id, buyer_player_id, buyer_country_profile_id,
      buyer_country_code, offer_id, business_id, seller_party_id, store_item_id,
      game_item_id, inventory_account_id, quantity, offer_version,
      available_quantity_at_quote, seller_unit_price, final_unit_price,
      seller_total_price, final_total_price, seller_currency_code,
      buyer_currency_code, exchange_rate, pricing_version, status,
      request_idempotency_key, request_hash, created_at, expires_at, metadata
    )
    select ${sqlLiteral(publicKey)}, offer_row.game_session_id,
      ${sqlLiteral(buyerId)}::uuid, ${sqlLiteral(FIXTURE.countryId)}::uuid,
      'TST', offer_row.id, party_row.business_id, offer_row.seller_party_id,
      offer_row.store_item_id, offer_row.game_item_id,
      offer_row.inventory_account_id, ${quantity}, ${expectedVersion},
      greatest(holding_row.quantity_owned::bigint, ${quantity}),
      ${unitPrice}::numeric, ${unitPrice}::numeric,
      round(${unitPrice}::numeric * ${quantity}, 4),
      round(${unitPrice}::numeric * ${quantity}, 4),
      offer_row.currency_code, offer_row.currency_code, 1,
      'business-offer-fixed-price-v2', 'created',
      ${sqlLiteral(requestIdempotencyKey)},
      ${quoteHashSql(game, buyerId, quantity, expectedVersion)},
      ${createdAtSql}, ${createdAtSql} + interval '2 minutes',
      jsonb_build_object('fixture', 'phase10a3-manual-quote')
    from public.store_seller_offers as offer_row
    join public.economic_parties as party_row
      on party_row.game_session_id = offer_row.game_session_id
      and party_row.id = offer_row.seller_party_id
    join public.inventory_holdings as holding_row
      on holding_row.game_session_id = offer_row.game_session_id
      and holding_row.inventory_account_id = offer_row.inventory_account_id
      and holding_row.game_item_id = offer_row.game_item_id
    where offer_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and offer_row.public_key = ${sqlLiteral(game.offerKey)};
  `);
}

function gameSummary(game) {
  return runJson(`select jsonb_build_object(
    'buyerChecking', (select balance from public.account_balances
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and player_id = ${sqlLiteral(game.buyerOneId)}::uuid
        and business_id is null and account_type = 'checking'
        and currency_code = 'ECO'),
    'businessCash', (select balance from public.account_balances
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and business_id = ${sqlLiteral(game.businessId)}::uuid
        and currency_code = 'ECO'),
    'listingQuantity', (select holding_row.quantity_owned
      from public.store_seller_offers offer_row
      join public.inventory_holdings holding_row
        on holding_row.game_session_id = offer_row.game_session_id
        and holding_row.inventory_account_id = offer_row.inventory_account_id
        and holding_row.game_item_id = offer_row.game_item_id
      where offer_row.id = ${sqlLiteral(game.offerId)}::uuid),
    'buyerQuantity', coalesce((select holding_row.quantity_owned
      from public.economic_parties party_row
      join public.inventory_accounts account_row
        on account_row.game_session_id = party_row.game_session_id
        and account_row.party_id = party_row.id
        and account_row.account_kind = 'personal'
        and account_row.location_key is null
      join public.inventory_holdings holding_row
        on holding_row.game_session_id = account_row.game_session_id
        and holding_row.inventory_account_id = account_row.id
        and holding_row.game_item_id = ${sqlLiteral(game.gameItemId)}::uuid
      where party_row.game_session_id = ${sqlLiteral(game.id)}::uuid
        and party_row.player_id = ${sqlLiteral(game.buyerOneId)}::uuid
        and party_row.party_kind = 'player'), 0),
    'buyerAverageCost', coalesce((select holding_row.average_unit_cost
      from public.economic_parties party_row
      join public.inventory_accounts account_row
        on account_row.game_session_id = party_row.game_session_id
        and account_row.party_id = party_row.id
        and account_row.account_kind = 'personal'
        and account_row.location_key is null
      join public.inventory_holdings holding_row
        on holding_row.game_session_id = account_row.game_session_id
        and holding_row.inventory_account_id = account_row.id
        and holding_row.game_item_id = ${sqlLiteral(game.gameItemId)}::uuid
      where party_row.game_session_id = ${sqlLiteral(game.id)}::uuid
        and party_row.player_id = ${sqlLiteral(game.buyerOneId)}::uuid
        and party_row.party_kind = 'player'), 0),
    'offerVersion', (select version from public.store_seller_offers
      where id = ${sqlLiteral(game.offerId)}::uuid),
    'receiptCount', (select count(*) from public.store_offer_purchase_receipts
      where game_session_id = ${sqlLiteral(game.id)}::uuid),
    'businessSettlementLedgerCount', (select count(*) from public.ledger_entries
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and source_domain = 'store'
        and source_action in ('business_offer_purchase_debit',
          'business_offer_purchase_credit')),
    'businessSettlementTransactionCount', (select count(*)
      from public.inventory_transactions
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and source_domain = 'store'
        and source_action = 'business_offer_purchase'),
    'businessSettlementLineCount', (select count(*)
      from public.inventory_transaction_lines line_row
      join public.inventory_transactions transaction_row
        on transaction_row.game_session_id = line_row.game_session_id
        and transaction_row.id = line_row.transaction_id
      where line_row.game_session_id = ${sqlLiteral(game.id)}::uuid
        and transaction_row.source_domain = 'store'
        and transaction_row.source_action = 'business_offer_purchase'),
    'purchasedEventCount', (select count(*) from public.inventory_events event_row
      join public.inventory_transactions transaction_row
        on transaction_row.game_session_id = event_row.game_session_id
        and transaction_row.id = event_row.inventory_transaction_id
      where event_row.game_session_id = ${sqlLiteral(game.id)}::uuid
        and transaction_row.source_action = 'business_offer_purchase'
        and event_row.event_type = 'PURCHASED'),
    'activityCount', (select count(*) from public.business_activity_events
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and event_type = 'business.store.sale.completed')
  )::text;`);
}

function legacyCompatibilitySummary(game) {
  return runJson(`select jsonb_build_object(
    'checking', (select balance from public.account_balances
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and player_id = ${sqlLiteral(game.buyerTwoId)}::uuid
        and account_type = 'checking' and business_id is null),
    'storeStock', (select stock_quantity from public.store_items
      where id = ${sqlLiteral(game.storeItemId)}::uuid),
    'storeHolding', (select holding_row.quantity_owned
      from public.store_items store_row
      join public.inventory_holdings holding_row
        on holding_row.game_session_id = store_row.game_session_id
        and holding_row.inventory_account_id = store_row.inventory_account_id
        and holding_row.game_item_id = store_row.game_item_id
      where store_row.id = ${sqlLiteral(game.storeItemId)}::uuid),
    'buyerHolding', (select holding_row.quantity_owned
      from public.economic_parties party_row
      join public.inventory_accounts account_row
        on account_row.game_session_id = party_row.game_session_id
        and account_row.party_id = party_row.id
        and account_row.account_kind = 'personal'
        and account_row.location_key is null
      join public.inventory_holdings holding_row
        on holding_row.game_session_id = account_row.game_session_id
        and holding_row.inventory_account_id = account_row.id
        and holding_row.game_item_id = ${sqlLiteral(game.gameItemId)}::uuid
      where party_row.game_session_id = ${sqlLiteral(game.id)}::uuid
        and party_row.player_id = ${sqlLiteral(game.buyerTwoId)}::uuid),
    'quoteStatus', (select status from public.store_purchase_quotes
      where public_quote_key = 'quote_11111111111111111111111111111111'),
    'purchaseRows', (select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from (select * from public.store_purchases
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and player_id = ${sqlLiteral(game.buyerTwoId)}::uuid) row_data),
    'idempotencyRows', (select jsonb_agg(to_jsonb(row_data) order by row_data.id)
      from (select * from public.mutation_idempotency_keys
        where game_session_id = ${sqlLiteral(game.id)}::uuid
          and player_id = ${sqlLiteral(game.buyerTwoId)}::uuid) row_data),
    'ledgerCount', (select count(*) from public.ledger_entries
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and player_id = ${sqlLiteral(game.buyerTwoId)}::uuid
        and source_action = 'store_purchase'),
    'transactionCount', (select count(*) from public.inventory_transactions
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and source_action = 'store_purchase'),
    'lineCount', (select count(*) from public.inventory_transaction_lines line_row
      join public.inventory_transactions transaction_row
        on transaction_row.game_session_id = line_row.game_session_id
        and transaction_row.id = line_row.transaction_id
      where transaction_row.game_session_id = ${sqlLiteral(game.id)}::uuid
        and transaction_row.source_action = 'store_purchase'),
    'eventCount', (select count(*) from public.inventory_events
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and source_action = 'store_purchase'),
    'businessOfferVersion', (select version from public.store_seller_offers
      where id = ${sqlLiteral(game.offerId)}::uuid),
    'businessListing', (select holding_row.quantity_owned
      from public.store_seller_offers offer_row
      join public.inventory_holdings holding_row
        on holding_row.inventory_account_id = offer_row.inventory_account_id
        and holding_row.game_item_id = offer_row.game_item_id
      where offer_row.id = ${sqlLiteral(game.offerId)}::uuid),
    'businessCash', (select balance from public.account_balances
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and business_id = ${sqlLiteral(game.businessId)}::uuid
        and currency_code = 'ECO'),
    'businessReceiptCount', (select count(*)
      from public.store_offer_purchase_receipts
      where game_session_id = ${sqlLiteral(game.id)}::uuid)
  )::text;`);
}

function assertPublicReceipt(result, game, replayed) {
  const expectedKeys = [
    "businessCredit",
    "businessKey",
    "buyerDebit",
    "buyerInventoryAccountKey",
    "canonicalItemKey",
    "catalogItemKey",
    "completedAt",
    "costCurrencyCode",
    "costOfGoodsSold",
    "currencyCode",
    "grossMargin",
    "grossRevenue",
    "inventoryTransactionKey",
    "offerKey",
    "offerVersionAfter",
    "offerVersionBefore",
    "quantity",
    "quoteKey",
    "receiptKey",
    "remainingListedQuantity",
    "replayed",
    "sellerPartyKey",
    "sourceUnitCost",
    "storeItemKey",
    "totalPrice",
    "unitPrice",
  ].sort();
  assert.deepEqual(Object.keys(result).sort(), expectedKeys);
  assert.match(result.receiptKey, /^spr_[0-9a-f]{32}$/u);
  assert.match(result.quoteKey, /^quote_[0-9a-f]{32}$/u);
  assert.equal(result.offerKey, game.offerKey);
  assert.equal(result.businessKey, game.businessKey);
  assert.match(result.sellerPartyKey, /^pty_[0-9a-f]{32}$/u);
  assert.match(result.catalogItemKey, /^itm_[0-9a-f]{32}$/u);
  assert.equal(result.canonicalItemKey, `fixture.widget.${game === gameOne ? "one" : "two"}`);
  assert.equal(result.storeItemKey, `fixture_widget_${game === gameOne ? "one" : "two"}`);
  assert.match(result.buyerInventoryAccountKey, /^iac_[0-9a-f]{32}$/u);
  assert.match(result.inventoryTransactionKey, /^itx_[0-9a-f]{32}$/u);
  assert.equal(result.quantity, 2);
  assert.equal(result.unitPrice, 7.5);
  assert.equal(result.totalPrice, 15);
  assert.equal(result.currencyCode, "ECO");
  assert.equal(result.buyerDebit, 15);
  assert.equal(result.businessCredit, 15);
  assert.equal(result.grossRevenue, 15);
  assert.equal(result.sourceUnitCost, 2.5);
  assert.equal(result.costCurrencyCode, "ECO");
  assert.equal(result.costOfGoodsSold, 5);
  assert.equal(result.grossMargin, 10);
  assert.equal(result.offerVersionAfter, result.offerVersionBefore + 1);
  assert.equal(result.remainingListedQuantity, 8);
  assert.equal(result.replayed, replayed);
  assert.ok(Number.isFinite(Date.parse(result.completedAt)));
}

resetFixture();
logProof("clean two-game PostgreSQL fixture seeded");

const security = runJson(`select jsonb_build_object(
  'serviceExecute', has_function_privilege('service_role',
    'public.settle_business_store_offer_v2(uuid,uuid,text,text,integer,bigint,text)',
    'EXECUTE'),
  'anonExecute', has_function_privilege('anon',
    'public.settle_business_store_offer_v2(uuid,uuid,text,text,integer,bigint,text)',
    'EXECUTE'),
  'authenticatedExecute', has_function_privilege('authenticated',
    'public.settle_business_store_offer_v2(uuid,uuid,text,text,integer,bigint,text)',
    'EXECUTE'),
  'serviceSelect', has_table_privilege('service_role',
    'public.store_offer_purchase_receipts', 'SELECT'),
  'serviceWrite', has_table_privilege('service_role',
    'public.store_offer_purchase_receipts',
    'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
  'anonTable', has_table_privilege('anon',
    'public.store_offer_purchase_receipts',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
  'authenticatedTable', has_table_privilege('authenticated',
    'public.store_offer_purchase_receipts',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
  'serviceResultHelper', has_function_privilege('service_role',
    'economy_private.read_store_offer_purchase_receipt_result_v2(uuid,boolean)',
    'EXECUTE'),
  'serviceGuardHelper', has_function_privilege('service_role',
    'economy_private.guard_store_offer_purchase_receipt_v2()', 'EXECUTE'),
  'serviceValidatorHelper', has_function_privilege('service_role',
    'economy_private.validate_store_offer_purchase_receipt_v2()', 'EXECUTE'),
  'rls', (select relrowsecurity and relforcerowsecurity from pg_class
    where oid = 'public.store_offer_purchase_receipts'::regclass)
  )::text;`);
assert.deepEqual(security, {
  serviceExecute: true,
  anonExecute: false,
  authenticatedExecute: false,
  serviceSelect: true,
  serviceWrite: false,
  anonTable: false,
  authenticatedTable: false,
  serviceResultHelper: false,
  serviceGuardHelper: false,
  serviceValidatorHelper: false,
  rls: true,
});
expectSqlError(
  `begin; set local role service_role;
   insert into public.store_offer_purchase_receipts default values; commit;`,
  /permission denied for table store_offer_purchase_receipts/iu,
);
logProof("service-only RPC, forced RLS, read-only receipt ACL, and private helpers");

// The certified seeded Store channel remains executable and does not touch the
// Business offer, listing, cash, or receipt authorities introduced by 10A.3.
runSql(`
  update public.game_sessions set lifecycle_state = 'active', status = 'active'
    where id = ${sqlLiteral(gameOne.id)}::uuid;
  update public.store_items set stock_quantity = 4
    where id = ${sqlLiteral(gameOne.storeItemId)}::uuid;
  insert into public.store_purchase_quotes(
    public_quote_key, game_session_id, player_id, store_item_id, quantity,
    currency_code, base_unit_price, inflation_multiplier, location_multiplier,
    scarcity_multiplier, discount_amount, final_unit_price, final_total_price,
    pricing_version, status, expires_at, item_currency_code,
    player_currency_code, exchange_rate, item_local_final_unit_price,
    item_local_final_total_price
  ) values (
    'quote_11111111111111111111111111111111', ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.buyerTwoId)}::uuid,
    ${sqlLiteral(gameOne.storeItemId)}::uuid, 1, 'ECO', 7.50, 1, 1, 1, 0,
    7.50, 7.50, 'store-pricing-v1', 'CREATED',
    statement_timestamp() + interval '2 minutes', 'ECO', 'ECO', 1, 7.50, 7.50
  );
`);
const businessBeforeLegacy = runJson(`select jsonb_build_object(
  'offerVersion', (select version from public.store_seller_offers
    where id = ${sqlLiteral(gameOne.offerId)}::uuid),
  'listingQuantity', (select holding_row.quantity_owned
    from public.store_seller_offers offer_row
    join public.inventory_holdings holding_row
      on holding_row.inventory_account_id = offer_row.inventory_account_id
      and holding_row.game_item_id = offer_row.game_item_id
    where offer_row.id = ${sqlLiteral(gameOne.offerId)}::uuid),
  'businessCash', (select balance from public.account_balances
    where business_id = ${sqlLiteral(gameOne.businessId)}::uuid
      and currency_code = 'ECO'),
  'receiptCount', (select count(*) from public.store_offer_purchase_receipts
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid)
  )::text;`);
const legacy = runJson(`begin; set local role service_role;
  select to_jsonb(result_row)::text
  from public.purchase_quoted_store_item_public_v1(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.buyerTwoId)}::uuid,
    'quote_11111111111111111111111111111111', 'phase10a3-legacy-purchase',
    null, jsonb_build_object('verification', 'phase10a3')) result_row;
  commit;`);
assert.equal(legacy.quote_key, "quote_11111111111111111111111111111111");
assert.equal(legacy.quantity, 1);
assert.equal(legacy.final_total_price, 7.5);
assert.equal(legacy.currency_code, "ECO");
assert.equal(legacy.already_completed, false);
const businessAfterLegacy = runJson(`select jsonb_build_object(
  'offerVersion', (select version from public.store_seller_offers
    where id = ${sqlLiteral(gameOne.offerId)}::uuid),
  'listingQuantity', (select holding_row.quantity_owned
    from public.store_seller_offers offer_row
    join public.inventory_holdings holding_row
      on holding_row.inventory_account_id = offer_row.inventory_account_id
      and holding_row.game_item_id = offer_row.game_item_id
    where offer_row.id = ${sqlLiteral(gameOne.offerId)}::uuid),
  'businessCash', (select balance from public.account_balances
    where business_id = ${sqlLiteral(gameOne.businessId)}::uuid
      and currency_code = 'ECO'),
  'receiptCount', (select count(*) from public.store_offer_purchase_receipts
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid)
  )::text;`);
assert.deepEqual(businessAfterLegacy, businessBeforeLegacy);
assert.deepEqual(runJson(`select jsonb_build_object(
  'storeStock', (select stock_quantity from public.store_items
    where id = ${sqlLiteral(gameOne.storeItemId)}::uuid),
  'purchaseCount', (select count(*) from public.store_purchases
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and player_id = ${sqlLiteral(gameOne.buyerTwoId)}::uuid),
  'checking', (select balance from public.account_balances
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and player_id = ${sqlLiteral(gameOne.buyerTwoId)}::uuid
      and account_type = 'checking')
  )::text;`), { storeStock: 3, purchaseCount: 1, checking: 92.5 });
const legacyEvidence = runJson(`select jsonb_build_object(
  'quoteStatus', quote_row.status,
  'receiptKey', purchase_row.public_receipt_key,
  'transactionCount', (select count(*) from public.inventory_transactions
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and source_domain = 'store' and source_action = 'store_purchase'
      and source_id = purchase_row.id),
  'lineDeltas', (select jsonb_agg(line_row.quantity_delta order by line_row.quantity_delta)
    from public.inventory_transaction_lines line_row
    join public.inventory_transactions transaction_row
      on transaction_row.game_session_id = line_row.game_session_id
      and transaction_row.id = line_row.transaction_id
    where transaction_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and transaction_row.source_domain = 'store'
      and transaction_row.source_action = 'store_purchase'
      and transaction_row.source_id = purchase_row.id),
  'lineCosts', (select jsonb_agg(line_row.unit_cost order by line_row.quantity_delta)
    from public.inventory_transaction_lines line_row
    join public.inventory_transactions transaction_row
      on transaction_row.game_session_id = line_row.game_session_id
      and transaction_row.id = line_row.transaction_id
    where transaction_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and transaction_row.source_domain = 'store'
      and transaction_row.source_action = 'store_purchase'
      and transaction_row.source_id = purchase_row.id),
  'lineCurrencies', (select jsonb_agg(line_row.currency_code order by line_row.quantity_delta)
    from public.inventory_transaction_lines line_row
    join public.inventory_transactions transaction_row
      on transaction_row.game_session_id = line_row.game_session_id
      and transaction_row.id = line_row.transaction_id
    where transaction_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and transaction_row.source_domain = 'store'
      and transaction_row.source_action = 'store_purchase'
      and transaction_row.source_id = purchase_row.id),
  'purchasedEvents', (select count(*) from public.inventory_events
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and source_id = purchase_row.id and event_type = 'PURCHASED'),
  'buyerQuantity', (select holding_row.quantity_owned
    from public.economic_parties party_row
    join public.inventory_accounts account_row
      on account_row.game_session_id = party_row.game_session_id
      and account_row.party_id = party_row.id
      and account_row.account_kind = 'personal'
      and account_row.location_key is null
    join public.inventory_holdings holding_row
      on holding_row.game_session_id = account_row.game_session_id
      and holding_row.inventory_account_id = account_row.id
      and holding_row.game_item_id = ${sqlLiteral(gameOne.gameItemId)}::uuid
    where party_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and party_row.player_id = ${sqlLiteral(gameOne.buyerTwoId)}::uuid)
  )::text
  from public.store_purchases purchase_row
  join public.store_purchase_quotes quote_row on quote_row.id = purchase_row.quote_id
  where purchase_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and purchase_row.player_id = ${sqlLiteral(gameOne.buyerTwoId)}::uuid
    and purchase_row.idempotency_key = 'phase10a3-legacy-purchase';`);
assert.deepEqual(legacyEvidence, {
  quoteStatus: "USED",
  receiptKey: legacy.receipt_key,
  transactionCount: 1,
  lineDeltas: [-1, 1],
  lineCosts: [7.5, 7.5],
  lineCurrencies: ["ECO", "ECO"],
  purchasedEvents: 1,
  buyerQuantity: 1,
});
const beforeLegacyReplay = legacyCompatibilitySummary(gameOne);
const legacyReplay = runJson(`begin; set local role service_role;
  select to_jsonb(result_row)::text
  from public.purchase_quoted_store_item_public_v1(
    ${sqlLiteral(gameOne.id)}::uuid, ${sqlLiteral(gameOne.buyerTwoId)}::uuid,
    'quote_11111111111111111111111111111111', 'phase10a3-legacy-purchase',
    null, jsonb_build_object('verification', 'phase10a3')) result_row;
  commit;`);
assert.equal(legacyReplay.already_completed, true);
assert.deepEqual({ ...legacyReplay, already_completed: false }, legacy);
assert.deepEqual(legacyCompatibilitySummary(gameOne), beforeLegacyReplay);
logProof("retained seeded Store purchase, delivery, and idempotent replay remain isolated");

assertNoMutationFailure(
  "malformed public settlement identity fails closed",
  rawSettlementSql({
    gameId: gameOne.id,
    buyerId: gameOne.buyerOneId,
    offerKey: "not-an-offer-key",
    quoteKey: "not-a-quote-key",
    idempotencyKey: "phase10a3-malformed-identity",
  }),
  /STORE_OFFER_SETTLEMENT_REQUEST_INVALID/iu,
);

const wrongBuyerQuote = createQuote(gameOne, {
  idempotencyKey: "phase10a3-wrong-buyer-quote",
});
assertNoMutationFailure(
  "quote bound to another Buyer fails closed",
  settlementSql({
    game: gameOne,
    buyerId: gameOne.buyerTwoId,
    quoteKey: wrongBuyerQuote.quoteKey,
    idempotencyKey: "phase10a3-wrong-buyer-settle",
  }),
  /STORE_OFFER_SETTLEMENT_QUOTE_NOT_FOUND/iu,
);

const inactiveBusinessQuote = createQuote(gameOne, {
  idempotencyKey: "phase10a3-inactive-business-quote",
});
assertNoMutationFailure(
  "inactive Business fails closed and its test mutation rolls back",
  withPreSettlementMutation(
    settlementSql({
      game: gameOne,
      quoteKey: inactiveBusinessQuote.quoteKey,
      idempotencyKey: "phase10a3-inactive-business-settle",
    }),
    `update public.business_entities set status = 'restructuring'
      where id = ${sqlLiteral(gameOne.businessId)}::uuid;`,
  ),
  /STORE_OFFER_SETTLEMENT_BUSINESS_UNAVAILABLE/iu,
);

const inactiveSellerQuote = createQuote(gameOne, {
  idempotencyKey: "phase10a3-inactive-seller-quote",
});
assertNoMutationFailure(
  "inactive seller party fails closed and its test mutation rolls back",
  withPreSettlementMutation(
    settlementSql({
      game: gameOne,
      quoteKey: inactiveSellerQuote.quoteKey,
      idempotencyKey: "phase10a3-inactive-seller-settle",
    }),
    `update public.economic_parties set status = 'disabled'
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and business_id = ${sqlLiteral(gameOne.businessId)}::uuid
        and party_kind = 'business';`,
  ),
  /STORE_OFFER_SETTLEMENT_SELLER_UNAVAILABLE/iu,
);

const terminalQuote = createQuote(gameOne, {
  idempotencyKey: "phase10a3-terminal-quote-create",
});
runSql(`update public.store_offer_purchase_quotes
  set status = 'cancelled', cancelled_at = statement_timestamp(),
      version = version + 1
  where public_key = ${sqlLiteral(terminalQuote.quoteKey)};`);
assertNoMutationFailure(
  "terminal cancelled quote fails closed",
  settlementSql({
    game: gameOne,
    quoteKey: terminalQuote.quoteKey,
    idempotencyKey: "phase10a3-terminal-quote-settle",
  }),
  /STORE_OFFER_SETTLEMENT_QUOTE_STATUS_INVALID/iu,
);

const inactiveOfferQuote = createQuote(gameOne, {
  idempotencyKey: "phase10a3-inactive-offer-quote",
});
assertNoMutationFailure(
  "paused offer fails before economic rows and its test mutation rolls back",
  withPreSettlementMutation(
    settlementSql({
      game: { ...gameOne, expectedOfferVersion: 3 },
      quoteKey: inactiveOfferQuote.quoteKey,
      expectedVersion: 3,
      idempotencyKey: "phase10a3-inactive-offer-settle",
    }),
    `update public.store_seller_offers
      set status = 'paused', version = version + 1
      where id = ${sqlLiteral(gameOne.offerId)}::uuid;`,
  ),
  /STORE_OFFER_SETTLEMENT_OFFER_STATUS_INVALID/iu,
);

const custodyQuote = createQuote(gameOne, {
  idempotencyKey: "phase10a3-custody-unavailable-quote",
});
assertNoMutationFailure(
  "disabled exact custody account fails closed and rolls back",
  withPreSettlementMutation(
    settlementSql({
      game: gameOne,
      quoteKey: custodyQuote.quoteKey,
      idempotencyKey: "phase10a3-custody-unavailable-settle",
    }),
    `update public.inventory_accounts set status = 'disabled'
      where id = (select inventory_account_id from public.store_seller_offers
        where id = ${sqlLiteral(gameOne.offerId)}::uuid);`,
  ),
  /STORE_OFFER_SETTLEMENT_CUSTODY_UNAVAILABLE/iu,
);

const cashCurrencyQuote = createQuote(gameOne, {
  idempotencyKey: "phase10a3-cash-currency-quote",
});
assertNoMutationFailure(
  "wrong-currency Business cash authority fails closed and rolls back",
  withPreSettlementMutation(
    settlementSql({
      game: gameOne,
      quoteKey: cashCurrencyQuote.quoteKey,
      idempotencyKey: "phase10a3-cash-currency-settle",
    }),
    `update public.account_balances set currency_code = 'ALT'
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and business_id = ${sqlLiteral(gameOne.businessId)}::uuid
        and currency_code = 'ECO';`,
  ),
  /STORE_OFFER_SETTLEMENT_BUSINESS_CASH_UNAVAILABLE/iu,
);

const buyerInventoryCurrencyQuote = createQuote(gameOne, {
  idempotencyKey: "phase10a3-buyer-inventory-currency-quote",
});
assertNoMutationFailure(
  "Buyer Inventory cost-currency drift fails closed and rolls back",
  withPreSettlementMutation(
    settlementSql({
      game: gameOne,
      quoteKey: buyerInventoryCurrencyQuote.quoteKey,
      idempotencyKey: "phase10a3-buyer-inventory-currency-settle",
    }),
    `insert into public.inventory_holdings(
      game_session_id, inventory_account_id, game_item_id, quantity_owned,
      quantity_reserved, average_unit_cost, cost_currency_code, version
    ) select ${sqlLiteral(gameOne.id)}::uuid, account_row.id,
      ${sqlLiteral(gameOne.gameItemId)}::uuid, 1, 0, 1.0000, 'ALT', 1
    from public.economic_parties party_row
    join public.inventory_accounts account_row
      on account_row.game_session_id = party_row.game_session_id
      and account_row.party_id = party_row.id
      and account_row.account_kind = 'personal'
      and account_row.location_key is null
    where party_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and party_row.player_id = ${sqlLiteral(gameOne.buyerOneId)}::uuid;`,
  ),
  /STORE_OFFER_SETTLEMENT_BUYER_INVENTORY_CURRENCY_INVALID/iu,
);

const insufficientFundsQuote = createQuote(gameOne, {
  idempotencyKey: "phase10a3-insufficient-funds-quote",
});
runSql(`update public.account_balances set balance = 0
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and player_id = ${sqlLiteral(gameOne.buyerOneId)}::uuid
    and account_type = 'checking' and currency_code = 'ECO';`);
assertNoMutationFailure(
  "insufficient Buyer Checking rolls back without mutation",
  settlementSql({
    game: gameOne,
    quoteKey: insufficientFundsQuote.quoteKey,
    idempotencyKey: "phase10a3-insufficient-funds-settle",
  }),
  /STORE_OFFER_SETTLEMENT_INSUFFICIENT_FUNDS/iu,
);
runSql(`update public.account_balances set balance = 100
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and player_id = ${sqlLiteral(gameOne.buyerOneId)}::uuid
    and account_type = 'checking' and currency_code = 'ECO';`);

const reservedQuote = createQuote(gameOne, {
  idempotencyKey: "phase10a3-reserved-stock-quote",
});
runSql(`update public.inventory_holdings set quantity_reserved = 1
  where inventory_account_id = (select inventory_account_id
    from public.store_seller_offers where id = ${sqlLiteral(gameOne.offerId)}::uuid)
    and game_item_id = ${sqlLiteral(gameOne.gameItemId)}::uuid;`);
assertNoMutationFailure(
  "reserved listing stock fails closed",
  settlementSql({
    game: gameOne,
    quoteKey: reservedQuote.quoteKey,
    idempotencyKey: "phase10a3-reserved-stock-settle",
  }),
  /STORE_OFFER_SETTLEMENT_INVENTORY_RESERVED/iu,
);
runSql(`update public.inventory_holdings set quantity_reserved = 0
  where inventory_account_id = (select inventory_account_id
    from public.store_seller_offers where id = ${sqlLiteral(gameOne.offerId)}::uuid)
    and game_item_id = ${sqlLiteral(gameOne.gameItemId)}::uuid;`);

const stockQuote = createQuote(gameOne, {
  idempotencyKey: "phase10a3-insufficient-stock-quote",
});
runSql(`update public.inventory_holdings set quantity_owned = 1
  where inventory_account_id = (select inventory_account_id
    from public.store_seller_offers where id = ${sqlLiteral(gameOne.offerId)}::uuid)
    and game_item_id = ${sqlLiteral(gameOne.gameItemId)}::uuid;`);
assertNoMutationFailure(
  "insufficient listing stock fails closed",
  settlementSql({
    game: gameOne,
    quoteKey: stockQuote.quoteKey,
    idempotencyKey: "phase10a3-insufficient-stock-settle",
  }),
  /STORE_OFFER_SETTLEMENT_INSUFFICIENT_STOCK/iu,
);
runSql(`update public.inventory_holdings set quantity_owned = 10
  where inventory_account_id = (select inventory_account_id
    from public.store_seller_offers where id = ${sqlLiteral(gameOne.offerId)}::uuid)
    and game_item_id = ${sqlLiteral(gameOne.gameItemId)}::uuid;`);

const costDriftQuote = createQuote(gameOne, {
  idempotencyKey: "phase10a3-cost-currency-quote",
});
runSql(`update public.inventory_holdings set cost_currency_code = 'ALT'
  where inventory_account_id = (select inventory_account_id
    from public.store_seller_offers where id = ${sqlLiteral(gameOne.offerId)}::uuid)
    and game_item_id = ${sqlLiteral(gameOne.gameItemId)}::uuid;`);
assertNoMutationFailure(
  "source cost-currency drift fails closed",
  settlementSql({
    game: gameOne,
    quoteKey: costDriftQuote.quoteKey,
    idempotencyKey: "phase10a3-cost-currency-settle",
  }),
  /STORE_OFFER_SETTLEMENT_COST_CURRENCY_DRIFT/iu,
);
runSql(`update public.inventory_holdings set cost_currency_code = 'ECO'
  where inventory_account_id = (select inventory_account_id
    from public.store_seller_offers where id = ${sqlLiteral(gameOne.offerId)}::uuid)
    and game_item_id = ${sqlLiteral(gameOne.gameItemId)}::uuid;`);

const cashOverflowQuote = createQuote(gameOne, {
  idempotencyKey: "phase10a3-business-cash-overflow-quote",
});
runSql(`update public.account_balances set balance = 999999999999.99
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and business_id = ${sqlLiteral(gameOne.businessId)}::uuid
    and currency_code = 'ECO';`);
assertNoMutationFailure(
  "Business cash overflow fails closed",
  settlementSql({
    game: gameOne,
    quoteKey: cashOverflowQuote.quoteKey,
    idempotencyKey: "phase10a3-business-cash-overflow-settle",
  }),
  /STORE_OFFER_SETTLEMENT_BUSINESS_CASH_UNAVAILABLE/iu,
);
runSql(`update public.account_balances set balance = 20
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and business_id = ${sqlLiteral(gameOne.businessId)}::uuid
    and currency_code = 'ECO';`);

insertManualQuote({
  buyerId: gameOne.ownerId,
  publicKey: `quote_${"a".repeat(32)}`,
  requestIdempotencyKey: "phase10a3-self-purchase-quote",
});
assertNoMutationFailure(
  "Business owner self-purchase fails closed",
  settlementSql({
    game: gameOne,
    buyerId: gameOne.ownerId,
    quoteKey: `quote_${"a".repeat(32)}`,
    idempotencyKey: "phase10a3-self-purchase-settle",
  }),
  /STORE_OFFER_SETTLEMENT_SELF_PURCHASE_FORBIDDEN/iu,
);

insertManualQuote({
  buyerId: gameOne.buyerTwoId,
  publicKey: `quote_${"b".repeat(32)}`,
  requestIdempotencyKey: "phase10a3-expired-manual-quote",
  createdAtSql: "statement_timestamp() - interval '3 minutes'",
});
assertNoMutationFailure(
  "expired immutable quote fails closed",
  settlementSql({
    game: gameOne,
    buyerId: gameOne.buyerTwoId,
    quoteKey: `quote_${"b".repeat(32)}`,
    idempotencyKey: "phase10a3-expired-manual-settle",
  }),
  /STORE_OFFER_SETTLEMENT_QUOTE_EXPIRED/iu,
);

insertManualQuote({
  buyerId: gameOne.buyerTwoId,
  publicKey: `quote_${"c".repeat(32)}`,
  requestIdempotencyKey: "phase10a3-mismatched-price-quote",
  unitPrice: "8.0000",
});
assertNoMutationFailure(
  "quote-to-offer economic mismatch fails closed",
  settlementSql({
    game: gameOne,
    buyerId: gameOne.buyerTwoId,
    quoteKey: `quote_${"c".repeat(32)}`,
    idempotencyKey: "phase10a3-mismatched-price-settle",
  }),
  /STORE_OFFER_SETTLEMENT_QUOTE_MISMATCH/iu,
);

const crossGameQuote = createQuote(gameOne, {
  idempotencyKey: "phase10a3-cross-game-quote",
});
assertNoMutationFailure(
  "offer identity from another game fails closed",
  rawSettlementSql({
    gameId: gameTwo.id,
    buyerId: gameTwo.buyerOneId,
    offerKey: gameOne.offerKey,
    quoteKey: crossGameQuote.quoteKey,
    idempotencyKey: "phase10a3-cross-game-offer-settle",
  }),
  /STORE_OFFER_SETTLEMENT_OFFER_NOT_FOUND/iu,
  [gameOne.id, gameTwo.id],
);
assertNoMutationFailure(
  "quote identity from another game fails closed",
  settlementSql({
    game: gameTwo,
    quoteKey: crossGameQuote.quoteKey,
    idempotencyKey: "phase10a3-cross-game-quote-settle",
  }),
  /STORE_OFFER_SETTLEMENT_QUOTE_NOT_FOUND/iu,
  [gameOne.id, gameTwo.id],
);

for (const stage of [
  "after_buyer_debit",
  "after_business_credit",
  "after_inventory_post",
  "after_activity",
  "after_receipt",
  "after_quote_consumption",
  "after_offer_version",
]) {
  const quote = createQuote(gameOne, {
    idempotencyKey: `phase10a3-${stage}-quote`,
  });
  const baseSql = settlementSql({
    game: gameOne,
    quoteKey: quote.quoteKey,
    idempotencyKey: `phase10a3-${stage}-settle`,
  });
  const injectedSql = baseSql.replace(
    "begin;",
    `begin; set local app.business_store_settlement_fail_stage = ${sqlLiteral(stage)};`,
  );
  assertNoMutationFailure(
    `injected ${stage} failure rolls back every side`,
    injectedSql,
    new RegExp(`STORE_OFFER_SETTLEMENT_INJECTED_FAILURE:${stage}`, "iu"),
  );
}

// A successful settlement in Game Two must leave every Game One row byte-for-byte
// unchanged, including its earlier retained-path and failed-attempt evidence.
const gameOneBeforeGameTwo = snapshot(gameOne.id);
const gameTwoQuote = createQuote(gameTwo, {
  idempotencyKey: "phase10a3-game-two-success-quote",
});
const gameTwoResult = settle({
  game: gameTwo,
  quoteKey: gameTwoQuote.quoteKey,
  idempotencyKey: "phase10a3-game-two-success-settle",
});
assertPublicReceipt(gameTwoResult, gameTwo, false);
assert.deepEqual(snapshot(gameOne.id), gameOneBeforeGameTwo);
assert.deepEqual(gameSummary(gameTwo), {
  buyerChecking: 85,
  businessCash: 35,
  listingQuantity: 8,
  buyerQuantity: 2,
  buyerAverageCost: 2.5,
  offerVersion: 3,
  receiptCount: 1,
  businessSettlementLedgerCount: 2,
  businessSettlementTransactionCount: 1,
  businessSettlementLineCount: 2,
  purchasedEventCount: 1,
  activityCount: 1,
});
logProof("successful settlement in Game Two is isolated from Game One");

runSql(`update public.store_seller_offers
  set unit_price = 7.3333, version = version + 1
  where id = ${sqlLiteral(gameTwo.offerId)}::uuid and version = 3;`);
const precisionQuote = createQuote(gameTwo, {
  buyerId: gameTwo.buyerTwoId,
  idempotencyKey: "phase10a3-money-precision-quote",
  quantity: 3,
  expectedVersion: 4,
});
assertNoMutationFailure(
  "four-decimal quote total cannot enter two-decimal ledger authority",
  settlementSql({
    game: { ...gameTwo, expectedOfferVersion: 4 },
    buyerId: gameTwo.buyerTwoId,
    quoteKey: precisionQuote.quoteKey,
    quantity: 3,
    expectedVersion: 4,
    idempotencyKey: "phase10a3-money-precision-settle",
  }),
  /STORE_OFFER_SETTLEMENT_MONEY_PRECISION_UNREPRESENTABLE/iu,
  [gameOne.id, gameTwo.id],
);

const successQuote = createQuote(gameOne, {
  idempotencyKey: "phase10a3-game-one-success-quote",
});
const success = settle({
  game: gameOne,
  quoteKey: successQuote.quoteKey,
  idempotencyKey: "phase10a3-game-one-success-settle",
});
assertPublicReceipt(success, gameOne, false);
assert.deepEqual(gameSummary(gameOne), {
  buyerChecking: 85,
  businessCash: 35,
  listingQuantity: 8,
  buyerQuantity: 2,
  buyerAverageCost: 2.5,
  offerVersion: 3,
  receiptCount: 1,
  businessSettlementLedgerCount: 2,
  businessSettlementTransactionCount: 1,
  businessSettlementLineCount: 2,
  purchasedEventCount: 1,
  activityCount: 1,
});
const committedEvidence = runJson(`select jsonb_build_object(
  'quoteStatus', quote_row.status,
  'quoteVersion', quote_row.version,
  'quoteUsedAt', quote_row.used_at,
  'offerVersionBefore', receipt_row.offer_version_before,
  'offerVersionAfter', receipt_row.offer_version_after,
  'receiptCompletedAt', receipt_row.completed_at,
  'activityOccurredAt', activity_row.occurred_at,
  'debit', debit_row.amount,
  'credit', credit_row.amount,
  'transactionStatus', transaction_row.status,
  'transactionType', transaction_row.transaction_type,
  'transactionReceiptKey', transaction_row.metadata->>'receiptKey',
  'lineEvidence', (select jsonb_agg(jsonb_build_object(
      'quantityDelta', line_row.quantity_delta,
      'reservationDelta', line_row.reservation_delta,
      'unitCost', line_row.unit_cost,
      'currencyCode', line_row.currency_code,
      'receiptKey', line_row.metadata->>'receiptKey'
    ) order by line_row.quantity_delta)
    from public.inventory_transaction_lines line_row
    where line_row.game_session_id = receipt_row.game_session_id
      and line_row.transaction_id = receipt_row.inventory_transaction_id),
  'listingHolding', (select jsonb_build_object(
      'quantity', holding_row.quantity_owned,
      'reserved', holding_row.quantity_reserved,
      'averageUnitCost', holding_row.average_unit_cost,
      'currencyCode', holding_row.cost_currency_code)
    from public.inventory_holdings holding_row
    where holding_row.game_session_id = receipt_row.game_session_id
      and holding_row.inventory_account_id = receipt_row.listing_inventory_account_id
      and holding_row.game_item_id = receipt_row.game_item_id),
  'buyerHolding', (select jsonb_build_object(
      'quantity', holding_row.quantity_owned,
      'reserved', holding_row.quantity_reserved,
      'averageUnitCost', holding_row.average_unit_cost,
      'currencyCode', holding_row.cost_currency_code)
    from public.inventory_holdings holding_row
    where holding_row.game_session_id = receipt_row.game_session_id
      and holding_row.inventory_account_id = receipt_row.buyer_inventory_account_id
      and holding_row.game_item_id = receipt_row.game_item_id),
  'eventEvidence', (select jsonb_agg(jsonb_build_object(
      'quantityDelta', event_row.quantity_delta,
      'eventType', event_row.event_type,
      'sourceMatchesReceipt', event_row.source_id = receipt_row.id,
      'receiptKey', event_row.metadata->>'receiptKey'
    ) order by event_row.id)
    from public.inventory_events event_row
    where event_row.game_session_id = receipt_row.game_session_id
      and event_row.inventory_transaction_id = receipt_row.inventory_transaction_id),
  'sourceUnitCost', receipt_row.source_unit_cost,
  'costOfGoodsSold', receipt_row.cost_of_goods_sold,
  'grossMargin', receipt_row.gross_margin
  )::text
  from public.store_offer_purchase_receipts receipt_row
  join public.store_offer_purchase_quotes quote_row
    on quote_row.game_session_id = receipt_row.game_session_id
    and quote_row.id = receipt_row.quote_id
  join public.business_activity_events activity_row
    on activity_row.game_session_id = receipt_row.game_session_id
    and activity_row.source_id = receipt_row.id
    and activity_row.event_type = 'business.store.sale.completed'
  join public.ledger_entries debit_row
    on debit_row.id = receipt_row.buyer_debit_ledger_entry_id
  join public.ledger_entries credit_row
    on credit_row.id = receipt_row.business_credit_ledger_entry_id
  join public.inventory_transactions transaction_row
    on transaction_row.id = receipt_row.inventory_transaction_id
  where receipt_row.public_key = ${sqlLiteral(success.receiptKey)};`);
assert.deepEqual(committedEvidence, {
  quoteStatus: "used",
  quoteVersion: 2,
  quoteUsedAt: committedEvidence.quoteUsedAt,
  offerVersionBefore: 2,
  offerVersionAfter: 3,
  receiptCompletedAt: success.completedAt,
  activityOccurredAt: success.completedAt,
  debit: -15,
  credit: 15,
  transactionStatus: "committed",
  transactionType: "purchase",
  transactionReceiptKey: success.receiptKey,
  lineEvidence: [
    {
      quantityDelta: -2,
      reservationDelta: 0,
      unitCost: 2.5,
      currencyCode: "ECO",
      receiptKey: success.receiptKey,
    },
    {
      quantityDelta: 2,
      reservationDelta: 0,
      unitCost: 2.5,
      currencyCode: "ECO",
      receiptKey: success.receiptKey,
    },
  ],
  listingHolding: {
    quantity: 8,
    reserved: 0,
    averageUnitCost: 2.5,
    currencyCode: "ECO",
  },
  buyerHolding: {
    quantity: 2,
    reserved: 0,
    averageUnitCost: 2.5,
    currencyCode: "ECO",
  },
  eventEvidence: [{
    quantityDelta: 2,
    eventType: "PURCHASED",
    sourceMatchesReceipt: true,
    receiptKey: success.receiptKey,
  }],
  sourceUnitCost: 2.5,
  costOfGoodsSold: 5,
  grossMargin: 10,
});
assert.ok(Number.isFinite(Date.parse(committedEvidence.quoteUsedAt)));
logProof("one atomic settlement commits balanced money, Inventory, accounting, quote, offer, and receipt evidence");

expectSqlError(
  `update public.store_offer_purchase_receipts set metadata = metadata
   where public_key = ${sqlLiteral(success.receiptKey)};`,
  /STORE_OFFER_PURCHASE_RECEIPT_IMMUTABLE/iu,
);
expectSqlError(
  `delete from public.store_offer_purchase_receipts
   where public_key = ${sqlLiteral(success.receiptKey)};`,
  /STORE_OFFER_PURCHASE_RECEIPT_IMMUTABLE/iu,
);
logProof("completed receipt rejects update and delete even for database owner");

// Replay is receipt-first: mutable offer, Buyer, and Business state can become
// unavailable after commit without changing the returned immutable economics.
runSql(`
  update public.store_seller_offers set status = 'paused', version = version + 1
    where id = ${sqlLiteral(gameOne.offerId)}::uuid and version = 3;
  update public.players set status = 'archived'
    where id = ${sqlLiteral(gameOne.buyerOneId)}::uuid;
  update public.business_entities set status = 'restructuring'
    where id = ${sqlLiteral(gameOne.businessId)}::uuid;
`);
const beforeReplay = snapshot(gameOne.id);
const replay = settle({
  game: gameOne,
  quoteKey: successQuote.quoteKey,
  idempotencyKey: "phase10a3-game-one-success-settle",
});
assertPublicReceipt(replay, gameOne, true);
assert.deepEqual({ ...replay, replayed: false }, success);
assert.deepEqual(snapshot(gameOne.id), beforeReplay);
logProof("matching replay returns the exact receipt before mutable-state interpretation");

assertNoMutationFailure(
  "conflicting idempotency reuse fails before economic mutation",
  settlementSql({
    game: gameOne,
    quoteKey: successQuote.quoteKey,
    quantity: 1,
    idempotencyKey: "phase10a3-game-one-success-settle",
  }),
  /STORE_OFFER_SETTLEMENT_IDEMPOTENCY_CONFLICT/iu,
);

console.log("PASS business Phase 10A.3 real PostgreSQL serial settlement verification");
