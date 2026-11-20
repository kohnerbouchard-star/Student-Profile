#!/usr/bin/env node

import assert from "node:assert/strict";

// Standalone concurrency evidence begins from the same retained C1 + D
// database acceptance fixture. The workflow rebuilds the disposable database
// before invoking this script, so no live or shared state is ever touched.
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
const buyerId = game.buyerOneId;
const sessions = new Set();

function raceOffer({ index, hex, name }) {
  const suffix = String(index).padStart(12, "0");
  return Object.freeze({
    gameItemId: `62000000-0000-0000-0000-${suffix}`,
    gameItemKey: `itm_${hex.repeat(32)}`,
    storeItemId: `92000000-0000-0000-0000-${suffix}`,
    storeItemKey: `d_funded_race_${index}`,
    offerId: `a2000000-0000-0000-0000-${suffix}`,
    offerKey: `sof_${hex.repeat(32)}`,
    canonicalKey: `business.player-store-fx-final.race.${index}`,
    name,
    expectedOfferVersion: 2,
  });
}

const lanes = Object.freeze({
  reverseA: raceOffer({ index: 41, hex: "8", name: "D Reverse A" }),
  reverseB: raceOffer({ index: 42, hex: "9", name: "D Reverse B" }),
  purchaseFirst: raceOffer({ index: 43, hex: "a", name: "D Purchase First" }),
  withdrawalFirst: raceOffer({ index: 44, hex: "b", name: "D Withdrawal First" }),
});

function seedRaceOfferSql(lane) {
  return `
insert into public.game_items (
  id, public_key, game_session_id, canonical_key, source_kind, name,
  item_class, subtype, stackable, serialized, transferable, status
) values (
  ${sqlLiteral(lane.gameItemId)}::uuid,
  ${sqlLiteral(lane.gameItemKey)},
  ${sqlLiteral(game.id)}::uuid,
  ${sqlLiteral(lane.canonicalKey)},
  'business_product', ${sqlLiteral(lane.name)}, 'finished_good', 'widget',
  true, false, true, 'active'
);

insert into public.store_items (
  id, game_session_id, item_key, name, category, price, currency_code,
  stock_quantity, status, visibility, game_item_id
) values (
  ${sqlLiteral(lane.storeItemId)}::uuid,
  ${sqlLiteral(game.id)}::uuid,
  ${sqlLiteral(lane.storeItemKey)},
  ${sqlLiteral(lane.name)},
  'goods', 7.50, 'ECO', 0, 'active', 'visible',
  ${sqlLiteral(lane.gameItemId)}::uuid
);

insert into public.store_seller_offers (
  id, public_key, game_session_id, store_item_id, game_item_id,
  seller_party_id, inventory_account_id, seller_kind, unit_price,
  currency_code, status, replenishment_policy, creation_idempotency_key,
  creation_request_hash, version, metadata
)
select
  ${sqlLiteral(lane.offerId)}::uuid,
  ${sqlLiteral(lane.offerKey)},
  ${sqlLiteral(game.id)}::uuid,
  ${sqlLiteral(lane.storeItemId)}::uuid,
  ${sqlLiteral(lane.gameItemId)}::uuid,
  party_row.id,
  null,
  'business', 7.50, 'ECO', 'draft', 'none',
  ${sqlLiteral(`d-funded-race-${lane.storeItemKey}`)},
  encode(extensions.digest(convert_to(${sqlLiteral(lane.offerKey)}, 'UTF8'), 'sha256'), 'hex'),
  1,
  jsonb_build_object('fixture', 'business_player_store_fx_final_concurrency')
from public.economic_parties as party_row
where party_row.game_session_id = ${sqlLiteral(game.id)}::uuid
  and party_row.business_id = ${sqlLiteral(game.businessId)}::uuid
  and party_row.party_kind = 'business';

do $lane$
declare
  v_listing_account_id uuid;
begin
  v_listing_account_id := economy_private.ensure_business_store_listing_account_v2(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(game.businessId)}::uuid,
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
    ${sqlLiteral(game.id)}::uuid,
    v_listing_account_id,
    ${sqlLiteral(lane.gameItemId)}::uuid,
    10, 0, 2.5000, 'ECO', 1
  );
end
$lane$;
`;
}

