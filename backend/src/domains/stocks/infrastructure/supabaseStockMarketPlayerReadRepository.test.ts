import {
  SupabaseStockMarketPlayerReadRepository,
} from "./supabaseStockMarketPlayerReadRepository.ts";
import {
  StockMarketPlayerReadError,
} from "../contracts/stockMarketPlayerReadContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const OTHER_PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000012";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000022";
const STOCK_ASSET_ID = "00000000-0000-4000-8000-000000000101";
const OTHER_STOCK_ASSET_ID = "00000000-0000-4000-8000-000000000102";
const ORDER_ID = "00000000-0000-4000-8000-000000000201";
const OTHER_ORDER_ID = "00000000-0000-4000-8000-000000000202";
const TRADE_ID = "00000000-0000-4000-8000-000000000301";
const OTHER_TRADE_ID = "00000000-0000-4000-8000-000000000302";

Deno.test("stock player read repository maps cash, holdings, and portfolio math", async () => {
  const client = new FakeClient(defaultTables());
  const repository = new SupabaseStockMarketPlayerReadRepository(client as any, {
    now: () => new Date("2026-06-24T00:00:00.000Z"),
  });
  const result = await repository.read({
    action: "read_portfolio",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    limit: 100,
  });

  assertEquals(result, {
    action: "read_portfolio",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    playerId: PLAYER_ID,
    cash: {
      accountType: "cash",
      currencyCode: "ECO",
      balance: 9500,
    },
    summary: {
      cashBalance: 9500,
      holdingsMarketValue: 625,
      totalEquity: 10125,
      totalCostBasis: 500,
      unrealizedPnl: 125,
      realizedPnl: 30,
      positionsCount: 1,
    },
    holdings: [{
      stockAssetId: STOCK_ASSET_ID,
      ticker: "AURA",
      companyName: "Aurora Aerospace Systems",
      sector: "AI_AEROSPACE",
      countryCode: "SOLVEND",
      quantity: 5,
      averageCost: 100,
      currentPrice: 125,
      marketValue: 625,
      costBasis: 500,
      unrealizedPnl: 125,
      unrealizedPnlPct: 25,
      realizedPnl: 30,
    }],
  });
});

Deno.test("stock player read repository queries only requested game and player data", async () => {
  const client = new FakeClient({
    ...defaultTables(),
    stock_holdings: [
      holdingRow(),
      holdingRow({
        game_session_id: OTHER_SESSION_ID,
        player_session_id: OTHER_PLAYER_SESSION_ID,
        player_id: PLAYER_ID,
        stock_asset_id: OTHER_STOCK_ASSET_ID,
        ticker: "LEAK",
      }),
      holdingRow({
        player_id: OTHER_PLAYER_ID,
        stock_asset_id: OTHER_STOCK_ASSET_ID,
        ticker: "OTHR",
      }),
    ],
    game_session_stock_assets: [
      assetRow(),
      assetRow({
        id: OTHER_STOCK_ASSET_ID,
        game_session_id: OTHER_SESSION_ID,
        ticker: "LEAK",
        current_price: 999,
      }),
    ],
  });
  const repository = new SupabaseStockMarketPlayerReadRepository(client as any, {
    now: () => new Date("2026-06-24T00:00:00.000Z"),
  });
  const result = await repository.read({
    action: "read_holdings",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    limit: 100,
  });

  if (result.action !== "read_holdings") {
    throw new Error("Expected read_holdings result.");
  }

  assertEquals(result.holdings.map((holding) => holding.ticker), ["AURA"]);
  assertTableFilter(client, "player_sessions", "game_session_id", GAME_SESSION_ID);
  assertTableFilter(client, "player_sessions", "id", PLAYER_SESSION_ID);
  assertTableFilter(client, "stock_holdings", "game_session_id", GAME_SESSION_ID);
  assertTableFilter(client, "stock_holdings", "player_id", PLAYER_ID);
  assertTableFilter(client, "game_session_stock_assets", "game_session_id", GAME_SESSION_ID);
});

Deno.test("stock player read repository handles zero cost basis PnL percentage safely", async () => {
  const repository = repositoryWithTables({
    ...defaultTables(),
    stock_holdings: [holdingRow({ quantity: 2, average_cost: 0, realized_pnl: 0 })],
    game_session_stock_assets: [assetRow({ current_price: 25 })],
  });
  const result = await repository.read({
    action: "read_holdings",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    limit: 100,
  });

  if (result.action !== "read_holdings") {
    throw new Error("Expected read_holdings result.");
  }

  assertEquals(result.holdings[0].costBasis, 0);
  assertEquals(result.holdings[0].unrealizedPnl, 50);
  assertEquals(result.holdings[0].unrealizedPnlPct, 0);
});

