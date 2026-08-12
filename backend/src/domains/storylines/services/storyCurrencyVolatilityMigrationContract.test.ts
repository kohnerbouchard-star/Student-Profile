export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260812110000_add_story_currency_volatility_runtime_v1.sql",
  import.meta.url,
);

Deno.test("Story FX volatility is bounded, coherent, idempotent, and service-only", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

  for (const contract of [
    "apply_story_currency_volatility_v1",
    "STORY_CURRENCY_VOLATILITY_REQUEST_INVALID",
    "STORY_CURRENCY_VOLATILITY_ADJUSTMENT_INVALID",
    "STORY_CURRENCY_VOLATILITY_VAL_NUMERAIRE_REQUIRED",
    "STORY_CURRENCY_VOLATILITY_FX_MATRIX_INCOMPLETE",
    "story-fx:",
    "v_pair_count <> 90",
    "v_inserted <> 90",
    "-1500 and 1500",
    "grant execute on function public.apply_story_currency_volatility_v1",
    "to service_role",
  ]) {
    assertIncludes(sql, contract);
  }

  assertNotIncludes(sql, "grant execute on function public.apply_story_currency_volatility_v1(uuid, text, jsonb, timestamptz)\n  to authenticated");
  assertNotIncludes(sql, "grant execute on function public.apply_story_currency_volatility_v1(uuid, text, jsonb, timestamptz)\n  to anon");
  assertEquals(firstNonblank(sql), "begin;");
  assertEquals(lastNonblank(sql), "commit;");
});

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
