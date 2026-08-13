export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const MIGRATION = "supabase/migrations/20260812120000_add_story_event_execution_lease_v1.sql";

Deno.test("Story execution lease migration finalizes only after a leased execution", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

  for (const expected of [
    "story_event_execution_claims_scope_unique",
    "status in ('executing', 'retryable_failed', 'completed')",
    "claim_story_event_execution_v1",
    "fail_story_event_execution_v1",
    "finalize_story_event_execution_v1",
    "pg_advisory_xact_lock",
    "'absent'::text",
    "'busy'::text",
    "'retryable_failed'::text",
    "'already_resolved'::text",
    "insert into public.story_event_resolutions",
    "v_claim.effective_at",
    "v_claim.effective_market_tick",
    "force row level security",
  ]) {
    assertIncludes(sql, expected);
  }

  const claimStart = sql.indexOf("create or replace function public.claim_story_event_execution_v1");
  const finalizeStart = sql.indexOf("create or replace function public.finalize_story_event_execution_v1");
  if (claimStart < 0 || finalizeStart < 0 || finalizeStart <= claimStart) {
    throw new Error("Story execution claim/finalize function order is invalid.");
  }

  const claimSql = sql.slice(claimStart, finalizeStart);
  if (claimSql.includes("insert into public.story_event_resolutions")) {
    throw new Error("Story claim must not create the canonical final resolution.");
  }
});

function assertIncludes(text: string, expected: string): void {
  if (!text.includes(expected)) {
    throw new Error(`Expected lease migration to include: ${expected}`);
  }
}
