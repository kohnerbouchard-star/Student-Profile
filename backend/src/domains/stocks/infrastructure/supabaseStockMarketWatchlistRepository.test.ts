import {
  StockMarketWatchlistError,
} from "../contracts/stockMarketWatchlistContracts.ts";
import {
  SupabaseStockMarketWatchlistRepository,
} from "./supabaseStockMarketWatchlistRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000022";
const ASSET_ID = "00000000-0000-4000-8000-000000000101";
const SECOND_ASSET_ID = "00000000-0000-4000-8000-000000000102";

Deno.test("stock watchlist repository lists only token-derived scope with pagination", async () => {
  const client = new FakeClient({
    player_stock_watchlist: [
      watchlistRow(),
      watchlistRow({
        id: "00000000-0000-4000-8000-000000000202",
        stock_asset_id: SECOND_ASSET_ID,
        created_at: "2026-07-17T00:01:00.000Z",
      }),
      watchlistRow({
        id: "00000000-0000-4000-8000-000000000203",
        player_id: OTHER_PLAYER_ID,
      }),
      watchlistRow({
        id: "00000000-0000-4000-8000-000000000204",
        game_session_id: OTHER_GAME_SESSION_ID,
      }),
    ],
    game_session_stock_assets: [asset(), asset({ id: SECOND_ASSET_ID })],
  });
  const repository = new SupabaseStockMarketWatchlistRepository(
    client as never,
  );
  const result = await repository.listWatchlist({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    limit: 1,
    offset: 0,
  });

  assertEquals(result.assetIds, [SECOND_ASSET_ID]);
  assertEquals(result.pagination, {
    limit: 1,
    offset: 0,
    returned: 1,
    hasMore: true,
    nextOffset: 1,
  });
});

Deno.test("stock watchlist repository batches membership reads", async () => {
  const client = new FakeClient({
    player_stock_watchlist: [
      watchlistRow(),
      watchlistRow({
        id: "00000000-0000-4000-8000-000000000202",
        stock_asset_id: SECOND_ASSET_ID,
        player_id: OTHER_PLAYER_ID,
      }),
    ],
    game_session_stock_assets: [asset(), asset({ id: SECOND_ASSET_ID })],
  });
  const repository = new SupabaseStockMarketWatchlistRepository(
    client as never,
  );
  const ids = await repository.listWatchlistedAssetIds({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    assetIds: [ASSET_ID, SECOND_ASSET_ID],
  });

  assertEquals([...ids], [ASSET_ID]);
  assertEquals(client.queryCounts.player_stock_watchlist, 1);
});

Deno.test("stock watchlist repository PUT behavior is idempotent", async () => {
  const client = new FakeClient({
    player_stock_watchlist: [],
    game_session_stock_assets: [asset()],
  });
  const repository = new SupabaseStockMarketWatchlistRepository(
    client as never,
  );
  const input = {
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    assetId: ASSET_ID,
    isWatchlisted: true,
  } as const;
  const first = await repository.setWatchlisted(input);
  const replay = await repository.setWatchlisted(input);

  assertEquals(first, { changed: true });
  assertEquals(replay, { changed: false });
  assertEquals(client.tables.player_stock_watchlist.length, 1);
});

Deno.test("stock watchlist repository DELETE behavior is idempotent", async () => {
  const client = new FakeClient({
    player_stock_watchlist: [watchlistRow()],
    game_session_stock_assets: [asset()],
  });
  const repository = new SupabaseStockMarketWatchlistRepository(
    client as never,
  );
  const input = {
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    assetId: ASSET_ID,
    isWatchlisted: false,
  } as const;
  const first = await repository.setWatchlisted(input);
  const replay = await repository.setWatchlisted(input);

  assertEquals(first, { changed: true });
  assertEquals(replay, { changed: false });
  assertEquals(client.tables.player_stock_watchlist, []);
});

