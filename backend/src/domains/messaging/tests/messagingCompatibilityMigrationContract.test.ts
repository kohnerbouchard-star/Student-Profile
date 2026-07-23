export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260721153000_compat_messaging_player_status_v1.sql",
  import.meta.url,
);

Deno.test("Messaging compatibility migration uses the stable active Player interface", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  for (const fragment of [
    "create or replace function public.read_player_message_policy_v1",
    "create or replace function public.create_player_message_thread_atomic_v1",
    "player_row.status = 'active'",
    "player_row.game_session_id = p_game_session_id",
    "player_row.player_identifier = v_recipient_identifier",
    "player_message_recipient_not_found",
    "on conflict on constraint message_thread_participants_pkey do nothing",
    "participant_row.thread_id = v_thread_id",
    "update public.message_thread_participants as participant_row",
    "create or replace function public.create_admin_message_thread_atomic_v1",
    "create or replace function public.mark_player_message_thread_read_v1",
    "create or replace function public.send_player_message_atomic_v1",
    "create or replace function public.read_player_messages_v1",
    "v_initial_created_at := clock_timestamp()",
    "created_at, updated_at",
    "v_initial_created_at, v_initial_created_at",
    "grant execute on function public.read_player_message_policy_v1(uuid, uuid) to service_role",
    "grant execute on function public.create_player_message_thread_atomic_v1(uuid, uuid, text, text, text, text) to service_role",
  ]) {
    if (!sql.includes(fragment)) throw new Error(`Missing fragment: ${fragment}`);
  }
  if (sql.includes("archived_at")) throw new Error("Compatibility migration must not depend on Player archive columns.");
  if (!sql.trimStart().startsWith("begin;") || !sql.trimEnd().endsWith("commit;")) {
    throw new Error("Compatibility migration must be transaction wrapped.");
  }
});

Deno.test("Messaging participant lifecycle is serialized, scoped, bounded, and immutably audited", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  for (const fragment of [
    "add column participant_reference text null",
    "'add_participant'",
    "'remove_participant'",
    "create or replace function public.change_admin_message_participant_atomic_v1",
    "game_row.owner_staff_user_id = p_staff_user_id",
    "player_row.game_session_id = p_game_session_id",
    "player_row.player_identifier = v_participant_key",
    "player_row.status = 'active'",
    "from public.message_threads as thread_row",
    "for update",
    "v_thread.retention_until <= now()",
    "v_count >= 500",
    "admin_message_last_participant",
    "on conflict (thread_id, player_id) do nothing",
    "delete from public.message_thread_participants",
    "insert into public.message_moderation_audit",
    "participant_reference",
    "grant execute on function public.change_admin_message_participant_atomic_v1(uuid, uuid, text, text, text, text, text) to service_role",
  ]) {
    if (!sql.includes(fragment)) throw new Error(`Missing participant fragment: ${fragment}`);
  }
  for (const forbidden of [
    "grant execute on function public.change_admin_message_participant_atomic_v1(uuid, uuid, text, text, text, text, text) to anon",
    "grant execute on function public.change_admin_message_participant_atomic_v1(uuid, uuid, text, text, text, text, text) to authenticated",
  ]) {
    if (sql.includes(forbidden)) throw new Error(`Forbidden participant grant: ${forbidden}`);
  }
});
