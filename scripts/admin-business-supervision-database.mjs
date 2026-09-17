import assert from "node:assert/strict";
import { FIXTURE, resetFixture, runSql, runJson, expectSqlError, sqlLiteral as q, snapshot } from "./business-phase10-atomic-settlement-database-support.mjs";

resetFixture();
const one = FIXTURE.games.one;
const two = FIXTURE.games.two;
runSql(`
  insert into public.staff_users(id, supabase_auth_user_id, email, display_name, status, role)
  values ('10000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-00000000000a','phase13-other@example.invalid','Other owner','active','game_admin');
  insert into public.staff_permission_grants(staff_user_id, permission)
  values ('${FIXTURE.staffId}', 'business.manage') on conflict do nothing;
  insert into public.business_ownership_positions(game_session_id,business_id,player_id,ownership_kind,units,voting_units)
  values ('${one.id}','${one.businessId}','${one.ownerId}','membership_interest',75,75),
    ('${one.id}','${one.businessId}','${one.buyerOneId}','membership_interest',25,25),
    ('${two.id}','${two.businessId}','${two.ownerId}','membership_interest',100,100);
  insert into public.business_activity_events(game_session_id,business_id,actor_type,event_type,reason_code,metadata)
  select '${one.id}','${one.businessId}','system','phase13.fixture','phase13.acceptance',
    jsonb_build_object('privateId','${one.ownerId}','token','POISON')
  from generate_series(1,101);
`);
const call = (game=one, staff=FIXTURE.staffId, key=game.businessKey) =>
  `public.read_admin_business_supervision_v2(${q(game.id)}::uuid,${q(staff)}::uuid,${q(key)})`;
function read(game=one) {
  // PostgreSQL enforces the no-write invariant, including nested SECURITY DEFINER helpers.
  return runJson(`begin read only; set local role service_role; select ${call(game)}::text; commit;`);
}
const before = [snapshot(one.id), snapshot(two.id)];
const first = read();
assert.equal(first.business.public_key, one.businessKey);
assert.equal(first.supervision.readOnly,true);
assert.equal(first.supervision.businessKey,one.businessKey);
const sections = first.supervision.sections;
assert.equal(Object.keys(sections).length,22);
assert.equal(sections.activity.rows.length,100);
assert.equal(sections.activity.truncated,true);
assert.equal(sections.ownership.rows.length,2);
assert.deepEqual(sections.ownership.rows.map(r=>r.ownership_basis_points).sort(),["2500","7500"]);
assert.ok(sections.offers.rows.some(r=>r.public_key===one.offerKey));
assert.ok(!sections.offers.rows.some(r=>r.public_key===two.offerKey));
assert.ok(read(two).supervision.sections.offers.rows.some(r=>r.public_key===two.offerKey));
assert.doesNotMatch(JSON.stringify(first), /POISON|player_id|actor_id|request_hash|idempotency_key|lease_token|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
assert.equal(sections.payroll.status,"empty");
assert.equal(sections.taxes.status,"empty");
assert.ok(sections.checking.rows.every(r=>typeof r.posted_amount==="string"));
read();
assert.deepEqual([snapshot(one.id),snapshot(two.id)],before);

expectSqlError(`begin; set local role service_role; select ${call(one,FIXTURE.staffId,two.businessKey)}; rollback;`,/BUSINESS_NOT_FOUND/);
expectSqlError(`begin; set local role service_role; select ${call(one,one.ownerId)}; rollback;`,/BUSINESS_SUPERVISION_DENIED/);
for (const role of ["anon","authenticated"]) {
  expectSqlError(`begin; set local role ${role}; select ${call()}; rollback;`,/permission denied/i);
}
expectSqlError(`begin; delete from public.staff_permission_grants where staff_user_id='${FIXTURE.staffId}' and permission='business.manage'; set local role service_role; select ${call()}; rollback;`,/BUSINESS_SUPERVISION_DENIED/);
expectSqlError(`begin; update public.staff_users set status='suspended', suspended_at=statement_timestamp() where id='${FIXTURE.staffId}'; set local role service_role; select ${call()}; rollback;`,/BUSINESS_SUPERVISION_DENIED/);
expectSqlError(`begin; update public.staff_users set role='security_operator' where id='${FIXTURE.staffId}'; set local role service_role; select ${call()}; rollback;`,/BUSINESS_SUPERVISION_DENIED/);
expectSqlError(`begin; update public.game_sessions set owner_staff_user_id='10000000-0000-0000-0000-000000000009' where id='${one.id}'; set local role service_role; select ${call()}; rollback;`,/BUSINESS_SUPERVISION_DENIED/);

const mapping=[{"player":"read_owned_business_stockroom_locations_v2","helper":"read_business_stockroom_locations_v2","table":true,"source":"20260821130000_business_stockroom_locations_v2.sql"},{"player":"read_owned_business_stockroom_v2","helper":"read_business_stockroom_v2","table":true,"source":"20260902091000_business_stockroom_numeric_projection_v2.sql"},{"player":"read_owned_business_equipment_v2","helper":"read_business_equipment_v2","table":true,"source":"20260902090000_business_equipment_read_period_projection_v2.sql"},{"player":"read_owned_business_workforce_utilization_v2","helper":"read_business_workforce_utilization_v2","table":false,"source":"20260822140300_business_production_labor_reservations_v2.sql"},{"player":"read_owned_business_manufacturing_jobs_v2","helper":"read_business_manufacturing_jobs_v2","table":true,"source":"20260823110100_business_manufacturing_worker_and_read_v2.sql"},{"player":"read_owned_business_production_readiness_v2","helper":"read_business_production_readiness_v2","table":false,"source":"20260902092000_business_workspace_read_projections_v2.sql"},{"player":"get_business_treasury_overview_v1","helper":"get_business_treasury_overview_v1","table":false,"source":"20260831101000_business_treasury_fx_commands_v1.sql"}];
for (const spec of mapping) {
  const args=`${q(one.id)}::uuid,${q(one.ownerId)}::uuid`;
  const expression=spec.table ? `(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.${spec.player}(${args}) r)` : `public.${spec.player}(${args})`;
  // Old Player entry points still operate in read-only transactions after extraction.
  const result=runJson(`begin read only; set local role service_role; select ${expression}::text; commit;`);
  assert.ok(result !== null,spec.player);
  expectSqlError(`begin; set local role service_role; select economy_private.${spec.helper}('${one.id}','${one.businessId}'); rollback;`,/permission denied/i);
}
expectSqlError(`begin read only; set local role service_role; select public.read_owned_business_stockroom_v2('${one.id}','${two.ownerId}'); rollback;`,/BUSINESS_NOT_FOUND/);
const closed = runJson(`begin; update public.business_entities set status='closed', closed_at=now() where id='${one.businessId}'; set local role service_role; select ${call()}::text; rollback;`);
assert.equal(closed.business.status,"closed");
assert.ok(closed.supervision.healthFlags.includes("business-not-active"));
const exact = runJson(`select economy_private.business_supervision_section_v2('[{"amount":9007199254740993.123456789123456789}]'::jsonb)::text;`);
assert.equal(exact.rows[0].amount,"9007199254740993.123456789123456789");
console.log("Phase 13 database: 22 sections, read-only enforcement, two-game scope, multi-owner percentages, grants/roles, closed history, Player ownership, and exact decimal precision pass");
