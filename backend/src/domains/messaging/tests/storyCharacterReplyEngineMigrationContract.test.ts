export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const ENGINE_MIGRATION = new URL(
  "../../../../supabase/migrations/20260818135000_add_story_character_reply_engine_v1.sql",
  import.meta.url,
);
const INTENT_REFINEMENT = new URL(
  "../../../../supabase/migrations/20260818140500_refine_story_character_reply_intents_v1.sql",
  import.meta.url,
);
const WORKER_SCALING = new URL(
  "../../../../supabase/migrations/20260818142000_scale_story_character_reply_worker_v1.sql",
  import.meta.url,
);

Deno.test("story character replies are durable, scoped, idempotent, and operationally controllable", async () => {
  const sql = await Deno.readTextFile(ENGINE_MIGRATION);
  for (const contract of [
    "create table private.story_character_reply_jobs",
    "story_character_reply_jobs_source_unique",
    "status in ('pending','processing','retry','completed','dead_letter','superseded')",
    "enqueue_story_character_reply_job_v1",
    "when (new.sender_type = 'player')",
    "for update skip locked",
    "deliver_story_character_message_v1",
    "'char_reply_' || replace(v_job.source_message_id::text, '-', '')",
    "read_story_character_reply_engine_health_v1",
    "set_story_character_reply_engine_enabled_v1",
    "lastCharacterReplyMessageId",
    "lastPlayerIntent",
    "lastPlayerTopic",
    "grant execute on function public.process_due_story_character_reply_jobs_v1",
  ]) assertIncludes(sql, contract);
  assertNotIncludes(sql, "grant execute on function public.process_due_story_character_reply_jobs_v1(integer, timestamptz)\n  to anon");
  assertNotIncludes(sql, "grant execute on function public.set_story_character_reply_engine_enabled_v1(boolean)\n  to authenticated");
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

Deno.test("story character intent classification prioritizes concern and advice over negotiation", async () => {
  const sql = await Deno.readTextFile(INTENT_REFINEMENT);
  for (const contract of [
    "return 'concern';",
    "return 'advice';",
    "return 'negotiation';",
    "counteroffer",
    "deal terms",
    "contract terms",
  ]) assertIncludes(sql, contract);
  assertBefore(sql, "return 'concern';", "return 'advice';");
  assertBefore(sql, "return 'advice';", "return 'negotiation';");
  assertNotIncludes(sql, "salary|wage|rent|price");
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

Deno.test("story character worker uses a bounded sub-minute cadence and prunes its cron history", async () => {
  const sql = await Deno.readTextFile(WORKER_SCALING);
  for (const contract of [
    "max_batch_size = 200",
    "'10 seconds'",
    "process_due_story_character_reply_jobs_v1(200, clock_timestamp())",
    "econovaria-story-character-replies-log-prune-v1",
    "cron.job_run_details",
    "interval '7 days'",
  ]) assertIncludes(sql, contract);
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

function assertBefore(value: string, first: string, second: string): void {
  const firstIndex = value.indexOf(first);
  const secondIndex = value.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    throw new Error(`Expected ${first} before ${second}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