function accountKey(currencyCode) {
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
      and party_row.player_id = ${sqlLiteral(buyerId)}::uuid
      and party_row.status = 'active';
  `).output;
  assert.match(key, /^bac_[0-9a-f]{32}$/u);
  return key;
}

function currentOfferVersion(offerKey) {
  return Number(runSql(`
    select version
    from public.store_seller_offers
    where game_session_id = ${sqlLiteral(game.id)}::uuid
      and public_key = ${sqlLiteral(offerKey)};
  `).output);
}

function quoteCall({
  offerKey,
  expectedVersion,
  allocations,
  idempotencyKey,
}) {
  return `public.create_business_store_offer_funding_quote_v1(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(buyerId)}::uuid,
    ${sqlLiteral(offerKey)},
    1,
    ${expectedVersion},
    ${sqlLiteral(JSON.stringify(allocations))}::jsonb,
    ${sqlLiteral(idempotencyKey)}
  )`;
}

function createQuote(input) {
  return runJson(`
    begin;
    set local role service_role;
    select ${quoteCall(input)}::text;
    commit;
  `);
}

function settlementCall(quoteKey, idempotencyKey) {
  return `public.settle_business_store_offer_funding_v2(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(buyerId)}::uuid,
    ${sqlLiteral(quoteKey)},
    ${sqlLiteral(idempotencyKey)}
  )`;
}

function withdrawalCall(lane, idempotencyKey) {
  return `public.request_business_store_offer_withdrawal_v2(
    ${sqlLiteral(game.id)}::uuid,
    ${sqlLiteral(game.businessKey)},
    ${sqlLiteral(lane.offerKey)},
    'full',
    null::integer,
    ${lane.expectedOfferVersion},
    ${sqlLiteral(idempotencyKey)}
  )`;
}

function heldCallSql(call, resultMarker, holdMarker) {
  return `begin;
set local role service_role;
select ${sqlLiteral(`${resultMarker}:`)} || (${call})::text;
select ${sqlLiteral(holdMarker)};`;
}

function committedCallSql(call, resultMarker, doneMarker) {
  return `begin;
set local role service_role;
select ${sqlLiteral(`${resultMarker}:`)} || (${call})::text;
commit;
select ${sqlLiteral(doneMarker)};`;
}

function failingCallSql(call) {
  return `begin;
