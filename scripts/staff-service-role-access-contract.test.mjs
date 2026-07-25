import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MIGRATION = new URL(
  "../backend/supabase/migrations/20260725113000_restore_staff_users_service_role_access_v1.sql",
  import.meta.url,
);

const REQUIRED_READ_TABLES = [
  "game_sessions",
  "players",
  "country_profiles",
  "store_items",
  "store_purchases",
  "player_country_assignments",
  "account_balances",
  "game_session_stock_assets",
  "player_sessions",
  "inventory_holdings",
  "game_session_contracts",
  "player_contract_progress",
  "player_attendance_records",
];

const DELEGATED_CONTROL_TABLES = [
  "stock_holdings",
  "stock_trades",
  "stock_market_events",
  "player_admin_flags",
  "player_admin_settings",
];

test("staff authentication and bootstrap projections remain service-owned", async () => {
  const sql = (await readFile(MIGRATION, "utf8")).toLowerCase();

  assert.match(sql, /revoke all on table public\.staff_users from public, anon, authenticated/);
  assert.match(
    sql,
    /grant select, insert, update, delete on table public\.staff_users to service_role/,
  );

  for (const table of REQUIRED_READ_TABLES) {
    assert.match(sql, new RegExp(`public\\.${table}`));
  }
  for (const table of DELEGATED_CONTROL_TABLES) {
    assert.doesNotMatch(sql, new RegExp(`public\\.${table}`));
  }
  assert.match(sql, /to service_role/);
  assert.doesNotMatch(sql, /grant[^;]+to\s+(?:anon|authenticated)/);
});
