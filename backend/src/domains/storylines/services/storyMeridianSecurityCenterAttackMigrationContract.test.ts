export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260812111000_seed_meridian_security_center_attack_v1.sql",
  import.meta.url,
);

Deno.test("Stage 5 attack executes bounded real-world disruption without declaring war", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

  for (const required of [
    "meridian_security_center_attack",
    "259200",
    "'stage', 5",
    "loc_syndalis_meridian_security_center_v1",
    "rte_meridian_syndalis_lumenor_v1",
    "rte_meridian_dravenlok_syndalis_v1",
    "rte_meridian_xalvoria_syndalis_v1",
    "world_location_state_change",
    "world_route_state_change",
    "'status', 'closed'",
    "'status', 'restricted'",
    "'reason', 'meridian_disruption'",
    "currency_volatility",
    "'SYN', 520",
    "'VAL', 0",
    "market_news_post",
    "meridian-security-center-attack-v1",
    "'category', 'geopolitical'",
    "'impactStrength', 'high'",
    "meridian_attack_occurred_v1",
    "meridian_attack_attribution_status_v1",
    "'value', 'unresolved'",
    "meridian_emergency_route_controls_v1",
    "meridian_payment_network_degraded_v1",
    "meridian_civilian_harm_confirmed_v1",
    "contract.meridian.attack-continuity-and-evidence.v1",
    "player_relationship_trust_score",
    "character.syndalis.aven-sorel.v1",
    "I am safe. Colleagues from the night shift are being treated",
  ]) {
    assertIncludes(sql, required);
  }

  assertNotIncludes(sql, "'reason', 'war'");
  assertNotIncludes(sql, "'category', 'war_conflict'");
  assertNotIncludes(sql, "confirmed attacker");
  assertNotIncludes(sql, "attackerCountry");
  assertNotIncludes(sql, "declared war");
  assertEquals(countOccurrences(sql, '\"countryCode\":'), 10);
});

Deno.test("Stage 5 attack is bootstrap-safe and attaches to activated full games", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

  for (const required of [
    "create or replace function public.initialize_meridian_security_center_attack_v1",
    "MERIDIAN_SECURITY_CENTER_ATTACK_GAME_NOT_FOUND",
    "MERIDIAN_SECURITY_CENTER_ATTACK_CANONICAL_STORYLINE_MISSING",
    "create or replace function public.activate_meridian_security_center_attack_from_full_game_v1",
    "zzzz_activate_meridian_security_center_attack_from_full_game_v1",
    "when (new.story_status = 'active')",
    "do $backfill$",
    "where activation.story_status = 'active'",
    "grant execute on function public.initialize_meridian_security_center_attack_v1(uuid)",
    "to service_role",
  ]) {
    assertIncludes(sql, required);
  }

  assertNotIncludes(sql, "do $migration$");
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

Deno.test("Stage 5 public narrative separates confirmed attack facts from unresolved attribution", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();

  assertIncludes(sql, "coordinated physical and digital attack");
  assertIncludes(sql, "injuries");
  assertIncludes(sql, "infrastructure damage");
  assertIncludes(sql, "cargo");
  assertIncludes(sql, "payment");
  assertIncludes(sql, "communications");
  assertIncludes(sql, "attribution remains unresolved");
  assertIncludes(sql, "have not confirmed an attacker");
  assertIncludes(sql, "avoid_spectacle");
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
