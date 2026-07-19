declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const BASE_MIGRATION =
  "supabase/migrations/20260719120000_add_stock_exchange_calendar_runtime_v1.sql";
const REQUIRED_TIMEZONE_MIGRATION =
  "supabase/migrations/20260719133000_require_stock_market_timezone_v1.sql";

Deno.test("one required game timezone gates all exchanges", async () => {
  const base = await Deno.readTextFile(BASE_MIGRATION);
  const required = await Deno.readTextFile(REQUIRED_TIMEZONE_MIGRATION);

  assertIncludes(
    base,
    "create or replace function public.execute_stock_market_order_calendar_gated",
  );
  assertIncludes(required, "to_jsonb('Asia/Seoul'::text)");
  assertIncludes(required, "validate_required_stock_market_timezone");
  assertIncludes(required, "STOCK_MARKET_TIMEZONE_REQUIRED");
  assertIncludes(required, "STOCK_MARKET_TIMEZONE_INVALID");
  assertIncludes(required, "STOCK_MARKET_EXISTING_TIMEZONE_INVALID");
  assertIncludes(required, "from pg_timezone_names");
  assertIncludes(required, "p_game_session_id uuid");
  assertIncludes(
    required,
    "public.is_stock_market_open_at(p_game_session_id, now())",
  );
  assertNotIncludes(required, "coalesce(v_timezone");
});

function assertIncludes(source: string, expected: string): void {
  if (!source.includes(expected)) {
    throw new Error(`Expected migration to include: ${expected}`);
  }
}

function assertNotIncludes(source: string, unexpected: string): void {
  if (source.includes(unexpected)) {
    throw new Error(`Expected migration to exclude: ${unexpected}`);
  }
}
