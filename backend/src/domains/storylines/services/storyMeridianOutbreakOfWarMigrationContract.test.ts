export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260816090200_seed_meridian_outbreak_of_war_v1.sql",
  import.meta.url,
);

Deno.test("Stage 7 opens war without inventing an attacker or player authority", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

  for (const required of [
    "meridian_outbreak_of_war",
    "432000",
    "'stage', 7",
    "meridian-outbreak-of-war-v1",
    "'category', 'war_conflict'",
    "'sentiment', 'negative'",
    "'impactStrength', 'high'",
    "world_location_state_change",
    "loc_syndalis_meridian_security_center_v1",
    "loc_syndalis_blacklight_v1",
    "loc_lumenor_starfall_v1",
    "loc_dravenlok_ironhold_v1",
    "loc_yrethia_sableport_v1",
    "loc_eldoran_crescent_bay_v1",
    "'availability', 'conflict'",
    "'availability', 'shortage'",
    "world_route_state_change",
    "rte_meridian_syndalis_lumenor_v1",
    "rte_meridian_dravenlok_syndalis_v1",
    "rte_meridian_xalvoria_syndalis_v1",
    "rte_meridian_lumenor_xalvoria_v1",
    "rte_meridian_xalvoria_dravenlok_v1",
    "'status', 'closed'",
    "'status', 'restricted'",
    "'reason', 'war'",
    "currency_volatility",
    "'SYN', 980",
    "'VAL', 0",
    "meridian_war_outbreak_active_v1",
    "meridian_open_conflict_status_v1",
    "meridian_mobilization_status_v1",
    "meridian_attack_attribution_status_v1",
    "'value', 'unresolved'",
    "meridian_route_resilience_status_v1",
    "'value', 'severely_degraded'",
    "meridian_civilian_protection_priority_v1",
    "meridian_information_integrity_priority_v1",
    "contract.meridian.war-civilian-continuity-assessment.v1",
    "contract.meridian.conflict-evidence-and-correction.v1",
    "playerAuthority', 'recommendation_only",
    "player_relationship_trust_score",
    "character.syndalis.aven-sorel.v1",
    "does not decide whether the war exists",
    "does not receive authority over national systems",
  ]) {
    assertIncludes(sql, required);
  }

  assertNotIncludes(sql, "attackerCountry");
  assertNotIncludes(sql, "confirmed attacker");
  assertNotIncludes(sql, "player_decides_war");
  assertNotIncludes(sql, "immigration_lock");
  assertNotIncludes(sql, "cash_debit");
  assertNotIncludes(sql, "storyFlagsToSet");
  assertNotIncludes(sql, "delete from public.story");
  assertEquals(countOccurrences(sql, '\"countryCode\":'), 10);
  assertEquals(countOccurrences(sql, "'reason', 'war'"), 2);
});

Deno.test("Stage 7 is bootstrap-safe and activates after Stage 6", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

  for (const required of [
    "create or replace function public.initialize_meridian_outbreak_of_war_v1",
    "MERIDIAN_OUTBREAK_OF_WAR_GAME_NOT_FOUND",
    "MERIDIAN_OUTBREAK_OF_WAR_CANONICAL_STORYLINE_MISSING",
    "create or replace function public.activate_meridian_outbreak_of_war_from_full_game_v1",
    "zzzzzz_activate_meridian_outbreak_of_war_from_full_game_v1",
    "when (new.story_status = 'active')",
    "do $backfill$",
    "where activation.story_status = 'active'",
    "grant execute on function public.initialize_meridian_outbreak_of_war_v1(uuid)",
    "to service_role",
  ]) {
    assertIncludes(sql, required);
  }

  assertNotIncludes(sql, "do $migration$");
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

Deno.test("Stage 7 remains civilian-facing, bounded, and correction-safe", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();

  assertIncludes(sql, "routes remain restricted rather than universally closed");
  assertIncludes(sql, "civilian travel, essential supply, settlement, and communications");
  assertIncludes(sql, "fair allocation rule");
  assertIncludes(sql, "one group at risk of exclusion");
  assertIncludes(sql, "one condition for ending the emergency measure");
  assertIncludes(sql, "confirmed facts, contested claims, and unresolved questions");
  assertIncludes(sql, "one claim that requires correction or stronger evidence");
  assertIncludes(sql, "attribution for the original attack remains unresolved");
  assertIncludes(sql, "does not receive national authority");
  assertIncludes(sql, "does not receive a fabricated attribution");
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