set local role service_role;
select (${call})::text;
commit;`;
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

async function finalNullQuoteReplayRace(ecoKey) {
  const expectedVersion = currentOfferVersion(game.offerKey);
  const call = quoteCall({
    offerKey: game.offerKey,
    expectedVersion,
    allocations: [{ sourceAccountKey: ecoKey, targetAmount: null }],
    idempotencyKey: "d-concurrency-final-null-quote-replay",
  });
  const first = await session("d_final_null_quote_first");
  const second = await session("d_final_null_quote_second");
  try {
    first.write(heldCallSql(
      call,
      "QUOTE_FIRST_RESULT",
      "QUOTE_FIRST_HOLD",
    ));
    await first.waitFor("QUOTE_FIRST_HOLD");

    second.write(committedCallSql(
      call,
      "QUOTE_SECOND_RESULT",
      "QUOTE_SECOND_DONE",
    ));
    const wait = await pollForDatabaseWait("d_final_null_quote_second");
    assert.equal(wait.waitEventType, "Lock");

    first.write("commit; select 'QUOTE_FIRST_DONE';");
    await first.waitFor("QUOTE_FIRST_DONE");
    await second.waitFor("QUOTE_SECOND_DONE");

    const firstResult = markedJson(first, "QUOTE_FIRST_RESULT");
    const secondResult = markedJson(second, "QUOTE_SECOND_RESULT");
    assert.equal(firstResult.replayed, false);
    assert.equal(secondResult.replayed, true);
    assert.equal(secondResult.quoteKey, firstResult.quoteKey);
    assert.equal(
      secondResult.fundingQuote.quote_key,
      firstResult.fundingQuote.quote_key,
    );
    assert.equal(Number(runSql(`
      select count(*)
      from public.store_offer_purchase_quotes
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and request_idempotency_key = 'd-concurrency-final-null-quote-replay';
    `).output), 1);
    return firstResult;
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

async function fundedSettlementReplayRace(quote) {
  const call = settlementCall(
    quote.quoteKey,
    "d-concurrency-funded-settlement-replay",
  );
  const first = await session("d_funded_settlement_first");
  const second = await session("d_funded_settlement_second");
  try {
    first.write(heldCallSql(
      call,
      "SETTLEMENT_FIRST_RESULT",
      "SETTLEMENT_FIRST_HOLD",
    ));
    await first.waitFor("SETTLEMENT_FIRST_HOLD");

    second.write(committedCallSql(
      call,
      "SETTLEMENT_SECOND_RESULT",
      "SETTLEMENT_SECOND_DONE",
    ));
    const wait = await pollForDatabaseWait("d_funded_settlement_second");
    assert.equal(wait.waitEventType, "Lock");

    first.write("commit; select 'SETTLEMENT_FIRST_DONE';");
    await first.waitFor("SETTLEMENT_FIRST_DONE");
    await second.waitFor("SETTLEMENT_SECOND_DONE");

    const firstResult = markedJson(first, "SETTLEMENT_FIRST_RESULT");
    const secondResult = markedJson(second, "SETTLEMENT_SECOND_RESULT");
    assert.equal(firstResult.replayed, false);
    assert.equal(secondResult.replayed, true);
    assert.equal(secondResult.receiptKey, firstResult.receiptKey);
    assert.equal(Number(runSql(`
      select count(*)
      from public.store_offer_purchase_receipts
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and request_idempotency_key = 'd-concurrency-funded-settlement-replay';
    `).output), 1);
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

async function reverseFinalNullAllocationRace(ecoKey, nrcKey) {
  const firstQuote = createQuote({
    offerKey: lanes.reverseA.offerKey,
    expectedVersion: lanes.reverseA.expectedOfferVersion,
    allocations: [
      { sourceAccountKey: ecoKey, targetAmount: "1" },
      { sourceAccountKey: nrcKey, targetAmount: null },
    ],
    idempotencyKey: "d-concurrency-reverse-quote-a",
  });
  const secondQuote = createQuote({
    offerKey: lanes.reverseB.offerKey,
    expectedVersion: lanes.reverseB.expectedOfferVersion,
    allocations: [
      { sourceAccountKey: nrcKey, targetAmount: "1" },
      { sourceAccountKey: ecoKey, targetAmount: null },
    ],
    idempotencyKey: "d-concurrency-reverse-quote-b",
  });
  assert.deepEqual(
    firstQuote.fundingQuote.lines.map((line) => line.source_account_key),
    [ecoKey, nrcKey].sort(),
  );
  assert.deepEqual(
    secondQuote.fundingQuote.lines.map((line) => line.source_account_key),
    [nrcKey, ecoKey].sort(),
  );

  const first = await session("d_reverse_accounts_first");
  const second = await session("d_reverse_accounts_second");
  try {
    first.write(heldCallSql(
      settlementCall(firstQuote.quoteKey, "d-concurrency-reverse-settle-a"),
      "REVERSE_FIRST_RESULT",
      "REVERSE_FIRST_HOLD",
    ));
    await first.waitFor("REVERSE_FIRST_HOLD");

    second.write(committedCallSql(
      settlementCall(secondQuote.quoteKey, "d-concurrency-reverse-settle-b"),
      "REVERSE_SECOND_RESULT",
      "REVERSE_SECOND_DONE",
    ));
    const wait = await pollForDatabaseWait("d_reverse_accounts_second");
    assert.equal(wait.waitEventType, "Lock");

    first.write("commit; select 'REVERSE_FIRST_DONE';");
    await first.waitFor("REVERSE_FIRST_DONE");
    await second.waitFor("REVERSE_SECOND_DONE");

    assert.equal(markedJson(first, "REVERSE_FIRST_RESULT").replayed, false);
    assert.equal(markedJson(second, "REVERSE_SECOND_RESULT").replayed, false);
    assert.equal(Number(runSql(`
      select count(*)
      from public.store_offer_purchase_receipts
      where game_session_id = ${sqlLiteral(game.id)}::uuid
        and request_idempotency_key in (
          'd-concurrency-reverse-settle-a',
          'd-concurrency-reverse-settle-b'
        );
    `).output), 2);
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

async function purchaseFirstWithdrawalRace(ecoKey) {
  const quote = createQuote({
    offerKey: lanes.purchaseFirst.offerKey,
    expectedVersion: lanes.purchaseFirst.expectedOfferVersion,
    allocations: [{ sourceAccountKey: ecoKey, targetAmount: null }],
    idempotencyKey: "d-concurrency-purchase-first-quote",
  });
  const first = await session("d_purchase_first");
  const second = await session("d_purchase_first_withdrawal");
  try {
    first.write(heldCallSql(
      settlementCall(quote.quoteKey, "d-concurrency-purchase-first-settle"),
      "PURCHASE_FIRST_RESULT",
      "PURCHASE_FIRST_HOLD",
    ));
    await first.waitFor("PURCHASE_FIRST_HOLD");

    second.write(failingCallSql(withdrawalCall(
      lanes.purchaseFirst,
      "d-concurrency-purchase-first-withdrawal",
    )));
    const wait = await pollForDatabaseWait("d_purchase_first_withdrawal");
    assert.equal(wait.waitEventType, "Lock");

    first.write("commit; select 'PURCHASE_FIRST_DONE';");
    await first.waitFor("PURCHASE_FIRST_DONE");
    await second.waitFor("STORE_WITHDRAWAL_OFFER_VERSION_CONFLICT");
    assert.equal(markedJson(first, "PURCHASE_FIRST_RESULT").replayed, false);

    const facts = runJson(`
      select jsonb_build_object(
        'receiptCount', (select count(*)
          from public.store_offer_purchase_receipts
          where game_session_id = ${sqlLiteral(game.id)}::uuid
            and offer_id = ${sqlLiteral(lanes.purchaseFirst.offerId)}::uuid),
        'withdrawalCount', (select count(*)
          from public.store_offer_withdrawal_requests
          where game_session_id = ${sqlLiteral(game.id)}::uuid
            and offer_id = ${sqlLiteral(lanes.purchaseFirst.offerId)}::uuid),
        'listedQuantity', (select holding_row.quantity_owned
          from public.store_seller_offers as offer_row
          join public.inventory_holdings as holding_row
            on holding_row.inventory_account_id = offer_row.inventory_account_id
           and holding_row.game_item_id = offer_row.game_item_id
          where offer_row.id = ${sqlLiteral(lanes.purchaseFirst.offerId)}::uuid)
      )::text;
    `);
    assert.equal(Number(facts.receiptCount), 1);
    assert.equal(Number(facts.withdrawalCount), 0);
    assert.equal(Number(facts.listedQuantity), 9);
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

async function withdrawalFirstPurchaseRace(ecoKey) {
  const quote = createQuote({
    offerKey: lanes.withdrawalFirst.offerKey,
    expectedVersion: lanes.withdrawalFirst.expectedOfferVersion,
    allocations: [{ sourceAccountKey: ecoKey, targetAmount: null }],
    idempotencyKey: "d-concurrency-withdrawal-first-quote",
  });
  const first = await session("d_withdrawal_first");
  const second = await session("d_withdrawal_first_purchase");
  try {
    first.write(heldCallSql(
      withdrawalCall(
        lanes.withdrawalFirst,
        "d-concurrency-withdrawal-first-request",
      ),
      "WITHDRAWAL_FIRST_RESULT",
      "WITHDRAWAL_FIRST_HOLD",
    ));
    await first.waitFor("WITHDRAWAL_FIRST_HOLD");

    second.write(failingCallSql(settlementCall(
      quote.quoteKey,
      "d-concurrency-withdrawal-first-settle",
    )));
    const wait = await pollForDatabaseWait("d_withdrawal_first_purchase");
    assert.equal(wait.waitEventType, "Lock");

    first.write("commit; select 'WITHDRAWAL_FIRST_DONE';");
    await first.waitFor("WITHDRAWAL_FIRST_DONE");
    await second.waitFor("STORE_OFFER_FUNDED_SETTLEMENT_OFFER_STATUS_INVALID");
    assert.match(
      second.errors,
      /STORE_OFFER_(?:FUNDED_)?SETTLEMENT_(?:OFFER_STATUS_INVALID|OFFER_VERSION_CONFLICT|WITHDRAWAL_PENDING|QUOTE_MISMATCH)/u,
    );
    assert.match(
      markedJson(first, "WITHDRAWAL_FIRST_RESULT").requestKey,
      /^swr_[0-9a-f]{32}$/u,
    );

    const facts = runJson(`
      select jsonb_build_object(
        'receiptCount', (select count(*)
          from public.store_offer_purchase_receipts
          where game_session_id = ${sqlLiteral(game.id)}::uuid
            and offer_id = ${sqlLiteral(lanes.withdrawalFirst.offerId)}::uuid),
        'fundingReceiptCount', (select count(*)
          from public.store_offer_purchase_receipts as receipt_row
          join public.purchase_funding_receipts as funding_row
            on funding_row.game_session_id = receipt_row.game_session_id
           and funding_row.id = receipt_row.funding_receipt_id
          where receipt_row.game_session_id = ${sqlLiteral(game.id)}::uuid
            and receipt_row.offer_id = ${sqlLiteral(lanes.withdrawalFirst.offerId)}::uuid),
        'withdrawalCount', (select count(*)
          from public.store_offer_withdrawal_requests
          where game_session_id = ${sqlLiteral(game.id)}::uuid
            and offer_id = ${sqlLiteral(lanes.withdrawalFirst.offerId)}::uuid),
        'quoteStatus', (select status
          from public.store_offer_purchase_quotes
          where game_session_id = ${sqlLiteral(game.id)}::uuid
            and public_key = ${sqlLiteral(quote.quoteKey)})
      )::text;
    `);
    assert.equal(Number(facts.receiptCount), 0);
    assert.equal(Number(facts.fundingReceiptCount), 0);
    assert.equal(Number(facts.withdrawalCount), 1);
    assert.equal(facts.quoteStatus, "created");
  } finally {
    closeSession(first);
    closeSession(second);
  }
}

runSql(`begin; ${Object.values(lanes).map(seedRaceOfferSql).join("\n")} commit;`);
const ecoKey = accountKey("ECO");
const nrcKey = accountKey("NRC");

try {
  const replayQuote = await finalNullQuoteReplayRace(ecoKey);
  await fundedSettlementReplayRace(replayQuote);
  await reverseFinalNullAllocationRace(ecoKey, nrcKey);
  await purchaseFirstWithdrawalRace(ecoKey);
  await withdrawalFirstPurchaseRace(ecoKey);
} finally {
  for (const value of sessions) closeSession(value);
}

console.log(JSON.stringify({
  ok: true,
  finalNullQuoteReplayRace: true,
  fundedSettlementReplayRace: true,
  reverseAllocationOrderSerialized: true,
  purchaseFirstWithdrawalRace: true,
  withdrawalFirstPurchaseRace: true,
  canonicalLockOrderPreserved: true,
}));
