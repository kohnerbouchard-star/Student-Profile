declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: string | URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260903150000_enforce_provisioned_stock_baseline_ticks_v1.sql",
  import.meta.url,
);

Deno.test("ready game provisioning creates authoritative baseline Stock ticks and fails closed", async () => {
  const sql = await Deno.readTextFile(MIGRATION);

  assertIncludes(sql, "create or replace function private.ensure_provisioned_stock_baseline_ticks_v1()");
  assertIncludes(sql, "new.provisioning_status <> 'ready'");
  assertIncludes(sql, "old.provisioning_status is not distinct from 'ready'");
  assertIncludes(sql, "insert into public.stock_price_ticks");
  assertIncludes(sql, "asset_row.id");
  assertIncludes(sql, "existing_tick.tick_index = 0");
  assertIncludes(sql, "'kind', 'stock_market_initialization'");
  assertIncludes(sql, "'tickIndex', 0");
  assertIncludes(sql, "GAME_PROVISIONING_STOCK_TICKS_INCOMPLETE");
  assertIncludes(sql, "before insert or update of provisioning_status");
  assertIncludes(sql, "on public.game_sessions");
  assertIncludes(sql, "for each row");
  assertIncludes(sql, "from public, anon, authenticated, service_role");

  assertNotIncludes(sql, "grant execute");
  assertNotIncludes(sql, "update public.game_sessions set provisioning_status = 'ready'");
});

function assertIncludes(text: string, expected: string): void {
  if (!text.includes(expected)) throw new Error(`Expected migration to include ${expected}`);
}

function assertNotIncludes(text: string, forbidden: string): void {
  if (text.includes(forbidden)) throw new Error(`Migration must not include ${forbidden}`);
}