Deno.test("stock watchlist repository rejects inactive and cross-game assets", async () => {
  for (
    const assetRows of [
      [asset({ is_active: false })],
      [asset({ game_session_id: OTHER_GAME_SESSION_ID })],
      [],
    ]
  ) {
    const client = new FakeClient({
      player_stock_watchlist: [],
      game_session_stock_assets: assetRows,
    });
    const repository = new SupabaseStockMarketWatchlistRepository(
      client as never,
    );

    await assertRejectsWithCode(
      () =>
        repository.setWatchlisted({
          gameSessionId: GAME_SESSION_ID,
          playerId: PLAYER_ID,
          assetId: ASSET_ID,
          isWatchlisted: true,
        }),
      "stock_asset_not_available",
    );
    assertEquals(client.tables.player_stock_watchlist, []);
  }
});

Deno.test("stock watchlist repository maps missing schema errors", async () => {
  const client = new FakeClient({
    player_stock_watchlist: [],
    game_session_stock_assets: [asset()],
  });
  client.tableErrors.set("player_stock_watchlist", {
    code: "42P01",
    message: "relation player_stock_watchlist does not exist",
  });
  const repository = new SupabaseStockMarketWatchlistRepository(
    client as never,
  );

  await assertRejectsWithCode(
    () =>
      repository.listWatchlist({
        gameSessionId: GAME_SESSION_ID,
        playerId: PLAYER_ID,
        limit: 50,
        offset: 0,
      }),
    "stock_market_watchlist_schema_not_applied",
  );
});

Deno.test("stock watchlist repository maps trigger scope races safely", async () => {
  for (
    const testCase of [
      {
        message: "player_stock_watchlist_asset_not_available",
        code: "stock_asset_not_available",
      },
      {
        message: "player_stock_watchlist_player_not_active",
        code: "invalid_player_session",
      },
    ]
  ) {
    const client = new FakeClient({
      player_stock_watchlist: [],
      game_session_stock_assets: [asset()],
    });
    client.insertErrors.set("player_stock_watchlist", {
      code: "P0001",
      message: testCase.message,
    });
    const repository = new SupabaseStockMarketWatchlistRepository(
      client as never,
    );

    await assertRejectsWithCode(
      () =>
        repository.setWatchlisted({
          gameSessionId: GAME_SESSION_ID,
          playerId: PLAYER_ID,
          assetId: ASSET_ID,
          isWatchlisted: true,
        }),
      testCase.code,
    );
  }
});

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    game_session_id: GAME_SESSION_ID,
    is_active: true,
    ...overrides,
  };
}

function watchlistRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000201",
    game_session_id: GAME_SESSION_ID,
    player_id: PLAYER_ID,
    stock_asset_id: ASSET_ID,
    created_at: "2026-07-17T00:00:00.000Z",
    ...overrides,
  };
}

class FakeClient {
  readonly tableErrors = new Map<
    string,
    { readonly code?: string; readonly message: string }
  >();
  readonly insertErrors = new Map<
    string,
    { readonly code?: string; readonly message: string }
  >();
  readonly queryCounts: Record<string, number> = {};

  constructor(
    readonly tables: Record<string, Record<string, unknown>[]>,
  ) {}

  from(tableName: string): FakeQueryBuilder {
    this.queryCounts[tableName] = (this.queryCounts[tableName] ?? 0) + 1;
    return new FakeQueryBuilder(this, tableName);
  }
}

