import { SupabaseStockMarketPlayerReadRepository } from "./supabaseStockMarketPlayerReadRepository.ts";
import { StockMarketPlayerReadError } from "../contracts/stockMarketPlayerReadContracts.ts";

export const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";

export const OTHER_SESSION_ID = "00000000-0000-4000-8000-000000000002";

export const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";

export const OTHER_PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000012";

export const PLAYER_ID = "00000000-0000-4000-8000-000000000021";

export const OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000022";

export const STOCK_ASSET_ID = "00000000-0000-4000-8000-000000000101";

export const OTHER_STOCK_ASSET_ID = "00000000-0000-4000-8000-000000000102";

export const ORDER_ID = "00000000-0000-4000-8000-000000000201";

export const OTHER_ORDER_ID = "00000000-0000-4000-8000-000000000202";

export const TRADE_ID = "00000000-0000-4000-8000-000000000301";

export const OTHER_TRADE_ID = "00000000-0000-4000-8000-000000000302";

export function repositoryWithTables(
  tables: Record<string, readonly Record<string, unknown>[]>,
) {
  return new SupabaseStockMarketPlayerReadRepository(
    new FakeClient(tables) as any,
    { now: () => new Date("2026-06-24T00:00:00.000Z") },
  );
}

export function defaultTables(): Record<string, readonly Record<string, unknown>[]> {
  return {
    player_sessions: [playerSessionRow()],
    account_balances: [cashRow()],
    stock_holdings: [holdingRow()],
    game_session_stock_assets: [assetRow()],
    stock_orders: [orderRow()],
    stock_trades: [tradeRow()],
  };
}

export function playerSessionRow(overrides: Record<string, unknown> = {}) {
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

export function cashRow(overrides: Record<string, unknown> = {}) {
  return {
    game_session_id: GAME_SESSION_ID,
    player_id: PLAYER_ID,
    account_type: "checking",
    balance: 9500,
    currency_code: "ECO",
    ...overrides,
  };
}

export function holdingRow(overrides: Record<string, unknown> = {}) {
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

export function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: STOCK_ASSET_ID,
    game_session_id: GAME_SESSION_ID,
    ticker: "AURA",
    company_name: "Aurora Aerospace Systems",
    sector_key: "AI_AEROSPACE",
    country_code: "SOLVEND",
    listing_currency_code: "ECO",
    current_price: 125,
    ...overrides,
  };
}

export function orderRow(overrides: Record<string, unknown> = {}) {
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

export function tradeRow(overrides: Record<string, unknown> = {}) {
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

export async function assertRejectsWithCodeAndStatus(
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

export function assertTableFilter(
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

export class FakeClient {
  readonly rpcCalls: { functionName: string; args: Record<string, string> }[] =
    [];
  async rpc(functionName: string, args: Record<string, string>) {
    this.rpcCalls.push({ functionName, args });
    assertEquals(functionName, "read_player_stock_positions_v1");
    return {
      data: (this.tables.stock_holdings ?? []).filter((r) =>
        r.game_session_id === args.p_game_session_id &&
        r.player_id === args.p_player_id
      ),
      error: this.tableErrors.get("stock_holdings") ?? null,
    };
  }
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

export interface QueryExecution {
  readonly tableName: string;
  readonly filters: readonly {
    readonly column: string;
    readonly value: unknown;
  }[];
  readonly inFilters: readonly {
    readonly column: string;
    readonly values: readonly unknown[];
  }[];
}

export class FakeQueryBuilder
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
        const comparison = compareValues(
          left[ordering.column],
          right[ordering.column],
        );
        return ordering.ascending ? comparison : -comparison;
      });
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return { data: rows, error: null };
  }
}

export function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right));
}

export function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
