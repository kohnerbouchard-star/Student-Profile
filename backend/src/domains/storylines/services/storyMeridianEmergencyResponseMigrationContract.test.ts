export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260812114000_seed_meridian_emergency_response_v1.sql",
  import.meta.url,
);

Deno.test("Stage 6 restores bounded continuity without declaring war", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

  for (const required of [
    "meridian_emergency_response",
    "345600",
    "'stage', 6",
    "market_news_post",
    "meridian-emergency-response-v1",
    "'category', 'infrastructure'",
    "'sentiment', 'mixed'",
    "'impactStrength', 'medium'",
    "world_location_state_change",
    "loc_syndalis_meridian_security_center_v1",
    "'availability', 'shortage'",
    "world_route_state_change",
    "rte_meridian_syndalis_lumenor_v1",
    "rte_meridian_dravenlok_syndalis_v1",
    "rte_meridian_xalvoria_syndalis_v1",
    "rte_meridian_lumenor_xalvoria_v1",
    "rte_meridian_xalvoria_dravenlok_v1",
    "'status', 'restricted'",
    "'reason', 'recovery'",
    "currency_volatility",
    "'SYN', -180",
    "'VAL', 0",
    "meridian_emergency_response_active_v1",
    "meridian_shared_security_access_v1",
    "temporary_audited",
    "meridian_manual_verification_active_v1",
    "meridian_emergency_rerouting_active_v1",
    "meridian_civilian_assistance_priority_v1",
    "meridian_attack_attribution_status_v1",
    "'value', 'unresolved'",
    "meridian_open_conflict_status_v1",
    "'value', 'not_declared'",
    "contract.meridian.emergency-response-review.v1",
    "contract.meridian.civilian-continuity-aid.v1",
    "playerAuthority', 'recommendation_only",
    "player_relationship_trust_score",
    "character.syndalis.aven-sorel.v1",
    "We still do not have confirmed attribution",
  ]) {
    assertIncludes(sql, required);
  }

  assertNotIncludes(sql, "'reason', 'war'");
  assertNotIncludes(sql, "'category', 'war_conflict'");
  assertNotIncludes(sql, "confirmed attacker");
  assertNotIncludes(sql, "attackerCountry");
  assertNotIncludes(sql, "declared war");
  assertNotIncludes(sql, "'status', 'closed'");
  assertEquals(countOccurrences(sql, '\"countryCode\":'), 10);
});

Deno.test("Stage 6 is bootstrap-safe and activates after the attack initializer", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

  for (const required of [
    "create or replace function public.initialize_meridian_emergency_response_v1",
    "MERIDIAN_EMERGENCY_RESPONSE_GAME_NOT_FOUND",
    "MERIDIAN_EMERGENCY_RESPONSE_CANONICAL_STORYLINE_MISSING",
    "create or replace function public.activate_meridian_emergency_response_from_full_game_v1",
    "zzzzz_activate_meridian_emergency_response_from_full_game_v1",
    "when (new.story_status = 'active')",
    "do $backfill$",
    "where activation.story_status = 'active'",
    "grant execute on function public.initialize_meridian_emergency_response_v1(uuid)",
    "to service_role",
  ]) {
    assertIncludes(sql, required);
  }

  assertNotIncludes(sql, "do $migration$");
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

Deno.test("Stage 6 keeps emergency powers temporary, audited, and civilian-facing", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();

  assertIncludes(sql, "time-limited shared access with audit logs");
  assertIncludes(sql, "temporary emergency response");
  assertIncludes(sql, "civilian or small-business continuity problem");
  assertIncludes(sql, "who bears the cost");
  assertIncludes(sql, "recommendation_only");
  assertIncludes(sql, "attribution remains unresolved");
  assertIncludes(sql, "war is not yet declared");
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
