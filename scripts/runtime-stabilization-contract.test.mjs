import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = await readFile("backend/supabase/config.toml", "utf8");
const migration = await readFile(
  "backend/supabase/migrations/20260725110000_repair_arrival_grant_scope_ambiguity_v3.sql",
  "utf8",
);
const workflow = await readFile(
  ".github/workflows/runtime-stabilization-onboarding.yml",
  "utf8",
);
const edgeSmoke = await readFile(
  "scripts/local-edge-runtime-smoke.mjs",
  "utf8",
);
const onboardingAdapter = await readFile(
  "scripts/runtime-stabilization-two-player-onboarding.mjs",
  "utf8",
);

test("local Supabase Edge Runtime remains enabled", () => {
  assert.match(config, /\[edge_runtime\]\s+enabled\s*=\s*true/m);
});

test("Arrival grant repair qualifies predicates that conflict with output variables", () => {
  assert.match(migration, /update public\.arrival_grant_commands as command_row/);
  assert.match(migration, /where command_row\.id = v_command\.id/);
  assert.match(migration, /update public\.player_progression_profiles as profile_row/);
  assert.match(migration, /and profile_row\.player_id = v_command\.player_id/);
});

test("runtime workflow proves live Edge routing and two-Player onboarding", () => {
  assert.match(workflow, /local-edge-runtime:/);
  assert.match(workflow, /node scripts\/local-edge-runtime-smoke\.mjs/);
  assert.match(workflow, /node scripts\/runtime-stabilization-two-player-onboarding\.mjs/);
  assert.match(workflow, /npx supabase db reset --workdir backend --local/);
});

test("local Edge smoke preserves JWT verification and rejects upstream failures", () => {
  assert.match(edgeSmoke, /jwtBypassUsed: false/);
  assert.match(edgeSmoke, /name resolution failed/);
  assert.match(edgeSmoke, /local_gateway_upstream_failed/);
  assert.match(edgeSmoke, /\/functions\/v1\/classroom-api\/staff\/signup/);
  assert.match(edgeSmoke, /\/functions\/v1\/admin-api\/diagnostics\/admin-console/);
});

test("two-Player acceptance uses an isolated game and idempotency namespace", () => {
  assert.match(onboardingAdapter, /Runtime Stabilization Two Player Target/);
  assert.match(onboardingAdapter, /game\.create\.runtime-stabilization\.two-player\.001/);
  assert.match(onboardingAdapter, /result\.outcome === \"created\"/);
});
