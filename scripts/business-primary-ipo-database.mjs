import assert from "node:assert/strict";
import { verifyPrimaryIpoPurge } from "./business-primary-ipo-purge.mjs";
import { createPrimaryIpoFixture, closeIpoOperatingHistory, jsonService, service } from "./business-primary-ipo-fixture.mjs";
import { runSql, runJson, expectSqlError, sqlLiteral as q, snapshot, openPsqlSession, pollForDatabaseWait } from "./business-phase10-atomic-settlement-database-support.mjs";

for (const kind of ["registry", "fk_graph", "delete_order"]) {
  console.log(`Phase 14C observed purge ${kind}: ${runSql(`select row_to_json(d)::text from public.get_game_data_purge_${kind}_digest_v1() d;`).output}`);
}
const { one, two } = createPrimaryIpoFixture();
const read = (game = one, player = game.ownerId) => jsonService(`public.read_player_business_ipos_v1(${q(game.id)},${q(player)})`);
const proposalSql = (game = one, player = game.ownerId, price = '2.50', shares = 20, key = 'phase14c-ipo-propose') =>
  `public.propose_business_primary_ipo_v1(${q(game.id)},${q(player)},${price},${shares},${q(key)})`;
const asService = (sql) => `begin; set local role service_role; select ${sql}; commit;`;
assert.equal(read().ownBusiness.eligible, false);
assert.equal(read().ownBusiness.reason, "financial_history_unavailable");
expectSqlError(asService(proposalSql()), /BUSINESS_IPO_INELIGIBLE/);
closeIpoOperatingHistory(one);
assert.equal(read().ownBusiness.eligible, true);
const otherBefore = snapshot(two.id);
for (const role of ["anon", "authenticated"]) expectSqlError(`begin; set local role ${role}; select ${proposalSql()}; commit;`, /permission denied/);
expectSqlError(asService(proposalSql(one, one.buyerTwoId)), /BUSINESS_NOT_FOUND/);
expectSqlError(asService(proposalSql(one, one.ownerId, '2.501')), /BUSINESS_IPO_TERMS_INVALID/);
expectSqlError(asService(proposalSql(one, one.ownerId, '0')), /BUSINESS_IPO_REQUEST_INVALID/);
expectSqlError(asService(proposalSql(one, one.ownerId, '2.50', 1000000)), /BUSINESS_IPO_TERMS_INVALID/);
const proposed = jsonService(proposalSql());
assert.equal(proposed.replayed, false);
assert.equal(proposed.offer.status, 'open');
assert.equal(proposed.offer.offeredShares, '20');
assert.equal(proposed.offer.originalOutstandingShares, '10000');
assert.equal(proposed.offer.postOfferingOutstandingShares, '10020');
assert.equal(proposed.offer.canVote, true);
assert.equal(jsonService(proposalSql()).replayed, true);
expectSqlError(asService(proposalSql(one, one.ownerId, '3.00')), /BUSINESS_IPO_IDEMPOTENCY_CONFLICT/);
const ipo = proposed.offer.ipoKey;
assert.equal(read(one, one.buyerOneId).offers.length, 0, 'unapproved terms remain within operator/voter scope');
const voteSql = (player = one.ownerId, key = 'phase14c-ipo-vote') => `public.vote_business_primary_ipo_v1(${q(one.id)},${q(player)},${q(ipo)},'approve',${q(key)})`;
const subSql = (player = one.buyerOneId, shares = 8, key = 'phase14c-subscribe-one', gameId = one.id) =>
  `public.subscribe_business_primary_ipo_v1(${q(gameId)},${q(player)},${q(ipo)},${shares},${q(key)})`;
