import assert from 'node:assert/strict';
import { createPrimaryIpoFixture, closeIpoOperatingHistory } from './business-primary-ipo-fixture.mjs';
import { verifyPrimaryIpoPurge } from './business-primary-ipo-purge.mjs';
import { expectSqlError, snapshot, openPsqlSession, pollForDatabaseWait } from './business-phase10-atomic-settlement-database-support.mjs';
import { marketFixture, marketState, positions, runSql, runJson, q, json, jsonService, service } from './business-financial-market-fixture.mjs';
for (const kind of ['registry','fk_graph','delete_order']) console.log(`Phase 14D observed purge ${kind}: ${runSql(`select row_to_json(d)::text from public.get_game_data_purge_${kind}_digest_v1() d;`).output}`);
const {one,two}=createPrimaryIpoFixture();
const otherBefore=snapshot(two.id);
const market=marketFixture(one);
const consume=()=>jsonService(`public.consume_business_market_events_v1(${q(one.id)},1000)`);
assert.equal(consume().listed,0);
const statement=closeIpoOperatingHistory(one);
assert.equal(consume().listed,0,'financial history alone cannot list an unissued Business');
const proposed=jsonService(`public.propose_business_primary_ipo_v1(${q(one.id)},${q(one.ownerId)},2.50,20,'phase14d-propose-ipo')`);
const ipo=proposed.offer.ipoKey;
jsonService(`public.vote_business_primary_ipo_v1(${q(one.id)},${q(one.ownerId)},${q(ipo)},'approve','phase14d-vote-ipo')`);
jsonService(`public.subscribe_business_primary_ipo_v1(${q(one.id)},${q(one.buyerOneId)},${q(ipo)},10,'phase14d-first-sub')`);
assert.equal(consume().listed,0,'partial allocation must not list');
jsonService(`public.subscribe_business_primary_ipo_v1(${q(one.id)},${q(one.buyerOneId)},${q(ipo)},10,'phase14d-final-sub')`);
assert.equal(consume().listed,1);
assert.deepEqual(consume(),{schemaVersion:1,consumed:0,listed:0},'consumer is idempotent, including pre-IPO observations');
let asset=market.asset(true);
assert.equal(asset.financials.statementKey,statement.closeReceiptKey);
assert.equal(asset.financials.currencyCode,'NRC');
assert.equal(asset.financials.status,'complete');
assert.equal(Number(asset.price),2.5);
assert.equal(positions(one,one.buyerOneId).find(p=>p.ticker===asset.ticker).quantity,20);
assert.equal(positions(one,one.ownerId).find(p=>p.ticker===asset.ticker).quantity,10000);
assert.equal(runSql(`select count(*) from public.stock_holdings where game_session_id=${q(one.id)} and stock_asset_id=${q(asset.id)};`).output,'0','IPO quantities require no parallel Stock holding');
const gamePositions=runJson(`select coalesce(jsonb_agg(to_jsonb(p)),'[]')::text from public.read_game_stock_positions_v1(${q(one.id)}) p;`);
assert.equal(gamePositions.find(p=>p.player_id===one.buyerOneId && p.stock_asset_id===asset.id).quantity,20);
assert.ok(gamePositions.every(p=>p.game_session_id===one.id && p.listing_currency_code));
const issuerCash=json(`select public.read_business_balance_v2(${q(one.id)},${q(one.businessId)},'NRC')::text`);
const asService=sql=>`begin;set local role service_role;select ${sql};commit;`;
for (const role of ['anon','authenticated']) expectSqlError(`begin;set local role ${role};select public.consume_business_market_events_v1(${q(one.id)});commit;`,/permission denied/);
for (const port of [
  `public.transfer_business_market_shares_v1(${q(one.id)},${q(one.businessKey)},${q(one.ownerId)},'sell',1,2.50,gen_random_uuid())`,
  `public.lock_business_market_position_v1(${q(one.id)},${q(one.businessKey)},${q(one.ownerId)})`,
]) expectSqlError(asService(port),/permission denied/);
expectSqlError(asService(`public.read_player_stock_positions_v1(${q(one.id)},${q(two.ownerId)})`),/STOCK_POSITION_PLAYER_UNAVAILABLE/);
expectSqlError(`begin;set local role service_role;update public.game_session_stock_assets set current_price=1 where id=${q(asset.id)};commit;`,/STOCK_BUSINESS_LINK_COMMAND_REQUIRED/);
expectSqlError(`begin;set local role service_role;delete from public.stock_business_event_consumptions where game_session_id=${q(one.id)};commit;`,/permission denied/);
expectSqlError(`update public.stock_business_event_consumptions set event_version=1 where game_session_id=${q(one.id)};`,/STOCK_BUSINESS_EVENT_EVIDENCE_IMMUTABLE/);
expectSqlError(`select ${market.quoteSql(one.buyerTwoId,asset,1,'phase14d-no-custody')};`,/STOCK_BUSINESS_SHARES_UNAVAILABLE/);
const beforeNoCash=marketState(one);
expectSqlError(`select ${market.sellSql(one.buyerOneId,asset,1,'phase14d-no-liquidity')};`,/INSUFFICIENT/);
assert.deepEqual(marketState(one),beforeNoCash,'zero Market liquidity cannot pay a seller or move shares');
expectSqlError(`select ${market.sellSql(one.buyerOneId,asset,0.5,'phase14d-fractional')};`,/STOCK_BUSINESS_WHOLE_SHARES_REQUIRED/);
// Market liquidity is funded only by a real retained Stock purchase. This is
// disposable Player starting capital, never a Market balance seed or IPO cash.
runSql(`select * from public.record_player_ledger_entry(${q(one.id)},${q(one.ownerId)},'checking',100000,'NRC','credit','setup',
  'initial_balance_seed',${q(one.ownerId)},'system',null,'{"bankTransactionIdempotencyKey":"phase14d-capital-fixture"}'::jsonb);`);
