import { SupabasePlayerBankingPublicRepository } from "./supabasePlayerBankingPublicRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("public Banking repository uses two bounded scoped queries without selecting IDs", async () => {
  const client = new FakeClient();
  const repository = new SupabasePlayerBankingPublicRepository(client as never);
  const page = await repository.readPage({
    gameSessionId: "00000000-0000-4000-8000-000000000001",
    playerId: "00000000-0000-4000-8000-000000000002",
    limit: 2,
    offset: 4,
  });

  assertEquals(client.queries.length, 2);
  assertEquals(client.queries[0].table, "account_balances");
  assertEquals(client.queries[0].selection, "account_type,balance,currency_code");
  assertEquals(client.queries[1].table, "ledger_entries");
  assertEquals(
    client.queries[1].selection,
    "account_type,amount,currency_code,entry_type,source_domain,source_action,created_at",
  );
  assertEquals(client.queries[1].rangeValue, [4, 6]);
  assertEquals(client.queries[1].orders, [
    ["created_at", false],
    ["id", false],
  ]);
  assertEquals(page.entries.length, 2);
  assertEquals(page.hasMore, true);
  const serialized = JSON.stringify(page);
  assertEquals(serialized.includes("00000000-0000-4000-8000"), false);
  assertEquals(serialized.includes("sourceId"), false);
});

class FakeClient {
  readonly queries: FakeQuery[] = [];

  from(table: string) {
    const query = new FakeQuery(table);
    this.queries.push(query);
    return query;
  }
}

class FakeQuery implements PromiseLike<any> {
  selection = "";
  readonly filters: unknown[] = [];
  readonly orders: unknown[] = [];
  rangeValue: [number, number] | null = null;

  constructor(readonly table: string) {}

  select(selection: string) {
    this.selection = selection;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }

  order(column: string, options: { ascending: boolean }) {
    this.orders.push([column, options.ascending]);
    return this;
  }

  range(from: number, to: number) {
    this.rangeValue = [from, to];
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const data = this.table === "account_balances"
      ? [{ account_type: "cash", balance: "1250", currency_code: "ECO" }]
      : [
        ledger("25", "ECO", "2026-07-19T04:00:00.000Z"),
        ledger("-4", "LUM", "2026-07-19T03:59:00.000Z"),
        ledger("1", "ECO", "2026-07-19T03:58:00.000Z"),
      ];
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

function ledger(amount: string, currencyCode: string, createdAt: string) {
  return {
    account_type: "cash",
    amount,
    currency_code: currencyCode,
    entry_type: Number(amount) < 0 ? "debit" : "credit",
    source_domain: "economy",
    source_action: "adjustment",
    created_at: createdAt,
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
