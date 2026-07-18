import {
  PlayerStockWatchlistPersistenceError,
} from "../contracts/playerStockWatchlistContracts.ts";
import {
  SupabasePlayerStockWatchlistRepository,
} from "./supabasePlayerStockWatchlistRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_UUID = "00000000-0000-4000-8000-000000000010";
const OTHER_PLAYER_UUID = "00000000-0000-4000-8000-000000000011";
const ASSET_UUID = "00000000-0000-4000-8000-000000000101";
const WATCHLIST_UUID = "00000000-0000-4000-8000-000000000201";

Deno.test("player stock watchlist repository scopes list reads and latest ticks", async () => {
  const client = new FakeClient();
  client.watchlistRows.push(
    watchlistRow(),
    watchlistRow({ id: "00000000-0000-4000-8000-000000000202", player_id: OTHER_PLAYER_UUID }),
    watchlistRow({ id: "00000000-0000-4000-8000-000000000203", game_session_id: OTHER_GAME_ID }),
  );
  client.assetRows.push(assetRow(), assetRow({ game_session_id: OTHER_GAME_ID }));
  client.tickRows.push(tickRow(), tickRow({ game_session_id: OTHER_GAME_ID }));

  const repository = new SupabasePlayerStockWatchlistRepository(client as never);
  const result = await repository.listWatchlist({
    gameId: GAME_ID,
    playerUuid: PLAYER_UUID,
    limit: 51,
    offset: 0,
  });

  assertEquals(result.entries.length, 1);
  assertEquals(result.assets.map((asset) => asset.ticker), ["AURA"]);
  assertEquals(result.latestTicks.map((tick) => tick.tickIndex), [42]);
  assertEquals(client.lastRange, { from: 0, to: 50 });
  assertEquals(client.rpcCalls, [{
    functionName: "read_latest_stock_market_ticks_for_game",
    args: { p_game_session_id: GAME_ID, p_ticker: null },
  }]);
});

Deno.test("player stock watchlist repository makes PUT and DELETE idempotent", async () => {
  const client = new FakeClient();
  client.assetRows.push(assetRow());
  client.watchlistRows.push(watchlistRow());
  const repository = new SupabasePlayerStockWatchlistRepository(client as never);

  const duplicate = await repository.setWatchlisted({
    gameId: GAME_ID,
    playerUuid: PLAYER_UUID,
    ticker: "AURA",
    isWatchlisted: true,
  });
  assertEquals(duplicate.changed, false);

  const removed = await repository.setWatchlisted({
    gameId: GAME_ID,
    playerUuid: PLAYER_UUID,
    ticker: "AURA",
    isWatchlisted: false,
  });
  assertEquals(removed.changed, true);

  const removedAgain = await repository.setWatchlisted({
    gameId: GAME_ID,
    playerUuid: PLAYER_UUID,
    ticker: "AURA",
    isWatchlisted: false,
  });
  assertEquals(removedAgain.changed, false);
});

Deno.test("player stock watchlist repository rejects inactive additions and maps schema errors", async () => {
  const inactiveClient = new FakeClient();
  inactiveClient.assetRows.push(assetRow({ is_active: false }));
  await assertRejectsCode(
    () => new SupabasePlayerStockWatchlistRepository(inactiveClient as never)
      .setWatchlisted({
        gameId: GAME_ID,
        playerUuid: PLAYER_UUID,
        ticker: "AURA",
        isWatchlisted: true,
      }),
    "player_stock_watchlist_asset_not_found",
  );

  const schemaClient = new FakeClient();
  schemaClient.tableError = {
    code: "42P01",
    message: "relation player_stock_watchlist does not exist",
  };
  await assertRejectsCode(
    () => new SupabasePlayerStockWatchlistRepository(schemaClient as never)
      .listWatchlist({
        gameId: GAME_ID,
        playerUuid: PLAYER_UUID,
        limit: 50,
        offset: 0,
      }),
    "player_stock_watchlist_schema_not_applied",
  );
});

