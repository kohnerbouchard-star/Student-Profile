import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("admin/game-lifecycle-controls.js", "utf8");
const css = readFileSync("admin/css/game-lifecycle-controls.css", "utf8");
const html = readFileSync("admin/index.html", "utf8");
const edge = readFileSync("backend/supabase/functions/admin-api/gameLifecycleOperations.ts", "utf8");
const index = readFileSync("backend/supabase/functions/admin-api/index.ts", "utf8");
const account = readFileSync("backend/supabase/functions/admin-api/accountOperations.ts", "utf8");
const gameRoutes = readFileSync("backend/supabase/functions/admin-api/gameRoutes.ts", "utf8");
const gameCode = readFileSync("admin/game-code-wiring.js", "utf8");
const migration = readFileSync(
  "backend/supabase/migrations/20260719200000_add_game_lifecycle_controls_v1.sql",
  "utf8",
);

assert.match(html, /css\/game-lifecycle-controls[.]css/);
assert.match(html, /game-lifecycle-controls[.]js/);
assert.match(source, /econovaria:admin-account-surface-ready/);
assert.match(source, /account-games/);
assert.match(source, /\/api\/admin\/games\/\$\{encodeURIComponent\(gameId\)\}\/lifecycle/);
assert.match(source, /sessions\/revoke/);
assert.match(source, /expectedVersion/);
assert.match(source, /x-idempotency-key/);
assert.match(source, /EconovariaAdminModalAccessibility/);
assert.match(source, /data-admin-terminal-modal-backdrop/);
assert.match(source, /Type \$\{definition[.]phrase\} to confirm/);
assert.doesNotMatch(source, /new\s+MutationObserver/);
assert.doesNotMatch(source, /window[.]fetch\s*=/);
assert.doesNotMatch(source, /document[.]createElement\(["']style["']\)/);
assert.doesNotMatch(source, /innerHTML\s*=\s*`[^`]*\$\{/s);

assert.match(css, /admin-game-lifecycle__facts/);
assert.match(css, /@media \(max-width: 760px\)/);
assert.doesNotMatch(css, /position:\s*absolute[^}]*top:\s*0/s);

assert.match(index, /handleGameLifecycleOperation/);
assert.match(index, /guardGameScopedMutation/);
assert.match(edge, /read_admin_game_lifecycle_v1/);
assert.match(edge, /transition_game_lifecycle_atomic_v1/);
assert.match(edge, /game_mutations_paused/);
assert.match(edge, /game_lifecycle_terminal/);
assert.match(account, /transition_game_lifecycle_atomic_v1/);
assert.doesNotMatch(account, /[.]update\(\{ status: ["\']archived["\']/);
assert.match(gameRoutes, /join-code\/reset/);
assert.match(gameCode, /join-code\/reset/);
assert.match(migration, /game_lifecycle_transition_requests/);
assert.match(migration, /alter column lifecycle_state set default ["\']draft["\']/);
assert.match(migration, /initialize_game_lifecycle_before_insert/);
assert.match(migration, /game_sessions_lifecycle_status_projection_check/);
assert.match(migration, /update public[.]player_sessions/);
assert.match(migration, /game_join_code_status = case/);
assert.match(migration, /insert into public[.]audit_log/);

console.log("Admin game lifecycle source contract passed.");
