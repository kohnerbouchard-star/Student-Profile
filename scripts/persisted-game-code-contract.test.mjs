import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MIGRATION = new URL(
  "../backend/supabase/migrations/20260725123000_persist_memorable_game_join_codes_v1.sql",
  import.meta.url,
);
const WIRING = new URL("../admin/game-code-wiring.js", import.meta.url);
const RESET_HANDLER = new URL(
  "../backend/src/domains/game-sessions/api/gameJoinCodeResetHttpHandler.ts",
  import.meta.url,
);
const STAFF_BOOTSTRAP = new URL(
  "../backend/src/domains/auth/api/staffBootstrapHttpHandler.ts",
  import.meta.url,
);

test("Game Codes are persisted public identifiers with one issuance authority", async () => {
  const sql = await readFile(MIGRATION, "utf8");
  const lower = sql.toLowerCase();

  assert.match(lower, /add column if not exists game_join_code text null/);
  assert.match(sql, /\^ECO-\[A-Z\]\{3,12\}-\[A-Z\]\{3,12\}-\[0-9\]\{3\}\$/);
  assert.match(lower, /create unique index if not exists game_sessions_active_readable_join_code_unique/);
  assert.match(lower, /create or replace function public\.issue_game_join_code_v1/);
  assert.match(lower, /game_join_code = v_code/);
  assert.match(lower, /game_join_code_hash = v_hash/);
  assert.match(lower, /grant execute on function public\.issue_game_join_code_v1\(uuid, uuid\)[\s\S]+to service_role/);
  assert.match(lower, /revoke all on function public\.issue_game_join_code_v1\(uuid, uuid\)[\s\S]+from public, anon, authenticated/);
  assert.doesNotMatch(lower, /grant[^;]+to\s+(?:public|anon|authenticated)/);
  assert.match(lower, /create or replace function public\.create_provisioned_game_v2/);
  assert.match(lower, /from public\.issue_game_join_code_v1\(v_game_id, p_staff_user_id\)/);
  assert.match(lower, /'joincode', v_join_code/);
});

test("Admin reads the authoritative persisted code instead of a browser cache", async () => {
  const [wiring, resetHandler, bootstrap] = await Promise.all([
    readFile(WIRING, "utf8"),
    readFile(RESET_HANDLER, "utf8"),
    readFile(STAFF_BOOTSTRAP, "utf8"),
  ]);

  assert.doesNotMatch(wiring, /GAME_CODE_CACHE_PREFIX|readCachedCode|writeCachedCode/);
  assert.match(wiring, /method:\s*"GET"/);
  assert.match(wiring, /readPersistedGameCode/);
  assert.match(wiring, /remains available after reloads/);
  assert.match(resetHandler, /new Set\(\["GET", "POST"\]\)/);
  assert.match(resetHandler, /\.select\("game_join_code,game_join_code_status,updated_at"\)/);
  assert.match(resetHandler, /\.rpc\("issue_game_join_code_v1"/);
  assert.match(bootstrap, /game_join_code,game_join_code_status/);
  assert.match(bootstrap, /joinCode:\s*session\.game_join_code/);
  assert.match(bootstrap, /gameCode:\s*session\.game_join_code/);
});
