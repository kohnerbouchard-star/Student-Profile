import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MIGRATION = new URL(
  "../backend/supabase/migrations/20260725130000_restore_player_auth_service_role_access_v1.sql",
  import.meta.url,
);

const BROWSER_DENIED_TABLES = [
  "player_access_credentials",
  "player_sessions",
  "ledger_entries",
  "country_economic_snapshots",
];

test("Player authentication and read projections remain browser-denied and service-owned", async () => {
  const sql = (await readFile(MIGRATION, "utf8")).toLowerCase();

  assert.match(sql, /revoke all on table[\s\S]+from public, anon, authenticated/);
  for (const table of BROWSER_DENIED_TABLES) {
    assert.match(sql, new RegExp(`public\\.${table}`));
  }
  assert.match(
    sql,
    /grant select on table public\.player_access_credentials\s+to service_role/,
  );
  assert.match(
    sql,
    /grant select, insert, update on table public\.player_sessions\s+to service_role/,
  );
  assert.match(
    sql,
    /grant select on table[\s\S]+public\.ledger_entries,[\s\S]+public\.country_economic_snapshots[\s\S]+to service_role/,
  );
  assert.doesNotMatch(sql, /grant[^;]+to\s+(?:public|anon|authenticated)/);
  assert.doesNotMatch(
    sql,
    /grant\s+(?:insert|update|delete)[^;]+public\.player_access_credentials/,
  );
  assert.match(sql, /has_table_privilege\('service_role', 'public\.ledger_entries', 'select'\)/);
  assert.match(sql, /has_table_privilege\('service_role', 'public\.country_economic_snapshots', 'select'\)/);
});
