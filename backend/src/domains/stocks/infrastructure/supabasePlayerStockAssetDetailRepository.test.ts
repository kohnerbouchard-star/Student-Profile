import {
  PlayerStockAssetDetailPersistenceError,
} from "../contracts/playerStockAssetDetailContracts.ts";
import {
  SupabasePlayerStockAssetDetailRepository,
} from "./supabasePlayerStockAssetDetailRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_ID = "00000000-0000-4000-8000-000000000002";
const ASSET_UUID = "00000000-0000-4000-8000-000000000101";
const OTHER_ASSET_UUID = "00000000-0000-4000-8000-000000000102";

Deno.test("stock asset detail scopes the asset and bounded history queries", async () => {
  const client = new FakeClient({
    game_session_stock_assets: [
      asset(),
      asset({
        id: OTHER_ASSET_UUID,
        game_session_id: OTHER_GAME_ID,
        ticker: "AURA",
      }),
      asset({ id: OTHER_ASSET_UUID, ticker: "BETA" }),
    ],
    stock_price_ticks: [
      tick(40),
      tick(41),
      tick(42),
      tick(999, {
        game_session_id: OTHER_GAME_ID,
        stock_asset_id: OTHER_ASSET_UUID,
      }),
    ],
  });
  const repository = new SupabasePlayerStockAssetDetailRepository(client as never);
  const result = await repository.readAsset({
    gameId: GAME_ID,
    ticker: "AURA",
    historyLimit: 2,
  });

  assertEquals(result.asset?.internalAssetUuid, ASSET_UUID);
  assertEquals(result.history.map((point) => point.tickIndex), [42, 41]);
  assertEquals(result.history[0].createdAt, "2026-07-18T05:42:00.000Z");
  assertEquals(client.queries.map((query) => query.tableName), [
    "game_session_stock_assets",
    "stock_price_ticks",
  ]);
  assertIncludes(client.queries[0].filters, {
    column: "game_session_id",
    value: GAME_ID,
  });
  assertIncludes(client.queries[0].filters, { column: "ticker", value: "AURA" });
  assertIncludes(client.queries[0].filters, { column: "is_active", value: true });
  assertEquals(client.queries[0].limit, 2);
  assertIncludes(client.queries[1].filters, {
    column: "stock_asset_id",
    value: ASSET_UUID,
  });
  assertEquals(client.queries[1].limit, 2);
});

Deno.test("stock asset detail does not query history when the asset is unavailable", async () => {
  const client = new FakeClient({
    game_session_stock_assets: [asset({ is_active: false })],
    stock_price_ticks: [tick(42)],
  });
  const repository = new SupabasePlayerStockAssetDetailRepository(client as never);
  const result = await repository.readAsset({
    gameId: GAME_ID,
    ticker: "AURA",
    historyLimit: 200,
  });

  assertEquals(result, { gameId: GAME_ID, asset: null, history: [] });
  assertEquals(client.queries.map((query) => query.tableName), [
    "game_session_stock_assets",
  ]);
});

Deno.test("stock asset detail rejects duplicate active ticker rows", async () => {
  const repository = new SupabasePlayerStockAssetDetailRepository(
    new FakeClient({
      game_session_stock_assets: [asset(), asset({ id: OTHER_ASSET_UUID })],
      stock_price_ticks: [],
    }) as never,
  );

  await assertRejectsCode(
    () =>
      repository.readAsset({
        gameId: GAME_ID,
        ticker: "AURA",
        historyLimit: 20,
      }),
    "player_stock_asset_detail_read_failed",
  );
});

Deno.test("stock asset detail maps missing schema errors", async () => {
  const client = new FakeClient({
    game_session_stock_assets: [],
    stock_price_ticks: [],
  });
  client.errors.set("game_session_stock_assets", {
    code: "42P01",
    message: "relation game_session_stock_assets does not exist",
  });
  const repository = new SupabasePlayerStockAssetDetailRepository(client as never);

  await assertRejectsCode(
    () =>
      repository.readAsset({
        gameId: GAME_ID,
        ticker: "AURA",
        historyLimit: 20,
      }),
    "player_stock_asset_detail_schema_not_applied",
  );
});

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_UUID,
    game_session_id: GAME_ID,
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

function tick(tickIndex: number, overrides: Record<string, unknown> = {}) {
  return {
    game_session_id: GAME_ID,
    stock_asset_id: ASSET_UUID,
    tick_index: tickIndex,
    ticker: "AURA",
    price: 100 + tickIndex,
    previous_price: 99 + tickIndex,
    change_pct: 1,
    volume: 1000 + tickIndex,
    created_at: `2026-07-18T05:${String(tickIndex).padStart(2, "0")}:00.000Z`,
    ...overrides,
  };
}

interface QueryLog {
  readonly tableName: string;
  readonly filters: readonly { readonly column: string; readonly value: unknown }[];
  readonly orders: readonly { readonly column: string; readonly ascending: boolean }[];
  readonly limit: number | null;
}

class FakeClient {
  readonly queries: QueryLog[] = [];
  readonly errors = new Map<
    string,
    { readonly code?: string; readonly message: string }
  >();

  constructor(
    readonly tables: Record<string, readonly Record<string, unknown>[]>,
  ) {}

  from(tableName: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this, tableName);
  }
}

class FakeQueryBuilder
  implements PromiseLike<{ readonly data: unknown[] | null; readonly error: any }> {
  readonly filters: { readonly column: string; readonly value: unknown }[] = [];
  readonly orders: { readonly column: string; readonly ascending: boolean }[] = [];
  limitCount: number | null = null;

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

  order(
    column: string,
    options: { readonly ascending?: boolean } = {},
  ): FakeQueryBuilder {
    this.orders.push({ column, ascending: options.ascending ?? true });
    return this;
  }

  limit(count: number): FakeQueryBuilder {
    this.limitCount = count;
    return this;
  }

  then<TResult1 = { readonly data: unknown[] | null; readonly error: any }, TResult2 = never>(
    onfulfilled?: ((value: { readonly data: unknown[] | null; readonly error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    this.client.queries.push({
      tableName: this.tableName,
      filters: [...this.filters],
      orders: [...this.orders],
      limit: this.limitCount,
    });

    const error = this.client.errors.get(this.tableName);
    if (error) return { data: null, error };

    let rows = [...(this.client.tables[this.tableName] ?? [])];
    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }
    for (const order of [...this.orders].reverse()) {
      rows.sort((left, right) => {
        const comparison = compare(left[order.column], right[order.column]);
        return order.ascending ? comparison : -comparison;
      });
    }
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    return { data: rows, error: null };
  }
}

function compare(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

async function assertRejectsCode(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof PlayerStockAssetDetailPersistenceError) {
      assertEquals(error.code, code);
      return;
    }
    throw error;
  }
  throw new Error(
    `Expected PlayerStockAssetDetailPersistenceError with code ${code}.`,
  );
}

function assertIncludes(
  values: readonly unknown[],
  expected: unknown,
): void {
  if (!values.some((value) => JSON.stringify(value) === JSON.stringify(expected))) {
    throw new Error(`Expected ${JSON.stringify(values)} to include ${JSON.stringify(expected)}.`);
  }
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