Deno.test("stock player read repository maps orders newest-first and scoped", async () => {
  const repository = repositoryWithTables({
    ...defaultTables(),
    stock_orders: [
      orderRow({ id: ORDER_ID, created_at: "2026-06-24T00:00:00.000Z" }),
      orderRow({
        id: OTHER_ORDER_ID,
        created_at: "2026-06-24T00:05:00.000Z",
        side: "sell",
        quantity: 1,
        execution_price: 130,
        gross_value: 130,
        idempotency_key: "order-2",
      }),
      orderRow({
        id: "00000000-0000-4000-8000-000000000299",
        game_session_id: OTHER_SESSION_ID,
        player_session_id: PLAYER_SESSION_ID,
        created_at: "2026-06-24T00:10:00.000Z",
      }),
      orderRow({
        id: "00000000-0000-4000-8000-000000000298",
        player_session_id: OTHER_PLAYER_SESSION_ID,
        created_at: "2026-06-24T00:15:00.000Z",
      }),
    ],
  });
  const result = await repository.read({
    action: "read_orders",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    limit: 10,
  });

  if (result.action !== "read_orders") {
    throw new Error("Expected read_orders result.");
  }

  assertEquals(result.orders.map((order) => order.orderId), [
    OTHER_ORDER_ID,
    ORDER_ID,
  ]);
  assertEquals(result.orders[0], {
    orderId: OTHER_ORDER_ID,
    stockAssetId: STOCK_ASSET_ID,
    ticker: "AURA",
    side: "sell",
    quantity: 1,
    executionPrice: 130,
    grossValue: 130,
    status: "filled",
    rejectionReason: null,
    idempotencyKey: "order-2",
    createdAt: "2026-06-24T00:05:00.000Z",
  });
});

Deno.test("stock player read repository maps trades newest-first and scoped", async () => {
  const repository = repositoryWithTables({
    ...defaultTables(),
    stock_trades: [
      tradeRow({ id: TRADE_ID, created_at: "2026-06-24T00:00:00.000Z" }),
      tradeRow({
        id: OTHER_TRADE_ID,
        order_id: OTHER_ORDER_ID,
        created_at: "2026-06-24T00:05:00.000Z",
        side: "sell",
        quantity: 1,
        execution_price: 130,
        gross_value: 130,
      }),
      tradeRow({
        id: "00000000-0000-4000-8000-000000000399",
        game_session_id: OTHER_SESSION_ID,
        created_at: "2026-06-24T00:10:00.000Z",
      }),
      tradeRow({
        id: "00000000-0000-4000-8000-000000000398",
        player_session_id: OTHER_PLAYER_SESSION_ID,
        created_at: "2026-06-24T00:15:00.000Z",
      }),
    ],
  });
  const result = await repository.read({
    action: "read_trades",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    limit: 10,
  });

  if (result.action !== "read_trades") {
    throw new Error("Expected read_trades result.");
  }

  assertEquals(result.trades.map((trade) => trade.tradeId), [
    OTHER_TRADE_ID,
    TRADE_ID,
  ]);
  assertEquals(result.trades[0], {
    tradeId: OTHER_TRADE_ID,
    orderId: OTHER_ORDER_ID,
    stockAssetId: STOCK_ASSET_ID,
    ticker: "AURA",
    side: "sell",
    quantity: 1,
    executionPrice: 130,
    grossValue: 130,
    createdAt: "2026-06-24T00:05:00.000Z",
  });
});

Deno.test("stock player read repository maps missing and inactive player sessions", async () => {
  await assertRejectsWithCodeAndStatus(
    () =>
      repositoryWithTables({ ...defaultTables(), player_sessions: [] }).read({
        action: "read_portfolio",
        gameSessionId: GAME_SESSION_ID,
        playerSessionId: PLAYER_SESSION_ID,
        limit: 100,
      }),
    "player_session_not_found",
    404,
  );
  await assertRejectsWithCodeAndStatus(
    () =>
      repositoryWithTables({
        ...defaultTables(),
        player_sessions: [playerSessionRow({ status: "revoked", revoked_at: "2026-06-24T00:00:00.000Z" })],
      }).read({
        action: "read_portfolio",
        gameSessionId: GAME_SESSION_ID,
        playerSessionId: PLAYER_SESSION_ID,
        limit: 100,
      }),
    "invalid_player_session",
    409,
  );
});

Deno.test("stock player read repository maps schema errors", async () => {
  const client = new FakeClient(defaultTables());
  client.tableErrors.set("stock_holdings", {
    code: "42P01",
    message: "relation stock_holdings does not exist",
  });
  const repository = new SupabaseStockMarketPlayerReadRepository(client as any, {
    now: () => new Date("2026-06-24T00:00:00.000Z"),
  });

  await assertRejectsWithCodeAndStatus(
    () =>
      repository.read({
        action: "read_portfolio",
        gameSessionId: GAME_SESSION_ID,
        playerSessionId: PLAYER_SESSION_ID,
        limit: 100,
      }),
    "stock_market_player_read_schema_not_applied",
    500,
  );
});

function repositoryWithTables(
  tables: Record<string, readonly Record<string, unknown>[]>,
) {
  return new SupabaseStockMarketPlayerReadRepository(
    new FakeClient(tables) as any,
    { now: () => new Date("2026-06-24T00:00:00.000Z") },
  );
}

