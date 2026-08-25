#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  createQuote,
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

function raceOffer({ index, hex, name }) {
  const suffix = String(index).padStart(12, "0");
  return Object.freeze({
    ...gameOne,
    expectedOfferVersion: 2,
    gameItemId: `61000000-0000-0000-0000-${suffix}`,
    gameItemKey: `itm_${hex.repeat(32)}`,
    storeItemId: `91000000-0000-0000-0000-${suffix}`,
    storeItemKey: `phase10a3_race_${index}`,
    offerId: `a1000000-0000-0000-0000-${suffix}`,
    offerKey: `sof_${hex.repeat(32)}`,
    canonicalKey: `phase10a3.race.${index}`,
    name,
  });
}

const lanes = Object.freeze({
  buyerA: raceOffer({ index: 1, hex: "a", name: "Buyer Race A" }),
  buyerB: raceOffer({ index: 2, hex: "b", name: "Buyer Race B" }),
  listing: raceOffer({ index: 3, hex: "c", name: "Listing Race" }),
  purchaseFirst: raceOffer({ index: 4, hex: "d", name: "Purchase First" }),
  withdrawalFirst: raceOffer({ index: 5, hex: "e", name: "Withdrawal First" }),
  cashA: raceOffer({ index: 6, hex: "f", name: "Cash Race A" }),
  cashB: raceOffer({ index: 7, hex: "7", name: "Cash Race B" }),
});

function seedRaceOfferSql(lane) {
  return `
insert into public.game_items (
  id, public_key, game_session_id, canonical_key, source_kind, name,
  item_class, subtype, stackable, serialized, transferable, status
) values (
  ${sqlLiteral(lane.gameItemId)}::uuid, ${sqlLiteral(lane.gameItemKey)},
  ${sqlLiteral(lane.id)}::uuid, ${sqlLiteral(lane.canonicalKey)},
  'business_product', ${sqlLiteral(lane.name)}, 'finished_good', 'widget',
  true, false, true, 'active'
);

insert into public.store_items (
  id, game_session_id, item_key, name, category, price, currency_code,
  stock_quantity, status, visibility, game_item_id
) values (
  ${sqlLiteral(lane.storeItemId)}::uuid, ${sqlLiteral(lane.id)}::uuid,
  ${sqlLiteral(lane.storeItemKey)}, ${sqlLiteral(lane.name)}, 'goods', 7.50,
  'ECO', 0, 'active', 'visible', ${sqlLiteral(lane.gameItemId)}::uuid
);

insert into public.store_seller_offers (
  id, public_key, game_session_id, store_item_id, game_item_id,
  seller_party_id, inventory_account_id, seller_kind, unit_price,
  currency_code, status, replenishment_policy, creation_idempotency_key,
  creation_request_hash, version, metadata
)
select ${sqlLiteral(lane.offerId)}::uuid, ${sqlLiteral(lane.offerKey)},
  ${sqlLiteral(lane.id)}::uuid, ${sqlLiteral(lane.storeItemId)}::uuid,
  ${sqlLiteral(lane.gameItemId)}::uuid, party_row.id, null, 'business', 7.50,
  'ECO', 'draft', 'none', ${
    sqlLiteral(`phase10a3-race-offer-${lane.storeItemKey}`)
  },
  encode(extensions.digest(convert_to(${
    sqlLiteral(lane.offerKey)
  }, 'UTF8'), 'sha256'), 'hex'),
  1, jsonb_build_object('fixture', 'phase10a3_concurrency')
from public.economic_parties as party_row
where party_row.game_session_id = ${sqlLiteral(lane.id)}::uuid
  and party_row.business_id = ${sqlLiteral(lane.businessId)}::uuid
  and party_row.party_kind = 'business';

do $lane$
declare
  v_listing_account_id uuid;
begin
  v_listing_account_id := economy_private.ensure_business_store_listing_account_v2(
    ${sqlLiteral(lane.id)}::uuid,
    ${sqlLiteral(lane.businessId)}::uuid,
    ${sqlLiteral(lane.offerId)}::uuid
  );

  update public.store_seller_offers
  set inventory_account_id = v_listing_account_id,
      status = 'active',
      version = 2
  where id = ${sqlLiteral(lane.offerId)}::uuid;

  insert into public.inventory_holdings (
    game_session_id, inventory_account_id, game_item_id, quantity_owned,
    quantity_reserved, average_unit_cost, cost_currency_code, version
  ) values (
    ${sqlLiteral(lane.id)}::uuid, v_listing_account_id,
    ${sqlLiteral(lane.gameItemId)}::uuid, 10, 0, 2.5000, 'ECO', 1
  );
end
$lane$;
`;
}

