declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260723213038_restore_player_country_assignment_compatibility_v1.sql",
  import.meta.url,
);

Deno.test("player country compatibility remains assignment-backed and forward-only", async () => {
  const sql = await Deno.readTextFile(MIGRATION);
  assertIncludes(sql, "begin;");
  assertIncludes(sql, "commit;");
  assertIncludes(sql, "add column if not exists country_id uuid references public.country_profiles");
  assertIncludes(sql, "Compatibility mirror of the authoritative active player_country_assignments.country_profile_id");
  assertIncludes(sql, "where assignment.status = 'active'");
  assertIncludes(sql, "and assignment.ended_at is null");
  assertIncludes(sql, "sync_player_country_assignment_compatibility_v1");
  assertIncludes(sql, "after insert or delete or update of country_profile_id, status, assigned_at, ended_at");
  assertIncludes(sql, "assert_player_country_assignment_compatibility_v1");
  assertIncludes(sql, "mismatch_count integer");
  assertIncludes(sql, "security definer");
  assertIncludes(sql, "set search_path = public, pg_temp");
  assertIncludes(sql, "from public, anon, authenticated");
  assertIncludes(sql, "to service_role");
  assertNotIncludes(sql, "drop column");
  assertNotIncludes(sql, "delete from public.player_country_assignments");
  assertNotIncludes(sql, "update public.player_country_assignments");
  assertNotIncludes(sql, "insert into public.player_country_assignments");
});

function assertIncludes(text: string, expected: string): void {
  if (!text.includes(expected)) throw new Error(`Expected migration to include ${expected}`);
}

function assertNotIncludes(text: string, forbidden: string): void {
  if (text.includes(forbidden)) throw new Error(`Migration must not include ${forbidden}`);
}
