import migrationSql from "../../../../supabase/migrations/20260718123000_add_inventory_redemption_admin_review_v1.sql" with {
  type: "text",
};

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Admin redemption migration is forward-only, scoped, and transaction wrapped", () => {
  const sql = migrationSql.toLowerCase();
  assert(sql.trimStart().startsWith("begin;"));
  assert(sql.trimEnd().endsWith("commit;"));
  for (
    const fragment of [
      "read_admin_inventory_redemptions_v1",
      "review_inventory_redemption_atomic_v1",
      "game_row.owner_staff_user_id",
      "inventory_redemption_admin_scope_forbidden",
      "security definer",
      "set search_path = public, pg_temp",
    ]
  ) assertIncludes(sql, fragment);
  assert(!sql.includes("drop table"));
  assert(!sql.includes("drop column"));
});

Deno.test("Admin redemption review serializes staff idempotency and request reservation writes", () => {
  const sql = migrationSql.toLowerCase();
  const review = between(
    sql,
    "create or replace function public.review_inventory_redemption_atomic_v1",
    "revoke all on function public.read_admin_inventory_redemptions_v1",
  );
  const staffLock = review.indexOf("for update of staff_row");
  const retryLookup = review.indexOf(
    "transition_row.idempotency_key = v_idempotency_key",
  );
  const requestLock = review.indexOf(
    "request_row.public_id = v_request_public_id",
  );
  const holdingLock = review.indexOf(
    "holding_row.id = v_request.inventory_holding_id",
  );
  assert(
    staffLock >= 0 && retryLookup > staffLock && requestLock > retryLookup &&
      holdingLock > requestLock,
  );
  for (
    const fragment of [
      "inventory_redemption_transitions_staff_idempotency_unique",
      "inventory_redemption_review_idempotency_conflict",
      "inventory_redemption_review_transition_invalid",
      "quantity_reserved = holding_row.quantity_reserved - v_request.quantity",
      "quantity_owned = holding_row.quantity_owned - v_request.quantity",
    ]
  ) assertIncludes(sql, fragment);
});

Deno.test("Admin redemption terminal transitions append audit and typed Inventory evidence once", () => {
  const sql = migrationSql.toLowerCase();
  for (
    const fragment of [
      "inventory_events_redemption_review_once",
      "'redemption_rejected'",
      "'redemption_fulfillment_release'",
      "'redemption_fulfilled'",
      "'released'",
      "'used'",
      "insert into public.audit_log",
      "'effectapplication', 'not_automated'",
    ]
  ) assertIncludes(sql, fragment);
  assertEquals(
    count(sql, "insert into public.inventory_redemption_transitions"),
    1,
  );
  assertEquals(count(sql, "insert into public.audit_log"), 1);
});

Deno.test("Admin redemption RPC return contracts omit internal UUID identifiers", () => {
  const sql = migrationSql.toLowerCase();
  for (
    const functionName of [
      "read_admin_inventory_redemptions_v1",
      "review_inventory_redemption_atomic_v1",
    ]
  ) {
    const section = sql.slice(
      sql.indexOf(`create or replace function public.${functionName}`),
    );
    const returned = between(section, "returns table (", ")\nlanguage plpgsql");
    for (
      const internal of [
        "game_session_id uuid",
        "player_id uuid",
        "staff_user_id uuid",
        "inventory_holding_id uuid",
        "store_item_id uuid",
      ]
    ) assert(!returned.includes(internal));
  }
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