function settlementCall({
  game,
  quoteKey,
  buyerId = game.buyerOneId,
  quantity = 2,
  expectedVersion = game.expectedOfferVersion,
  idempotencyKey,
}) {
  return `public.settle_business_store_offer_v2(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(buyerId)}::uuid,
    ${sqlLiteral(game.offerKey)},
    ${sqlLiteral(quoteKey)},
    ${quantity},
    ${expectedVersion},
    ${sqlLiteral(idempotencyKey)}
  )`;
}

function withdrawalCall({
  game,
  expectedVersion = game.expectedOfferVersion,
  idempotencyKey,
}) {
  return `public.request_business_store_offer_withdrawal_v2(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(game.businessKey)},
    ${sqlLiteral(game.offerKey)},
    'full',
    null::integer,
    ${expectedVersion},
    ${sqlLiteral(idempotencyKey)}
  )`;
}

function heldCallSql(call, resultMarker, holdMarker) {
  return `begin;
set local role service_role;
select ${sqlLiteral(`${resultMarker}:`)} || (${call})::text;
select ${sqlLiteral(holdMarker)};
`;
}

function committedCallSql(call, resultMarker, doneMarker) {
  return `begin;
set local role service_role;
select ${sqlLiteral(`${resultMarker}:`)} || (${call})::text;
commit;
select ${sqlLiteral(doneMarker)};
`;
}

