export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260816090300_seed_meridian_fortune_during_war_v1.sql",
  import.meta.url,
);

Deno.test("Stage 8 creates explainable wartime opportunities rather than lottery profit", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  for (const required of [
    "meridian_fortune_during_war",
    "518400",
    "'stage', 8",
    "'sentiment', 'mixed'",
    "'impactStrength', 'high'",
    "meridian_wartime_opportunity_window_v1",
    "meridian_wartime_profit_requires_tradeoff_v1",
    "profitMustBeExplainable",
    "lotteryProfit', false",
    "profitSource",
    "affectedPeople",
    "legalRisk",
    "reputationalRisk",
    "longTermDependency",
    "mutuallyExclusive', false",
    "player_completed_contract",
    "contract.meridian.war-civilian-continuity-assessment.v1",
    "contract.meridian.conflict-evidence-and-correction.v1",
  ]) assertIncludes(sql, required);

  assertEquals(countOccurrences(sql, "'type', 'contract_unlock'"), 6);
  assertEquals(countOccurrences(sql, '"countryCode":'), 10);
  assertNotIncludes(sql, "cash_debit");
  assertNotIncludes(sql, "immigration_lock");
  assertNotIncludes(sql, "attackerCountry");
  assertNotIncludes(sql, "confirmed attacker");
});

Deno.test("Stage 8 stays an adaptation phase instead of silently escalating world damage", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assertIncludes(sql, "adaptation phase, not another military escalation");
  assertNotIncludes(sql, "world_route_state_change");
  assertNotIncludes(sql, "world_location_state_change");
  assertIncludes(sql, "'VAL', 0");
  assertIncludes(sql, "'SYN', 300");
  assertIncludes(sql, "'category', 'war_conflict'");
  assertIncludes(sql, "attribution', 'unresolved'");
});

Deno.test("Stage 8 is bootstrap-safe and follows Stage 7 deterministically", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  for (const required of [
    "create or replace function public.initialize_meridian_fortune_during_war_v1",
    "MERIDIAN_FORTUNE_DURING_WAR_GAME_NOT_FOUND",
    "MERIDIAN_FORTUNE_DURING_WAR_CANONICAL_STORYLINE_MISSING",
    "zzzzzzz_activate_meridian_fortune_during_war_v1",
    "when (new.story_status = 'active')",
    "do $backfill$",
    "grant execute on function public.initialize_meridian_fortune_during_war_v1(uuid)",
    "to service_role",
  ]) assertIncludes(sql, required);
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
function assertNotIncludes(value: string, unexpected: string): void {
  if (value.includes(unexpected)) throw new Error(`Unexpected contract: ${unexpected}`);
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
