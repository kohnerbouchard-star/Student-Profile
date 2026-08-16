import {
  RuntimeCursorStockMarketNewsRepository,
  RuntimeCursorStockMarketRunnerRepository,
} from "./runtimeCursorStockMarketRepositories.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const ASSET_ID = "00000000-0000-4000-8000-000000000101";

Deno.test("runtime cursor runner resolves next tick before base load", async () => {
  const client = new FakeClient(18, 17);
  const repository = new RuntimeCursorStockMarketRunnerRepository(client as any);
  const state = await repository.load({ gameSessionId: GAME_ID });

  assertEquals(state.tickIndex, 18);
  assertEquals(client.rpcCalls[0], {
    functionName: "get_next_stock_market_tick_index",
    args: { p_game_session_id: GAME_ID },
  });
});

Deno.test("runtime cursor runner preserves explicit replay tick", async () => {
  const client = new FakeClient(18, 17);
  const repository = new RuntimeCursorStockMarketRunnerRepository(client as any);
  const state = await repository.load({ gameSessionId: GAME_ID, tickIndex: 7 });

  assertEquals(state.tickIndex, 7);
  assertEquals(client.rpcCalls, []);
});

Deno.test("runtime cursor market news reads current authoritative tick", async () => {
  const client = new FakeClient(18, 17);
  const repository = new RuntimeCursorStockMarketNewsRepository(client as any);
  assertEquals(await repository.readCurrentTick(GAME_ID), 17);
  assertEquals(client.rpcCalls[0], {
    functionName: "get_current_stock_market_tick_index_v2",
    args: { p_game_session_id: GAME_ID },
  });
});

class FakeClient {
  readonly rpcCalls: { readonly functionName: string; readonly args: any }[] = [];

  constructor(
    private readonly nextTick: number,
    private readonly currentTick: number,
  ) {}

  async rpc(functionName: string, args: any) {
    this.rpcCalls.push({ functionName, args });
    if (functionName === "get_next_stock_market_tick_index") {
      return { data: this.nextTick, error: null };
    }
    if (functionName === "get_current_stock_market_tick_index_v2") {
      return { data: this.currentTick, error: null };
    }
    if (functionName === "apply_stock_market_runner_tick") {
      return { data: [{ assets_updated: 1, ticks_inserted: 1 }], error: null };
    }
    return { data: null, error: { message: `Unexpected RPC ${functionName}` } };
  }

  from(tableName: string) {
    return new FakeQueryBuilder(tableName);
  }
}

class FakeQueryBuilder {
  private readonly filters: { column: string; value: unknown }[] = [];
  private orders: { column: string; ascending: boolean }[] = [];
  private limitCount: number | null = null;

  constructor(private readonly tableName: string) {}

  select(_columns: string) { return this; }
  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }
  in(_column: string, _values: readonly unknown[]) { return this; }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending ?? true });
    return this;
  }
  limit(count: number) {
    this.limitCount = count;
    return this;
  }
  maybeSingle() {
    const rows = this.rows();
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }
  then(onfulfilled?: (value: { data: unknown[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.rows(), error: null }).then(onfulfilled);
  }

  private rows(): Record<string, unknown>[] {
    let rows: Record<string, unknown>[];
    if (this.tableName === "game_sessions") {
      rows = [{ id: GAME_ID }];
    } else if (this.tableName === "game_session_stock_assets") {
      rows = [{
        id: ASSET_ID,
        game_session_id: GAME_ID,
        ticker: "AURA",
        company_name: "Aurora Works",
        sector_key: "TECHNOLOGY",
        country_code: "SOLVEND",
        current_price: 100,
        previous_close: 99,
        open_price: 100,
        day_high: 101,
        day_low: 98,
        market_cap: 100000000,
        shares_outstanding: 1000000,
        beta: 1,
        liquidity: 0.8,
        current_volatility: 0.05,
        long_run_volatility: 0.04,
        fair_value_anchor: 100,
        recent_returns: [],
        chart_history: [],
        fundamentals: {},
        country_exposure: {},
        sector_exposure: {},
        commodity_exposure: {},
        is_active: true,
      }];
    } else {
      rows = [];
    }

    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }
    for (const order of [...this.orders].reverse()) {
      rows.sort((left, right) => {
        const comparison = String(left[order.column] ?? "").localeCompare(String(right[order.column] ?? ""));
        return order.ascending ? comparison : -comparison;
      });
    }
    if (this.limitCount !== null) rows = rows.slice(0, this.limitCount);
    return rows;
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
