export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260721133000_compat_messaging_player_status_v1.sql",
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
