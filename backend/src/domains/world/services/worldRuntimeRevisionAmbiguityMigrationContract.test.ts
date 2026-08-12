export {};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260812114500_fix_world_runtime_revision_ambiguity_v1.sql",
  import.meta.url,
);

Deno.test("World route and location mutations qualify the runtime revision column", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

  assertEquals(
    countOccurrences(
      sql,
      "update public.world_runtime_instances as runtime_row\n  set revision = runtime_row.revision + 1",
    ),
    2,
  );
  assertEquals(
    countOccurrences(
      sql,
      "where runtime_row.game_session_id = p_game_session_id\n  returning runtime_row.* into v_runtime;",
    ),
    2,
  );
  assertNotIncludes(
    sql,
    "update public.world_runtime_instances\n  set revision = revision + 1",
  );

  for (const required of [
    "create or replace function public.apply_world_route_state_v1",
    "create or replace function public.apply_world_location_state_v1",
    "WORLD_RUNTIME_REVISION_CONFLICT",
    "WORLD_ROUTE_COMMAND_UNKNOWN_ROUTE",
    "WORLD_LOCATION_COMMAND_UNKNOWN_LOCATION",
    "grant execute on function public.apply_world_route_state_v1",
    "grant execute on function public.apply_world_location_state_v1",
  ]) {
    assertIncludes(sql, required);
  }
});

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
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
