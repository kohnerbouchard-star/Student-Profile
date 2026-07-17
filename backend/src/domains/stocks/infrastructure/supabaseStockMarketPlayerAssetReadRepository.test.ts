import {
  StockMarketPlayerAssetReadError,
} from "../contracts/stockMarketPlayerAssetReadContracts.ts";
import {
  SupabaseStockMarketReadRepository,
} from "./supabaseStockMarketReadRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const ASSET_ID = "00000000-0000-4000-8000-000000000101";
const SECOND_ASSET_ID = "00000000-0000-4000-8000-000000000102";
const THIRD_ASSET_ID = "00000000-0000-4000-8000-000000000103";

Deno.test("player market asset list paginates without per-asset queries", async () => {
  const client = new FakeClient({
    game_session_stock_assets: [
      asset(),
      asset({
        id: SECOND_ASSET_ID,
        ticker: "BETA",
        company_name: "Beta Industries",
      }),
      asset({
        id: THIRD_ASSET_ID,
        ticker: "CETA",
        company_name: "Ceta Industries",
      }),
    ],
    stock_price_ticks: [
      tick(),
      tick({
        stock_asset_id: SECOND_ASSET_ID,
        ticker: "BETA",
        tick_index: 2,
        volume: 2000,
      }),
      tick({
        stock_asset_id: THIRD_ASSET_ID,
        ticker: "CETA",
        tick_index: 3,
        volume: 3000,
      }),
    ],
  });
  const repository = new SupabaseStockMarketReadRepository(client as never);
  const result = await repository.listPlayerAssets({
    gameSessionId: GAME_SESSION_ID,
    limit: 2,
    offset: 0,
  });

  assertEquals(result.assets.map((value) => value.ticker), ["AURA", "BETA"]);
  assertEquals(result.assets[1].volume, 2000);
  assertEquals(result.tickIndex, 3);
  assertEquals(result.pagination, {
    limit: 2,
    offset: 0,
    returned: 2,
    hasMore: true,
    nextOffset: 2,
  });
  assertEquals(client.queriedTables, ["game_session_stock_assets"]);
  assertEquals(client.rpcCalls.length, 1);
});

Deno.test("player market asset detail scopes bounded history by game and asset", async () => {
  const client = new FakeClient({
    game_session_stock_assets: [
      asset(),
      asset({
        id: SECOND_ASSET_ID,
        game_session_id: OTHER_GAME_SESSION_ID,
      }),
    ],
    stock_price_ticks: [
      tick({ tick_index: 0, created_at: "tick-0" }),
      tick({ tick_index: 1, created_at: "tick-1" }),
      tick({ tick_index: 2, created_at: "tick-2" }),
      tick({
        game_session_id: OTHER_GAME_SESSION_ID,
        stock_asset_id: SECOND_ASSET_ID,
        tick_index: 999,
        created_at: "cross-game-tick",
      }),
    ],
  });
  const repository = new SupabaseStockMarketReadRepository(client as never);
  const result = await repository.readPlayerAsset({
    gameSessionId: GAME_SESSION_ID,
    assetId: ASSET_ID,
    historyLimit: 2,
  });

  assertEquals(result.asset.assetId, ASSET_ID);
  assertEquals(result.history.map((point) => point.tickIndex), [1, 2]);
  assertEquals(result.tickIndex, 2);
  assertEquals(client.queriedTables, [
    "game_session_stock_assets",
    "stock_price_ticks",
  ]);
  assertEquals(client.rpcCalls.length, 1);
});

Deno.test("player market asset detail hides cross-game and inactive assets", async () => {
  for (
    const rows of [
      [asset({ game_session_id: OTHER_GAME_SESSION_ID })],
      [asset({ is_active: false })],
    ]
  ) {
    const repository = new SupabaseStockMarketReadRepository(
      new FakeClient({
        game_session_stock_assets: rows,
        stock_price_ticks: [],
      }) as never,
    );

    await assertRejectsWithCode(
      () =>
        repository.readPlayerAsset({
          gameSessionId: GAME_SESSION_ID,
          assetId: ASSET_ID,
          historyLimit: 20,
        }),
      "stock_asset_not_available",
    );
  }
});

