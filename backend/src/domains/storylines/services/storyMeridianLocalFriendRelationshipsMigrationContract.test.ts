export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260816090600_seed_meridian_local_friend_relationships_v1.sql",
  import.meta.url,
);

Deno.test("Meridian local friends add ten non-sponsor relationships across the full arc", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

  for (const expected of [
    "meridian_local_friend_introductions",
    "meridian_local_friend_fracture_reactions",
    "meridian_local_friend_wartime_reactions",
    "meridian_local_friend_belonging_reactions",
    "36000",
    "108000",
    "540000",
    "626400",
    "'relationshipRole', 'local_friend'",
    "player_relationship_reply_count_at_least",
    "'relationshipAware',true",
  ]) assertIncludes(compact(sql), compact(expected));

  assertEquals(countOccurrences(sql, '"countryCode":'), 10);
  assertEquals(countOccurrences(sql, '"conversationKey":'), 10);
  assertEquals(countOccurrences(sql, "_local_friend_intro'"), 1);
  assertEquals(countOccurrences(sql, "_local_friend_fracture_engaged'"), 1);
  assertEquals(countOccurrences(sql, "_local_friend_war_engaged'"), 1);
  assertEquals(countOccurrences(sql, "_local_friend_belonging_engaged'"), 1);
});

Deno.test("Meridian local friends use the ten authored country-opening identities", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  for (const expected of FRIEND_KEYS) assertIncludes(sql, expected);
  for (const expected of FRIEND_NAMES) assertIncludes(sql, expected);
});

Deno.test("Meridian local friends remain globally dormant and definitions-only", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  for (const expected of [
    "is_active=false",
    "existing in-progress games are intentionally not backfilled mid-campaign",
    "revoke all on function public.initialize_meridian_local_friend_relationships_v1(uuid)",
  ]) assertIncludes(compact(sql), compact(expected));

  assertNotIncludes(sql, "insert into public.game_session_story_event_overrides");
  assertNotIncludes(sql, "enable_meridian_campaign_continuation_after_arrival_v1");
  assertNotIncludes(sql, "immigration_lock");
  assertNotIncludes(sql, "cash_credit");
  assertNotIncludes(sql, "cash_debit");
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

const FRIEND_KEYS = [
  "character.northreach.jonis-hale.v1",
  "character.yrethia.perran-dey.v1",
  "character.thaloris.kalen-ro.v1",
  "character.solvend.liora-fen.v1",
  "character.eldoran.oren-pell.v1",
  "character.valerion.ressa-vail.v1",
  "character.lumenor.arven-lis.v1",
  "character.xalvoria.sena-korr.v1",
  "character.dravenlok.tarek-junn.v1",
  "character.syndalis.nyra-pell.v1"
] as const;
const FRIEND_NAMES = [
  "Jonis Hale",
  "Perran Dey",
  "Kalen Ro",
  "Liora Fen",
  "Oren Pell",
  "Ressa Vail",
  "Arven Lis",
  "Sena Korr",
  "Tarek Junn",
  "Nyra Pell"
] as const;

function compact(value: string): string { return value.replace(/\s+/g, ""); }
function countOccurrences(value: string, needle: string): number { return value.split(needle).length - 1; }
function firstNonblank(value: string): string { return value.split(/\r?\n/).map((line)=>line.trim().toLowerCase()).find(Boolean) ?? ""; }
function lastNonblank(value: string): string { return value.split(/\r?\n/).map((line)=>line.trim().toLowerCase()).filter(Boolean).at(-1) ?? ""; }
function assertIncludes(value: string, expected: string): void { if (!value.includes(expected)) throw new Error(`Missing contract: ${expected}`); }
function assertNotIncludes(value: string, unexpected: string): void { if (value.includes(unexpected)) throw new Error(`Unexpected contract: ${unexpected}`); }
function assertEquals(actual: unknown, expected: unknown): void { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`); }
