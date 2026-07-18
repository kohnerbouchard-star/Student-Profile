declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../supabase/migrations/20260718173000_add_shared_request_rate_limits_v1.sql",
  import.meta.url,
);

Deno.test("rate-limit migration is transactional, privacy-safe, atomic, and service-role only", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();
  assert(sql.startsWith("begin;"));
  assert(sql.trimEnd().endsWith("commit;"));
  assertIncludes(sql, "force row level security");
  assertIncludes(
    sql,
    "revoke all on table public.request_rate_limit_buckets\n  from public, anon, authenticated, service_role",
  );
  assertIncludes(sql, "security definer");
  assertIncludes(sql, "set search_path = pg_catalog, public");
  assertIncludes(
    sql,
    "on conflict (dimension, key_hash, window_started_at, window_seconds)",
  );
  assertIncludes(sql, "do update set");
  assertIncludes(sql, "order by bucket ->> 'dimension'");
  assertIncludes(sql, "pg_advisory_xact_lock");
  assertIncludes(sql, "select max(blocked_until)");
  assertIncludes(sql, "jsonb_array_length(p_buckets) <> 4");
  assertIncludes(sql, "jsonb_object_length(v_bucket) <> 5");
  assertIncludes(
    sql,
    "grant execute on function public.consume_request_rate_limits_v1(jsonb)\n  to service_role",
  );
  assertIncludes(
    sql,
    "revoke all on function public.consume_request_rate_limits_v1(jsonb)\n  from public, anon, authenticated",
  );
  assert(!sql.includes("inet "));
  assert(!sql.includes("player_id uuid"));
  assert(!sql.includes("game_session_id uuid"));
  assert(!sql.includes("session_token"));
});

function assertIncludes(actual: string, expected: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`Expected migration to include: ${expected}`);
  }
}

function assert(condition: boolean): void {
  if (!condition) throw new Error("Assertion failed.");
}
