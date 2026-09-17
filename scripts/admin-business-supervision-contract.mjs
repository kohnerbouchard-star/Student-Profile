import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUSINESS_SUPERVISION_FIELDS, normalizeBusinessSupervision } from "../admin/v2/src/routes/business/BusinessSupervisionModel.js";
const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const migrations = "backend/supabase/migrations/";
const shared = read(migrations + "20260917214421_admin_business_supervision_v2.sql");
const snapshot = read(migrations + "20260917214558_admin_business_supervision_snapshot_v2.sql");
const mapping = [
  {
    "player": "read_owned_business_stockroom_locations_v2",
    "helper": "read_business_stockroom_locations_v2",
    "table": true,
    "source": "20260821130000_business_stockroom_locations_v2.sql"
  },
  {
    "player": "read_owned_business_stockroom_v2",
    "helper": "read_business_stockroom_v2",
    "table": true,
    "source": "20260902091000_business_stockroom_numeric_projection_v2.sql"
  },
  {
    "player": "read_owned_business_equipment_v2",
    "helper": "read_business_equipment_v2",
    "table": true,
    "source": "20260902090000_business_equipment_read_period_projection_v2.sql"
  },
  {
    "player": "read_owned_business_workforce_utilization_v2",
    "helper": "read_business_workforce_utilization_v2",
    "table": false,
    "source": "20260822140300_business_production_labor_reservations_v2.sql"
  },
  {
    "player": "read_owned_business_manufacturing_jobs_v2",
    "helper": "read_business_manufacturing_jobs_v2",
    "table": true,
    "source": "20260823110100_business_manufacturing_worker_and_read_v2.sql"
  },
  {
    "player": "read_owned_business_production_readiness_v2",
    "helper": "read_business_production_readiness_v2",
    "table": false,
    "source": "20260902092000_business_workspace_read_projections_v2.sql"
  },
  {
    "player": "get_business_treasury_overview_v1",
    "helper": "get_business_treasury_overview_v1",
    "table": false,
    "source": "20260831101000_business_treasury_fx_commands_v1.sql"
  }
];
function definition(source, name) {
  const start = source.toLowerCase().indexOf("create or replace function " + name.toLowerCase() + "(");
  assert.ok(start >= 0, name);
  const bodyStart = source.indexOf("as $function$", start) + "as $function$".length;
  const end = source.indexOf("$function$;", bodyStart);
  assert.ok(end > bodyStart, name);
  return source.slice(bodyStart, end);
}
for (const spec of mapping) {
  const original = definition(read(migrations + spec.source), "public." + spec.player);
  const expected = original.replaceAll("public.resolve_player_business_v2(p_game_session_id, p_player_id)", "economy_private.resolve_business_read_scope_v2(p_game_session_id, p_business_id)");
  assert.equal(definition(shared, "economy_private." + spec.helper), expected, spec.helper + " canonical body drift");
  const wrapper = definition(shared, "public." + spec.player);
  assert.ok(wrapper.includes("public.resolve_player_business_v2(p_game_session_id, p_player_id)"));
  assert.ok(wrapper.includes("economy_private." + spec.helper + "(p_game_session_id, v_business.business_id)"));
}
for (const source of [shared, snapshot]) {
  const withoutComments = source.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(withoutComments, /\b(?:insert\s+into|update\s+public\.|delete\s+from|truncate|alter\s+table|create\s+table|for\s+update)\b/i);
}
assert.doesNotMatch(snapshot, /p_player_id|resolve_player_business_v2|ensure_business|current_business_payroll_period_key_v2/);
for (const guard of ["s.status = 'active'", "s.role = 'game_admin'", "permission.permission = 'business.manage'", "s.id = p_staff_user_id", "g.owner_staff_user_id", "b.game_session_id = p_game_session_id", "b.public_key = p_business_key", "from public, anon, authenticated;"]) assert.ok(snapshot.includes(guard), guard);
assert.ok(snapshot.includes("where a.ordinality <= 100"));
assert.ok(snapshot.includes("then to_jsonb(e.value #>> '{}')"));
assert.ok(snapshot.includes("limit 101"));
const projection = read("backend/supabase/functions/admin-api/businessSupervisionProjection.ts");
for (const name of Object.keys(BUSINESS_SUPERVISION_FIELDS)) {
  assert.ok(snapshot.includes("'" + name + "'"), name);
  assert.ok(projection.includes(name + ":"), name);
}
const key = "biz_" + "a".repeat(32);
const privateId = "10000000-0000-0000-0000-000000000001";
const model = normalizeBusinessSupervision({
  schemaVersion: 1, readOnly: true, businessKey: key, sections: {
    checking: { status: "ready", rows: [{ account_key: "bac_" + "b".repeat(32), posted_amount: "9007199254740993.123456789123456789", currency_code: "ECO", account_id: privateId, held_amount: privateId, metadata: { token: "SECRET" } }] },
    ownership: { status: "ready", rows: Array.from({length:101}, () => ({ units: "1", player_id: privateId })) },
  },
}, key);
assert.equal(model.sections.checking.rows[0].posted_amount, "9007199254740993.123456789123456789");
assert.equal(model.sections.checking.rows[0].held_amount, null);
assert.equal(model.sections.ownership.rows.length, 100);
assert.equal(model.sections.ownership.truncated, true);
assert.equal(model.sections.payroll.status, "unavailable");
assert.doesNotMatch(JSON.stringify(model), /SECRET|account_id|player_id|10000000-0000/);
assert.equal(normalizeBusinessSupervision({schemaVersion:1,readOnly:true,businessKey:"biz_"+"b".repeat(32),sections:{}},key).sections.checking.status, "unavailable");
console.log("Phase 13 source authority, canonical body parity, bounded precision and privacy: pass");