expectSqlError(asService(subSql()), /BUSINESS_IPO_NOT_OPEN/);
expectSqlError(asService(voteSql(one.buyerOneId)), /BUSINESS_IPO_VOTER_NOT_ELIGIBLE/);
expectSqlError(asService(`public.cast_business_governance_vote_v2(${q(one.id)},${q(one.ownerId)},${q(ipo)},'approve','phase14c-bypass-vote')`), /BUSINESS_IPO_COMMAND_REQUIRED/);
expectSqlError(asService(`public.create_business_governance_proposal_v2(${q(one.id)},${q(one.ownerId)},${q(one.businessKey)},'capital_raise','{"schema":"business.primary_ipo.v1"}','phase14c-bypass-propose')`), /BUSINESS_IPO_COMMAND_REQUIRED/);
const approved = jsonService(voteSql());
assert.equal(approved.offer.status, 'approved');
assert.equal(approved.offer.approvalBasisPoints, 10000);
assert.equal(jsonService(voteSql()).replayed, true);
assert.equal(read(one, one.buyerTwoId).offers[0].canSubscribe, true);
expectSqlError(asService(subSql(two.buyerOneId, 1, 'phase14c-wrong-player')), /BUSINESS_IPO_PLAYER_UNAVAILABLE/);
expectSqlError(asService(subSql(two.buyerOneId, 1, 'phase14c-wrong-game', two.id)), /BUSINESS_IPO_NOT_FOUND/);
for (const table of ['business_governance_proposals', 'business_governance_voter_snapshots', 'business_governance_votes', 'business_management_mandates']) {
  expectSqlError(`begin; set local role service_role; delete from public.${table} where game_session_id=${q(one.id)}; commit;`, /permission denied/);
}
expectSqlError(`update public.business_governance_proposals set terms=terms||'{"unitPrice":"0.01"}'::jsonb where public_key=${q(ipo)};`, /BUSINESS_GOVERNANCE_TERMS_IMMUTABLE/);
expectSqlError(`update public.business_governance_proposals set status='executed',executed_at=now() where public_key=${q(ipo)};`, /BUSINESS_IPO_STATE_INVALID/);
expectSqlError(`update public.business_governance_voter_snapshots set voting_units=voting_units+1 where game_session_id=${q(one.id)};`, /BUSINESS_GOVERNANCE_EVIDENCE_IMMUTABLE/);
expectSqlError(`update public.business_governance_votes set decision='reject' where game_session_id=${q(one.id)};`, /BUSINESS_GOVERNANCE_EVIDENCE_IMMUTABLE/);
for (const unavailable of [
  `update public.players set status='archived' where id=${q(one.buyerOneId)}`,
  `update public.game_sessions set status='disabled',lifecycle_state='paused' where id=${q(one.id)}`,
]) expectSqlError(`begin; ${unavailable}; set local role service_role; select ${subSql()}; commit;`, /BUSINESS_IPO_(PLAYER|GAME)_UNAVAILABLE/);
const quantities = () => runJson(`select jsonb_build_object(
  'issued',s.issued_shares::text,'outstanding',s.outstanding_shares::text,
  'playerUnits',(select sum(units)::text from public.business_ownership_positions where game_session_id=s.game_session_id and business_id=s.business_id and status='active'),
  'receipts',(select count(*) from public.business_ownership_transactions where game_session_id=s.game_session_id and business_id=s.business_id and transaction_kind='issuance'),
  'raised',(select coalesce(sum(consideration_amount),0)::text from public.business_ownership_transactions where game_session_id=s.game_session_id and business_id=s.business_id and transaction_kind='issuance'),
  'buyerCash',(select balance::text from public.account_balances where game_session_id=s.game_session_id and player_id=${q(one.buyerOneId)} and currency_code='NRC' and account_type='checking'),
  'businessCash',public.read_business_balance_v2(s.game_session_id,s.business_id,'NRC')::text)::text
  from public.business_corporate_share_structures s where s.game_session_id=${q(one.id)} and s.business_id=${q(one.businessId)};`);
const before = quantities();
// Fail the very first subscription through canonical held funds. The mandate
// capture occurs before Banking; this proves it also rolls back on denial.
expectSqlError(`begin; do $fixture$ declare a uuid; v_amount numeric; begin
  select bank_account_id,balance into a,v_amount from public.account_balances
    where game_session_id=${q(one.id)} and player_id=${q(one.buyerOneId)} and currency_code='NRC' and account_type='checking';
  perform private.create_bank_account_hold_v1(${q(one.id)},a,v_amount,'business-ipo-acceptance','held-funds-proof',null,
    'phase14c-held-first',repeat('a',64),clock_timestamp()+interval '1 day','{}'::jsonb);
  end; $fixture$; set local role service_role; select ${subSql()}; commit;`, /BANK_ACCOUNT_AVAILABLE_BALANCE_INSUFFICIENT/);
