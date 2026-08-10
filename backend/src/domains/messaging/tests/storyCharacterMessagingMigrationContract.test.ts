declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const MIGRATION = "20260810081110_add_story_character_messaging_v1.sql";

Deno.test("story character Messaging migration preserves private system-owned authority", async () => {
  const sql = await Deno.readTextFile(
    new URL(`../../../../supabase/migrations/${MIGRATION}`, import.meta.url),
  );

  for (const pattern of [
    /thread_type in \('announcement', 'system', 'player', 'contract', 'story'\)/,
    /message_threads_story_system_only/,
    /create table public\.story_message_threads/,
    /unique \(game_session_id, player_id, character_key\)/,
    /create table public\.story_messages/,
    /unique \(game_session_id, player_id, source_storyline_event_id, effect_index\)/,
    /alter table public\.story_message_threads force row level security/,
    /alter table public\.story_messages force row level security/,
    /protect_story_message_participants_v1/,
    /STORY_MESSAGE_PARTICIPANTS_IMMUTABLE/,
    /create or replace function public\.deliver_story_character_message_v1/,
    /security definer\s+set search_path = public, pg_temp/,
    /grant execute on function public\.deliver_story_character_message_v1[\s\S]*to service_role/,
    /storyCharacterName/,
    /storyEventKey/,
  ]) {
    if (!pattern.test(sql)) throw new Error(`Missing migration contract: ${pattern}`);
  }

  if (/grant execute on function public\.deliver_story_character_message_v1[\s\S]{0,300}to (?:anon|authenticated)/.test(sql)) {
    throw new Error("Story message delivery must not be browser-executable.");
  }
});