const retained=market.asset(false);assert.ok(retained);
const retainedQuantity=Math.ceil(30000/Number(retained.price));
const retainedQuote=json(`select ${market.quoteSql(one.ownerId,retained,retainedQuantity,'phase14d-retained-quote')}`);
json(`select ${market.buySql(one.ownerId,retainedQuote.quote_key,'phase14d-retained-buy')}`);
let before=marketState(one);
const sold=json(`select ${market.sellSql(one.buyerOneId,asset,6,'phase14d-sell-six')}`);
assert.equal(Number(sold.holding_quantity_after),14);
assert.equal(marketState(one).cap.market_custody_shares,6);
let committed=marketState(one);
assert.equal(json(`select ${market.sellSql(one.buyerOneId,asset,6,'phase14d-sell-six')}`).already_completed,true);
assert.deepEqual(marketState(one),committed);
assert.equal(committed.cap.issued_shares,before.cap.issued_shares);
assert.equal(committed.cap.outstanding_shares,before.cap.outstanding_shares);
const buyQuote=json(`select ${market.quoteSql(one.buyerTwoId,asset,2,'phase14d-buy-two-quote')}`);
for (const stage of ['after_funding','after_holding','after_order','after_trade','after_evidence']) {
  before=marketState(one);
  expectSqlError(`begin;set local app.stock_buy_settlement_fail_stage=${q(stage)};select ${market.buySql(one.buyerTwoId,buyQuote.quote_key,`phase14d-buy-fail-${stage}`)};commit;`,new RegExp(`STOCK_BUY_SETTLEMENT_INJECTED_FAILURE:${stage}`));
  assert.deepEqual(marketState(one),before,`buy ${stage} rolls back Banking, Business positions/custody/evidence and Stock metadata`);
  expectSqlError(`begin;set local app.stock_sell_settlement_fail_stage=${q(stage)};select ${market.sellSql(one.buyerOneId,asset,1,`phase14d-sell-fail-${stage}`)};commit;`,new RegExp(`STOCK_SELL_SETTLEMENT_INJECTED_FAILURE:${stage}`));
  assert.deepEqual(marketState(one),before,`sell ${stage} rolls back every authority`);
}
const bought=json(`select ${market.buySql(one.buyerTwoId,buyQuote.quote_key,'phase14d-buy-two')}`);
assert.equal(Number(bought.holding_quantity_after),2);
committed=marketState(one);
assert.equal(json(`select ${market.buySql(one.buyerTwoId,buyQuote.quote_key,'phase14d-buy-two')}`).already_completed,true);
assert.deepEqual(marketState(one),committed);
assert.equal(committed.cap.market_custody_shares,4);
for (const player of [one.buyerOneId,one.buyerTwoId]) {
  const p=positions(one,player).find(p=>p.ticker===asset.ticker);assert.ok(p.quantity>0);
  assert.equal(runSql(`select quantity from public.stock_holdings where game_session_id=${q(one.id)} and stock_asset_id=${q(asset.id)} and player_id=${q(player)};`).output,'0.0000');
}
expectSqlError(`update public.stock_holdings set quantity=1 where game_session_id=${q(one.id)} and stock_asset_id=${q(asset.id)};`,/STOCK_BUSINESS_QUANTITY_AUTHORITY_REQUIRED/);
expectSqlError(`begin;set local role service_role;update public.stock_holdings set average_cost=0 where game_session_id=${q(one.id)} and stock_asset_id=${q(asset.id)};commit;`,/STOCK_BUSINESS_HOLDING_COMMAND_REQUIRED/);
const qa=json(`select ${market.quoteSql(one.buyerOneId,asset,3,'phase14d-race-quote-a')}`);
const qb=json(`select ${market.quoteSql(one.buyerTwoId,asset,3,'phase14d-race-quote-b')}`);
const a=openPsqlSession('phase14d-custody-a');const b=openPsqlSession('phase14d-custody-b');
try {
  await Promise.all([a.waitFor('SESSION_READY:'),b.waitFor('SESSION_READY:')]);
  a.write(`begin;select ${market.buySql(one.buyerOneId,qa.quote_key,'phase14d-race-buy-a')};select 'FIRST_STAGED';`);await a.waitFor('FIRST_STAGED');
  b.write(`begin;select ${market.buySql(one.buyerTwoId,qb.quote_key,'phase14d-race-buy-b')};commit;select 'SECOND_COMMITTED';`);
  const losing=b.waitFor('SECOND_COMMITTED').then(()=>({committed:true}),error=>({error:error.message}));
  await pollForDatabaseWait('phase14d-custody-b');a.write("commit;select 'FIRST_COMMITTED';");await a.waitFor('FIRST_COMMITTED');
  assert.match((await losing).error,/STOCK_BUSINESS_SHARES_UNAVAILABLE/);
} finally {a.close();b.close();}
assert.equal(marketState(one).cap.market_custody_shares,1);
// All issued shares can enter finite custody. Zero-share managers retain their
// operating mandate, but custody has no player voting authority.
for (const player of [one.ownerId,one.buyerOneId,one.buyerTwoId]) {
  const held=positions(one,player).find(p=>p.ticker===asset.ticker).quantity;
  json(`select ${market.sellSql(player,asset,held,`phase14d-exit-${player.slice(-4)}`)}`);
}
assert.equal(marketState(one).cap.market_custody_shares,10020);
const gov=jsonService(`public.read_owned_business_governance_v2(${q(one.id)},${q(one.ownerId)})`);
assert.equal(gov.managementAuthority,true);assert.equal(gov.currentPosition,null);assert.equal(gov.corporateShareStructure.marketCustodyShares,'10020');
assert.equal(service(`public.resolve_player_business_v2(${q(one.id)},${q(one.ownerId)})`).business_key,one.businessKey);
expectSqlError(asService(`public.resolve_player_business_v2(${q(one.id)},${q(one.buyerOneId)})`),/BUSINESS_NOT_FOUND/);
assert.equal(json(`select public.read_business_balance_v2(${q(one.id)},${q(one.businessId)},'NRC')::text`),issuerCash,'secondary trades never change issuer cash');
const reentry=json(`select ${market.quoteSql(one.ownerId,asset,1,'phase14d-reenter-quote')}`);
json(`select ${market.buySql(one.ownerId,reentry.quote_key,'phase14d-reenter-buy')}`);
assert.equal(positions(one,one.ownerId).find(p=>p.ticker===asset.ticker).quantity,1);
assert.equal(Number(positions(one,one.ownerId).find(p=>p.ticker===asset.ticker).average_cost),2.5);
runSql(`update public.business_entities set status='closed' where id=${q(one.businessId)} and game_session_id=${q(one.id)};`);
expectSqlError(`select ${market.quoteSql(one.ownerId,asset,1,'phase14d-stale-listing')};`,/STOCK_BUSINESS_ISSUER_UNAVAILABLE/);
consume();assert.equal(market.asset(true).active,false);assert.equal(market.asset(true).price,asset.price,'observations never overwrite the Market price');
assert.deepEqual(consume(),{schemaVersion:1,consumed:0,listed:0});
assert.equal(json(`select ${market.buySql(one.ownerId,reentry.quote_key,'phase14d-reenter-buy')}`).already_completed,true,'committed replay survives later issuer closure');
assert.deepEqual(snapshot(two.id),otherBefore,'Market integration leaves the comparison game unchanged');
const journal=json(`select jsonb_build_object('invalid',count(*) filter(where posting_version<>'balanced_v2' or exists(
  select 1 from public.ledger_entries l where l.bank_transaction_id=t.id and l.game_session_id=t.game_session_id
  group by l.currency_code having sum(l.amount)<>0))) from public.bank_transactions t where t.game_session_id=${q(one.id)}`);
assert.equal(journal.invalid,0);
verifyPrimaryIpoPurge(one,two,['stock_business_event_consumptions']);
console.log('Phase 14D Market: real IPO/event listing, finite shares/cash, canonical secondary settlement/replay, five-stage rollback, custody race, operator exit/reentry, financial provenance, closure, game isolation and populated purge passed.');
