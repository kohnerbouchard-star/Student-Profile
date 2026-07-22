import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const recovery = await readFile(new URL(
  "../backend/supabase/migrations/20260721145500_add_admin_crafting_recovery_v1.sql",
  import.meta.url,
), "utf8");
const supply = await readFile(new URL(
  "../backend/supabase/migrations/20260721145700_add_admin_crafting_supply_and_grants_v1.sql",
  import.meta.url,
), "utf8");

test("Admin recovery rejects divergent idempotent replays", () => {
  for (const token of [
    "CRAFTING_RECOVERY_IDEMPOTENCY_CONFLICT",
    "v_event.target_key is distinct from p_job_public_id",
    "v_event.outcome->>'outcome'",
    "v_event.outcome->>'reason'",
  ]) assert.match(recovery, new RegExp(token.replaceAll(".", "\\."), "i"));
});

test("Admin recovery records the true immutable transition origin", () => {
  assert.match(recovery, /v_from_status\s+text/i);
  assert.match(recovery, /v_from_status:=v_job\.status/i);
  assert.match(
    recovery,
    /p_game_session_id,v_job\.id,v_from_status,v_job\.status,'staff_user'/i,
  );
});

test("Admin supply rejects divergent replay payloads", () => {
  for (const token of [
    "CRAFTING_SUPPLY_IDEMPOTENCY_CONFLICT",
    "v_request jsonb",
    "v_event.outcome-'version'-'replayed'",
    "v_request||jsonb_build_object",
  ]) assert.match(supply, new RegExp(token.replaceAll(".", "\\."), "i"));
});

test("Admin supply is active-game scoped and uses bounded public identifiers", () => {
  assert.match(supply, /status='active'\s+and lifecycle_state='active'/i);
  assert.match(supply, /p_country_code !~ '\^\[A-Z\]\{3\}\$'/i);
  assert.match(supply, /p_source_event_key !~ '\^\[A-Za-z0-9\]/i);
  assert.match(supply, /revoke all on function public\.apply_admin_physical_economy_supply_v1/i);
});
