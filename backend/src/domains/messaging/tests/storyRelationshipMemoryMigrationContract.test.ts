export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MEMORY_MIGRATION = new URL(
  "../../../../supabase/migrations/20260812090000_add_story_relationship_memory_v1.sql",
  import.meta.url,
);
const OPENINGS_MIGRATION = new URL(
  "../../../../supabase/migrations/20260812091000_seed_remaining_country_character_openings_v1.sql",
  import.meta.url,
);

Deno.test("story relationship memory is player-scoped and reply-aware", async () => {
  const sql = await Deno.readTextFile(MEMORY_MIGRATION);
  for (const contract of [
    "create table public.player_story_relationships",
    "player_story_relationships_scope_unique",
    "record_player_story_relationship_memory_v1",
    "capture_story_relationship_contact_v1",
    "capture_story_relationship_reply_v1",
    "reply_count = reply_count + 1",
    "stage = case when stage = 'contacted' then 'engaged' else stage end",
    "trust_score between -100 and 100",
    "to service_role",
  ]) assertIncludes(sql, contract);
  assertNotIncludes(sql, "grant select on table public.player_story_relationships to authenticated");
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

Deno.test("remaining country openings add 36 contacts to the canonical storyline", async () => {
  const sql = await Deno.readTextFile(OPENINGS_MIGRATION);
  for (const country of [
    "YRETHIA", "THALORIS", "SOLVEND", "ELDORAN", "VALERION",
    "LUMENOR", "XALVORIA", "DRAVENLOK", "SYNDALIS",
  ]) assertIncludes(sql, `\"countryCode\":\"${country}\"`);
  for (const role of ["sponsor", "local_friend", "rival_peer", "gatekeeper"]) {
    assertIncludes(sql, `\"role\":\"${role}\"`);
  }
  const contactCount = (sql.match(/\"country\":/g) ?? []).length;
  assertEquals(contactCount, 36);
  assertIncludes(sql, "econovaria_demo_act_1");
  assertIncludes(sql, "initialize_remaining_country_character_openings_v1");
  assertNotIncludes(sql, "insert into public.storylines");
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