function failingCallSql(call) {
  return `begin;
set local role service_role;
select (${call})::text;
commit;
`;
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

function parseResult(value, marker) {
  const prefix = `${marker}:`;
  const line = value.output.split(/\r?\n/u).find((entry) =>
    entry.startsWith(prefix)
  );
  assert.ok(line, `missing ${marker} in psql output: ${value.output}`);
  return JSON.parse(line.slice(prefix.length));
}

function numeric(value) {
  return Number.parseFloat(String(value));
}

function assertMoney(actual, expected, label) {
  assert.equal(numeric(actual), expected, label);
}

async function sameIdempotencyRace() {
  const quote = createQuote(gameOne, {
    buyerId: gameOne.buyerOneId,
    quantity: 2,
    expectedVersion: 2,
    idempotencyKey: "phase10a3-concurrency-idem-quote",
  });
  const call = settlementCall({
    game: gameOne,
    quoteKey: quote.quoteKey,
    buyerId: gameOne.buyerOneId,
    quantity: 2,
    expectedVersion: 2,
    idempotencyKey: "phase10a3-concurrency-same-idem",
  });
  const first = await session("phase10a3_same_idem_first");
  const second = await session("phase10a3_same_idem_second");
  try {
    first.write(heldCallSql(call, "IDEM_FIRST_RESULT", "IDEM_FIRST_HOLD"));
    await first.waitFor("IDEM_FIRST_HOLD");

    second.write(committedCallSql(
      call,
      "IDEM_SECOND_RESULT",
      "IDEM_SECOND_DONE",
    ));
    const wait = await pollForDatabaseWait("phase10a3_same_idem_second");
    assert.equal(wait.waitEventType, "Lock");

    first.write("commit; select 'IDEM_FIRST_DONE';");
    await first.waitFor("IDEM_FIRST_DONE");
    await second.waitFor("IDEM_SECOND_DONE");

    const firstResult = parseResult(first, "IDEM_FIRST_RESULT");
    const secondResult = parseResult(second, "IDEM_SECOND_RESULT");
    assert.equal(firstResult.replayed, false);
    assert.equal(secondResult.replayed, true);
    assert.equal(secondResult.receiptKey, firstResult.receiptKey);
    const comparableFirst = { ...firstResult };
    const comparableSecond = { ...secondResult };
    delete comparableFirst.replayed;
    delete comparableSecond.replayed;
    assert.deepEqual(comparableSecond, comparableFirst);

    const facts = runJson(`select jsonb_build_object(
      'receiptCount', count(*),
      'ledgerCount', coalesce(sum((select count(*) from public.ledger_entries le
        where le.source_id = r.id)), 0),
      'transactionCount', coalesce(sum((select count(*) from public.inventory_transactions it
        where it.source_id = r.id)), 0),
      'activityCount', coalesce(sum((select count(*) from public.business_activity_events ae
        where ae.source_id = r.id)), 0),
      'buyerDebit', min(r.buyer_debit),
      'businessCredit', min(r.business_credit),
      'cogs', min(r.cost_of_goods_sold),
      'margin', min(r.gross_margin),
      'remaining', min(r.remaining_listed_quantity),
      'offerVersion', (select version from public.store_seller_offers
        where id = ${sqlLiteral(gameOne.offerId)}::uuid),
      'quoteStatus', min(q.status),
      'quoteVersion', min(q.version),
      'buyerBalance', (select balance from public.account_balances
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and player_id = ${sqlLiteral(gameOne.buyerOneId)}::uuid
          and business_id is null and account_type = 'checking' and currency_code = 'ECO'),
      'businessCash', (select balance from public.account_balances
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and business_id = ${sqlLiteral(gameOne.businessId)}::uuid
          and currency_code = 'ECO')
    )::text
    from public.store_offer_purchase_receipts r
    join public.store_offer_purchase_quotes q on q.id = r.quote_id
    where r.game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and r.request_idempotency_key = 'phase10a3-concurrency-same-idem';`);
    assert.equal(facts.receiptCount, 1);
    assert.equal(facts.ledgerCount, 2);
    assert.equal(facts.transactionCount, 1);
    assert.equal(facts.activityCount, 1);
    assertMoney(facts.buyerDebit, 15, "same-idempotency buyer debit");
    assertMoney(facts.businessCredit, 15, "same-idempotency Business credit");
    assertMoney(facts.cogs, 5, "same-idempotency COGS");
    assertMoney(facts.margin, 10, "same-idempotency gross margin");
    assert.equal(facts.remaining, 8);
    assert.equal(facts.offerVersion, 3);
    assert.equal(facts.quoteStatus, "used");
    assert.equal(facts.quoteVersion, 2);
    assertMoney(facts.buyerBalance, 85, "same-idempotency Buyer balance");
    assertMoney(facts.businessCash, 35, "same-idempotency Business cash");
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

async function sameOfferOversellRace() {
  const quoteOne = createQuote(gameOne, {
    buyerId: gameOne.buyerOneId,
    quantity: 5,
    expectedVersion: 3,
    idempotencyKey: "phase10a3-oversell-quote-one",
  });
  const quoteTwo = createQuote(gameOne, {
    buyerId: gameOne.buyerTwoId,
    quantity: 5,
    expectedVersion: 3,
    idempotencyKey: "phase10a3-oversell-quote-two",
  });
  const firstCall = settlementCall({
    game: gameOne,
    quoteKey: quoteOne.quoteKey,
    buyerId: gameOne.buyerOneId,
    quantity: 5,
    expectedVersion: 3,
    idempotencyKey: "phase10a3-oversell-first",
  });
  const secondCall = settlementCall({
    game: gameOne,
    quoteKey: quoteTwo.quoteKey,
    buyerId: gameOne.buyerTwoId,
    quantity: 5,
    expectedVersion: 3,
    idempotencyKey: "phase10a3-oversell-second",
  });
  const first = await session("phase10a3_oversell_first");
  const second = await session("phase10a3_oversell_second");
  try {
    first.write(heldCallSql(
      firstCall,
      "OVERSELL_FIRST_RESULT",
      "OVERSELL_FIRST_HOLD",
    ));
    await first.waitFor("OVERSELL_FIRST_HOLD");
    second.write(failingCallSql(secondCall));
    const wait = await pollForDatabaseWait("phase10a3_oversell_second");
    assert.equal(wait.waitEventType, "Lock");

    first.write("commit; select 'OVERSELL_FIRST_DONE';");
    await first.waitFor("OVERSELL_FIRST_DONE");
    await second.waitFor("STORE_OFFER_SETTLEMENT_OFFER_VERSION_CONFLICT");
    assert.equal(parseResult(first, "OVERSELL_FIRST_RESULT").replayed, false);

    const facts = runJson(`select jsonb_build_object(
      'listed', h.quantity_owned,
      'offerVersion', o.version,
      'firstReceiptCount', (select count(*) from public.store_offer_purchase_receipts
        where request_idempotency_key = 'phase10a3-oversell-first'),
      'secondReceiptCount', (select count(*) from public.store_offer_purchase_receipts
        where request_idempotency_key = 'phase10a3-oversell-second'),
      'quoteOneStatus', (select status from public.store_offer_purchase_quotes
        where public_key = ${sqlLiteral(quoteOne.quoteKey)}),
      'quoteTwoStatus', (select status from public.store_offer_purchase_quotes
        where public_key = ${sqlLiteral(quoteTwo.quoteKey)}),
      'buyerOneBalance', (select balance from public.account_balances
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and player_id = ${sqlLiteral(gameOne.buyerOneId)}::uuid
          and business_id is null and account_type = 'checking' and currency_code = 'ECO'),
      'buyerTwoBalance', (select balance from public.account_balances
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and player_id = ${sqlLiteral(gameOne.buyerTwoId)}::uuid
          and business_id is null and account_type = 'checking' and currency_code = 'ECO')
    )::text
    from public.store_seller_offers o
    join public.inventory_holdings h
      on h.inventory_account_id = o.inventory_account_id
      and h.game_item_id = o.game_item_id
    where o.id = ${sqlLiteral(gameOne.offerId)}::uuid;`);
    assert.equal(facts.listed, 3);
    assert.equal(facts.offerVersion, 4);
    assert.equal(facts.firstReceiptCount, 1);
    assert.equal(facts.secondReceiptCount, 0);
    assert.equal(facts.quoteOneStatus, "used");
    assert.equal(facts.quoteTwoStatus, "created");
    assertMoney(facts.buyerOneBalance, 47.5, "winning oversell Buyer balance");
    assertMoney(facts.buyerTwoBalance, 100, "losing oversell Buyer balance");
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

async function twoGameIsolationRace() {
  const quoteOne = createQuote(gameOne, {
    buyerId: gameOne.buyerTwoId,
    quantity: 1,
    expectedVersion: 4,
    idempotencyKey: "phase10a3-isolation-quote-one",
  });
  const quoteTwo = createQuote(gameTwo, {
    buyerId: gameTwo.buyerOneId,
    quantity: 1,
    expectedVersion: 2,
    idempotencyKey: "phase10a3-isolation-quote-two",
  });
  const firstCall = settlementCall({
    game: gameOne,
    quoteKey: quoteOne.quoteKey,
    buyerId: gameOne.buyerTwoId,
    quantity: 1,
    expectedVersion: 4,
    idempotencyKey: "phase10a3-isolation-settle-one",
  });
  const secondCall = settlementCall({
    game: gameTwo,
    quoteKey: quoteTwo.quoteKey,
    buyerId: gameTwo.buyerOneId,
    quantity: 1,
    expectedVersion: 2,
    idempotencyKey: "phase10a3-isolation-settle-two",
  });
  const first = await session("phase10a3_isolation_game_one");
  const second = await session("phase10a3_isolation_game_two");
  try {
    first.write(heldCallSql(
      firstCall,
      "ISOLATION_ONE_RESULT",
      "ISOLATION_ONE_HOLD",
    ));
    await first.waitFor("ISOLATION_ONE_HOLD");

    second.write(committedCallSql(
      secondCall,
      "ISOLATION_TWO_RESULT",
      "ISOLATION_TWO_DONE",
    ));
    await second.waitFor("ISOLATION_TWO_DONE", 5_000);
    first.write("commit; select 'ISOLATION_ONE_DONE';");
    await first.waitFor("ISOLATION_ONE_DONE");

    assert.equal(parseResult(first, "ISOLATION_ONE_RESULT").replayed, false);
    assert.equal(parseResult(second, "ISOLATION_TWO_RESULT").replayed, false);
    const facts = runJson(`select jsonb_build_object(
      'gameOneVersion', (select version from public.store_seller_offers
        where id = ${sqlLiteral(gameOne.offerId)}::uuid),
      'gameOneListed', (select h.quantity_owned from public.store_seller_offers o
        join public.inventory_holdings h on h.inventory_account_id = o.inventory_account_id
          and h.game_item_id = o.game_item_id where o.id = ${
      sqlLiteral(gameOne.offerId)
    }::uuid),
      'gameTwoVersion', (select version from public.store_seller_offers
        where id = ${sqlLiteral(gameTwo.offerId)}::uuid),
      'gameTwoListed', (select h.quantity_owned from public.store_seller_offers o
        join public.inventory_holdings h on h.inventory_account_id = o.inventory_account_id
          and h.game_item_id = o.game_item_id where o.id = ${
      sqlLiteral(gameTwo.offerId)
    }::uuid),
      'crossGameReceiptCount', (select count(*) from public.store_offer_purchase_receipts
        where (game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and request_idempotency_key = 'phase10a3-isolation-settle-two')
          or (game_session_id = ${sqlLiteral(gameTwo.id)}::uuid
          and request_idempotency_key = 'phase10a3-isolation-settle-one'))
    )::text;`);
    assert.equal(facts.gameOneVersion, 5);
    assert.equal(facts.gameOneListed, 2);
    assert.equal(facts.gameTwoVersion, 3);
    assert.equal(facts.gameTwoListed, 9);
    assert.equal(facts.crossGameReceiptCount, 0);
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

async function buyerCheckingRace() {
  const quoteA = createQuote(lanes.buyerA, {
    buyerId: gameOne.buyerOneId,
    quantity: 2,
    idempotencyKey: "phase10a3-buyer-race-quote-a",
  });
  const quoteB = createQuote(lanes.buyerB, {
    buyerId: gameOne.buyerOneId,
    quantity: 2,
    idempotencyKey: "phase10a3-buyer-race-quote-b",
  });
  runSql(`update public.account_balances set balance = 20
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and player_id = ${sqlLiteral(gameOne.buyerOneId)}::uuid
      and business_id is null and account_type = 'checking' and currency_code = 'ECO';`);
  const callA = settlementCall({
    game: lanes.buyerA,
    quoteKey: quoteA.quoteKey,
    buyerId: gameOne.buyerOneId,
    idempotencyKey: "phase10a3-buyer-race-settle-a",
  });
  const callB = settlementCall({
    game: lanes.buyerB,
    quoteKey: quoteB.quoteKey,
    buyerId: gameOne.buyerOneId,
    idempotencyKey: "phase10a3-buyer-race-settle-b",
  });
  const first = await session("phase10a3_buyer_balance_first");
  const second = await session("phase10a3_buyer_balance_second");
  try {
    first.write(heldCallSql(callA, "BUYER_FIRST_RESULT", "BUYER_FIRST_HOLD"));
    await first.waitFor("BUYER_FIRST_HOLD");
    second.write(failingCallSql(callB));
    const wait = await pollForDatabaseWait("phase10a3_buyer_balance_second");
    assert.equal(wait.waitEventType, "Lock");
    first.write("commit; select 'BUYER_FIRST_DONE';");
    await first.waitFor("BUYER_FIRST_DONE");
    await second.waitFor("STORE_OFFER_SETTLEMENT_INSUFFICIENT_FUNDS");
    assert.equal(parseResult(first, "BUYER_FIRST_RESULT").replayed, false);

    const facts = runJson(`select jsonb_build_object(
      'buyerBalance', (select balance from public.account_balances
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and player_id = ${sqlLiteral(gameOne.buyerOneId)}::uuid
          and business_id is null and account_type = 'checking' and currency_code = 'ECO'),
      'firstReceipts', (select count(*) from public.store_offer_purchase_receipts
        where offer_id = ${sqlLiteral(lanes.buyerA.offerId)}::uuid),
      'secondReceipts', (select count(*) from public.store_offer_purchase_receipts
        where offer_id = ${sqlLiteral(lanes.buyerB.offerId)}::uuid),
      'firstVersion', (select version from public.store_seller_offers
        where id = ${sqlLiteral(lanes.buyerA.offerId)}::uuid),
      'secondVersion', (select version from public.store_seller_offers
        where id = ${sqlLiteral(lanes.buyerB.offerId)}::uuid),
      'secondQuoteStatus', (select status from public.store_offer_purchase_quotes
        where public_key = ${sqlLiteral(quoteB.quoteKey)}),
      'secondListed', (select h.quantity_owned from public.store_seller_offers o
        join public.inventory_holdings h on h.inventory_account_id = o.inventory_account_id
          and h.game_item_id = o.game_item_id
        where o.id = ${sqlLiteral(lanes.buyerB.offerId)}::uuid)
    )::text;`);
    assertMoney(facts.buyerBalance, 5, "Buyer Checking serialized balance");
    assert.equal(facts.firstReceipts, 1);
    assert.equal(facts.secondReceipts, 0);
    assert.equal(facts.firstVersion, 3);
    assert.equal(facts.secondVersion, 2);
    assert.equal(facts.secondQuoteStatus, "created");
    assert.equal(facts.secondListed, 10);
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

async function listingHoldingRace() {
  const quote = createQuote(lanes.listing, {
    buyerId: gameOne.buyerTwoId,
    quantity: 2,
    idempotencyKey: "phase10a3-listing-race-quote",
  });
  const before = runJson(`select jsonb_build_object(
    'buyerBalance', (select balance from public.account_balances
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and player_id = ${sqlLiteral(gameOne.buyerTwoId)}::uuid
        and business_id is null and account_type = 'checking' and currency_code = 'ECO'),
    'businessCash', (select balance from public.account_balances
      where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
        and business_id = ${sqlLiteral(gameOne.businessId)}::uuid
        and currency_code = 'ECO')
  )::text;`);
  const blocker = await session("phase10a3_listing_blocker");
  const purchaser = await session("phase10a3_listing_purchaser");
  try {
    blocker.write(`begin;
update public.inventory_holdings h
set quantity_owned = 1, version = h.version + 1
from public.store_seller_offers o
where o.id = ${sqlLiteral(lanes.listing.offerId)}::uuid
  and h.inventory_account_id = o.inventory_account_id
  and h.game_item_id = o.game_item_id;
select 'LISTING_BLOCKER_HOLD';
`);
    await blocker.waitFor("LISTING_BLOCKER_HOLD");
    purchaser.write(failingCallSql(settlementCall({
      game: lanes.listing,
      quoteKey: quote.quoteKey,
      buyerId: gameOne.buyerTwoId,
      idempotencyKey: "phase10a3-listing-race-settle",
    })));
    const wait = await pollForDatabaseWait("phase10a3_listing_purchaser");
    assert.equal(wait.waitEventType, "Lock");
    blocker.write("commit; select 'LISTING_BLOCKER_DONE';");
    await blocker.waitFor("LISTING_BLOCKER_DONE");
    await purchaser.waitFor("STORE_OFFER_SETTLEMENT_INSUFFICIENT_STOCK");

    const facts = runJson(`select jsonb_build_object(
      'listed', h.quantity_owned,
      'offerVersion', o.version,
      'quoteStatus', (select status from public.store_offer_purchase_quotes
        where public_key = ${sqlLiteral(quote.quoteKey)}),
      'receiptCount', (select count(*) from public.store_offer_purchase_receipts
        where offer_id = ${sqlLiteral(lanes.listing.offerId)}::uuid),
      'buyerBalance', (select balance from public.account_balances
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and player_id = ${sqlLiteral(gameOne.buyerTwoId)}::uuid
          and business_id is null and account_type = 'checking' and currency_code = 'ECO'),
      'businessCash', (select balance from public.account_balances
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and business_id = ${sqlLiteral(gameOne.businessId)}::uuid
          and currency_code = 'ECO')
    )::text
    from public.store_seller_offers o
    join public.inventory_holdings h on h.inventory_account_id = o.inventory_account_id
      and h.game_item_id = o.game_item_id
    where o.id = ${sqlLiteral(lanes.listing.offerId)}::uuid;`);
    assert.equal(facts.listed, 1);
    assert.equal(facts.offerVersion, 2);
    assert.equal(facts.quoteStatus, "created");
    assert.equal(facts.receiptCount, 0);
    assertMoney(
      facts.buyerBalance,
      numeric(before.buyerBalance),
      "listing race Buyer unchanged",
    );
    assertMoney(
      facts.businessCash,
      numeric(before.businessCash),
      "listing race cash unchanged",
    );
  } finally {
    closeSession(blocker);
    closeSession(purchaser);
  }
}

async function purchaseFirstWithdrawalRace() {
  const quote = createQuote(lanes.purchaseFirst, {
    buyerId: gameOne.buyerTwoId,
    quantity: 2,
    idempotencyKey: "phase10a3-purchase-first-quote",
  });
  const purchase = await session("phase10a3_purchase_first");
  const withdrawal = await session("phase10a3_purchase_first_withdrawal");
  try {
    purchase.write(heldCallSql(
      settlementCall({
        game: lanes.purchaseFirst,
        quoteKey: quote.quoteKey,
        buyerId: gameOne.buyerTwoId,
        idempotencyKey: "phase10a3-purchase-first-settle",
      }),
      "PURCHASE_FIRST_RESULT",
      "PURCHASE_FIRST_HOLD",
    ));
    await purchase.waitFor("PURCHASE_FIRST_HOLD");
    withdrawal.write(failingCallSql(withdrawalCall({
      game: lanes.purchaseFirst,
      idempotencyKey: "phase10a3-purchase-first-withdraw",
    })));
    const wait = await pollForDatabaseWait(
      "phase10a3_purchase_first_withdrawal",
    );
    assert.equal(wait.waitEventType, "Lock");
    purchase.write("commit; select 'PURCHASE_FIRST_DONE';");
    await purchase.waitFor("PURCHASE_FIRST_DONE");
    await withdrawal.waitFor("STORE_WITHDRAWAL_OFFER_VERSION_CONFLICT");
    assert.equal(
      parseResult(purchase, "PURCHASE_FIRST_RESULT").replayed,
      false,
    );

    const facts = runJson(`select jsonb_build_object(
      'offerStatus', o.status,
      'offerVersion', o.version,
      'listed', h.quantity_owned,
      'receiptCount', (select count(*) from public.store_offer_purchase_receipts
        where offer_id = o.id),
      'withdrawalCount', (select count(*) from public.store_offer_withdrawal_requests
        where offer_id = o.id)
    )::text
    from public.store_seller_offers o
    join public.inventory_holdings h on h.inventory_account_id = o.inventory_account_id
      and h.game_item_id = o.game_item_id
    where o.id = ${sqlLiteral(lanes.purchaseFirst.offerId)}::uuid;`);
    assert.equal(facts.offerStatus, "active");
    assert.equal(facts.offerVersion, 3);
    assert.equal(facts.listed, 8);
    assert.equal(facts.receiptCount, 1);
    assert.equal(facts.withdrawalCount, 0);
  } finally {
    closeSession(purchase);
    closeSession(withdrawal);
  }
}

async function withdrawalFirstPurchaseRace() {
  const quote = createQuote(lanes.withdrawalFirst, {
    buyerId: gameOne.buyerTwoId,
    quantity: 2,
    idempotencyKey: "phase10a3-withdrawal-first-quote",
  });
  const withdrawal = await session("phase10a3_withdrawal_first");
  const purchase = await session("phase10a3_withdrawal_first_purchase");
  try {
    withdrawal.write(heldCallSql(
      withdrawalCall({
        game: lanes.withdrawalFirst,
        idempotencyKey: "phase10a3-withdrawal-first-request",
      }),
      "WITHDRAWAL_FIRST_RESULT",
      "WITHDRAWAL_FIRST_HOLD",
    ));
    await withdrawal.waitFor("WITHDRAWAL_FIRST_HOLD");
    purchase.write(failingCallSql(settlementCall({
      game: lanes.withdrawalFirst,
      quoteKey: quote.quoteKey,
      buyerId: gameOne.buyerTwoId,
      idempotencyKey: "phase10a3-withdrawal-first-settle",
    })));
    const wait = await pollForDatabaseWait(
      "phase10a3_withdrawal_first_purchase",
    );
    assert.equal(wait.waitEventType, "Lock");
    withdrawal.write("commit; select 'WITHDRAWAL_FIRST_DONE';");
    await withdrawal.waitFor("WITHDRAWAL_FIRST_DONE");
    await purchase.waitFor("STORE_OFFER_SETTLEMENT_OFFER_STATUS_INVALID");
    assert.equal(
      parseResult(withdrawal, "WITHDRAWAL_FIRST_RESULT").replayed,
      false,
    );

    const facts = runJson(`select jsonb_build_object(
      'offerStatus', o.status,
      'offerVersion', o.version,
      'listed', h.quantity_owned,
      'quoteStatus', (select status from public.store_offer_purchase_quotes
        where public_key = ${sqlLiteral(quote.quoteKey)}),
      'receiptCount', (select count(*) from public.store_offer_purchase_receipts
        where offer_id = o.id),
      'withdrawalCount', (select count(*) from public.store_offer_withdrawal_requests
        where offer_id = o.id and status = 'pending')
    )::text
    from public.store_seller_offers o
    join public.inventory_holdings h on h.inventory_account_id = o.inventory_account_id
      and h.game_item_id = o.game_item_id
    where o.id = ${sqlLiteral(lanes.withdrawalFirst.offerId)}::uuid;`);
    assert.equal(facts.offerStatus, "withdrawal_pending");
    assert.equal(facts.offerVersion, 3);
    assert.equal(facts.listed, 10);
    assert.equal(facts.quoteStatus, "created");
    assert.equal(facts.receiptCount, 0);
    assert.equal(facts.withdrawalCount, 1);
  } finally {
    closeSession(withdrawal);
    closeSession(purchase);
  }
}

async function businessCashOverflowRace() {
  const quoteA = createQuote(lanes.cashA, {
    buyerId: gameOne.buyerOneId,
    quantity: 1,
    idempotencyKey: "phase10a3-cash-race-quote-a",
  });
  const quoteB = createQuote(lanes.cashB, {
    buyerId: gameOne.buyerTwoId,
    quantity: 1,
    idempotencyKey: "phase10a3-cash-race-quote-b",
  });
  runSql(`update public.account_balances
    set balance = case
      when business_id = ${
    sqlLiteral(gameOne.businessId)
  }::uuid then 999999999990.00
      else 100.00
    end
    where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
      and currency_code = 'ECO'
      and (
        business_id = ${sqlLiteral(gameOne.businessId)}::uuid
        or (business_id is null and account_type = 'checking'
          and player_id in (${sqlLiteral(gameOne.buyerOneId)}::uuid,
            ${sqlLiteral(gameOne.buyerTwoId)}::uuid))
      );`);
  const losingBuyerDebitCountBefore = runJson(`select jsonb_build_object(
    'count', count(*)
  )::text from public.ledger_entries
  where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
    and player_id = ${sqlLiteral(gameOne.buyerTwoId)}::uuid
    and source_domain = 'store'
    and source_action = 'business_offer_purchase_debit';`).count;
  const first = await session("phase10a3_cash_first");
  const second = await session("phase10a3_cash_second");
  try {
    first.write(heldCallSql(
      settlementCall({
        game: lanes.cashA,
        quoteKey: quoteA.quoteKey,
        buyerId: gameOne.buyerOneId,
        quantity: 1,
        idempotencyKey: "phase10a3-cash-race-settle-a",
      }),
      "CASH_FIRST_RESULT",
      "CASH_FIRST_HOLD",
    ));
    await first.waitFor("CASH_FIRST_HOLD");
    second.write(failingCallSql(settlementCall({
      game: lanes.cashB,
      quoteKey: quoteB.quoteKey,
      buyerId: gameOne.buyerTwoId,
      quantity: 1,
      idempotencyKey: "phase10a3-cash-race-settle-b",
    })));
    const wait = await pollForDatabaseWait("phase10a3_cash_second");
    assert.equal(wait.waitEventType, "Lock");
    first.write("commit; select 'CASH_FIRST_DONE';");
    await first.waitFor("CASH_FIRST_DONE");
    await second.waitFor("STORE_OFFER_SETTLEMENT_BUSINESS_CASH_UNAVAILABLE");
    assert.equal(parseResult(first, "CASH_FIRST_RESULT").replayed, false);

    const facts = runJson(`select jsonb_build_object(
      'businessCash', (select balance::text from public.account_balances
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and business_id = ${sqlLiteral(gameOne.businessId)}::uuid
          and currency_code = 'ECO'),
      'buyerOne', (select balance from public.account_balances
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and player_id = ${sqlLiteral(gameOne.buyerOneId)}::uuid
          and business_id is null and account_type = 'checking' and currency_code = 'ECO'),
      'buyerTwo', (select balance from public.account_balances
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and player_id = ${sqlLiteral(gameOne.buyerTwoId)}::uuid
          and business_id is null and account_type = 'checking' and currency_code = 'ECO'),
      'firstReceipts', (select count(*) from public.store_offer_purchase_receipts
        where offer_id = ${sqlLiteral(lanes.cashA.offerId)}::uuid),
      'secondReceipts', (select count(*) from public.store_offer_purchase_receipts
        where offer_id = ${sqlLiteral(lanes.cashB.offerId)}::uuid),
      'firstListed', (select h.quantity_owned from public.store_seller_offers o
        join public.inventory_holdings h on h.inventory_account_id = o.inventory_account_id
          and h.game_item_id = o.game_item_id
        where o.id = ${sqlLiteral(lanes.cashA.offerId)}::uuid),
      'secondListed', (select h.quantity_owned from public.store_seller_offers o
        join public.inventory_holdings h on h.inventory_account_id = o.inventory_account_id
          and h.game_item_id = o.game_item_id
        where o.id = ${sqlLiteral(lanes.cashB.offerId)}::uuid),
      'secondQuoteStatus', (select status from public.store_offer_purchase_quotes
        where public_key = ${sqlLiteral(quoteB.quoteKey)}),
      'secondOfferVersion', (select version from public.store_seller_offers
        where id = ${sqlLiteral(lanes.cashB.offerId)}::uuid),
      'secondBuyerDebitCount', (select count(*) from public.ledger_entries
        where game_session_id = ${sqlLiteral(gameOne.id)}::uuid
          and player_id = ${sqlLiteral(gameOne.buyerTwoId)}::uuid
          and source_domain = 'store'
          and source_action = 'business_offer_purchase_debit')
    )::text;`);
    assert.equal(facts.businessCash, "999999999997.50");
    assertMoney(facts.buyerOne, 92.5, "successful cash-race Buyer debit");
    assertMoney(facts.buyerTwo, 100, "overflow loser Buyer rollback");
    assert.equal(facts.firstReceipts, 1);
    assert.equal(facts.secondReceipts, 0);
    assert.equal(facts.firstListed, 9);
    assert.equal(facts.secondListed, 10);
    assert.equal(facts.secondQuoteStatus, "created");
    assert.equal(facts.secondOfferVersion, 2);
    assert.equal(
      facts.secondBuyerDebitCount,
      losingBuyerDebitCountBefore,
      "overflow loser debit must roll back before the cash error escapes",
    );
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

async function main() {
  resetFixture();
  runSql(Object.values(lanes).map(seedRaceOfferSql).join("\n"));

  await sameIdempotencyRace();
  await sameOfferOversellRace();
  await twoGameIsolationRace();
  await buyerCheckingRace();
  await listingHoldingRace();
  await purchaseFirstWithdrawalRace();
  await withdrawalFirstPurchaseRace();
  await businessCashOverflowRace();

  console.log(
    "Phase 10A.3 real PostgreSQL concurrency, ordering, and two-game isolation verification passed.",
  );
}

try {
  await main();
} finally {
  for (const value of sessions) value.close();
}
