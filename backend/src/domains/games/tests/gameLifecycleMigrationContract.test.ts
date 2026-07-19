export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const MIGRATION = "supabase/migrations/20260719200000_add_game_lifecycle_controls_v1.sql";

Deno.test("game lifecycle migration defines canonical states and compatibility projection", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assertContains(sql, "lifecycle_state in ('draft', 'active', 'paused', 'ended', 'archived')");
  assertContains(sql, "when 'paused' then 'disabled'");
  assertContains(sql, "when 'ended' then 'archived'");
  assertContains(sql, "lifecycle_version = lifecycle_version + 1");
  assertContains(sql, "game_sessions_lifecycle_version_positive");
  assertContains(sql, "alter column lifecycle_state set default 'draft'");
  assertContains(sql, "initialize_game_lifecycle_before_insert");
  assertContains(sql, "game_sessions_lifecycle_status_projection_check");
});

Deno.test("game lifecycle transition is owner-scoped, idempotent, and row-locked", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assertContains(sql, "transition_game_lifecycle_atomic_v1");
  assertContains(sql, "owner_staff_user_id = p_staff_user_id");
  assertContains(sql, "for update;");
  assertContains(sql, "pg_advisory_xact_lock");
  assertContains(sql, "unique (game_session_id, idempotency_key)");
  assertContains(sql, "GAME_LIFECYCLE_IDEMPOTENCY_CONFLICT");
  assertContains(sql, "GAME_LIFECYCLE_VERSION_CONFLICT");
});

Deno.test("terminal lifecycle actions revoke sessions and join access atomically", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assertContains(sql, "v_action in ('end', 'archive', 'revoke_sessions')");
  assertContains(sql, "update public.player_sessions");
  assertContains(sql, "status = 'revoked'");
  assertContains(sql, "when v_action in ('end', 'archive') then 'revoked'");
  assertContains(sql, "when v_action in ('end', 'archive') then null");
  assertContains(sql, "'game.lifecycle.' || v_action");
});

Deno.test("game lifecycle database surface is service-role only", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assertContains(sql, "revoke all on function public.read_admin_game_lifecycle_v1(uuid, uuid) from public");
  assertContains(sql, "grant execute on function public.read_admin_game_lifecycle_v1(uuid, uuid) to service_role");
  assertContains(sql, "revoke all on function public.transition_game_lifecycle_atomic_v1(uuid, uuid, text, text, bigint) from public");
  assertContains(sql, "grant execute on function public.transition_game_lifecycle_atomic_v1(uuid, uuid, text, text, bigint) to service_role");
});

function assertContains(value: string, expected: string): void {
  if (!value.includes(expected)) {
    throw new Error(`Expected migration to contain: ${expected}`);
  }
}
