export {};
declare const Deno: { readTextFile(path: string): Promise<string>; test(name: string, run: () => void | Promise<void>): void };
const migrationPath = "supabase/migrations/20260810215844_add_story_structured_response_windows_v1.sql";
Deno.test("S2 Story response migration is private, immutable, and replay-safe", async () => {
  const sql = await Deno.readTextFile(migrationPath);
  for (const required of ["create table public.story_message_interactions","create table public.story_message_interaction_selections","force row level security","deliver_story_character_message_v2","select_player_story_message_interaction_v1","read_player_story_message_interactions_v1","read_admin_story_message_interactions_v1","read_story_message_interaction_effective_choice_v1","PLAYER_STORY_CHOICE_IDEMPOTENCY_CONFLICT","PLAYER_STORY_CHOICE_EXPIRED"]) {
    if (!sql.includes(required)) throw new Error(`missing ${required}`);
  }
  if (/grant\s+(?:select|insert|update|delete|all)[^;]+to\s+(?:anon|authenticated)/i.test(sql)) throw new Error("browser table grants are not allowed");
});
