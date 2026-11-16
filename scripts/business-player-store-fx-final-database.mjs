#!/usr/bin/env node

import assert from "node:assert/strict";

// The retained C1 acceptance seeds two isolated games, initializes immutable FX
// authority, and proves the all-positive allocation compatibility path before D
// exercises the ordered final-null intent. This import is intentionally part of
// the permanent zero-to-head ratchet rather than a copied fixture.
import "./multicurrency-store-funding-database.mjs";
import {
  FIXTURE,
  expectSqlError,
  runJson,
  runSql,
  sqlLiteral,
} from "./business-phase10-atomic-settlement-database-support.mjs";

const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
const gameOne = FIXTURE.games.one;
const gameTwo = FIXTURE.games.two;
const buyer = gameOne.buyerOneId;

function serviceJson(sql) {
  return runJson(`begin; set local role service_role; ${sql}; commit;`);
}

function accountKey(gameId, playerId, currencyCode) {
  const key = runSql(`
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
  assert.match(key, /^bac_[0-9a-f]{32}$/u);
  return key;
}

function businessCheckingBalance(game) {
  return Number(runSql(`
    select balance_row.balance::text
    from public.economic_parties as party_row
    join public.bank_accounts as account_row
      on account_row.game_session_id = party_row.game_session_id
     and account_row.party_id = party_row.id
     and account_row.account_kind = 'checking'
     and account_row.currency_code = 'ECO'
     and account_row.status = 'active'
    join public.account_balances as balance_row
      on balance_row.game_session_id = account_row.game_session_id
     and balance_row.bank_account_id = account_row.id
    where party_row.game_session_id = ${sqlLiteral(game.id)}::uuid
      and party_row.party_kind = 'business'
      and party_row.business_id = ${sqlLiteral(game.businessId)}::uuid
      and party_row.status = 'active';
  `).output);
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
      and offer_row.public_key = ${sqlLiteral(game.offerKey)};
  `).output);
}

