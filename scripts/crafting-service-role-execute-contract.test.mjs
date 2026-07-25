import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MIGRATION = new URL(
  "../backend/supabase/migrations/20260725131000_restore_crafting_service_role_execute_v1.sql",
  import.meta.url,
);

const SERVICE_RPC_SIGNATURES = [
  "read_player_crafting_v1\\(uuid,uuid\\)",
  "start_player_crafting_job_v1\\(uuid,uuid,text,integer,jsonb,text\\)",
  "cancel_player_crafting_job_v1\\(uuid,uuid,text,text\\)",
  "claim_player_crafting_job_v1\\(uuid,uuid,text,text\\)",
  "set_player_equipment_slot_v1\\(uuid,uuid,text,text,text\\)",
  "use_player_inventory_item_effect_v1\\(uuid,uuid,text,text,text\\)",
  "salvage_player_equipment_v1\\(uuid,uuid,text,text\\)",
  "read_admin_crafting_oversight_v1\\(uuid,uuid,text,integer\\)",
  "recover_admin_crafting_job_v1\\(uuid,uuid,text,text,text,text\\)",
  "apply_admin_physical_economy_supply_v1\\(uuid,uuid,text,text,text,integer,numeric,numeric,text,timestamptz,text\\)",
  "import_physical_economy_pack_v1\\(uuid,uuid,jsonb,text,text\\)",
  "activate_physical_economy_pack_v1\\(uuid,uuid,text,text,text\\)",
];

test("Crafting RPC execution is service-owned and browser-denied", async () => {
  const sql = (await readFile(MIGRATION, "utf8")).toLowerCase();

  for (const signature of SERVICE_RPC_SIGNATURES) {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${signature}\\s+from public, anon, authenticated`),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${signature}\\s+to service_role`),
    );
  }

  assert.doesNotMatch(sql, /grant execute[^;]+to\s+(?:public|anon|authenticated)/);
  assert.match(sql, /has_function_privilege\('service_role'/);
  assert.match(sql, /has_function_privilege\('anon'/);
  assert.match(sql, /has_function_privilege\('authenticated'/);
  assert.match(sql, /notify pgrst, 'reload schema'/);
});
