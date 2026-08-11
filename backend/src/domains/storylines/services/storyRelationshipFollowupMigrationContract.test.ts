export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const FOLLOWUPS = new URL(
  "../../../../supabase/migrations/20260812092000_seed_relationship_followups_and_meridian_fracture_v1.sql",
  import.meta.url,
);
const ACTIVATION = new URL(
  "../../../../supabase/migrations/20260812092500_defer_relationship_followups_until_arrival_v1.sql",
  import.meta.url,
);

Deno.test("relationship follow-up seed covers ten countries and uses persisted relationship conditions", async () => {
  const sql = await Deno.readTextFile(FOLLOWUPS);

  for (const contract of [
    "initialize_relationship_followups_and_meridian_fracture_v1",
    "player_relationship_stage_is",
    "player_relationship_reply_count_at_least",
    "player_relationship_trust_score",
    "'operator', 'at_least'",
    "'score', 20",
    "'phase', 'meridian_boom'",
    "'phase', 'meridian_fracture'",
    "21600",
    "86400",
    "character.northreach.edda-veyr.v1",
    "character.yrethia.leva-orren.v1",
    "character.thaloris.vessa-tarn.v1",
    "character.solvend.iven-sar.v1",
    "character.eldoran.mera-dalen.v1",
    "character.valerion.celan-mire.v1",
    "character.lumenor.nela-corin.v1",
    "character.xalvoria.elian-vor.v1",
    "character.dravenlok.orsa-bren.v1",
    "character.syndalis.aven-sorel.v1",
  ]) {
    assertIncludes(sql, contract);
  }

  assertEquals(countOccurrences(sql, '"country":"'), 10);
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

Deno.test("relationship follow-ups remain globally dormant and enable per game after arrival contact", async () => {
  const sql = await Deno.readTextFile(ACTIVATION);

  for (const contract of [
    "create table if not exists public.game_session_story_event_overrides",
    "primary key (game_session_id, storyline_event_id)",
    "zzz_defer_relationship_followups_after_full_game_activation_v1",
    "set is_active = false",
    "enable_relationship_followups_after_arrival_contact_v1",
    "new.payload -> 'payload' ->> 'phase'",
    "= 'arrival'",
    "insert into public.game_session_story_event_overrides",
    "on conflict (game_session_id, storyline_event_id) do update",
    "relationship_%_sponsor_followup",
    "meridian_fracture_%_sponsor_reaction",
    "grant select, insert, update, delete",
  ]) {
    assertIncludes(sql, contract);
  }

  assertNotIncludes(sql, "set is_active = true");
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
  if (!value.includes(expected)) {
    throw new Error(`Missing contract: ${expected}`);
  }
}

function assertNotIncludes(value: string, unexpected: string): void {
  if (value.includes(unexpected)) {
    throw new Error(`Unexpected contract: ${unexpected}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
