export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260721154000_harden_messaging_player_reads_v1.sql",
  import.meta.url,
);

Deno.test("Messaging player read hardening provides exact reads, database search and cursor pagination", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  for (const contract of [
    "create or replace function public.read_player_messages_v2",
    "create or replace function public.read_player_message_thread_v1",
    "create or replace function public.private_player_message_thread_payload_v1",
    "p_before_updated_at timestamptz",
    "p_before_thread_public_id text",
    "position(lower(v_query)",
    "'pageUnreadCount'",
    "'nextCursor'",
    "global_unread as",
    "PLAYER_MESSAGE_THREAD_NOT_FOUND",
    "grant execute on function public.read_player_messages_v2",
    "grant execute on function public.read_player_message_thread_v1",
  ]) {
    assertIncludes(sql, contract);
  }

  assertIncludes(sql, "revoke all on function public.private_player_message_thread_payload_v1");
  assertNotIncludes(sql, "grant execute on function public.private_player_message_thread_payload_v1");
  assertNotIncludes(sql, " to anon");
  assertNotIncludes(sql, " to authenticated");
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

function firstNonblank(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim().toLowerCase()).find(Boolean) ?? "";
}

function lastNonblank(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim().toLowerCase()).filter(Boolean).at(-1) ?? "";
}

function assertIncludes(value: string, expected: string): void {
  if (!value.includes(expected)) throw new Error(`Missing contract: ${expected}`);
}

function assertNotIncludes(value: string, unexpected: string): void {
  if (value.includes(unexpected)) throw new Error(`Unexpected contract: ${unexpected}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
