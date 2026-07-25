import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CONFIG = new URL("../backend/supabase/config.toml", import.meta.url);
const MIGRATION = new URL(
  "../backend/supabase/migrations/20260725110000_repair_arrival_grant_scope_ambiguity_v3.sql",
  import.meta.url,
);

test("local Supabase Edge Runtime is enabled", async () => {
  const source = await readFile(CONFIG, "utf8");
  assert.match(source, /\[edge_runtime\]\s+enabled\s*=\s*true/);
});

test("Arrival grant repair qualifies predicates exposed by RETURNS TABLE", async () => {
  const source = await readFile(MIGRATION, "utf8");
  assert.match(source, /update public\.arrival_grant_commands as command_row/);
  assert.match(source, /where command_row\.id = v_command\.id/);
  assert.match(source, /update public\.player_progression_profiles as profile_row/);
  assert.match(source, /where profile_row\.game_session_id = p_game_session_id/);
  assert.match(source, /and profile_row\.player_id = v_command\.player_id/);
  assert.doesNotMatch(
    source,
    /update public\.player_progression_profiles\s+set[\s\S]*?where game_session_id = p_game_session_id\s+and player_id = v_command\.player_id/,
  );
});
