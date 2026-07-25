import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MIGRATION = new URL(
  "../backend/supabase/migrations/20260725120000_restore_admin_control_service_role_access_v1.sql",
  import.meta.url,
);

const MUTABLE_CONTROL_TABLES = [
  "attendance_day_locks",
  "player_admin_flags",
  "player_admin_settings",
  "staff_admin_preferences",
  "game_settings",
  "game_difficulty_policy_settings",
];

const READ_ONLY_REFERENCE_TABLES = [
  "difficulty_policy_profiles",
  "stock_holdings",
  "stock_orders",
  "stock_trades",
  "stock_price_ticks",
  "stock_market_events",
];

test("Admin runtime tables remain browser-denied and service-owned", async () => {
  const sql = (await readFile(MIGRATION, "utf8")).toLowerCase();

  for (const table of MUTABLE_CONTROL_TABLES) {
    assert.match(sql, new RegExp(`public\\.${table}`));
    assert.match(
      sql,
      new RegExp(
        `has_table_privilege\\('service_role',\\s*'public\\.${table}',\\s*'select,insert,update,delete'\\)`,
      ),
    );
  }

  for (const table of READ_ONLY_REFERENCE_TABLES) {
    assert.match(sql, new RegExp(`public\\.${table}`));
    assert.match(
      sql,
      new RegExp(
        `has_table_privilege\\('service_role',\\s*'public\\.${table}',\\s*'select'\\)`,
      ),
    );
  }

  assert.match(
    sql,
    /revoke all on table[\s\S]+from public, anon, authenticated/,
  );
  assert.match(
    sql,
    /grant select, insert, update, delete on table[\s\S]+to service_role/,
  );
  assert.match(
    sql,
    /grant select on table[\s\S]+to service_role/,
  );
  assert.doesNotMatch(
    sql,
    /grant[^;]+to\s+(?:public|anon|authenticated)/,
  );
  assert.match(sql, /notify pgrst,\s*'reload schema'/);
});
