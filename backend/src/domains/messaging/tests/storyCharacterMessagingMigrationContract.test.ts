export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MESSAGING_MIGRATION = new URL(
  "../../../../supabase/migrations/20260811110000_story_character_messaging_v1.sql",
  import.meta.url,
);
const RENDER_MIGRATION = new URL(
  "../../../../supabase/migrations/20260811111000_story_character_message_render_v1.sql",
  import.meta.url,
);
const NORTHREACH_SEED = new URL(
  "../../../../supabase/migrations/20260811112000_northreach_character_opening_seed_v1.sql",
  import.meta.url,
);
const REPLY_ENGINE_MIGRATION = new URL(
  "../../../../supabase/migrations/20260818135000_add_story_character_reply_engine_v1.sql",
  import.meta.url,
);
const REPLY_INTENT_REFINEMENT = new URL(
  "../../../../supabase/migrations/20260818140500_refine_story_character_reply_intents_v1.sql",
  import.meta.url,
);
const REPLY_WORKER_SCALING = new URL(
  "../../../../supabase/migrations/20260818142000_scale_story_character_reply_worker_v1.sql",
  import.meta.url,
);

Deno.test("story character messaging stays player-scoped, idempotent, reply-aware, and canonical", async () => {
  const sql = await Deno.readTextFile(MESSAGING_MIGRATION);
  for (const contract of [
    "story_character_key text null",
    "story_character_name text null",
    "story_player_id uuid null",
    "story_conversation_key text null",
    "message_threads_story_conversation_unique",
    "deliver_story_character_message_v1",
    "STORY_CHARACTER_MESSAGE_SCOPE_FORBIDDEN",
    "STORY_CHARACTER_MESSAGE_IDEMPOTENCY_CONFLICT",
    "messages_system_idempotency_unique",
    "notification_deliveries",
    "allow_player_replies",
    "deliver_story_character_message_from_impact_v1",
    "new.effect_type = 'character_message'",
  ]) assertIncludes(sql, contract);
  assertIncludes(sql, "grant execute on function public.deliver_story_character_message_v1");
  assertNotIncludes(sql, "grant execute on function public.deliver_story_character_message_v1(uuid, uuid, text, text, text, text, text, boolean, text)\n  to anon");
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

Deno.test("player message rendering exposes character identity without exposing ownership IDs", async () => {
  const sql = await Deno.readTextFile(RENDER_MIGRATION);
  for (const contract of [
    "'storyCharacterKey', thread_row.story_character_key",
    "'storyCharacterName', thread_row.story_character_name",
    "when thread_row.story_character_name is not null then thread_row.story_character_name",
    "when message_row.sender_type = 'system' and thread_row.story_character_key is not null",
    "revoke all on function public.private_player_message_thread_payload_v1",
  ]) assertIncludes(sql, contract);
  assertNotIncludes(sql, "story_player_id'\n");
});

Deno.test("Northreach opening extends the canonical storyline with four authored relationship contacts", async () => {
  const sql = await Deno.readTextFile(NORTHREACH_SEED);
  for (const contract of [
    "econovaria_demo_act_1",
    "initialize_demo_storyline_for_game",
    "character.northreach.edda-veyr.v1",
    "character.northreach.jonis-hale.v1",
    "character.northreach.mares-kovan.v1",
    "character.northreach.rian-kest.v1",
    "'type', 'character_message'",
    "'type', 'player_current_country_is'",
    "'countryCode', 'NORTHREACH'",
    "activate_northreach_character_story_from_full_game_v1",
  ]) assertIncludes(sql, contract);
  assertNotIncludes(sql, "insert into public.game_session_storylines");
});

Deno.test("story character replies are durable, scoped, idempotent, and operationally controllable", async () => {
  const sql = await Deno.readTextFile(REPLY_ENGINE_MIGRATION);
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
  const sql = await Deno.readTextFile(REPLY_INTENT_REFINEMENT);
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
  const sql = await Deno.readTextFile(REPLY_WORKER_SCALING);
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
function assertIncludes(value: string, expected: string): void { if (!value.includes(expected)) throw new Error(`Missing contract: ${expected}`); }
function assertNotIncludes(value: string, unexpected: string): void { if (value.includes(unexpected)) throw new Error(`Unexpected contract: ${unexpected}`); }
function assertBefore(value: string, first: string, second: string): void {
  const firstIndex = value.indexOf(first);
  const secondIndex = value.indexOf(second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    throw new Error(`Expected ${first} before ${second}`);
  }
}
function assertEquals(actual: unknown, expected: unknown): void { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`); }
