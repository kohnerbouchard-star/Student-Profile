export {};
declare const Deno: { args: string[]; readTextFile(path: string): Promise<string>; test(name: string, run: () => void | Promise<void>): void };
Deno.test("relationship migration keeps state private and idempotent", async () => {
  const sql = await Deno.readTextFile(Deno.args[0]);
  for (const fragment of [
    "create table public.story_relationships",
    "create table public.story_relationship_adjustments",
    "force row level security",
    "adjust_story_relationship_v1",
    "unique (game_session_id, player_id, source_storyline_event_id, effect_index)",
    "revoke all privileges",
  ]) if (!sql.includes(fragment)) throw new Error(`missing migration contract: ${fragment}`);
});
