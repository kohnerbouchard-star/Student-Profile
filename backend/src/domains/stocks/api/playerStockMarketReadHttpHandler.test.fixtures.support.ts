import type { StockMarketPlayerReadAction } from "../contracts/stockMarketPlayerReadContracts.ts";

export const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";

export const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";

export const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";

export const PLAYER_ID = "00000000-0000-4000-8000-000000000021";

export const STOCK_ASSET_ID = "00000000-0000-4000-8000-000000000101";

export const ORDER_ID = "00000000-0000-4000-8000-000000000201";

export const OTHER_ORDER_ID = "00000000-0000-4000-8000-000000000202";

export const TRADE_ID = "00000000-0000-4000-8000-000000000301";

export const OTHER_TRADE_ID = "00000000-0000-4000-8000-000000000302";

export function dependencies(options: {
  readonly client?: FakeClient;
  readonly resolvePlayerSession?: (
    serviceClient: any,
    sessionTokenHash: string,
  ) => Promise<
    | {
      readonly ok: true;
      readonly session: {
        readonly id: string;
        readonly game_session_id: string;
        readonly player_id: string;
      };
    }
    | {
      readonly ok: false;
      readonly status: number;
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly retryable: boolean;
      };
    }
  >;
} = {}): any {
  const client = options.client ?? new FakeClient(tables());

  return {
    createServiceClient: () => client as any,
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service-role",
      },
    }),
    hashSessionToken: async () => "session-token-hash",
    resolvePlayerSession: options.resolvePlayerSession,
  };
}

export function request(
  action: StockMarketPlayerReadAction,
  options: {
    readonly authToken?: string | null;
    readonly gameSessionId?: string;
    readonly playerSessionId?: string;
    readonly limit?: string;
    readonly runnerSecret?: string;
    readonly extraQuery?: string;
    readonly omitGameSessionId?: boolean;
    readonly omitPlayerSessionId?: boolean;
  } = {},
): Request {
  const pathByAction: Record<StockMarketPlayerReadAction, string> = {
    read_portfolio: "portfolio",
    read_holdings: "holdings",
    read_orders: "orders",
    read_trades: "trades",
  };
  const query = new URLSearchParams();

  if (!options.omitGameSessionId) {
    query.set("gameSessionId", options.gameSessionId ?? GAME_SESSION_ID);
  }

  if (!options.omitPlayerSessionId) {
    query.set("playerSessionId", options.playerSessionId ?? PLAYER_SESSION_ID);
  }

  if (options.limit) {
    query.set("limit", options.limit);
  }

  const suffix = options.extraQuery ? `&${options.extraQuery}` : "";
  const headers = new Headers();

  if (options.authToken !== null) {
    headers.set("authorization", "Bearer supabase-jwt-for-gateway");
    headers.set("x-player-session-token", options.authToken ?? "player-token");
  }

  if (options.runnerSecret) {
    headers.set("x-stock-market-runner-secret", options.runnerSecret);
  }

  return new Request(
    `https://example.test/players/me/stocks/${
      pathByAction[action]
    }?${query}${suffix}`,
    { method: "GET", headers },
  );
}

export function tables(): Record<string, readonly Record<string, unknown>[]> {
  return {
    player_sessions: [playerSession()],
    game_sessions: [{
      id: GAME_SESSION_ID,
      name: "Period 1",
      status: "active",
    }],
    players: [{
      id: PLAYER_ID,
      game_session_id: GAME_SESSION_ID,
      display_name: "Avery",
      roster_label: "A-1",
      status: "active",
    }],
    account_balances: [{
      game_session_id: GAME_SESSION_ID,
      player_id: PLAYER_ID,
      account_type: "checking",
      balance: 9500,
      currency_code: "ECO",
    }],
    stock_holdings: [{
      game_session_id: GAME_SESSION_ID,
      player_session_id: PLAYER_SESSION_ID,
      player_id: PLAYER_ID,
      stock_asset_id: STOCK_ASSET_ID,
      ticker: "AURA",
      quantity: 5,
      average_cost: 100,
      realized_pnl: 30,
    }],
    game_session_stock_assets: [{
      listing_currency_code: "ECO",
      id: STOCK_ASSET_ID,
      game_session_id: GAME_SESSION_ID,
      ticker: "AURA",
      company_name: "Aurora Aerospace Systems",
      sector_key: "AI_AEROSPACE",
      country_code: "SOLVEND",
      current_price: 125,
    }],
    stock_orders: [
      orderRow(),
      orderRow({
        id: OTHER_ORDER_ID,
        side: "sell",
        quantity: 1,
        execution_price: 130,
        gross_value: 130,
        idempotency_key: "order-2",
        created_at: "2026-06-24T00:05:00.000Z",
      }),
    ],
    stock_trades: [
      tradeRow(),
      tradeRow({
        id: OTHER_TRADE_ID,
        order_id: OTHER_ORDER_ID,
        side: "sell",
        quantity: 1,
        execution_price: 130,
        gross_value: 130,
        created_at: "2026-06-24T00:05:00.000Z",
      }),
    ],
  };
}

export function playerSession(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAYER_SESSION_ID,
    game_session_id: GAME_SESSION_ID,
    player_id: PLAYER_ID,
    session_token_hash: "session-token-hash",
    status: "active",
    expires_at: "2999-01-01T00:00:00.000Z",
    revoked_at: null,
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

export function holdingDto() {
  return {
    stockAssetId: STOCK_ASSET_ID,
    ticker: "AURA",
    companyName: "Aurora Aerospace Systems",
    sector: "AI_AEROSPACE",
    countryCode: "SOLVEND",
    currencyCode: "ECO",
    quantity: 5,
    averageCost: 100,
    currentPrice: 125,
    marketValue: 625,
    costBasis: 500,
    unrealizedPnl: 125,
    unrealizedPnlPct: 25,
    realizedPnl: 30,
  };
}

export class FakeClient {
  readonly forbiddenCalls: string[] = [];

  constructor(
    readonly tables: Record<string, readonly Record<string, unknown>[]>,
  ) {}

  from(tableName: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this, tableName);
  }

  async rpc(functionName: string, args: Record<string, unknown> = {}) {
    if (functionName === "read_player_stock_positions_v1") {
      return {
        data: (this.tables.stock_holdings ?? []).filter((row) =>
          row.game_session_id === args.p_game_session_id &&
          row.player_id === args.p_player_id
        ),
        error: null,
      };
    }
    this.forbiddenCalls.push(`rpc:${functionName}`);
    return { data: null, error: { message: `Unexpected RPC ${functionName}` } };
  }
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

  insert(): FakeQueryBuilder {
    this.client.forbiddenCalls.push(`insert:${this.tableName}`);
    return this;
  }

  update(): FakeQueryBuilder {
    this.client.forbiddenCalls.push(`update:${this.tableName}`);
    return this;
  }

  delete(): FakeQueryBuilder {
    this.client.forbiddenCalls.push(`delete:${this.tableName}`);
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

  async maybeSingle() {
    const result = await this.execute();
    return { data: result.data?.[0] ?? null, error: result.error };
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

export async function assertErrorResponse(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  const body = await response.json();

  assertEquals(response.status, status);
  assertEquals(body.error.code, code);
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