function playerInventoryQuantity(game, playerId) {
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

function currentOfferVersion(game) {
  return Number(runSql(`
    select version
    from public.store_seller_offers
    where game_session_id = ${sqlLiteral(game.id)}::uuid
      and public_key = ${sqlLiteral(game.offerKey)};
  `).output);
}

function seededQuote({ allocations, idempotencyKey, quantity = 1 }) {
  return serviceJson(`
    select public.create_seeded_store_funding_quote_v1(
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(buyer)}::uuid,
      'fixture_widget_one',
      ${quantity},
      ${sqlLiteral(JSON.stringify(allocations))}::jsonb,
      ${sqlLiteral(idempotencyKey)},
      statement_timestamp()
    )::text
  `);
}

function systemOfferSnapshot(sellerKind) {
  return runJson(`
    select jsonb_build_object(
      'offerKey', offer_row.public_key,
      'version', offer_row.version,
      'availableQuantity',
        holding_row.quantity_owned - holding_row.quantity_reserved
    )::text
    from public.store_seller_offers as offer_row
    join public.inventory_holdings as holding_row
      on holding_row.game_session_id = offer_row.game_session_id
     and holding_row.inventory_account_id = offer_row.inventory_account_id
     and holding_row.game_item_id = offer_row.game_item_id
    where offer_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and offer_row.store_item_id = ${sqlLiteral(gameOne.storeItemId)}::uuid
      and offer_row.seller_kind = ${sqlLiteral(sellerKind)}
      and offer_row.status = 'active'
    order by offer_row.public_key
    limit 1;
  `);
}

function systemOfferQuote({
  offerKey,
  expectedVersion,
  allocations,
  idempotencyKey,
  quantity = 1,
}) {
  return serviceJson(`
    select public.create_system_store_offer_funding_quote_v2(
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(buyer)}::uuid,
      ${sqlLiteral(offerKey)},
      ${quantity},
      ${expectedVersion},
      ${sqlLiteral(JSON.stringify(allocations))}::jsonb,
      ${sqlLiteral(idempotencyKey)},
      statement_timestamp()
    )::text
  `);
}

function systemOfferQuantity(offerKey) {
  return Number(runSql(`
    select holding_row.quantity_owned - holding_row.quantity_reserved
    from public.store_seller_offers as offer_row
    join public.inventory_holdings as holding_row
      on holding_row.game_session_id = offer_row.game_session_id
     and holding_row.inventory_account_id = offer_row.inventory_account_id
     and holding_row.game_item_id = offer_row.game_item_id
    where offer_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and offer_row.public_key = ${sqlLiteral(offerKey)};
  `).output);
}

function settleSystemOffer(quoteKey, idempotencyKey) {
  return serviceJson(`
    select public.settle_system_store_offer_funding_v2(
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(buyer)}::uuid,
      ${sqlLiteral(quoteKey)},
      ${sqlLiteral(idempotencyKey)}
    )::text
  `);
}

function seedNpcOffer() {
  runSql(`
    insert into public.economic_parties(
      id, public_key, game_session_id, party_kind, system_key, status
    ) values (
      'd1000000-0000-0000-0000-000000000001'::uuid,
      'pty_d1000000000000000000000000000001',
      ${sqlLiteral(gameOne.id)}::uuid,
      'system',
      'npc.fixture-merchant',
      'active'
    );

    insert into public.inventory_accounts(
      id, public_key, game_session_id, party_id, account_kind, status, metadata
    ) values (
      'd2000000-0000-0000-0000-000000000001'::uuid,
      'iac_d2000000000000000000000000000001',
      ${sqlLiteral(gameOne.id)}::uuid,
      'd1000000-0000-0000-0000-000000000001'::uuid,
      'store_stock',
      'active',
      jsonb_build_object('fixture', 'business-player-store-fx-final-v2')
    );

    insert into public.store_seller_offers(
      id, public_key, game_session_id, store_item_id, game_item_id,
      seller_party_id, inventory_account_id, seller_kind, unit_price,
      currency_code, status, replenishment_policy,
      creation_idempotency_key, creation_request_hash, version, metadata
    ) values (
      'd3000000-0000-0000-0000-000000000001'::uuid,
      'sof_d3000000000000000000000000000001',
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(gameOne.storeItemId)}::uuid,
      ${sqlLiteral(gameOne.gameItemId)}::uuid,
      'd1000000-0000-0000-0000-000000000001'::uuid,
      'd2000000-0000-0000-0000-000000000001'::uuid,
      'npc',
      8.50,
      'ECO',
      'active',
      'none',
      'd-npc-offer-fixture',
      repeat('d', 64),
      1,
      jsonb_build_object('fixture', 'business-player-store-fx-final-v2')
    );

    insert into public.inventory_holdings(
      game_session_id, inventory_account_id, game_item_id, quantity_owned,
      quantity_reserved, average_unit_cost, cost_currency_code, version
    ) values (
      ${sqlLiteral(gameOne.id)}::uuid,
      'd2000000-0000-0000-0000-000000000001'::uuid,
      ${sqlLiteral(gameOne.gameItemId)}::uuid,
      5,
      0,
      2.5000,
      'ECO',
      1
    );
  `);
}

function businessQuote({ allocations, idempotencyKey, expectedVersion }) {
  return serviceJson(`
    select public.create_business_store_offer_funding_quote_v1(
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(buyer)}::uuid,
      ${sqlLiteral(gameOne.offerKey)},
      1,
      ${expectedVersion},
      ${sqlLiteral(JSON.stringify(allocations))}::jsonb,
      ${sqlLiteral(idempotencyKey)}
    )::text
  `);
}

function readBusinessReceipt(
  receiptKey,
  gameId = gameOne.id,
  buyerId = buyer,
) {
  return serviceJson(`
    select public.read_business_store_offer_funding_receipt_v1(
      ${sqlLiteral(gameId)}::uuid,
      ${sqlLiteral(buyerId)}::uuid,
      ${sqlLiteral(receiptKey)}
    )::text
  `);
}

function targetContributionTotal(quote) {
  return quote.fundingQuote.lines.reduce(
    (sum, line) => sum + Number(line.target_contribution),
    0,
  );
}

const privilege = runJson(`
  select jsonb_build_object(
    'businessAuthenticatedExecute', has_function_privilege(
      'authenticated',
      'public.settle_business_store_offer_funding_v2(uuid,uuid,text,text)',
      'EXECUTE'
    ),
    'businessAnonExecute', has_function_privilege(
      'anon',
      'public.settle_business_store_offer_funding_v2(uuid,uuid,text,text)',
      'EXECUTE'
    ),
    'businessServiceExecute', has_function_privilege(
      'service_role',
      'public.settle_business_store_offer_funding_v2(uuid,uuid,text,text)',
      'EXECUTE'
    ),
    'systemQuoteAuthenticatedExecute', has_function_privilege(
      'authenticated',
      'public.create_system_store_offer_funding_quote_v2(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)',
      'EXECUTE'
    ),
    'systemQuoteAnonExecute', has_function_privilege(
      'anon',
      'public.create_system_store_offer_funding_quote_v2(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)',
      'EXECUTE'
    ),
    'systemQuoteServiceExecute', has_function_privilege(
      'service_role',
      'public.create_system_store_offer_funding_quote_v2(uuid,uuid,text,integer,bigint,jsonb,text,timestamp with time zone)',
      'EXECUTE'
    ),
    'systemSettleAuthenticatedExecute', has_function_privilege(
      'authenticated',
      'public.settle_system_store_offer_funding_v2(uuid,uuid,text,text)',
      'EXECUTE'
    ),
    'systemSettleAnonExecute', has_function_privilege(
      'anon',
      'public.settle_system_store_offer_funding_v2(uuid,uuid,text,text)',
      'EXECUTE'
    ),
    'systemSettleServiceExecute', has_function_privilege(
      'service_role',
      'public.settle_system_store_offer_funding_v2(uuid,uuid,text,text)',
      'EXECUTE'
    ),
    'businessReadAuthenticatedExecute', has_function_privilege(
      'authenticated',
      'public.read_business_store_offer_funding_receipt_v1(uuid,uuid,text)',
      'EXECUTE'
    ),
    'businessReadAnonExecute', has_function_privilege(
      'anon',
      'public.read_business_store_offer_funding_receipt_v1(uuid,uuid,text)',
      'EXECUTE'
    ),
    'businessReadServiceExecute', has_function_privilege(
      'service_role',
      'public.read_business_store_offer_funding_receipt_v1(uuid,uuid,text)',
      'EXECUTE'
    )
  )::text;
`);
assert.equal(privilege.businessAuthenticatedExecute, false);
assert.equal(privilege.businessAnonExecute, false);
assert.equal(privilege.businessServiceExecute, true);
assert.equal(privilege.systemQuoteAuthenticatedExecute, false);
assert.equal(privilege.systemQuoteAnonExecute, false);
assert.equal(privilege.systemQuoteServiceExecute, true);
assert.equal(privilege.systemSettleAuthenticatedExecute, false);
assert.equal(privilege.systemSettleAnonExecute, false);
assert.equal(privilege.systemSettleServiceExecute, true);
assert.equal(privilege.businessReadAuthenticatedExecute, false);
assert.equal(privilege.businessReadAnonExecute, false);
assert.equal(privilege.businessReadServiceExecute, true);

const ecoKey = accountKey(gameOne.id, buyer, "ECO");
const nrcKey = accountKey(gameOne.id, buyer, "NRC");
const yrcKey = accountKey(gameOne.id, buyer, "YRC");

// One-account final-null intent derives the exact authoritative target. An
// identical replay returns the original commercial and C0 quote identities.
const oneIntent = [{ sourceAccountKey: ecoKey, targetAmount: null }];
const oneQuote = seededQuote({
  allocations: oneIntent,
  idempotencyKey: "d-seeded-final-null-one",
});
assert.match(oneQuote.quoteKey, /^quote_[0-9a-f]{32}$/u);
assert.match(oneQuote.fundingQuote.quote_key, /^pfq_[0-9a-f]{32}$/u);
assert.equal(oneQuote.fundingQuote.lines.length, 1);
assert.equal(oneQuote.fundingQuote.lines[0].source_account_key, ecoKey);
assert.equal(
  Number(oneQuote.fundingQuote.lines[0].target_contribution),
  Number(oneQuote.finalTotalPrice),
);
const oneReplay = seededQuote({
  allocations: oneIntent,
  idempotencyKey: "d-seeded-final-null-one",
});
assert.equal(oneReplay.quoteKey, oneQuote.quoteKey);
assert.equal(oneReplay.fundingQuote.quote_key, oneQuote.fundingQuote.quote_key);
assert.equal(oneReplay.replayed, true);

// Ordered two-account intent computes only the final remainder after the
// seeded price and currency precision are known. The retained C0 authority
// then emits lines in canonical account-key order for deterministic locking.
const twoQuote = seededQuote({
  allocations: [
    { sourceAccountKey: nrcKey, targetAmount: "1" },
    { sourceAccountKey: ecoKey, targetAmount: null },
  ],
  idempotencyKey: "d-seeded-final-null-two",
});
assert.deepEqual(
  twoQuote.fundingQuote.lines.map((line) => line.source_account_key),
  [nrcKey, ecoKey].sort(),
);
assert.equal(
  Number(twoQuote.fundingQuote.lines.find((line) =>
    line.source_account_key === nrcKey
  ).target_contribution),
  1,
);
assert.equal(
  targetContributionTotal(twoQuote),
  Number(twoQuote.finalTotalPrice),
);
assert.ok(Number(twoQuote.fundingQuote.lines[1].target_contribution) > 0);

// An all-foreign allocation is not a same-currency compatibility case: every
// selected Checking account differs from the Store target currency and the
// immutable C0 quote must retain explicit FX evidence for every source line.
const allForeignQuote = seededQuote({
  allocations: [
    { sourceAccountKey: nrcKey, targetAmount: "1" },
    { sourceAccountKey: yrcKey, targetAmount: null },
  ],
  idempotencyKey: "d-seeded-final-null-all-foreign",
});
assert.equal(allForeignQuote.fundingQuote.lines.length, 2);
assert.equal(targetContributionTotal(allForeignQuote), Number(allForeignQuote.finalTotalPrice));
assert.ok(allForeignQuote.fundingQuote.requires_fx);
assert.ok(allForeignQuote.fundingQuote.lines.every((line) =>
  line.source_currency_code !== allForeignQuote.fundingQuote.target_currency_code &&
  line.requires_fx === true
));

// The live handler selects a public seeded/NPC offer and invokes the
// offer-bound system adapter. Distinct outer idempotency keys for identical
// intent must create independent Store and C0 quotes because their immutable
// context keys are also distinct.
const seededSystemOffer = systemOfferSnapshot("seeded");
assert.match(seededSystemOffer.offerKey, /^sof_[0-9a-f]{32}$/u);
const seededSystemBefore = systemOfferQuantity(seededSystemOffer.offerKey);
const seededSystemQuote = systemOfferQuote({
  offerKey: seededSystemOffer.offerKey,
  expectedVersion: Number(seededSystemOffer.version),
  allocations: oneIntent,
  idempotencyKey: "d-system-seeded-fresh-a",
});
const seededSystemFreshQuote = systemOfferQuote({
  offerKey: seededSystemOffer.offerKey,
  expectedVersion: Number(seededSystemOffer.version),
  allocations: oneIntent,
  idempotencyKey: "d-system-seeded-fresh-b",
});
assert.notEqual(seededSystemFreshQuote.quoteKey, seededSystemQuote.quoteKey);
assert.notEqual(
  seededSystemFreshQuote.fundingQuote.quote_key,
  seededSystemQuote.fundingQuote.quote_key,
);
assert.equal(seededSystemQuote.offerKey, seededSystemOffer.offerKey);
assert.equal(seededSystemQuote.sellerKind, "seeded");
assert.equal(
  seededSystemQuote.fundingQuote.funding_context_kind,
  "store.system-offer",
);
assert.equal(
  seededSystemQuote.fundingQuote.funding_context_key,
  seededSystemQuote.quoteKey,
);
assert.match(seededSystemQuote.contextDigest, /^[0-9a-f]{64}$/u);
const seededSystemBinding = runJson(`
  select jsonb_build_object(
    'storeDigest', store_quote.funding_context_hash,
    'fundingDigest', funding_quote.funding_context_hash
  )::text
  from public.store_purchase_quotes as store_quote
  join public.purchase_funding_quotes as funding_quote
    on funding_quote.game_session_id = store_quote.game_session_id
   and funding_quote.id = store_quote.funding_quote_id
  where store_quote.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and store_quote.public_quote_key = ${sqlLiteral(seededSystemQuote.quoteKey)};
`);
assert.equal(
  seededSystemBinding.storeDigest,
  seededSystemQuote.contextDigest,
);
assert.equal(seededSystemBinding.fundingDigest, seededSystemQuote.contextDigest);
for (const column of ["seller_offer_version", "available_quantity_at_quote"]) {
  expectSqlError(`
    begin;
    set local session_replication_role = replica;
    update public.store_purchase_quotes
    set ${column} = null
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and public_quote_key = ${sqlLiteral(seededSystemQuote.quoteKey)};
    commit;
  `, /store_purchase_quotes_seller_offer_binding_check/u);
}
const seededSystemReceipt = settleSystemOffer(
  seededSystemQuote.quoteKey,
  "d-system-seeded-settle",
);
assert.equal(seededSystemReceipt.offerKey, seededSystemOffer.offerKey);
assert.equal(seededSystemReceipt.sellerKind, "seeded");
assert.equal(
  Number(seededSystemReceipt.offerVersionAfter),
  Number(seededSystemOffer.version),
);
assert.equal(
  Number(seededSystemReceipt.remainingSellerQuantity),
  seededSystemBefore - 1,
);
assert.match(seededSystemReceipt.inventoryTransactionKey, /^itx_[0-9a-f]{32}$/u);
assert.equal(
  seededSystemReceipt.fundingReceipt.funding_context_kind,
  "store.system-offer",
);
assert.equal(JSON.stringify(seededSystemReceipt).match(UUID), null);
for (
  const column of ["seller_offer_version_after", "remaining_seller_quantity"]
) {
  expectSqlError(`
    begin;
    set local session_replication_role = replica;
    update public.store_purchases
    set ${column} = null
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and public_receipt_key = ${sqlLiteral(seededSystemReceipt.receiptKey)};
    commit;
  `, /store_purchases_seller_offer_result_check/u);
}

// The live adapter rejects an otherwise valid historical item-rooted quote
// before any Store, Banking, or Inventory effect can occur.
const legacyBalanceBefore = Number(runSql(`
  select balance_row.balance
  from public.bank_accounts as account_row
  join public.economic_parties as party_row
    on party_row.game_session_id = account_row.game_session_id
   and party_row.id = account_row.party_id
  join public.account_balances as balance_row
    on balance_row.game_session_id = account_row.game_session_id
   and balance_row.bank_account_id = account_row.id
  where account_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and account_row.public_key = ${sqlLiteral(ecoKey)}
    and party_row.player_id = ${sqlLiteral(buyer)}::uuid;
`).output);
const legacyInventoryBefore = playerInventoryQuantity(gameOne, buyer);
const legacyStockBefore = systemOfferQuantity(seededSystemOffer.offerKey);
expectSqlError(`
  begin;
  set local role service_role;
  select public.settle_system_store_offer_funding_v2(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyer)}::uuid,
    ${sqlLiteral(oneQuote.quoteKey)},
    'd-system-legacy-rejected'
  );
  commit;
`, /STORE_SYSTEM_OFFER_FUNDED_SETTLEMENT_LEGACY_CONFLICT/u);
assert.equal(Number(runSql(`
  select balance_row.balance
  from public.bank_accounts as account_row
  join public.account_balances as balance_row
    on balance_row.game_session_id = account_row.game_session_id
   and balance_row.bank_account_id = account_row.id
  where account_row.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and account_row.public_key = ${sqlLiteral(ecoKey)};
`).output), legacyBalanceBefore);
assert.equal(playerInventoryQuantity(gameOne, buyer), legacyInventoryBefore);
assert.equal(systemOfferQuantity(seededSystemOffer.offerKey), legacyStockBefore);

// NPC offers use that same public repository and settlement adapter. Their
// finite custody decrements atomically and their optimistic offer version
// advances once, while seeded compatibility versions remain unchanged.
seedNpcOffer();
const npcOffer = systemOfferSnapshot("npc");
const npcBefore = systemOfferQuantity(npcOffer.offerKey);
const npcQuote = systemOfferQuote({
  offerKey: npcOffer.offerKey,
  expectedVersion: Number(npcOffer.version),
  allocations: [{ sourceAccountKey: yrcKey, targetAmount: null }],
  idempotencyKey: "d-system-npc-quote",
});
assert.equal(npcQuote.sellerKind, "npc");
assert.equal(npcQuote.offerKey, npcOffer.offerKey);
assert.equal(npcQuote.fundingQuote.funding_context_kind, "store.system-offer");
const npcReceipt = settleSystemOffer(
  npcQuote.quoteKey,
  "d-system-npc-settle",
);
assert.equal(npcReceipt.sellerKind, "npc");
assert.equal(Number(npcReceipt.offerVersionBefore), Number(npcOffer.version));
assert.equal(
  Number(npcReceipt.offerVersionAfter),
  Number(npcOffer.version) + 1,
);
assert.equal(Number(npcReceipt.remainingSellerQuantity), npcBefore - 1);
assert.equal(systemOfferQuantity(npcOffer.offerKey), npcBefore - 1);
assert.match(npcReceipt.inventoryTransactionKey, /^itx_[0-9a-f]{32}$/u);
assert.equal(JSON.stringify(npcReceipt).match(UUID), null);

// Receipt replay is an immutable reread. A later purchase of the same item
// advances the live holding, but may not rewrite purchase A's owned-after
// evidence.
assert.ok(
  playerInventoryQuantity(gameOne, buyer) >
    Number(seededSystemReceipt.inventoryQuantityOwned),
);
const seededSystemReplayAfterNpc = settleSystemOffer(
  seededSystemQuote.quoteKey,
  "d-system-seeded-settle",
);
assert.deepEqual(seededSystemReplayAfterNpc, {
  ...seededSystemReceipt,
  alreadyCompleted: true,
});

const rejectedQuoteCountBefore = Number(runSql(`
  select count(*)
  from public.store_purchase_quotes
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and request_idempotency_key like 'd-invalid-%';
`).output);

function expectSeededAllocationError(allocations, idempotencyKey, pattern) {
  expectSqlError(`
    begin;
    set local role service_role;
    select public.create_seeded_store_funding_quote_v1(
      ${sqlLiteral(gameOne.id)}::uuid,
      ${sqlLiteral(buyer)}::uuid,
      'fixture_widget_one',
      1,
      ${sqlLiteral(JSON.stringify(allocations))}::jsonb,
      ${sqlLiteral(idempotencyKey)},
      statement_timestamp()
    );
    commit;
  `, pattern);
}

expectSeededAllocationError([
  { sourceAccountKey: nrcKey, targetAmount: null },
  { sourceAccountKey: ecoKey, targetAmount: null },
], "d-invalid-allocation", /STORE_FUNDING_ALLOCATIONS_INVALID/u);
expectSeededAllocationError([
  { sourceAccountKey: ecoKey, targetAmount: "1" },
  { sourceAccountKey: ecoKey, targetAmount: null },
], "d-invalid-duplicate", /STORE_FUNDING_DUPLICATE_ACCOUNT/u);
expectSeededAllocationError([
  { sourceAccountKey: ecoKey, targetAmount: "1.001" },
  { sourceAccountKey: nrcKey, targetAmount: null },
], "d-invalid-precision", /STORE_FUNDING_TARGET_PRECISION_INVALID/u);
expectSeededAllocationError([
  { sourceAccountKey: ecoKey, targetAmount: "999999" },
  { sourceAccountKey: nrcKey, targetAmount: null },
], "d-invalid-remainder", /STORE_FUNDING_REMAINDER_INVALID/u);

const rejectedQuoteCountAfter = Number(runSql(`
  select count(*)
  from public.store_purchase_quotes
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and request_idempotency_key like 'd-invalid-%';
`).output);
assert.equal(rejectedQuoteCountAfter, rejectedQuoteCountBefore);

// Three-account Business intent preserves immutable final-null hashing and
// exact target reconciliation. C0 emits canonical account-key line order. The
// v2 settlement accepts quote intent only; offer, quantity, version, and seller
// authority remain server-derived.
const offerVersion = currentOfferVersion(gameOne);
const threeIntent = [
  { sourceAccountKey: ecoKey, targetAmount: "1.25" },
  { sourceAccountKey: nrcKey, targetAmount: "2.25" },
  { sourceAccountKey: yrcKey, targetAmount: null },
];
const businessFundedQuote = businessQuote({
  allocations: threeIntent,
  idempotencyKey: "d-business-final-null-three",
  expectedVersion: offerVersion,
});
const businessFundedReplay = businessQuote({
  allocations: threeIntent,
  idempotencyKey: "d-business-final-null-three",
  expectedVersion: offerVersion,
});
assert.equal(businessFundedReplay.quoteKey, businessFundedQuote.quoteKey);
assert.equal(
  businessFundedReplay.fundingQuote.quote_key,
  businessFundedQuote.fundingQuote.quote_key,
);
assert.equal(businessFundedReplay.replayed, true);
const businessFundedFreshQuote = businessQuote({
  allocations: threeIntent,
  idempotencyKey: "d-business-final-null-fresh",
  expectedVersion: offerVersion,
});
assert.notEqual(businessFundedFreshQuote.quoteKey, businessFundedQuote.quoteKey);
assert.notEqual(
  businessFundedFreshQuote.fundingQuote.quote_key,
  businessFundedQuote.fundingQuote.quote_key,
);
assert.deepEqual(
  businessFundedQuote.fundingQuote.lines.map((line) =>
    line.source_account_key
  ),
  [ecoKey, nrcKey, yrcKey].sort(),
);
assert.equal(businessFundedQuote.fundingQuote.lines.length, 3);
assert.equal(Number(businessFundedQuote.finalTotalPrice), 7.5);
assert.equal(targetContributionTotal(businessFundedQuote), 7.5);
assert.equal(
  Number(businessFundedQuote.fundingQuote.lines.find((line) =>
    line.source_account_key === yrcKey
  ).target_contribution),
  4,
);

// Materializing to the same concrete amounts is not an identical replay: the
// immutable request fingerprint is over the original ordered intent.
expectSqlError(`
  begin;
  set local role service_role;
  select public.create_business_store_offer_funding_quote_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyer)}::uuid,
    ${sqlLiteral(gameOne.offerKey)},
    1,
    ${offerVersion},
    ${sqlLiteral(JSON.stringify([
      { sourceAccountKey: ecoKey, targetAmount: "1.25" },
      { sourceAccountKey: nrcKey, targetAmount: "2.25" },
      { sourceAccountKey: yrcKey, targetAmount: "4" },
    ]))}::jsonb,
    'd-business-final-null-three'
  );
  commit;
`, /STORE_OFFER_FUNDED_QUOTE_IDEMPOTENCY_CONFLICT/u);

const businessBefore = businessCheckingBalance(gameOne);
const listingBefore = listingQuantity(gameOne);
const inventoryBefore = playerInventoryQuantity(gameOne, buyer);
const businessReceipt = serviceJson(`
  select public.settle_business_store_offer_funding_v2(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyer)}::uuid,
    ${sqlLiteral(businessFundedQuote.quoteKey)},
    'd-business-final-null-settle'
  )::text
`);
assert.match(businessReceipt.receiptKey, /^spr_[0-9a-f]{32}$/u);
assert.match(
  businessReceipt.fundingReceipt.receipt_key,
  /^pfr_[0-9a-f]{32}$/u,
);
assert.equal(businessCheckingBalance(gameOne), businessBefore + 7.5);
assert.equal(listingQuantity(gameOne), listingBefore - 1);
assert.equal(playerInventoryQuantity(gameOne, buyer), inventoryBefore + 1);
assert.equal(Number(businessReceipt.grossRevenue), 7.5);
assert.equal(JSON.stringify(businessReceipt).match(UUID), null);
const businessReceiptRead = readBusinessReceipt(businessReceipt.receiptKey);
assert.deepEqual(businessReceiptRead, {
  ...businessReceipt,
  replayed: true,
});
assert.equal(JSON.stringify(businessReceiptRead).match(UUID), null);
expectSqlError(`
  begin;
  set local role service_role;
  select public.read_business_store_offer_funding_receipt_v1(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(gameOne.buyerTwoId)}::uuid,
    ${sqlLiteral(businessReceipt.receiptKey)}
  );
  commit;
`, /STORE_OFFER_FUNDED_RECEIPT_NOT_FOUND/u);
expectSqlError(`
  begin;
  set local role service_role;
  select public.read_business_store_offer_funding_receipt_v1(
    ${sqlLiteral(gameTwo.id)}::uuid,
    ${sqlLiteral(gameTwo.buyerOneId)}::uuid,
    ${sqlLiteral(businessReceipt.receiptKey)}
  );
  commit;
`, /STORE_OFFER_FUNDED_RECEIPT_NOT_FOUND/u);

// A completed settlement key is bound to its original quote. Reusing that key
// with a different valid quote must conflict before any second economic write.
const conflictingBusinessQuote = businessQuote({
  allocations: [{ sourceAccountKey: yrcKey, targetAmount: null }],
  idempotencyKey: "d-business-different-quote",
  expectedVersion: currentOfferVersion(gameOne),
});
expectSqlError(`
  begin;
  set local role service_role;
  select public.settle_business_store_offer_funding_v2(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyer)}::uuid,
    ${sqlLiteral(conflictingBusinessQuote.quoteKey)},
    'd-business-final-null-settle'
  );
  commit;
`, /STORE_OFFER_FUNDED_SETTLEMENT_IDEMPOTENCY_CONFLICT/u);
assert.equal(businessCheckingBalance(gameOne), businessBefore + 7.5);
assert.equal(listingQuantity(gameOne), listingBefore - 1);

assert.equal(playerInventoryQuantity(gameOne, buyer), inventoryBefore + 1);

const businessReplay = serviceJson(`
  select public.settle_business_store_offer_funding_v2(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyer)}::uuid,
    ${sqlLiteral(businessFundedQuote.quoteKey)},
    'd-business-final-null-settle'
  )::text
`);
assert.equal(businessReplay.receiptKey, businessReceipt.receiptKey);
assert.equal(businessReplay.replayed, true);
assert.equal(businessCheckingBalance(gameOne), businessBefore + 7.5);
assert.equal(listingQuantity(gameOne), listingBefore - 1);

// A later purchase may change the Buyer's live holding and seller balances,
// but reading receipt A remains an immutable projection of receipt A.
serviceJson(`
  select public.settle_business_store_offer_funding_v2(
    ${sqlLiteral(gameOne.id)}::uuid,
    ${sqlLiteral(buyer)}::uuid,
    ${sqlLiteral(conflictingBusinessQuote.quoteKey)},
    'd-business-second-settle'
  )::text
`);
assert.deepEqual(readBusinessReceipt(businessReceipt.receiptKey), {
  ...businessReceipt,
  replayed: true,
});
assert.equal(businessCheckingBalance(gameOne), businessBefore + 15);
assert.equal(listingQuantity(gameOne), listingBefore - 2);
assert.equal(playerInventoryQuantity(gameOne, buyer), inventoryBefore + 2);

// The same public-looking quote key cannot cross the authenticated two-game
// boundary, and a rejected call leaves no settlement replay residue in game 2.
expectSqlError(`
  begin;
  set local role service_role;
  select public.settle_business_store_offer_funding_v2(
    ${sqlLiteral(gameTwo.id)}::uuid,
    ${sqlLiteral(gameTwo.buyerOneId)}::uuid,
    ${sqlLiteral(businessFundedQuote.quoteKey)},
    'd-two-game-cross-scope'
  );
  commit;
`, /STORE_OFFER_FUNDED_SETTLEMENT_QUOTE_NOT_FOUND|STORE_OFFER_SETTLEMENT_QUOTE_NOT_FOUND/u);
assert.equal(Number(runSql(`
  select count(*)
  from public.store_offer_purchase_receipts
  where game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
    and request_idempotency_key = 'd-two-game-cross-scope';
`).output), 0);

console.log(
  "Business Player Store/FX final database acceptance passed: legacy all-positive compatibility, ordered 1-3 final-null allocation intent, exact funded settlement, replay/conflict, privacy, rollback, and two-game isolation are preserved.",
);
