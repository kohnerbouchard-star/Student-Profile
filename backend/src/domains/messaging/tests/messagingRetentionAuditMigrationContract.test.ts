export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260721151000_harden_messaging_retention_and_audit_v2.sql",
  import.meta.url,
);

Deno.test("retention deletion preserves typed public audit evidence", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  for (const fragment of [
    "add column thread_public_id text",
    "add column message_public_id text",
    "add column deleted_message_count integer not null default 0",
    "drop constraint message_moderation_audit_thread_scope_fk",
    "drop constraint message_moderation_audit_message_scope_fk",
    "'delete_thread'",
    "capture_message_moderation_audit_identity_v1",
    "refuse_message_moderation_audit_mutation_v1",
    "before update or delete on public.message_moderation_audit",
  ]) assertIncludes(sql, fragment);
});

Deno.test("retention deletion is owner scoped expired only and idempotent", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  const deletion = between(
    sql,
    "create or replace function public.delete_expired_admin_message_thread_atomic_v1",
    "revoke all on function public.capture_message_moderation_audit_identity_v1",
  );
  for (const fragment of [
    "game_row.owner_staff_user_id = p_staff_user_id",
    "v_thread.retention_until > now()",
    "admin_message_retention_not_expired",
    "for update",
    "admin_message_idempotency_conflict",
    "'replayed'::text",
    "insert into public.message_moderation_audit",
    "delete from public.message_threads",
    "'applied'::text",
  ]) assertIncludes(deletion, fragment);
});

Deno.test("retention command returns only public command identities", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  const signature = between(
    sql,
    "returns table (",
    ")\nlanguage plpgsql",
  );
  for (const fragment of [
    "deletion_outcome text",
    "action_id text",
    "thread_id text",
    "deleted_message_count integer",
    "created_at timestamptz",
  ]) assertIncludes(signature, fragment);
  for (const forbidden of [
    "game_session_id uuid",
    "staff_user_id uuid",
    "thread_uuid",
    "message_uuid",
    "payload json",
  ]) assert(!signature.includes(forbidden));
});

function between(value: string, start: string, end: string): string {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Migration section missing: ${start} -> ${end}`);
  }
  return value.slice(startIndex, endIndex);
}
function assertIncludes(value: string, fragment: string): void {
  if (!value.includes(fragment)) throw new Error(`Missing fragment: ${fragment}`);
}
function assert(value: boolean): void {
  if (!value) throw new Error("Assertion failed");
}
