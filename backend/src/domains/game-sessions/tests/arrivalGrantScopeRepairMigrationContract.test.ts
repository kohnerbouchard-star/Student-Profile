declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260725100000_repair_arrival_grant_scope_ambiguity_v3.sql",
  import.meta.url,
);

Deno.test("Arrival grant repair qualifies every predicate that can collide with RETURNS TABLE variables", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

  assertIncludes(sql, "create or replace function public.apply_arrival_grant_command_v1");
  assertIncludes(sql, "update public.arrival_grant_commands as command_row");
  assertIncludes(sql, "where command_row.id = v_command.id");
  assertIncludes(sql, "update public.player_progression_profiles as profile_row");
  assertIncludes(sql, "where profile_row.game_session_id = p_game_session_id");
  assertIncludes(sql, "and profile_row.player_id = v_command.player_id");
  assertIncludes(sql, "from public, anon, authenticated");
  assertIncludes(sql, "to service_role");

  assertNotIncludes(
    sql,
    "where game_session_id = p_game_session_id\n    and player_id = v_command.player_id",
  );
  assertNotIncludes(sql, "where id = v_command.id\n    and status in");
});

function assertIncludes(text: string, expected: string): void {
  if (!text.includes(expected)) {
    throw new Error(`Expected Arrival repair migration to include ${expected}`);
  }
}

function assertNotIncludes(text: string, forbidden: string): void {
  if (text.includes(forbidden)) {
    throw new Error(`Arrival repair migration must not include ${forbidden}`);
  }
}
