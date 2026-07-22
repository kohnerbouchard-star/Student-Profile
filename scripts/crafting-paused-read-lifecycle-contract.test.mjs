import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const playerReadMigration = await readFile(
  new URL(
    "../backend/supabase/migrations/20260721132000_add_player_crafting_read_v1.sql",
    import.meta.url,
  ),
  "utf8",
);
const itemDefinitionMigration = await readFile(
  new URL(
    "../backend/supabase/migrations/20260721130000_add_crafting_item_definitions_v1.sql",
    import.meta.url,
  ),
  "utf8",
);

test("Player Crafting reads preserve active and paused lifecycle projections", () => {
  assert.match(
    playerReadMigration,
    /g\.status\s*=\s*'active'\s+and\s+g\.lifecycle_state\s*=\s*'active'/i,
  );
  assert.match(
    playerReadMigration,
    /g\.status\s*=\s*'disabled'\s+and\s+g\.lifecycle_state\s*=\s*'paused'/i,
  );
  assert.doesNotMatch(
    playerReadMigration,
    /g\.lifecycle_state\s+in\s*\(\s*'active'\s*,\s*'paused'\s*\)\s*and\s*g\.status\s*=\s*'active'/i,
  );
  assert.doesNotMatch(
    playerReadMigration,
    /g\.lifecycle_state\s*=\s*'(ended|archived)'/i,
  );
});

test("Crafting deterministic helper pins its search path", () => {
  assert.match(
    itemDefinitionMigration,
    /crafting_deterministic_basis_points_v1[\s\S]*?set search_path\s*=\s*public\s*,\s*pg_temp[\s\S]*?as \$\$/i,
  );
});