assert.deepEqual(quantities(), before);
assert.equal(runSql(`select count(*) from public.business_management_mandates where game_session_id=${q(one.id)};`).output, '0');
const receipt = jsonService(subSql());
assert.equal(receipt.receipt.shares, '8');
assert.equal(Number(receipt.receipt.total), 20);
assert.equal(receipt.receipt.offeringCompleted, false);
const after = quantities();
assert.equal(Number(after.buyerCash), Number(before.buyerCash) - 20);
assert.equal(Number(after.businessCash), Number(before.businessCash) + 20);
assert.equal(after.issued, '10008'); assert.equal(after.outstanding, '10008'); assert.equal(after.playerUnits, '10008');
assert.equal(jsonService(subSql()).replayed, true);
assert.deepEqual(quantities(), after);
expectSqlError(asService(subSql(one.buyerOneId, 9)), /BUSINESS_IPO_IDEMPOTENCY_CONFLICT/);
for (const fn of ['resolve_player_business_v2', 'get_business_treasury_overview_v1', 'read_owned_business_governance_v2']) {
  expectSqlError(asService(`public.${fn}(${q(one.id)},${q(one.buyerOneId)})`), /BUSINESS_NOT_FOUND/);
}
assert.equal(service(`public.resolve_player_business_v2(${q(one.id)},${q(one.ownerId)})`).business_key, one.businessKey);
// Passive investment does not consume the one-operating-Business slot.
const investorFormation = service(`public.propose_business_formation_v2(${q(one.id)},${q(one.buyerOneId)},
  'Investor Independent Company','c_corporation','manufacturing',
  '[{"playerIdentifier":"SELF","ownershipBasisPoints":10000,"capitalContribution":"0"}]'::jsonb,'phase14c-passive-formation')`);
assert.ok(investorFormation.formation_key);
// Canonical Banking denial must unwind management/share/receipt writes together.
expectSqlError(`begin; do $fixture$ begin perform * from public.record_player_ledger_entry(
  ${q(one.id)},${q(one.buyerTwoId)},'checking',-100,'NRC','debit','business','capital_contribution_out',
  ${q(one.businessId)},'system',null,jsonb_build_object('bankTransactionIdempotencyKey','phase14c-empty-buyer'));
  end; $fixture$;
  set local role service_role; select ${subSql(one.buyerTwoId, 1, 'phase14c-no-cash')}; commit;`, /INSUFFICIENT/);
assert.deepEqual(quantities(), after);
const first = openPsqlSession('phase14c-allocation-first'); const second = openPsqlSession('phase14c-allocation-second');
try {
  await Promise.all([first.waitFor('SESSION_READY:'), second.waitFor('SESSION_READY:')]);
  first.write(`begin; set local role service_role; select ${subSql(one.buyerOneId, 8, 'phase14c-race-first')}; select 'FIRST_STAGED';`);
  await first.waitFor('FIRST_STAGED');
  second.write(`begin; set local role service_role; select ${subSql(one.buyerTwoId, 8, 'phase14c-race-second')}; commit; select 'SECOND_COMMITTED';`);
  const rejected = second.waitFor('SECOND_COMMITTED').then(() => ({committed:true}), error => ({error:error.message}));
  await pollForDatabaseWait('phase14c-allocation-second');
  first.write("commit; select 'FIRST_COMMITTED';"); await first.waitFor('FIRST_COMMITTED');
  assert.match((await rejected).error, /BUSINESS_IPO_ALLOCATION_UNAVAILABLE/);
} finally { first.close(); second.close(); }
const completed = jsonService(subSql(one.buyerTwoId, 4, 'phase14c-final-allocation'));
assert.equal(completed.receipt.offeringCompleted, true);
assert.equal(quantities().issued, '10020'); assert.equal(Number(quantities().raised), 50);
assert.equal(read().offers[0].status, 'executed'); assert.equal(read().offers[0].remainingShares, '0');
assert.equal(jsonService(subSql(one.buyerTwoId, 4, 'phase14c-final-allocation')).replayed, true);
expectSqlError(asService(subSql(one.buyerTwoId, 1, 'phase14c-oversubscribed')), /BUSINESS_IPO_NOT_OPEN/);
assert.deepEqual(snapshot(two.id), otherBefore, 'another game remains unchanged across all primary actions');
assert.doesNotMatch(JSON.stringify([read(),receipt,completed]), /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|request_hash|idempotency_key|source_id/i);
const journal = runJson(`select jsonb_build_object('transactions',count(*),'invalid',count(*) filter(where posting_version<>'balanced_v2' or
  exists(select 1 from public.ledger_entries l where l.game_session_id=t.game_session_id and l.bank_transaction_id=t.id
    group by l.currency_code having sum(l.amount)<>0)))::text from public.bank_transactions t
  where t.game_session_id=${q(one.id)} and t.source_action in ('ipo_primary_subscription','ipo_primary_subscription_out');`);
assert.equal(journal.transactions, 6); assert.equal(journal.invalid, 0);
verifyPrimaryIpoPurge(one, two);
console.log('Phase 14C primary IPO: canonical formation/Store/close, eligibility, immutable governance, balanced issuance/replay, operator separation, allocation race, roles and game isolation pass.');
