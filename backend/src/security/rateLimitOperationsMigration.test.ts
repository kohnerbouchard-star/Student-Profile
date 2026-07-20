declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../supabase/migrations/20260720150000_harden_request_rate_limit_operations_v2.sql",
  import.meta.url,
);

Deno.test("rate-limit operations migration is bounded, privacy-safe, and service-role only", async () => {
  const sql = (await Deno.readTextFile(MIGRATION)).toLowerCase();

  assert(sql.startsWith("begin;"));
  assert(sql.trimEnd().endsWith("commit;"));
  assertIncludes(sql, "create or replace function public.prune_request_rate_limit_buckets_v1");
  assertIncludes(sql, "p_batch_limit not between 1 and 10000");
  assertIncludes(sql, "limit p_batch_limit");
  assertIncludes(sql, "for update skip locked");
  assertIncludes(sql, "where buckets.expires_at <= v_now");
  assertIncludes(
    sql,
    "grant execute on function public.prune_request_rate_limit_buckets_v1(integer)\n  to service_role",
  );
  assertIncludes(
    sql,
    "revoke all on function public.prune_request_rate_limit_buckets_v1(integer)\n  from public, anon, authenticated",
  );

  assertIncludes(sql, "create or replace function public.read_request_rate_limit_telemetry_v1");
  assertIncludes(sql, "p_since_seconds not between 60 and 86400");
  assertIncludes(sql, "p_row_limit not between 1 and 100");
  assertIncludes(sql, "limit p_row_limit");
  assertIncludes(sql, "count(*) filter");
  assertIncludes(
    sql,
    "grant execute on function public.read_request_rate_limit_telemetry_v1(integer, integer)\n  to service_role",
  );
  assertIncludes(
    sql,
    "revoke all on function public.read_request_rate_limit_telemetry_v1(integer, integer)\n  from public, anon, authenticated",
  );

  const telemetrySignature = sql.slice(
    sql.indexOf("create or replace function public.read_request_rate_limit_telemetry_v1"),
  );
  const telemetryReturns = telemetrySignature.slice(
    telemetrySignature.indexOf("returns table"),
    telemetrySignature.indexOf("language plpgsql"),
  );
  assert(!telemetryReturns.includes("key_hash"));
  assert(!telemetryReturns.includes("player"));
  assert(!telemetryReturns.includes("game_session"));
  assert(!telemetryReturns.includes("token"));
  assert(!telemetryReturns.includes("ip_address"));

  assertIncludes(sql, "security definer");
  assertIncludes(sql, "set search_path = pg_catalog, public");
  assert(!sql.includes("session_token"));
  assert(!sql.includes("access_code"));
  assert(!sql.includes("credential"));
}
);

function assertIncludes(actual: string, expected: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`Expected migration to include: ${expected}`);
  }
}

function assert(condition: boolean): void {
  if (!condition) throw new Error("Assertion failed.");
}
