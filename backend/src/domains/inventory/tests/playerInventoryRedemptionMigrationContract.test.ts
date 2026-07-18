declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
  readTextFile(path: URL): Promise<string>;
};

const MIGRATION = new URL(
  "../../../../supabase/migrations/20260718113000_add_inventory_redemption_player_workflow_v1.sql",
  import.meta.url,
);

Deno.test("Redemption migration is forward, transaction-wrapped, and game isolated", async () => {
  const migrationSql = await Deno.readTextFile(MIGRATION);
  const sql = migrationSql.toLowerCase();
  assert(sql.trimStart().startsWith("begin;"));
  assert(sql.trimEnd().endsWith("commit;"));
  for (
    const fragment of [
      "inventory_redemption_requests_player_scope_fk",
      "inventory_redemption_requests_holding_scope_fk",
      "inventory_redemption_requests_item_scope_fk",
      "foreign key (game_session_id, request_id)",
      "security definer",
      "set search_path = public, pg_temp",
    ]
  ) assertIncludes(sql, fragment);
  assert(!sql.includes("drop table"));
  assert(!sql.includes("drop column"));
});

Deno.test("Redemption request serializes before retry resolution and reserves once", async () => {
  const migrationSql = await Deno.readTextFile(MIGRATION);
  const sql = migrationSql.toLowerCase();
  const functionSql = between(
    sql,
    "create or replace function public.request_inventory_redemption_atomic_v1",
    "create or replace function public.read_player_inventory_redemptions_v1",
  );
  const playerLock = functionSql.indexOf("for update of player_row");
  const retryLookup = functionSql.indexOf(
    "and request_row.idempotency_key = v_idempotency_key",
  );
  const itemLookup = functionSql.indexOf("from public.store_items as item_row");
  assert(
    playerLock >= 0 && retryLookup > playerLock && itemLookup > retryLookup,
  );
  assertIncludes(
    sql,
    "unique (game_session_id, player_id, idempotency_key)",
  );
  for (
    const fragment of [
      "inventory_redemption_idempotency_conflict",
      "set quantity_reserved = holding_row.quantity_reserved + p_quantity",
      "'reserved'",
      "'redemption_requested'",
      "'inventory.redemption_requested'",
    ]
  ) assertIncludes(functionSql, fragment);
  assertEquals(
    count(functionSql, "insert into public.inventory_redemption_transitions"),
    1,
  );
  assertEquals(count(functionSql, "insert into public.inventory_events"), 1);
  assertEquals(count(functionSql, "insert into public.audit_log"), 1);
});

Deno.test("Redemption persistence is append-only and browser returns are UUID-private", async () => {
  const migrationSql = await Deno.readTextFile(MIGRATION);
  const sql = migrationSql.toLowerCase();
  for (
    const fragment of [
      "public_id text not null",
      "check (public_id ~ '^red_[0-9a-f]{32}$')",
      "request_id text",
      "item_id text",
      "grant select on table public.inventory_redemption_requests",
      "grant select on table public.inventory_redemption_transitions",
    ]
  ) assertIncludes(sql, fragment);
  assert(!sql.includes("grant update on table public.inventory_redemption"));
  assert(!sql.includes("grant delete on table public.inventory_redemption"));
  const readFunction = between(
    sql,
    "create or replace function public.read_player_inventory_redemptions_v1",
    "revoke all on function public.request_inventory_redemption_atomic_v1",
  );
  const readReturn = between(
    readFunction,
    "returns table (",
    ")\nlanguage plpgsql",
  );
  for (
    const internal of [
      "returns table (\n  id uuid",
      "game_session_id uuid",
      "player_id uuid",
      "inventory_holding_id uuid",
      "store_item_id uuid",
    ]
  ) assert(!readReturn.includes(internal));
});

function between(value: string, start: string, end: string): string {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error("Migration section missing");
  }
  return value.slice(startIndex, endIndex);
}

function count(value: string, fragment: string): number {
  return value.split(fragment).length - 1;
}

function assertIncludes(value: string, fragment: string): void {
  if (!value.includes(fragment)) {
    throw new Error(`Missing fragment: ${fragment}`);
  }
}

function assert(value: boolean): void {
  if (!value) throw new Error("Assertion failed");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Actual ${String(actual)}; expected ${String(expected)}`);
  }
}
