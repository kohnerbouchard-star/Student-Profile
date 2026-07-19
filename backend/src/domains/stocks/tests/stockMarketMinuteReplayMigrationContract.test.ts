declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const MIGRATION =
  "supabase/migrations/20260719143000_add_stock_market_minute_replay_v1.sql";

Deno.test("market minute migration preserves tick sequence and adds canonical minute identity", async () => {
  const source = await Deno.readTextFile(MIGRATION);

  assertIncludes(source, "add column if not exists exchange_code text null");
  assertIncludes(source, "add column if not exists market_minute timestamptz null");
  assertIncludes(source, "stock_price_ticks_market_minute_unique_idx");
  assertIncludes(source, "game_session_id,");
  assertIncludes(source, "stock_asset_id,");
  assertIncludes(source, "exchange_code,");
  assertIncludes(source, "market_minute");
  assertIncludes(source, "create or replace function public.apply_stock_market_runner_minute");
  assertIncludes(source, "public.is_stock_market_open_at(v_market_minute)");
  assertIncludes(source, "pg_advisory_xact_lock");
  assertIncludes(source, "STOCK_MARKET_MINUTE_ALREADY_EXISTS");
  assertIncludes(source, "from public.apply_stock_market_runner_tick(");
  assertIncludes(source, "STOCK_RUNNER_MARKET_MINUTE_TAG_COUNT_MISMATCH");
  assertIncludes(source, "to service_role;");
});

function assertIncludes(source: string, expected: string): void {
  if (!source.includes(expected)) {
    throw new Error(`Expected migration to include: ${expected}`);
  }
}
