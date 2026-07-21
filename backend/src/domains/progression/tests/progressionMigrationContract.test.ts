declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};
const MIGRATION = new URL(
  "../../../../supabase/migrations/20260721113000_add_progression_reputation_runtime_v1.sql",
  import.meta.url,
);

Deno.test("Progression migration is transactional, private, bounded, and replay safe", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  assert(sql.startsWith("begin;"));
  assert(sql.trimEnd().endsWith("commit;"));
  for (const table of [
    "progression_skill_definitions",
    "progression_achievement_definitions",
    "player_progression_profiles",
    "player_reputation_scores",
    "progression_events",
    "player_progression_skills",
    "player_achievement_progress",
    "player_progression_reward_grants",
    "progression_command_audit",
    "progression_admin_corrections",
  ]) {
    includes(sql, `create table public.${table}`);
    includes(sql, `alter table public.${table} force row level security`);
    includes(sql, `revoke all on table public.${table} from public, anon, authenticated`);
  }
  includes(sql, "progression_level_threshold_v1");
  includes(sql, "progression_level_for_experience_v1");
  includes(sql, "record_progression_integration_event_v1");
  includes(sql, "unlock_player_progression_skill_atomic_v1");
  includes(sql, "claim_player_progression_reward_atomic_v1");
  includes(sql, "apply_admin_progression_correction_atomic_v1");
  includes(sql, "refuse_progression_audit_mutation_v1");
  includes(sql, "between -100 and 100");
  includes(sql, "progression_events_idempotency_unique");
  includes(sql, "player_progression_reward_source_unique");
  includes(sql, "progression_command_idempotency_unique");
  includes(sql, "v_daily_count >= v_daily_cap");
  includes(sql, "least(1000000000");
  includes(sql, "greatest(-100, least(100");
  includes(sql, "game_session_id");
  assert(!sql.includes("access_code"));
  assert(!sql.includes("session_token"));
  assert(!sql.includes("generic_payload"));
  assert(!sql.includes("jsonb_payload"));
  assert(!sql.includes("insert into public.ledger"));
  assert(!sql.includes("insert into public.inventory"));
});

Deno.test("Progression definitions use equal specialization ceilings and bounded rewards", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  for (const track of ["markets", "enterprise", "production", "diplomacy"]) {
    const matches = [...sql.matchAll(new RegExp(`'${track}'`, "g"))];
    assert(matches.length >= 3);
  }
  for (const effect of ["100", "150", "250"]) includes(sql, `,${effect})`);
  includes(sql.toLowerCase(), "reward_kind in ('skill_points','reputation','badge')");
  assert(!sql.toLowerCase().includes("reward_kind in ('currency"));
  assert(!sql.toLowerCase().includes("exponential"));
});

function includes(value: string, expected: string): void {
  if (!value.includes(expected)) throw new Error(`Expected migration to include ${expected}`);
}
function assert(condition: boolean): void {
  if (!condition) throw new Error("Assertion failed");
}