function defaultTables(): Record<string, readonly Record<string, unknown>[]> {
  return {
    player_sessions: [playerSessionRow()],
    account_balances: [cashRow()],
    stock_holdings: [holdingRow()],
    game_session_stock_assets: [assetRow()],
    stock_orders: [orderRow()],
    stock_trades: [tradeRow()],
  };
}

function playerSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAYER_SESSION_ID,
    game_session_id: GAME_SESSION_ID,
    player_id: PLAYER_ID,
    status: "active",
    expires_at: "2999-01-01T00:00:00.000Z",
    revoked_at: null,
    ...overrides,
  };
}

function cashRow(overrides: Record<string, unknown> = {}) {
  return {
    game_session_id: GAME_SESSION_ID,
    player_id: PLAYER_ID,
    account_type: "cash",
    balance: 9500,
    currency_code: "ECO",
    ...overrides,
  };
}

function holdingRow(overrides: Record<string, unknown> = {}) {
  return {
    game_session_id: GAME_SESSION_ID,
    player_session_id: PLAYER_SESSION_ID,
    player_id: PLAYER_ID,
    stock_asset_id: STOCK_ASSET_ID,
    ticker: "AURA",
    quantity: 5,
    average_cost: 100,
    realized_pnl: 30,
    ...overrides,
  };
}

function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: STOCK_ASSET_ID,
    game_session_id: GAME_SESSION_ID,
    ticker: "AURA",
    company_name: "Aurora Aerospace Systems",
    sector_key: "AI_AEROSPACE",
    country_code: "SOLVEND",
    current_price: 125,
    ...overrides,
  };
}

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    game_session_id: GAME_SESSION_ID,
    player_session_id: PLAYER_SESSION_ID,
    player_id: PLAYER_ID,
    stock_asset_id: STOCK_ASSET_ID,
    ticker: "AURA",
    side: "buy",
    quantity: 5,
    execution_price: 100,
    gross_value: 500,
    status: "filled",
    rejection_reason: null,
    idempotency_key: "order-1",
    created_at: "2026-06-24T00:00:00.000Z",
    ...overrides,
  };
}

function tradeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TRADE_ID,
    order_id: ORDER_ID,
    game_session_id: GAME_SESSION_ID,
    player_session_id: PLAYER_SESSION_ID,
    player_id: PLAYER_ID,
    stock_asset_id: STOCK_ASSET_ID,
    ticker: "AURA",
    side: "buy",
    quantity: 5,
    execution_price: 100,
    gross_value: 500,
    created_at: "2026-06-24T00:00:00.000Z",
    ...overrides,
  };
}

async function assertRejectsWithCodeAndStatus(
  run: () => Promise<unknown>,
  code: string,
  status: number,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof StockMarketPlayerReadError) {
      assertEquals(error.code, code);
      assertEquals(error.status, status);
      return;
    }

    throw error;
  }

  throw new Error(`Expected StockMarketPlayerReadError with code ${code}.`);
}

function assertTableFilter(
  client: FakeClient,
  tableName: string,
  column: string,
  value: unknown,
): void {
  const found = client.executedQueries.some((query) =>
    query.tableName === tableName &&
    query.filters.some((filter) =>
      filter.column === column && filter.value === value
    )
  );

  if (!found) {
    throw new Error(`Expected ${tableName} to filter ${column}.`);
  }
}

class FakeClient {
  readonly tableErrors = new Map<
    string,
    { readonly code?: string; readonly message: string }
  >();
  readonly executedQueries: QueryExecution[] = [];

  constructor(
    readonly tables: Record<string, readonly Record<string, unknown>[]>,
  ) {}

  from(tableName: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this, tableName);
  }
}

interface QueryExecution {
  readonly tableName: string;
  readonly filters: readonly { readonly column: string; readonly value: unknown }[];
  readonly inFilters: readonly {
    readonly column: string;
    readonly values: readonly unknown[];
  }[];
}

class FakeQueryBuilder
  implements PromiseLike<{ readonly data: unknown[] | null; readonly error: unknown }> {
  private readonly filters: { readonly column: string; readonly value: unknown }[] = [];
  private readonly inFilters: {
    readonly column: string;
    readonly values: readonly unknown[];
  }[] = [];
  private readonly orderings: { readonly column: string; readonly ascending: boolean }[] = [];
  private limitCount: number | null = null;

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

  then<TResult1 = { readonly data: unknown[] | null; readonly error: unknown }, TResult2 = never>(
    onfulfilled?: ((
      value: { readonly data: unknown[] | null; readonly error: unknown },
    ) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{
    readonly data: unknown[] | null;
    readonly error: unknown;
  }> {
    this.client.executedQueries.push({
      tableName: this.tableName,
      filters: [...this.filters],
      inFilters: [...this.inFilters],
    });

    const tableError = this.client.tableErrors.get(this.tableName);

    if (tableError) {
      return { data: null, error: tableError };
    }

    let rows = [...(this.client.tables[this.tableName] ?? [])];

    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }

    for (const filter of this.inFilters) {
      rows = rows.filter((row) => filter.values.includes(row[filter.column]));
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
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
