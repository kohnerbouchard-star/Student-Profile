import assert from "node:assert/strict";
import { FIXTURE, runSql, runJson, expectSqlError, snapshot, sqlLiteral as q } from "./business-phase10-atomic-settlement-database-support.mjs";
import { jsonService } from "./business-primary-ipo-fixture.mjs";

// This helper inherits the fixture's localhost-only connection guard. The R2
// completion and expired license are disposable test setup, not live actions.
export function verifyPrimaryIpoPurge(game, other) {
  const before = snapshot(other.id);
  const ids = {
    code: '71000000-0000-4000-8000-000000000014',
    entitlement: '72000000-0000-4000-8000-000000000014',
    request: '73000000-0000-4000-8000-000000000014',
    arm: '74000000-0000-4000-8000-000000000014',
  };
  const tables = ['business_management_mandates','business_governance_proposals','business_governance_voter_snapshots',
    'business_governance_votes','business_ownership_transactions','business_financial_statements'];
  const counts = Object.fromEntries(tables.map(table => [table, Number(runSql(
    `select count(*) from public.${table} where game_session_id=${q(game.id)};`).output)]));
  assert.ok(Object.values(counts).every(count => count > 0), 'purge must exercise actual IPO and financial evidence');
  jsonService("public.configure_game_data_purge_environment_v1('staging','phase14c-disposable-r2')");
  runSql(`begin;
    insert into public.purchase_codes(id,code_hash,status,max_redemptions,redeemed_count,license_duration_days)
      values(${q(ids.code)},repeat('e',64),'exhausted',1,1,null);
    insert into public.entitlements(id,purchase_code_id,staff_user_id,game_session_id,status,license_expires_at,expired_at)
      values(${q(ids.entitlement)},${q(ids.code)},${q(FIXTURE.staffId)},${q(game.id)},'expired','2000-01-01','2000-01-02');
    update private.game_data_purge_control set arm_id=${q(ids.arm)},armed_until=clock_timestamp()+interval '2 hours',
      armed_by_staff_user_id=${q(FIXTURE.staffId)},armed_at=clock_timestamp(),disarmed_at=null,updated_at=clock_timestamp() where singleton;
    insert into private.game_data_purge_requests(id,game_session_id,game_name_snapshot,entitlement_id,license_expires_at,status,
      confirmation_hash,confirmation_issued_at,confirmation_not_before,confirmation_expires_at,confirmed_by_staff_user_id,
      confirmed_at,purge_not_before,confirmed_arm_id,r2_prefix,r2_deleted_at)
      select ${q(ids.request)},id,name,${q(ids.entitlement)},'2000-01-01','r2_deleted',repeat('c',64),
        clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 minutes',
        ${q(FIXTURE.staffId)},clock_timestamp()-interval '1 minute',clock_timestamp()-interval '1 day',${q(ids.arm)},
        ${q(`staging/game_session=${game.id}/`)},clock_timestamp()-interval '1 minute'
      from public.game_sessions where id=${q(game.id)};
    commit;`);
  const preflight = jsonService(`public.get_game_data_purge_preflight_v1(${q(ids.request)})`);
  assert.equal(preflight.registrySha256, 'ab44a67a1247fd706636c3aeb627f352344ca08bde6b6c7159f686a873612a48');
  assert.equal(preflight.fkGraphSha256, '343f1966b3750e7a639fb82059bab1049edd44591e27d59cd08017c19be46198');
  assert.equal(preflight.deleteOrderSha256, 'f2fe1c6ad5d11bf7c73e1bd761153e6e6cfa726d9b26f780b62e42eb603667b6');
  assert.deepEqual([preflight.registryTableCount,preflight.fkGraphEdgeCount,preflight.deleteOrderTableCount], [206,455,205]);
  expectSqlError(`begin; update private.game_data_purge_requests set db_delete_cursor=206 where id=${q(ids.request)};
    set local role service_role; select public.finalize_game_data_purge_v1(${q(ids.request)}); commit;`, /GAME_PURGE_DATABASE_ROWS_REMAIN/);
  let cursor = 0;
  while (cursor < 206) {
    const claims = runJson(`begin; set local role service_role;
      select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb)::text from public.claim_confirmed_game_data_purge_v1() c; commit;`);
    assert.equal(claims.length, 1); assert.equal(claims[0].request_id, ids.request); assert.equal(claims[0].stage, 'db');
    const next = jsonService(`public.execute_game_data_purge_db_batch_v2(${q(ids.request)},20)`);
    assert.ok(next.cursor > cursor && next.cursor - cursor <= 20);
    cursor = next.cursor;
  }
  const result = jsonService(`public.finalize_game_data_purge_v1(${q(ids.request)})`);
  assert.equal(result.status, 'completed'); assert.equal(result.leverDisarmed, true);
  assert.equal(runSql(`select count(*) from public.game_sessions where id=${q(game.id)};`).output, '0');
  const deleted = runJson(`select db_deleted_rows::text from private.game_data_purge_requests where id=${q(ids.request)};`);
  for (const table of tables) assert.equal(deleted[`public.${table}`], counts[table], table);
  assert.deepEqual(snapshot(other.id), before, 'canonical IPO purge must preserve the comparison game');
  console.log('Phase 14C populated IPO purge: 206 registry / 455 FK / 205 ordered / 206 final cursor; immutable evidence removed with other-game isolation.');
}
