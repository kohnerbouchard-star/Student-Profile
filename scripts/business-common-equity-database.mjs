import assert from "node:assert/strict";
import {
  FIXTURE, resetFixture, runSql, runJson, expectSqlError,
  sqlLiteral as q, snapshot, openPsqlSession, pollForDatabaseWait,
} from "./business-phase10-atomic-settlement-database-support.mjs";

resetFixture();
const { one, two } = FIXTURE.games;
runSql(`update public.game_sessions set lifecycle_state='active',status='active'
  where id in (${q(one.id)},${q(two.id)});
  do $fixture$ begin perform * from public.record_player_ledger_entry(
    ${q(one.id)},${q(one.buyerOneId)},'checking',10000,'ECO','credit','setup','initial_balance_seed',
    ${q(one.buyerOneId)},'system',null,
    jsonb_build_object('bankTransactionIdempotencyKey','phase14b-formation-capital'));
  end; $fixture$;`);
const service = (sql) => runJson(`begin; set local role service_role; select to_jsonb(r)::text from ${sql} r; commit;`);
const formation = service(`public.propose_business_formation_v2(
  ${q(one.id)},${q(one.buyerOneId)},'Common Equity Corporation','c_corporation','manufacturing',
  '[{"playerIdentifier":"SELF","ownershipBasisPoints":10000,"capitalContribution":"1000.00"}]'::jsonb,
  'phase14b-formation-propose')`);
service(`public.respond_business_formation_v2(${q(one.id)},${q(one.buyerOneId)},
  ${q(formation.formation_key)},'approve','phase14b-formation-approve')`);
const activate = `public.activate_business_formation_v2(${q(one.id)},${q(one.buyerOneId)},
  ${q(formation.formation_key)},'phase14b-formation-activate')`;
const active = service(activate);
const replay = service(activate);
assert.equal(replay.business_key, active.business_key);
assert.equal(replay.replayed, true);
const corporation = runJson(`select jsonb_build_object('id',id,'key',public_key)::text
  from public.business_entities where game_session_id=${q(one.id)} and public_key=${q(active.business_key)};`);
const where = `game_session_id=${q(one.id)} and business_id=${q(corporation.id)}`;
const founder = `${where} and player_id=${q(one.buyerOneId)} and status='active'`;
const read = () => runJson(`select jsonb_build_object(
  'authorized',s.authorized_shares::text,'issued',s.issued_shares::text,
  'outstanding',s.outstanding_shares::text,'treasury',s.treasury_shares::text,
  'units',(select sum(units)::text from public.business_ownership_positions where ${where} and status='active'),
  'votes',(select sum(voting_units)::text from public.business_ownership_positions where ${where} and status='active'),
  'receipts',(select count(*) from public.business_ownership_transactions where ${where}))::text
  from public.business_corporate_share_structures s where ${where};`);
assert.deepEqual(read(), { authorized: "1000000", issued: "10000", outstanding: "10000", treasury: "0", units: "10000", votes: "10000", receipts: 1 });
const otherBefore = snapshot(two.id);
const original = read();
for (const [sql,error] of [
  [`update public.business_ownership_positions set voting_units=units-1 where ${founder}`, /BUSINESS_COMMON_ONE_SHARE_ONE_VOTE_REQUIRED/],
  [`update public.business_ownership_positions set ownership_kind='membership_interest' where ${founder}`, /BUSINESS_COMMON_ONE_SHARE_ONE_VOTE_REQUIRED/],
  [`update public.business_ownership_positions set units=units+1,voting_units=voting_units+1 where ${founder}`, /BUSINESS_COMMON_OUTSTANDING_MISMATCH/],
  [`update public.business_corporate_share_structures set issued_shares=issued_shares+1,outstanding_shares=outstanding_shares+1 where ${where}`, /BUSINESS_COMMON_OUTSTANDING_MISMATCH/],
  [`update public.business_corporate_share_structures set authorized_shares=issued_shares-1 where ${where}`, /business_corporate_share_structures_share_check/],
  [`delete from public.business_corporate_share_structures where ${where}`, /BUSINESS_COMMON_SHARE_STRUCTURE_REQUIRED/],
  [`update public.business_entities set entity_type='llc' where game_session_id=${q(one.id)} and id=${q(corporation.id)}`, /BUSINESS_COMMON_ENTITY_CONVERSION_REQUIRES_AUTHORITY/],
]) {
  expectSqlError(`begin; ${sql}; set constraints all immediate; commit;`, error);
  assert.deepEqual(read(), original, "invalid cap-table changes roll back");
}
expectSqlError(`begin;
  update public.business_ownership_positions set units=units+1,voting_units=voting_units+1 where ${founder};
  update public.business_corporate_share_structures set issued_shares=issued_shares+1,outstanding_shares=outstanding_shares+1 where ${where};
  commit;`, /BUSINESS_COMMON_RECEIPT_POSITION_MISMATCH/);
