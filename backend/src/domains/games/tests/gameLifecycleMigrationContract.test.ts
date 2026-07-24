export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const MIGRATION =
  "supabase/migrations/20260719200000_add_game_lifecycle_controls_v1.sql";
const REPAIR_MIGRATION =
  "supabase/migrations/20260724013000_repair_game_lifecycle_version_ambiguity_v1.sql";

Deno.test("game lifecycle migration defines canonical states and compatibility projection", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assertContains(
    sql,
    "lifecycle_state in ('draft', 'active', 'paused', 'ended', 'archived')",
  );
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
  assertContains(
    sql,
    "revoke all on function public.read_admin_game_lifecycle_v1(uuid, uuid) from public",
  );
  assertContains(
    sql,
    "grant execute on function public.read_admin_game_lifecycle_v1(uuid, uuid) to service_role",
  );
  assertContains(
    sql,
    "revoke all on function public.transition_game_lifecycle_atomic_v1(uuid, uuid, text, text, bigint) from public",
  );
  assertContains(
    sql,
    "grant execute on function public.transition_game_lifecycle_atomic_v1(uuid, uuid, text, text, bigint) to service_role",
  );
});

Deno.test("forward repair qualifies lifecycle columns that overlap output variables", async () => {
  const sql = await Deno.readTextFile(REPAIR_MIGRATION);
  assertContains(sql, "create or replace function public.transition_game_lifecycle_atomic_v1");
  assertContains(sql, "update public.game_sessions as gs");
  assertContains(sql, "lifecycle_version = gs.lifecycle_version + 1");
  assertContains(sql, "coalesce(gs.started_at, v_now)");
  assertContains(sql, "else gs.paused_at");
  assertContains(sql, "else gs.resumed_at");
  assertContains(sql, "coalesce(gs.ended_at, v_now)");
  assertContains(sql, "coalesce(gs.archived_at, v_now)");
  assertContains(sql, "returning gs.* into v_game");
  assertContains(sql, "to service_role");

  const forbidden = [
    "lifecycle_version = lifecycle_version + 1",
    "coalesce(started_at, v_now)",
    "else paused_at",
    "else resumed_at",
    "coalesce(ended_at, v_now)",
    "coalesce(archived_at, v_now)",
  ];
  for (const token of forbidden) {
    if (sql.includes(token)) {
      throw new Error(`Repair migration retained ambiguous token: ${token}`);
    }
  }
});

Deno.test("forward repair preserves lifecycle idempotency and authorization contracts", async () => {
  const sql = await Deno.readTextFile(REPAIR_MIGRATION);
  assertContains(sql, "pg_advisory_xact_lock");
  assertContains(sql, "GAME_LIFECYCLE_IDEMPOTENCY_CONFLICT");
  assertContains(sql, "GAME_LIFECYCLE_VERSION_CONFLICT");
  assertContains(sql, "owner_staff_user_id = p_staff_user_id");
  assertContains(sql, "v_action in ('end', 'archive', 'revoke_sessions')");
  assertContains(sql, "status = 'revoked'");
  assertContains(sql, "security definer");
  assertContains(sql, "set search_path = public, pg_temp");
});

function assertContains(value: string, expected: string): void {
  if (!value.includes(expected)) {
    throw new Error(`Expected migration to contain: ${expected}`);
  }
}
