export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const STORY_TRIGGER_HARDENING = new URL(
  "../../../../supabase/migrations/20260812091500_harden_story_trigger_function_privileges_v1.sql",
  import.meta.url,
);
const FOLLOWUP_TRIGGER_HARDENING = new URL(
  "../../../../supabase/migrations/20260812093000_harden_relationship_followup_trigger_privileges_v1.sql",
  import.meta.url,
);

Deno.test("Story trigger-only SECURITY DEFINER helpers are not directly executable", async () => {
  const sql = await Deno.readTextFile(STORY_TRIGGER_HARDENING);

  for (const helper of [
    "deliver_story_character_message_from_impact_v1()",
    "activate_northreach_character_story_from_full_game_v1()",
    "capture_story_relationship_contact_v1()",
    "capture_story_relationship_reply_v1()",
    "activate_remaining_country_openings_from_full_game_v1()",
  ]) {
    assertIncludes(sql, `revoke all on function public.${helper}`);
  }

  assertEquals(countOccurrences(sql, "from public, anon, authenticated, service_role;"), 5);
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

Deno.test("relationship follow-up trigger-only helpers are not directly executable", async () => {
  const sql = await Deno.readTextFile(FOLLOWUP_TRIGGER_HARDENING);

  for (const helper of [
    "activate_relationship_followups_from_full_game_v1()",
    "enable_relationship_followups_after_arrival_contact_v1()",
  ]) {
    assertIncludes(sql, `revoke all on function public.${helper}`);
  }

  assertEquals(countOccurrences(sql, "from public, anon, authenticated, service_role;"), 2);
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

function firstNonblank(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim().toLowerCase()).find(Boolean) ?? "";
}

function lastNonblank(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim().toLowerCase()).filter(Boolean).at(-1) ?? "";
}

function assertIncludes(value: string, expected: string): void {
  if (!value.includes(expected)) throw new Error(`Missing contract: ${expected}`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
