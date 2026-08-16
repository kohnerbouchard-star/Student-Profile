export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260816090500_seed_meridian_reckoning_v1.sql",
  import.meta.url,
);

Deno.test("Stage 10 records a mechanically valid recovery world ending", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  for (const required of [
    "meridian_reckoning",
    "691200",
    "'stage',10",
    "'worldEndingFamily','unstable_ceasefire'",
    "'reason', 'recovery'",
    "'status', 'restricted'",
    "'status', 'open'",
    "'availability', 'normal'",
    "'availability', 'shortage'",
    "'availability', 'closed'",
    "meridian_world_resolution_v1",
    "meridian_reconstruction_phase_v1",
    "meridian_reckoning_complete_v1",
    "meridian_attack_attribution_status_v1",
    "'value', 'unresolved'",
  ]) assertIncludes(sql, required);

  for (const route of [
    "rte_meridian_syndalis_lumenor_v1",
    "rte_meridian_dravenlok_syndalis_v1",
    "rte_meridian_xalvoria_syndalis_v1",
    "rte_meridian_lumenor_xalvoria_v1",
    "rte_meridian_xalvoria_dravenlok_v1",
  ]) assertIncludes(sql, route);
  assertEquals(countOccurrences(sql, '"countryCode":'), 10);
});

Deno.test("Stage 10 personal endings are auditable, exclusive, and not a morality meter", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  for (const ending of [
    "the_reformer",
    "the_community_leader",
    "the_builder",
    "the_broker",
    "the_magnate",
    "the_citizen",
    "the_survivor",
  ]) assertIncludes(sql, ending);

  for (const branch of [
    "_reckoning_reformer",
    "_reckoning_community_leader",
    "_reckoning_builder",
    "_reckoning_broker",
    "_reckoning_magnate",
    "_reckoning_citizen",
    "_reckoning_survivor",
  ]) assertIncludes(sql, branch);

  assertIncludes(sql, "classificationIsNotMoralScore");
  assertIncludes(sql, "worldAndPersonalOutcomesSeparate");
  assertIncludes(sql, "player_completed_contract");
  assertIncludes(sql, "player_relationship_trust_score");
  assertIncludes(sql, "'type', 'player_cash_above', 'amount', 8000");
  assertIncludes(sql, "7,607");
  assertIncludes(sql, "jsonb_build_object('not',v_reformer_core)");
  assertIncludes(sql, "v_reformer_core,v_community_core,v_builder_core,v_broker_core,v_magnate_core,v_citizen_core");
});

Deno.test("Stage 10 does not fabricate legal status, attacker attribution, or moral victory", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assertNotIncludes(sql, "'type', 'immigration_lock'");
  assertNotIncludes(sql, "cash_debit");
  assertNotIncludes(sql, "confirmed attacker");
  assertNotIncludes(sql, "attackerCountry");
  assertNotIncludes(sql, "personalEndingFamily','the_exile'");
  assertNotIncludes(sql, "personalEndingFamily','the_collaborator'");
  assertNotIncludes(sql, "personalEndingFamily','the_stateless_financier'");
  assertIncludes(sql, "narrativeIdentityNotLegalStatus");
  assertIncludes(sql, "doesNotMutateResidencyStatus");
  assertIncludes(sql, "'victoryClaim','none'");
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

function countOccurrences(value: string, needle: string): number { return value.split(needle).length - 1; }
function firstNonblank(value: string): string { return value.split(/\r?\n/).map((line) => line.trim().toLowerCase()).find(Boolean) ?? ""; }
function lastNonblank(value: string): string { return value.split(/\r?\n/).map((line) => line.trim().toLowerCase()).filter(Boolean).at(-1) ?? ""; }
function assertIncludes(value: string, expected: string): void { if (!value.includes(expected)) throw new Error(`Missing contract: ${expected}`); }
function assertNotIncludes(value: string, unexpected: string): void { if (value.includes(unexpected)) throw new Error(`Unexpected contract: ${unexpected}`); }
function assertEquals(actual: unknown, expected: unknown): void { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`); }