class FakeClient {
  readonly watchlistRows: Record<string, unknown>[] = [];
  readonly assetRows: Record<string, unknown>[] = [];
  readonly tickRows: Record<string, unknown>[] = [];
  readonly rpcCalls: { functionName: string; args: unknown }[] = [];
  lastRange: { from: number; to: number } | null = null;
  tableError: { code?: string; message: string } | null = null;

  from(tableName: string): FakeQuery {
    return new FakeQuery(this, tableName);
  }

  async rpc(functionName: string, args: any) {
    this.rpcCalls.push({ functionName, args });
    return {
      data: this.tickRows.filter((row) =>
        row.game_session_id === args.p_game_session_id
      ),
      error: null,
    };
  }
}

class FakeQuery implements PromiseLike<any> {
  private readonly filters: { column: string; value: unknown; kind: "eq" | "in" }[] = [];
  private readonly orderings: { column: string; ascending: boolean }[] = [];
  private bounds: { from: number; to: number } | null = null;

  constructor(
    private readonly client: FakeClient,
    private readonly tableName: string,
  ) {}

  select(): FakeQuery {
    return this;
  }

  eq(column: string, value: unknown): FakeQuery {
    this.filters.push({ column, value, kind: "eq" });
    return this;
  }

  in(column: string, values: readonly unknown[]): FakeQuery {
    this.filters.push({ column, value: values, kind: "in" });
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

  limit(count: number): FakeQuery {
    this.bounds = { from: 0, to: count - 1 };
    return this;
  }

  async insert(values: any) {
    if (this.client.tableError) return { data: null, error: this.client.tableError };
    const duplicate = this.client.watchlistRows.some((row) =>
      row.game_session_id === values.game_session_id &&
      row.player_id === values.player_id &&
      row.stock_asset_id === values.stock_asset_id
    );
    if (duplicate) {
      return { data: null, error: { code: "23505", message: "duplicate" } };
    }
    this.client.watchlistRows.push(watchlistRow(values));
    return { data: [], error: null };
  }

  delete(): FakeDeleteQuery {
    return new FakeDeleteQuery(this.client);
  }

  then(onfulfilled?: any, onrejected?: any): PromiseLike<any> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    if (this.client.tableError) return { data: null, error: this.client.tableError };
    let rows = this.tableName === "player_stock_watchlist"
      ? [...this.client.watchlistRows]
      : [...this.client.assetRows];
    for (const filter of this.filters) {
      rows = rows.filter((row) => filter.kind === "eq"
        ? row[filter.column] === filter.value
        : (filter.value as readonly unknown[]).includes(row[filter.column]));
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

class FakeDeleteQuery {
  private readonly filters: { column: string; value: unknown }[] = [];

  constructor(private readonly client: FakeClient) {}

  eq(column: string, value: unknown): FakeDeleteQuery {
    this.filters.push({ column, value });
    return this;
  }

  async select() {
    if (this.client.tableError) return { data: null, error: this.client.tableError };
    const removed = this.client.watchlistRows.filter((row) =>
      this.filters.every((filter) => row[filter.column] === filter.value)
    );
    this.client.watchlistRows.splice(
      0,
      this.client.watchlistRows.length,
      ...this.client.watchlistRows.filter((row) => !removed.includes(row)),
    );
    return { data: removed.map((row) => ({ id: row.id })), error: null };
  }
}

function watchlistRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WATCHLIST_UUID,
    game_session_id: GAME_ID,
    player_id: PLAYER_UUID,
    stock_asset_id: ASSET_UUID,
    created_at: "2026-07-18T06:00:00.000Z",
    ...overrides,
  };
}

function assetRow(overrides: Record<string, unknown> = {}) {
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

function tickRow(overrides: Record<string, unknown> = {}) {
  return {
    game_session_id: GAME_ID,
    stock_asset_id: ASSET_UUID,
    tick_index: 42,
    volume: 1000,
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
    if (error instanceof PlayerStockWatchlistPersistenceError) {
      assertEquals(error.code, code);
      return;
    }
    throw error;
  }
  throw new Error(`Expected PlayerStockWatchlistPersistenceError ${code}.`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