assert.deepEqual(read(), original);
for (const role of ["anon", "authenticated", "service_role"]) {
  expectSqlError(`begin; set local role ${role};
    update public.business_ownership_positions set units=units+1 where ${founder}; commit;`, /permission denied/);
  expectSqlError(`begin; set local role ${role};
    select economy_private.assert_business_common_equity_v1(${q(one.id)},${q(corporation.id)}); commit;`, /permission denied/);
}
// A fixture gift exercises atomic movement of the same common shares. It is
// not an economic command or a reopening of the retired valuation-based offer.
runSql(`begin;
  update public.business_ownership_positions set units=9500,voting_units=9500 where ${founder};
  insert into public.business_ownership_positions(game_session_id,business_id,player_id,ownership_kind,units,voting_units)
    values(${q(one.id)},${q(corporation.id)},${q(one.buyerTwoId)},'share',500,500);
  insert into public.business_ownership_transactions(game_session_id,business_id,transaction_kind,ownership_kind,
    from_player_id,to_player_id,units,voting_units,consideration_amount,currency_code,idempotency_key)
    values(${q(one.id)},${q(corporation.id)},'transfer','share',${q(one.buyerOneId)},${q(one.buyerTwoId)},
      500,500,0,'ECO','phase14b-fixture-transfer');
  set constraints all immediate; commit;`);
assert.equal(read().outstanding, "10000");
assert.equal(read().receipts, 2);
expectSqlError(`update public.business_ownership_transactions set units=501
  where ${where} and idempotency_key='phase14b-fixture-transfer';`, /BUSINESS_OWNERSHIP_TRANSACTION_IMMUTABLE/);
expectSqlError(`begin; update public.business_ownership_positions set game_session_id=${q(two.id)}
  where ${founder}; commit;`, /BUSINESS_EQUITY_SCOPE_IMMUTABLE/);
// An atomic issuance can commit in any statement order, but two concurrent
// issuances cannot both consume the final two authorized shares.
runSql(`update public.business_corporate_share_structures set authorized_shares=10002 where ${where};`);
function fixtureIssue(key) {
  return `update public.business_corporate_share_structures set issued_shares=issued_shares+2,
    outstanding_shares=outstanding_shares+2 where ${where};
    update public.business_ownership_positions set units=units+2,voting_units=voting_units+2 where ${founder};
    insert into public.business_ownership_transactions(game_session_id,business_id,transaction_kind,ownership_kind,
      to_player_id,units,voting_units,consideration_amount,currency_code,idempotency_key)
    values(${q(one.id)},${q(corporation.id)},'issuance','share',${q(one.buyerOneId)},2,2,0,'ECO',${q(key)});`;
}
const first = openPsqlSession("phase14b-equity-first");
const second = openPsqlSession("phase14b-equity-second");
try {
  await Promise.all([first.waitFor("SESSION_READY:"), second.waitFor("SESSION_READY:")]);
  first.write(`begin; select 1 from public.business_entities where id=${q(corporation.id)} for update;
    ${fixtureIssue("phase14b-capacity-first")} select 'FIRST_STAGED';`);
  await first.waitFor("FIRST_STAGED");
  second.write(`begin; select 1 from public.business_entities where id=${q(corporation.id)} for update;
    ${fixtureIssue("phase14b-capacity-second")} commit; select 'SECOND_COMMITTED';`);
  const rejected = second.waitFor("SECOND_COMMITTED").then(() => ({ committed: true }), error => ({ error: error.message }));
  await pollForDatabaseWait("phase14b-equity-second");
  first.write("commit; select 'FIRST_COMMITTED';");
  await first.waitFor("FIRST_COMMITTED");
  const result = await rejected;
  assert.equal(result.committed, undefined);
  assert.match(result.error, /business_corporate_share_structures_share_check/);
} finally { first.close(); second.close(); }
assert.equal(read().outstanding, "10002");
assert.equal(read().issued, "10002");
assert.equal(read().units, "10002");
assert.equal(read().votes, "10002");
assert.equal(read().receipts, 3);
assert.deepEqual(snapshot(two.id), otherBefore, "another game's complete economic state stays unchanged");
// The compatibility trigger must also create a valid legacy corporation.
runSql(`insert into public.business_entities(game_session_id,owner_player_id,legal_name,entity_type,industry_code,
  country_code,currency_code,status,capitalization,valuation,tax_classification,formation_state,ownership_model_version)
  values(${q(two.id)},${q(two.buyerOneId)},'Legacy Common Corporation','corporation','manufacturing',
    'TST','ECO','active',0,0,'c_corporation','operational',1);`);
console.log("Phase 14B common equity: real formation/replay, one share/one vote, receipt reconciliation, deferred atomicity, capacity race, role denial and game isolation pass.");
