import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MIGRATION = new URL(
  "../backend/supabase/migrations/20260725130000_restore_player_auth_service_role_access_v1.sql",
  import.meta.url,
);

test("Player login persistence remains browser-denied and service-owned", async () => {
  const sql = (await readFile(MIGRATION, "utf8")).toLowerCase();

  assert.match(
    sql,
    /revoke all on table public\.player_access_credentials\s+from public, anon, authenticated/,
  );
  assert.match(
    sql,
    /revoke all on table public\.player_sessions\s+from public, anon, authenticated/,
  );
  assert.match(
    sql,
    /grant select on table public\.player_access_credentials\s+to service_role/,
  );
  assert.match(
    sql,
    /grant select, insert, update on table public\.player_sessions\s+to service_role/,
  );
  assert.doesNotMatch(sql, /grant[^;]+to\s+(?:public|anon|authenticated)/);
  assert.doesNotMatch(
    sql,
    /grant\s+(?:insert|update|delete)[^;]+public\.player_access_credentials/,
  );
});
