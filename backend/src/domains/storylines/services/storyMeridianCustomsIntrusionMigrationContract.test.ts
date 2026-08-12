export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260812103000_seed_meridian_customs_security_intrusion_v1.sql",
  import.meta.url,
);

Deno.test("Meridian customs intrusion stays distinct from attack and executes bounded crisis effects", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

  for (const contract of [
    "econovaria_demo_act_1",
    "meridian_customs_security_intrusion",
    "172800",
    "'stage', 4",
    "systems_failure_under_uncertainty",
    "market_news_post",
    "meridian-customs-security-intrusion-v1",
    "'category', 'supply_chain'",
    "'scope', 'global'",
    "'sentiment', 'negative'",
    "'impactStrength', 'medium'",
    "'durationTicks', 6",
    "meridian_customs_intrusion_detected_v1",
    "meridian_attribution_status_v1",
    "'value', 'unresolved'",
    "contract.meridian.respond-first-disruption.v1",
    "Meridian Disruption Response",
    "player_relationship_trust_score",
    "'operator', 'at_least'",
    "'score', 20",
    "'not', jsonb_build_object",
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

  assertEquals(countOccurrences(sql, '\"countryCode\":'), 10);
  assertEquals(countOccurrences(sql, "_customs_intrusion_trusted'"), 1);
  assertEquals(countOccurrences(sql, "_customs_intrusion_general'"), 1);
  assertNotIncludes(sql, "market_status_change");
  assertNotIncludes(sql, "immigration_lock");
  assertNotIncludes(sql, "war_conflict");
  assertNotIncludes(sql, "attackerCountry");
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

Deno.test("Meridian customs intrusion installs bootstrap-safe initializer and activation wiring", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

  for (const contract of [
    "create or replace function public.initialize_meridian_customs_security_intrusion_v1",
    "p_game_session_id uuid",
    "MERIDIAN_CUSTOMS_INTRUSION_GAME_NOT_FOUND",
    "MERIDIAN_CUSTOMS_INTRUSION_CANONICAL_STORYLINE_MISSING",
    "create or replace function public.activate_meridian_customs_security_intrusion_from_full_game_v1",
    "zzz_activate_meridian_customs_security_intrusion_from_full_game_v1",
    "when (new.story_status = 'active')",
    "do $backfill$",
    "select distinct activation.game_session_id",
    "where activation.story_status = 'active'",
    "grant execute on function public.initialize_meridian_customs_security_intrusion_v1(uuid)",
    "to service_role",
  ]) {
    assertIncludes(sql, contract);
  }

  assertNotIncludes(sql, "do $migration$");
  assertEquals(
    countOccurrences(sql, "MERIDIAN_CUSTOMS_INTRUSION_CANONICAL_STORYLINE_MISSING"),
    1,
  );
});

Deno.test("Meridian customs intrusion authors uncertainty rather than confirmed attribution", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();

  assertIncludes(sql, "attribution remains unresolved");
  assertIncludes(sql, "cause remains unconfirmed");
  assertIncludes(sql, "have not established attribution");
  assertIncludes(sql, "do not assign blame without evidence");
  assertNotIncludes(sql, "confirmed attacker");
  assertNotIncludes(sql, "declared war");
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