Deno.test("player market asset batch read resolves watchlist assets without N+1 queries", async () => {
  const client = new FakeClient({
    game_session_stock_assets: [
      asset(),
      asset({
        id: SECOND_ASSET_ID,
        ticker: "BETA",
        company_name: "Beta Industries",
      }),
      asset({
        id: THIRD_ASSET_ID,
        ticker: "CETA",
        company_name: "Ceta Industries",
      }),
    ],
    stock_price_ticks: [
      tick(),
      tick({
        stock_asset_id: SECOND_ASSET_ID,
        ticker: "BETA",
        tick_index: 2,
      }),
    ],
  });
  const repository = new SupabaseStockMarketReadRepository(client as never);
  const result = await repository.readPlayerAssetsByIds({
    gameSessionId: GAME_SESSION_ID,
    assetIds: [SECOND_ASSET_ID, ASSET_ID, ASSET_ID],
  });

  assertEquals(result.assets.map((value) => value.assetId), [
    ASSET_ID,
    SECOND_ASSET_ID,
  ]);
  assertEquals(result.tickIndex, 2);
  assertEquals(client.queriedTables, ["game_session_stock_assets"]);
  assertEquals(client.rpcCalls.length, 1);
});

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    game_session_id: GAME_SESSION_ID,
    ticker: "AURA",
    company_name: "Aurora Aerospace Systems",
    sector_key: "AI_AEROSPACE",
    country_code: "SOLVEND",
    description: "Public company description",
    current_price: 105,
    previous_close: 100,
    open_price: 100,
    day_high: 106,
    day_low: 99,
    market_cap: 105000000,
    current_volatility: 0.05,
    long_run_volatility: 0.04,
    is_active: true,
    ...overrides,
  };
}

function tick(overrides: Record<string, unknown> = {}) {
  return {
    game_session_id: GAME_SESSION_ID,
    stock_asset_id: ASSET_ID,
    tick_index: 1,
    ticker: "AURA",
    price: 105,
    previous_price: 100,
    change_pct: 5,
    volume: 1000,
    created_at: "tick-1",
    ...overrides,
  };
}

class FakeClient {
  readonly queriedTables: string[] = [];
  readonly rpcCalls: { readonly functionName: string; readonly args: any }[] =
    [];

  constructor(
    readonly tables: Record<string, readonly Record<string, unknown>[]>,
  ) {}

  from(tableName: string): FakeQueryBuilder {
    this.queriedTables.push(tableName);
    return new FakeQueryBuilder(this, tableName);
  }

  async rpc(functionName: string, args: any) {
    this.rpcCalls.push({ functionName, args });

    let rows = [...(this.tables.stock_price_ticks ?? [])]
      .filter((row) => row.game_session_id === args.p_game_session_id);

    if (args.p_ticker) {
      rows = rows.filter((row) => row.ticker === args.p_ticker);
    }

    const latestByAssetId = new Map<string, Record<string, unknown>>();

    for (const row of rows) {
      const assetId = String(row.stock_asset_id);
      const current = latestByAssetId.get(assetId);

      if (!current || Number(row.tick_index) > Number(current.tick_index)) {
        latestByAssetId.set(assetId, row);
      }
    }

    return { data: [...latestByAssetId.values()], error: null };
  }
}

class FakeQueryBuilder
  implements
    PromiseLike<{ readonly data: unknown[] | null; readonly error: unknown }> {
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
    let rows = [...(this.client.tables[this.tableName] ?? [])];

    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }

    for (const filter of this.inFilters) {
      rows = rows.filter((row) => filter.values.includes(row[filter.column]));
    }

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

    return { data: rows, error: null };
  }
}

async function assertRejectsWithCode(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof StockMarketPlayerAssetReadError) {
      assertEquals(error.code, code);
      return;
    }

    throw error;
  }

  throw new Error(
    `Expected StockMarketPlayerAssetReadError with code ${code}.`,
  );
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
