export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260721152000_complete_messaging_lifecycle_v1.sql",
  import.meta.url,
);

Deno.test("Messaging completion migration enforces disabled attachments and game-scoped Player threads", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  for (const fragment of [
    "create table public.message_game_policies",
    "attachments_enabled boolean not null default false",
    "message_game_policies_attachments_disabled check (attachments_enabled = false)",
    "alter table public.message_game_policies force row level security",
    "created_by_player_id uuid null",
    "foreign key (game_session_id, created_by_player_id)",
    "create_player_message_thread_atomic_v1",
    "player_row.game_session_id = p_game_session_id",
    "player_row.player_identifier = v_recipient_identifier",
    "v_recipient.id = p_player_id",
    "player_message_threads_disabled",
    "player_message_recipient_not_found",
    "player_message_idempotency_conflict",
    "'threadid', v_thread.public_thread_id",
    "'messageid', v_message.public_message_id",
  ]) assertIncludes(sql, fragment);
  for (const forbidden of [
    "grant execute on function public.create_player_message_thread_atomic_v1(uuid, uuid, text, text, text, text) to anon",
    "grant execute on function public.create_player_message_thread_atomic_v1(uuid, uuid, text, text, text, text) to authenticated",
  ]) assert(!sql.includes(forbidden));
});

Deno.test("Contract thread validation, message immutability, and strict moderation replay are explicit", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  for (const fragment of [
    "validate_message_contract_thread_v1",
    "from public.game_session_contracts as contract_row",
    "contract_row.contract_key = new.contract_key",
    "message_contract_not_found",
    "protect_message_content_v1",
    "new.body is distinct from old.body",
    "message_content_immutable",
    "moderate_admin_message_atomic_v2",
    "v_existing.action <> v_action",
    "coalesce(v_existing.reason, '') <> coalesce(v_reason, '')",
    "admin_message_idempotency_conflict",
    "'replayed'::text",
  ]) assertIncludes(sql, fragment);
});

Deno.test("Messaging completion RPCs are service-role only and expose public identities", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  for (const signature of [
    "read_player_message_policy_v1(uuid, uuid)",
    "create_player_message_thread_atomic_v1(uuid, uuid, text, text, text, text)",
    "read_admin_message_policy_v1(uuid, uuid)",
    "set_admin_message_policy_v1(uuid, uuid, boolean, integer)",
    "moderate_admin_message_atomic_v2(uuid, uuid, text, text, text, text, text)",
  ]) {
    assertIncludes(sql, `revoke all on function public.${signature} from public, anon, authenticated`);
    assertIncludes(sql, `grant execute on function public.${signature} to service_role`);
  }
  const createReturn = between(
    sql,
    "returns table (\n  create_outcome text",
    ")\nlanguage plpgsql",
  );
  for (const fragment of ["thread_id text", "message_id text", "recipient_reference text"]) {
    assertIncludes(createReturn, fragment);
  }
  for (const forbidden of ["player_id uuid", "game_session_id uuid", "thread_uuid", "message_uuid"]) {
    assert(!createReturn.includes(forbidden));
  }
});

function between(value: string, start: string, end: string): string {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Section missing: ${start} -> ${end}`);
  return value.slice(startIndex, endIndex);
}
function assertIncludes(value: string, fragment: string): void {
  if (!value.includes(fragment)) throw new Error(`Missing fragment: ${fragment}`);
}
function assert(value: boolean): void {
  if (!value) throw new Error("Assertion failed");
}
