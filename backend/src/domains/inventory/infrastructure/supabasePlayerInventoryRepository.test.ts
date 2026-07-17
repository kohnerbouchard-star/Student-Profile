import {
  PlayerInventoryPersistenceError,
  SupabasePlayerInventoryRepository,
} from "./supabasePlayerInventoryRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_ID = "00000000-0000-4000-8000-000000000011";
const OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000012";
const ITEM_ID = "00000000-0000-4000-8000-000000000021";

Deno.test("inventory repository applies composite player scope and retains owned hidden item metadata", async () => {
  const client = new FakeClient({
    inventory_holdings: [
      holdingRow(),
      holdingRow({
        id: "00000000-0000-4000-8000-000000000032",
        player_id: OTHER_PLAYER_ID,
      }),
      holdingRow({
        id: "00000000-0000-4000-8000-000000000033",
        game_session_id: OTHER_GAME_SESSION_ID,
      }),
    ],
    store_items: [
      itemRow({ status: "archived", visibility: "hidden" }),
      itemRow({
        id: "00000000-0000-4000-8000-000000000022",
        game_session_id: OTHER_GAME_SESSION_ID,
      }),
    ],
  });
  const repository = new SupabasePlayerInventoryRepository(client as never);
  const records = await repository.readPlayerInventory({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
  });

  assertEquals(records, [{
    id: "00000000-0000-4000-8000-000000000031",
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    storeItemId: ITEM_ID,
    itemKey: "repair-kit",
    name: "Repair Kit",
    description: "Single-use protection.",
    category: "Consumables",
    unitValue: 9.99,
    currencyCode: "ECO",
    itemStatus: "archived",
    itemVisibility: "hidden",
    quantityOwned: 2,
    quantityReserved: 1,
    createdAt: "2026-07-16T08:00:00.000Z",
    updatedAt: "2026-07-17T07:00:00.000Z",
  }]);
  assertEquals(client.queries, [
    {
      tableName: "inventory_holdings",
      filters: [
        ["game_session_id", GAME_SESSION_ID],
        ["player_id", PLAYER_ID],
      ],
      inFilters: [],
    },
    {
      tableName: "store_items",
      filters: [["game_session_id", GAME_SESSION_ID]],
      inFilters: [["id", [ITEM_ID]]],
    },
  ]);
});

Deno.test("inventory repository skips catalog lookup for an empty inventory", async () => {
  const client = new FakeClient({ inventory_holdings: [], store_items: [] });
  const repository = new SupabasePlayerInventoryRepository(client as never);
  const records = await repository.readPlayerInventory({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
  });

  assertEquals(records, []);
  assertEquals(client.queries.map((query) => query.tableName), [
    "inventory_holdings",
  ]);
});

Deno.test("inventory repository fails closed when owned item metadata is missing", async () => {
  const repository = new SupabasePlayerInventoryRepository(
    new FakeClient({
      inventory_holdings: [holdingRow()],
      store_items: [],
    }) as never,
  );
  let error: unknown;

  try {
    await repository.readPlayerInventory({
      gameSessionId: GAME_SESSION_ID,
      playerId: PLAYER_ID,
    });
  } catch (caught) {
    error = caught;
  }

  assertEquals(error instanceof PlayerInventoryPersistenceError, true);
  assertEquals(
    (error as PlayerInventoryPersistenceError).code,
    "player_inventory_metadata_missing",
  );
});

class FakeClient {
  readonly queries: {
    readonly tableName: string;
    readonly filters: readonly (readonly [string, unknown])[];
    readonly inFilters: readonly (readonly [string, readonly unknown[]])[];
  }[] = [];

  constructor(
    readonly tables: Record<string, readonly Record<string, unknown>[]>,
  ) {}

  from(tableName: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this, tableName);
  }
}

class FakeQueryBuilder
  implements PromiseLike<{ readonly data: unknown[]; readonly error: null }> {
  private readonly filters: [string, unknown][] = [];
  private readonly inFilters: [string, readonly unknown[]][] = [];
  private readonly orderings: [string, boolean][] = [];

  constructor(
    private readonly client: FakeClient,
    private readonly tableName: string,
  ) {}

  select(): FakeQueryBuilder {
    return this;
  }

  eq(column: string, value: unknown): FakeQueryBuilder {
    this.filters.push([column, value]);
    return this;
  }

  in(column: string, values: readonly unknown[]): FakeQueryBuilder {
    this.inFilters.push([column, values]);
    return this;
  }

  order(
    column: string,
    options: { readonly ascending?: boolean } = {},
  ): FakeQueryBuilder {
    this.orderings.push([column, options.ascending ?? true]);
    return this;
  }

  then<
    TResult1 = { readonly data: unknown[]; readonly error: null },
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
        value: { readonly data: unknown[]; readonly error: null },
      ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{
    readonly data: unknown[];
    readonly error: null;
  }> {
    this.client.queries.push({
      tableName: this.tableName,
      filters: this.filters,
      inFilters: this.inFilters,
    });
    let rows = [...(this.client.tables[this.tableName] ?? [])];

    for (const [column, value] of this.filters) {
      rows = rows.filter((row) => row[column] === value);
    }

    for (const [column, values] of this.inFilters) {
      rows = rows.filter((row) => values.includes(row[column]));
    }

    for (const [column, ascending] of [...this.orderings].reverse()) {
      rows.sort((left, right) => {
        const comparison = String(left[column]).localeCompare(
          String(right[column]),
        );
        return ascending ? comparison : -comparison;
      });
    }

    return { data: rows, error: null };
  }
}

function holdingRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "00000000-0000-4000-8000-000000000031",
    game_session_id: GAME_SESSION_ID,
    player_id: PLAYER_ID,
    store_item_id: ITEM_ID,
    quantity_owned: 2,
    quantity_reserved: 1,
    created_at: "2026-07-16T08:00:00.000Z",
    updated_at: "2026-07-17T07:00:00.000Z",
    ...overrides,
  };
}

function itemRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: ITEM_ID,
    game_session_id: GAME_SESSION_ID,
    item_key: "repair-kit",
    name: "Repair Kit",
    description: "Single-use protection.",
    category: "Consumables",
    price: "9.99",
    currency_code: "ECO",
    status: "active",
    visibility: "visible",
    ...overrides,
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
