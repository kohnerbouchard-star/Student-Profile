import { SupabasePlayerStorePublicReadRepository } from "./supabasePlayerStorePublicReadRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "11111111-1111-4111-8111-111111111111";
const PLAYER_ID = "22222222-2222-4222-8222-222222222222";

Deno.test("read-only Player Store adapter exposes catalog and history without RPC authority", async () => {
  const client = new ReadClient({
    store_items: [{
      item_key: "field_permit",
      name: "Field Permit",
      description: "Access permit",
      category: "license",
      price: "50.00",
      currency_code: "NRC",
      stock_quantity: 10,
      status: "active",
      visibility: "visible",
      sort_order: 1,
      updated_at: "2026-08-31T01:00:00.000Z",
    }],
    store_purchases: [{
      public_receipt_key: "receipt_11111111111111111111111111111111",
      quantity: 2,
      final_total_price: "100.00",
      currency_code: "NRC",
      status: "COMPLETED",
      created_at: "2026-08-31T01:01:00.000Z",
      store_purchase_quotes: {
        public_quote_key: "quote_11111111111111111111111111111111",
      },
      store_items: { item_key: "field_permit", name: "Field Permit" },
    }],
  });
  const repository = new SupabasePlayerStorePublicReadRepository(
    client as never,
  );

  const items = await repository.listItems({
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
  });
  const purchases = await repository.listPurchases({
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    limit: 25,
  });

  assertEquals(items[0].itemKey, "field_permit");
  assertEquals(
    purchases[0].receiptKey,
    "receipt_11111111111111111111111111111111",
  );
  assertEquals(client.tables, ["store_items", "store_purchases"]);
  assertEquals("rpc" in client, false);
});

class ReadClient {
  readonly tables: string[] = [];

  constructor(
    private readonly rows: Readonly<Record<string, readonly unknown[]>>,
  ) {}

  from(table: string) {
    this.tables.push(table);
    return new ReadQuery(this.rows[table] ?? []);
  }
}

class ReadQuery
  implements PromiseLike<{ data: readonly unknown[]; error: null }> {
  constructor(private readonly rows: readonly unknown[]) {}

  select() {
    return this;
  }

  eq() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  then<TResult1 = { data: readonly unknown[]; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: readonly unknown[]; error: null }) =>
        | TResult1
        | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
