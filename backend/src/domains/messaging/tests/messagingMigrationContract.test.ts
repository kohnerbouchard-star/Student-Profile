declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260720123000_add_messaging_communication_v1.sql",
  import.meta.url,
);

Deno.test("messaging migration is forward, transaction-wrapped, forced-RLS, and game isolated", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  assert(sql.trimStart().startsWith("begin;"));
  assert(sql.trimEnd().endsWith("commit;"));
  for (const fragment of [
    "create table public.message_threads",
    "create table public.message_thread_participants",
    "create table public.messages",
    "create table public.message_moderation_audit",
    "foreign key (game_session_id, thread_id)",
    "foreign key (game_session_id, player_id)",
    "alter table public.message_threads force row level security",
    "alter table public.messages force row level security",
    "revoke all privileges on table public.messages from public, anon, authenticated",
    "security definer",
    "set search_path = public, pg_temp",
  ]) assertIncludes(sql, fragment);
  assert(!sql.includes("drop table"));
  assert(!sql.includes("drop column"));
});

Deno.test("messaging browser contracts use public identifiers and never return ownership UUID columns", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  for (const fragment of [
    "public_thread_id text not null default ('thr_'",
    "public_message_id text not null default ('msg_'",
    "public_action_id text not null default ('mda_'",
    "'id', thread_row.public_thread_id",
    "'id', message_row.public_message_id",
    "player_sender.player_identifier !~*",
  ]) assertIncludes(sql, fragment);

  const playerRead = between(
    sql,
    "create or replace function public.read_player_messages_v1",
    "create or replace function public.send_player_message_atomic_v1",
  );
  for (const forbidden of [
    "'game_session_id'",
    "'player_id'",
    "'sender_player_id'",
    "'sender_staff_user_id'",
    "'thread_id', thread_row.id",
    "'id', message_row.id",
  ]) assert(!playerRead.includes(forbidden));
});

Deno.test("messaging sends and staff moderation serialize and replay idempotently", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  const send = between(
    sql,
    "create or replace function public.send_player_message_atomic_v1",
    "create or replace function public.mark_player_message_thread_read_v1",
  );
  const moderate = between(
    sql,
    "create or replace function public.moderate_admin_message_atomic_v1",
    "revoke all on function public.read_player_messages_v1",
  );
  for (const fragment of [
    "messages_player_idempotency_unique",
    "for update of thread_row",
    "player_message_idempotency_conflict",
    "return query\n    select\n      'replayed'::text",
    "insert into public.notification_deliveries",
    "on conflict (notification_id, player_id) do nothing",
  ]) assertIncludes(fragment === "messages_player_idempotency_unique" ? sql : send, fragment);
  for (const fragment of [
    "message_moderation_audit_staff_idempotency_unique",
    "admin_message_idempotency_conflict",
    "for update",
    "insert into public.message_moderation_audit",
    "'replayed'::text",
  ]) assertIncludes(fragment === "message_moderation_audit_staff_idempotency_unique" ? sql : moderate, fragment);
});

Deno.test("messaging retention, reply policy, body bounds, and moderation audit are explicit", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  for (const fragment of [
    "thread_type in ('announcement', 'system', 'player', 'contract')",
    "status in ('active', 'disabled', 'closed')",
    "length(btrim(body)) between 1 and 1000",
    "retention_until > created_at",
    "thread_row.retention_until > now()",
    "player_message_replies_disabled",
    "action in ('create_thread', 'disable_thread', 'enable_thread', 'close_thread', 'hide_message', 'unhide_message')",
    "immutable staff moderation and thread-creation command audit",
  ]) assertIncludes(sql, fragment);
});

function between(value: string, start: string, end: string): string {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Migration section missing: ${start} -> ${end}`);
  return value.slice(startIndex, endIndex);
}

function assertIncludes(value: string, fragment: string): void {
  if (!value.includes(fragment)) throw new Error(`Missing fragment: ${fragment}`);
}

function assert(value: boolean): void {
  if (!value) throw new Error("Assertion failed");
}