class FakeQueryBuilder
  implements
    PromiseLike<{ readonly data: unknown[] | null; readonly error: unknown }> {
  private operation: "select" | "insert" | "delete" = "select";
  private insertValue: Record<string, unknown> | null = null;
  private readonly filters: {
    readonly column: string;
    readonly value: unknown;
  }[] = [];
  private readonly inFilters: {
    readonly column: string;
    readonly values: readonly unknown[];
  }[] = [];
  private readonly orderings: {
    readonly column: string;
    readonly ascending: boolean;
  }[] = [];
  private limitCount: number | null = null;
  private rangeBounds: { readonly from: number; readonly to: number } | null =
    null;

  constructor(
    private readonly client: FakeClient,
    private readonly tableName: string,
  ) {}

  select(): FakeQueryBuilder {
    return this;
  }

  insert(value: Record<string, unknown>): FakeQueryBuilder {
    this.operation = "insert";
    this.insertValue = value;
    return this;
  }

  delete(): FakeQueryBuilder {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown): FakeQueryBuilder {
    this.filters.push({ column, value });
    return this;
  }

  in(column: string, values: readonly unknown[]): FakeQueryBuilder {
    this.inFilters.push({ column, values });
    return this;
  }

  order(
    column: string,
    options: { readonly ascending?: boolean } = {},
  ): FakeQueryBuilder {
    this.orderings.push({ column, ascending: options.ascending ?? true });
    return this;
  }

  limit(count: number): FakeQueryBuilder {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number): FakeQueryBuilder {
    this.rangeBounds = { from, to };
    return this;
  }

  then<
    TResult1 = { readonly data: unknown[] | null; readonly error: unknown },
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
        value: { readonly data: unknown[] | null; readonly error: unknown },
      ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{
    readonly data: unknown[] | null;
    readonly error: unknown;
  }> {
    const tableError = this.client.tableErrors.get(this.tableName);

    if (tableError) {
      return { data: null, error: tableError };
    }

    if (this.operation === "insert") {
      return this.executeInsert();
    }

    if (this.operation === "delete") {
      return this.executeDelete();
    }

    return { data: this.filteredRows(), error: null };
  }

  private executeInsert(): {
    readonly data: unknown[] | null;
    readonly error: unknown;
  } {
    const insertError = this.client.insertErrors.get(this.tableName);

    if (insertError) {
      return { data: null, error: insertError };
    }

    const value = this.insertValue ?? {};
    const rows = this.client.tables[this.tableName] ?? [];
    const duplicate = rows.some((row) =>
      row.game_session_id === value.game_session_id &&
      row.player_id === value.player_id &&
      row.stock_asset_id === value.stock_asset_id
    );

    if (duplicate) {
      return {
        data: null,
        error: { code: "23505", message: "duplicate key value" },
      };
    }

    rows.push({
      id: `watchlist-${rows.length + 1}`,
      created_at: `created-${rows.length + 1}`,
      ...value,
    });
    this.client.tables[this.tableName] = rows;

    return { data: [], error: null };
  }

  private executeDelete(): {
    readonly data: unknown[] | null;
    readonly error: unknown;
  } {
    const rows = this.client.tables[this.tableName] ?? [];
    const deleted = rows.filter((row) => this.matchesFilters(row));
    this.client.tables[this.tableName] = rows.filter((row) =>
      !this.matchesFilters(row)
    );

    return { data: deleted, error: null };
  }

  private filteredRows(): Record<string, unknown>[] {
    let rows = [...(this.client.tables[this.tableName] ?? [])]
      .filter((row) => this.matchesFilters(row));

    for (const ordering of [...this.orderings].reverse()) {
      rows.sort((left, right) => {
        const comparison = String(left[ordering.column]).localeCompare(
          String(right[ordering.column]),
        );
        return ordering.ascending ? comparison : -comparison;
      });
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    if (this.rangeBounds) {
      rows = rows.slice(this.rangeBounds.from, this.rangeBounds.to + 1);
    }

    return rows;
  }

  private matchesFilters(row: Record<string, unknown>): boolean {
    return this.filters.every((filter) =>
      row[filter.column] === filter.value
    ) && this.inFilters.every((filter) =>
      filter.values.includes(row[filter.column])
    );
  }
}

async function assertRejectsWithCode(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof StockMarketWatchlistError) {
      assertEquals(error.code, code);
      return;
    }

    throw error;
  }

  throw new Error(`Expected StockMarketWatchlistError with code ${code}.`);
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
