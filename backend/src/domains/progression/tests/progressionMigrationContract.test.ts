declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};
const MIGRATION = new URL(
  "../../../../supabase/migrations/20260721113000_add_progression_reputation_runtime_v1.sql",
  import.meta.url,
);
const IDEMPOTENCY_MIGRATION = new URL(
  "../../../../supabase/migrations/20260721115500_harden_progression_event_idempotency_v1.sql",
  import.meta.url,
);
const CURVE_AND_LIFECYCLE_MIGRATION = new URL(
  "../../../../supabase/migrations/20260721120500_rebalance_progression_curve_v1.sql",
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

Deno.test("Progression ingress binds source contracts and prevents source-event farming", async () => {
  const sql = (await Deno.readTextFile(IDEMPOTENCY_MIGRATION)).toLowerCase();
  assert(sql.startsWith("begin;"));
  assert(sql.trimEnd().endsWith("commit;"));
  includes(sql, "progression_events_source_identity_unique");
  includes(sql, "game_session_id,\n    player_id,\n    source_domain,\n    source_event_type,\n    source_public_id");
  includes(sql, "progression_event_source_mismatch");
  includes(sql, "progression_source_event_conflict");
  includes(sql, "select * into v_source_existing");
  includes(sql, "return query select 'replayed'::text, v_source_existing.public_event_id");
  includes(sql, "for update");
  for (const contract of [
    "business.operation.completed",
    "crafting.recipe.completed",
    "market.order.settled",
    "story.chapter.completed",
    "world.travel.completed",
    "world.arrival.completed",
    "messaging.contribution.approved",
  ]) includes(sql, contract);
  includes(sql, "source_domain in ('contracts','business','crafting','market','story','relationship','country','world','messaging','admin')");
});

Deno.test("Admin corrections serialize with lifecycle transitions and preserve committed replay", async () => {
  const sql = (await Deno.readTextFile(CURVE_AND_LIFECYCLE_MIGRATION)).toLowerCase();
  assert(sql.startsWith("begin;"));
  assert(sql.trimEnd().endsWith("commit;"));
  includes(sql, "enforce_progression_admin_correction_game_active_v1");
  includes(sql, "before insert on public.progression_admin_corrections");
  includes(sql, "for share");
  includes(sql, "game_session_disabled");
  includes(sql, "game_session_archived");
  includes(sql, "game_session_not_active");
  includes(sql, "game_session_not_found");
  includes(sql, "committed idempotent replays remain available because they do not insert new audit rows");
  assert(!sql.includes("before update on public.progression_admin_corrections"));
});

function includes(value: string, expected: string): void {
  if (!value.includes(expected)) throw new Error(`Expected migration to include ${expected}`);
}
function assert(condition: boolean): void {
  if (!condition) throw new Error("Assertion failed");
}
