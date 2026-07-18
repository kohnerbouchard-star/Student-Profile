declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../supabase/migrations/20260718190000_add_pre_auth_rate_limit_rpc_v1.sql",
  import.meta.url,
);

Deno.test("pre-auth migration is atomic, two-dimensional, and service-role only", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  assert(sql.startsWith("begin;"));
  assert(sql.trimEnd().endsWith("commit;"));
  assertIncludes(sql, "consume_pre_auth_request_rate_limits_v1");
  assertIncludes(sql, "jsonb_array_length(p_buckets) <> 2");
  assertIncludes(sql, "array['action', 'ip']::text[]");
  assertIncludes(sql, "order by bucket ->> 'dimension'");
  assertIncludes(sql, "pg_advisory_xact_lock");
  assertIncludes(
    sql,
    "on conflict (dimension, key_hash, window_started_at, window_seconds)",
  );
  assertIncludes(sql, "security definer");
  assertIncludes(sql, "set search_path = pg_catalog, public");
  assertIncludes(
    sql,
    "grant execute on function public.consume_pre_auth_request_rate_limits_v1(jsonb)\n  to service_role",
  );
  assertIncludes(
    sql,
    "revoke all on function public.consume_pre_auth_request_rate_limits_v1(jsonb)\n  from public, anon, authenticated",
  );
  for (
    const forbidden of [
      "player_id uuid",
      "game_session_id uuid",
      "session_token",
      "access_code",
      "player_identifier",
      "game_join_code",
    ]
  ) {
    assert(!sql.includes(forbidden));
  }
});

function assertIncludes(actual: string, expected: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`Expected migration to include: ${expected}`);
  }
}

function assert(condition: boolean): void {
  if (!condition) throw new Error("Assertion failed.");
}
