declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const MIGRATION = "supabase/migrations/20260812115000_add_story_effect_replay_safety_v1.sql";

Deno.test("Story replay-safety migration preserves deterministic and local-currency invariants", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

  assertIncludes(sql, "player_story_impacts_idempotency_unique");
  assertIncludes(sql, "story_cash_adjustments_idempotency_unique");
  assertIncludes(sql, "apply_story_cash_adjustment_v1");
  assertIncludes(sql, "pg_advisory_xact_lock");
  assertIncludes(sql, "player_country_assignments");
  assertIncludes(sql, "country.currency_code");
  assertIncludes(sql, "'checking'");
  assertIncludes(sql, "'replayed'::text");
  assertIncludes(sql, "STORY_CASH_IDEMPOTENCY_CONFLICT");
  assertIncludes(sql, "grant execute on function public.apply_story_cash_adjustment_v1");

  if (/\bECO\b/u.test(sql)) {
    throw new Error("Story cash replay safety must not hard-code the retired global ECO currency.");
  }
});

function assertIncludes(text: string, expected: string): void {
  if (!text.includes(expected)) {
    throw new Error(`Expected migration to include: ${expected}`);
  }
}
