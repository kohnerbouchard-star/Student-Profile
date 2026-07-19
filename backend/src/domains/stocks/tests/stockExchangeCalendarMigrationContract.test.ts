declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string): Promise<string>;
};

const MIGRATION =
  "supabase/migrations/20260719120000_add_stock_exchange_calendar_runtime_v1.sql";

Deno.test("exchange calendar migration gates new market orders at the database boundary", async () => {
  const source = await Deno.readTextFile(MIGRATION);
  assertIncludes(source, "create or replace function public.is_stock_market_open_at");
  assertIncludes(source, "at time zone 'Asia/Seoul'");
  assertIncludes(source, "time '08:00'");
  assertIncludes(source, "time '17:00'");
  assertIncludes(source, "create or replace function public.execute_stock_market_order_calendar_gated");
  assertIncludes(source, "STOCK_TRADING_MARKET_CLOSED");
  assertIncludes(source, "from public.stock_orders existing_order");
  assertIncludes(source, "existing_order.idempotency_key = btrim(coalesce(p_idempotency_key, ''))");
  assertIncludes(source, "if not exists (");
  assertIncludes(source, ") and not public.is_stock_market_open_at(now()) then");
  assertIncludes(source, "grant execute on function public.execute_stock_market_order_calendar_gated");
});

function assertIncludes(source: string, expected: string): void {
  if (!source.includes(expected)) {
    throw new Error(`Expected migration to include: ${expected}`);
  }
}
