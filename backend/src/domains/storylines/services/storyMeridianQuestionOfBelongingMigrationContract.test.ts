export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260816090400_seed_meridian_question_of_belonging_v1.sql",
  import.meta.url,
);

Deno.test("Stage 9 returns wartime economic choices as belonging pressure", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  for (const required of [
    "meridian_question_of_belonging",
    "604800",
    "'stage', 9",
    "'category', 'policy'",
    "'sentiment', 'mixed'",
    "meridian_belonging_review_window_v1",
    "meridian_foreign_contact_scrutiny_v1",
    "player_completed_contract",
    "wartime_choice_returned",
    "doesNotMutateResidencyStatus",
    "doesNotRequirePoliticalEndorsement",
    "self_report_and_personal_decision",
  ]) assertIncludes(sql, required);

  for (const key of [
    "contract.meridian.wartime-emergency-logistics-allocation.v1",
    "contract.meridian.wartime-strategic-manufacturing-capacity.v1",
    "contract.meridian.wartime-cyber-continuity-procurement.v1",
    "contract.meridian.wartime-essential-supply-distribution.v1",
    "contract.meridian.wartime-distressed-asset-memo.v1",
    "contract.meridian.wartime-reconstruction-finance-terms.v1",
  ]) assertIncludes(sql, key);

  assertEquals(countOccurrences(sql, "'type', 'contract_unlock'"), 3);
  assertEquals(countOccurrences(sql, '"countryCode":'), 10);
});

Deno.test("Stage 9 does not invent a universal residency lock or political loyalty mechanic", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assertNotIncludes(sql, "'type', 'immigration_lock'");
  assertNotIncludes(sql, "world_route_state_change");
  assertNotIncludes(sql, "world_location_state_change");
  assertNotIncludes(sql, "cash_debit");
  assertNotIncludes(sql, "confirmed attacker");
  assertIncludes(sql, "does not apply an");
  assertIncludes(sql, "immigration_lock or fabricate a legal-status mutation");
  assertIncludes(sql, "standardsVaryByCountry");
});

Deno.test("Stage 9 keeps optional wartime choices reachable through an exhaustive fallback", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assertIncludes(sql, "v_wartime_choice_condition");
  assertIncludes(sql, "jsonb_build_object('not', v_wartime_choice_condition)");
  assertIncludes(sql, "'_belonging_wartime_choice'");
  assertIncludes(sql, "'_belonging_general'");
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

function countOccurrences(value: string, needle: string): number { return value.split(needle).length - 1; }
function firstNonblank(value: string): string { return value.split(/\r?\n/).map((line) => line.trim().toLowerCase()).find(Boolean) ?? ""; }
function lastNonblank(value: string): string { return value.split(/\r?\n/).map((line) => line.trim().toLowerCase()).filter(Boolean).at(-1) ?? ""; }
function assertIncludes(value: string, expected: string): void { if (!value.includes(expected)) throw new Error(`Missing contract: ${expected}`); }
function assertNotIncludes(value: string, unexpected: string): void { if (value.includes(unexpected)) throw new Error(`Unexpected contract: ${unexpected}`); }
function assertEquals(actual: unknown, expected: unknown): void { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`); }
