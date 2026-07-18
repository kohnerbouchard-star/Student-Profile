import {
  PlayerStockAssetListPersistenceError,
} from "../contracts/playerStockAssetListContracts.ts";
import {
  SupabasePlayerStockAssetListRepository,
} from "./supabasePlayerStockAssetListRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_ID = "00000000-0000-4000-8000-000000000002";
const ASSET_UUID = "00000000-0000-4000-8000-000000000101";
const SECOND_ASSET_UUID = "00000000-0000-4000-8000-000000000102";

Deno.test("player stock asset repository scopes and bounds one asset query plus one tick query", async () => {
  const client = new FakeClient([
    asset(),
    asset({ id: SECOND_ASSET_UUID, ticker: "BETA", company_name: "Beta Energy" }),
    asset({ game_session_id: OTHER_GAME_ID, ticker: "CROSS" }),
  ], [
    tick(),
    tick({ stock_asset_id: SECOND_ASSET_UUID, ticker: "BETA", tick_index: 2, volume: 2000 }),
    tick({ game_session_id: OTHER_GAME_ID, tick_index: 99 }),
  ]);
  const repository = new SupabasePlayerStockAssetListRepository(client as never);
  const result = await repository.listAssets({ gameId: GAME_ID, limit: 2, offset: 0 });

  assertEquals(result.gameId, GAME_ID);
  assertEquals(result.assets.map((value) => value.ticker), ["AURA", "BETA"]);
  assertEquals(result.latestTicks.map((value) => value.tickIndex), [1, 2]);
  assertEquals(client.fromCalls, ["game_session_stock_assets"]);
  assertEquals(client.rpcCalls, [{
    functionName: "read_latest_stock_market_ticks_for_game",
    args: { p_game_session_id: GAME_ID, p_ticker: null },
  }]);
  assertEquals(client.lastRange, { from: 0, to: 1 });
});

Deno.test("player stock asset repository preserves lookahead range", async () => {
  const client = new FakeClient([
    asset(),
    asset({ id: SECOND_ASSET_UUID, ticker: "BETA" }),
  ], []);
  const repository = new SupabasePlayerStockAssetListRepository(client as never);
  await repository.listAssets({ gameId: GAME_ID, limit: 3, offset: 4 });
  assertEquals(client.lastRange, { from: 4, to: 6 });
});

Deno.test("player stock asset repository maps schema errors", async () => {
  const client = new FakeClient([], []);
  client.tableError = {
    code: "42P01",
    message: "relation game_session_stock_assets does not exist",
  };
  const repository = new SupabasePlayerStockAssetListRepository(client as never);

  await assertRejectsCode(
    () => repository.listAssets({ gameId: GAME_ID, limit: 50, offset: 0 }),
    "player_stock_asset_schema_not_applied",
  );
});

class FakeClient {
  readonly fromCalls: string[] = [];
  readonly rpcCalls: { functionName: string; args: unknown }[] = [];
  lastRange: { from: number; to: number } | null = null;
  tableError: { code?: string; message: string } | null = null;

  constructor(
    readonly assets: readonly Record<string, unknown>[],
    readonly ticks: readonly Record<string, unknown>[],
  ) {}

  from(tableName: string): FakeQuery {
    this.fromCalls.push(tableName);
    return new FakeQuery(this);
  }

  async rpc(functionName: string, args: any) {
    this.rpcCalls.push({ functionName, args });
    return {
      data: this.ticks.filter((row) => row.game_session_id === args.p_game_session_id),
      error: null,
    };
  }
}

class FakeQuery
  implements PromiseLike<{ data: readonly Record<string, unknown>[] | null; error: unknown }> {
  private readonly filters: { column: string; value: unknown }[] = [];
  private readonly orderings: { column: string; ascending: boolean }[] = [];
  private bounds: { from: number; to: number } | null = null;

  constructor(private readonly client: FakeClient) {}

  select(): FakeQuery {
    return this;
  }

  eq(column: string, value: unknown): FakeQuery {
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}): FakeQuery {
    this.orderings.push({ column, ascending: options.ascending ?? true });
    return this;
  }

  range(from: number, to: number): FakeQuery {
    this.bounds = { from, to };
    this.client.lastRange = this.bounds;
    return this;
  }

  then<TResult1 = { data: readonly Record<string, unknown>[] | null; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: readonly Record<string, unknown>[] | null; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    if (this.client.tableError) {
      return { data: null, error: this.client.tableError };
    }

    let rows = [...this.client.assets];
    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }
    for (const ordering of [...this.orderings].reverse()) {
      rows.sort((left, right) => {
        const comparison = String(left[ordering.column]).localeCompare(
          String(right[ordering.column]),
        );
        return ordering.ascending ? comparison : -comparison;
      });
    }
    if (this.bounds) rows = rows.slice(this.bounds.from, this.bounds.to + 1);
    return { data: rows, error: null };
  }
}

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

function tick(overrides: Record<string, unknown> = {}) {
  return {
    game_session_id: GAME_ID,
    stock_asset_id: ASSET_UUID,
    tick_index: 1,
    ticker: "AURA",
    price: 105,
    previous_price: 100,
    change_pct: 5,
    volume: 1000,
    created_at: "2026-07-18T05:00:00.000Z",
    ...overrides,
  };
}

async function assertRejectsCode(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof PlayerStockAssetListPersistenceError) {
      assertEquals(error.code, code);
      return;
    }
    throw error;
  }
  throw new Error(`Expected PlayerStockAssetListPersistenceError with code ${code}.`);
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
