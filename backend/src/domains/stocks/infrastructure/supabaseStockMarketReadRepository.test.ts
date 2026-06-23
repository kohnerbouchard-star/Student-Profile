import {
  SupabaseStockMarketReadRepository,
} from "./supabaseStockMarketReadRepository.ts";
import { StockMarketReadError } from "../contracts/stockMarketReadContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const ASSET_ID = "00000000-0000-4000-8000-000000000101";
const OTHER_ASSET_ID = "00000000-0000-4000-8000-000000000102";

Deno.test("stock market read board reads only requested game session", async () => {
  const repository = new SupabaseStockMarketReadRepository(new FakeClient({
    game_session_stock_assets: [asset(), asset({ id: OTHER_ASSET_ID, game_session_id: OTHER_SESSION_ID, current_price: 500 })],
    stock_price_ticks: [tick(), tick({ game_session_id: OTHER_SESSION_ID, stock_asset_id: OTHER_ASSET_ID, price: 500 })],
  }) as any);
  const result = await repository.read({
    gameSessionId: GAME_SESSION_ID,
    includeHistory: false,
    historyLimit: 200,
  });

  assertEquals(result.stocks.length, 1);
  assertEquals(result.stocks[0].assetId, ASSET_ID);
  assertEquals(result.stocks[0].currentPrice, 105);
  assertEquals(result.tickIndex, 1);
});

Deno.test("stock market read ticker history reads only requested game session and stock_price_ticks", async () => {
  const client = new FakeClient({
    game_session_stock_assets: [asset(), asset({ id: OTHER_ASSET_ID, game_session_id: OTHER_SESSION_ID })],
    stock_price_ticks: [
      tick({ tick_index: 0, price: 100, previous_price: 100, change_pct: 0, created_at: "tick-0" }),
      tick({ tick_index: 1, price: 105, previous_price: 100, change_pct: 5, created_at: "tick-1" }),
      tick({ game_session_id: OTHER_SESSION_ID, stock_asset_id: OTHER_ASSET_ID, tick_index: 99, price: 999 }),
    ],
  });
  const repository = new SupabaseStockMarketReadRepository(client as any);
  const result = await repository.read({
    gameSessionId: GAME_SESSION_ID,
    ticker: "AURA",
    includeHistory: true,
    historyLimit: 200,
  });

  assertEquals(result.ticker, "AURA");
  assertEquals(result.stock?.ticker, "AURA");
  assertEquals(result.history?.map((point) => point.tickIndex), [0, 1]);
  assertEquals(client.queriedTables, [
    "game_session_stock_assets",
    "stock_price_ticks",
    "stock_price_ticks",
  ]);
});

Deno.test("stock market read applies history limit", async () => {
  const repository = new SupabaseStockMarketReadRepository(new FakeClient({
    game_session_stock_assets: [asset()],
    stock_price_ticks: [
      tick({ tick_index: 0 }),
      tick({ tick_index: 1 }),
      tick({ tick_index: 2 }),
    ],
  }) as any);
  const result = await repository.read({
    gameSessionId: GAME_SESSION_ID,
    ticker: "AURA",
    includeHistory: true,
    historyLimit: 2,
  });

  assertEquals(result.history?.map((point) => point.tickIndex), [1, 2]);
});

Deno.test("stock market read returns empty state when no stocks exist", async () => {
  const repository = new SupabaseStockMarketReadRepository(new FakeClient({
    game_session_stock_assets: [],
    stock_price_ticks: [],
  }) as any);
  const result = await repository.read({
    gameSessionId: GAME_SESSION_ID,
    includeHistory: false,
    historyLimit: 200,
  });

  assertEquals(result.stocks, []);
  assertEquals(result.emptyState, {
    reason: "stock_market_not_initialized",
    recommendedAction: "run_stock_market_seed_copy",
  });
});

Deno.test("stock market read maps missing schema errors", async () => {
  const client = new FakeClient({
    game_session_stock_assets: [],
    stock_price_ticks: [],
  });
  client.tableErrors.set("game_session_stock_assets", {
    code: "42P01",
    message: "relation game_session_stock_assets does not exist",
  });
  const repository = new SupabaseStockMarketReadRepository(client as any);

  await assertRejectsWithCode(
    () => repository.read({ gameSessionId: GAME_SESSION_ID, includeHistory: false, historyLimit: 200 }),
    "stock_market_schema_not_applied",
  );
});

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSET_ID,
    game_session_id: GAME_SESSION_ID,
    ticker: "AURA",
    company_name: "Aurora Aerospace Systems",
    sector_key: "AI_AEROSPACE",
    country_code: "SOLVEND",
    description: "Test stock",
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

async function assertRejectsWithCode(run: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof StockMarketReadError) {
      assertEquals(error.code, code);
      return;
    }

    throw error;
  }

  throw new Error(`Expected StockMarketReadError with code ${code}.`);
}

class FakeClient {
  readonly queriedTables: string[] = [];
  readonly tableErrors = new Map<string, { readonly code?: string; readonly message: string }>();

  constructor(readonly tables: Record<string, readonly Record<string, unknown>[]>) {}

  from(tableName: string): FakeQueryBuilder {
    this.queriedTables.push(tableName);
    return new FakeQueryBuilder(this, tableName);
  }
}

class FakeQueryBuilder implements PromiseLike<{ readonly data: unknown[] | null; readonly error: unknown }> {
  private readonly filters: { readonly column: string; readonly value: unknown }[] = [];
  private readonly orderings: { readonly column: string; readonly ascending: boolean }[] = [];
  private limitCount: number | null = null;

  constructor(private readonly client: FakeClient, private readonly tableName: string) {}

  select(): FakeQueryBuilder {
    return this;
  }

  eq(column: string, value: unknown): FakeQueryBuilder {
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, options: { readonly ascending?: boolean } = {}): FakeQueryBuilder {
    this.orderings.push({ column, ascending: options.ascending ?? true });
    return this;
  }

  limit(count: number): FakeQueryBuilder {
    this.limitCount = count;
    return this;
  }

  then<TResult1 = { readonly data: unknown[] | null; readonly error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { readonly data: unknown[] | null; readonly error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ readonly data: unknown[] | null; readonly error: unknown }> {
    const tableError = this.client.tableErrors.get(this.tableName);

    if (tableError) {
      return { data: null, error: tableError };
    }

    let rows = [...(this.client.tables[this.tableName] ?? [])];

    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }

    for (const ordering of [...this.orderings].reverse()) {
      rows.sort((left, right) => {
        const comparison = compareValues(left[ordering.column], right[ordering.column]);
        return ordering.ascending ? comparison : -comparison;
      });
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return { data: rows, error: null };
  }
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right));
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
