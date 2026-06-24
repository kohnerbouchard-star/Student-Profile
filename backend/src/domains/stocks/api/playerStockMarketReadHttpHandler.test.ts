import {
  handlePlayerStockMarketReadRequest,
} from "./playerStockMarketReadHttpHandler.ts";
import type {
  StockMarketPlayerReadAction,
} from "../contracts/stockMarketPlayerReadContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const STOCK_ASSET_ID = "00000000-0000-4000-8000-000000000101";
const ORDER_ID = "00000000-0000-4000-8000-000000000201";
const OTHER_ORDER_ID = "00000000-0000-4000-8000-000000000202";
const TRADE_ID = "00000000-0000-4000-8000-000000000301";
const OTHER_TRADE_ID = "00000000-0000-4000-8000-000000000302";

Deno.test("player stock read rejects missing player session", async () => {
  const response = await handlePlayerStockMarketReadRequest(
    request("read_portfolio", { authToken: null }),
    "read_portfolio",
    dependencies(),
  );

  await assertErrorResponse(response, 401, "invalid_player_session");
});

Deno.test("player stock read rejects invalid player session", async () => {
  const response = await handlePlayerStockMarketReadRequest(
    request("read_portfolio"),
    "read_portfolio",
    dependencies({
      resolvePlayerSession: async () => ({
        ok: false as const,
        status: 401,
        error: {
          code: "invalid_player_session",
          message: "Player session is invalid or expired.",
          retryable: false,
        },
      }),
    }),
  );

  await assertErrorResponse(response, 401, "invalid_player_session");
});

Deno.test("player stock read rejects revoked, expired, and inactive sessions", async () => {
  for (const session of [
    playerSession({ status: "revoked", revoked_at: "2026-06-24T00:00:00.000Z" }),
    playerSession({ expires_at: "2020-01-01T00:00:00.000Z" }),
    playerSession({ status: "expired" }),
  ]) {
    const response = await handlePlayerStockMarketReadRequest(
      request("read_portfolio"),
      "read_portfolio",
      dependencies({ client: new FakeClient({ ...tables(), player_sessions: [session] }) }),
    );

    await assertErrorResponse(response, 401, "invalid_player_session");
  }
});

Deno.test("player stock read rejects mismatched game session", async () => {
  const response = await handlePlayerStockMarketReadRequest(
    request("read_portfolio", { gameSessionId: OTHER_GAME_SESSION_ID }),
    "read_portfolio",
    dependencies(),
  );

  await assertErrorResponse(response, 401, "invalid_player_session_scope");
});

Deno.test("player stock read rejects missing game or player session query", async () => {
  const missingGame = await handlePlayerStockMarketReadRequest(
    request("read_portfolio", { omitGameSessionId: true }),
    "read_portfolio",
    dependencies(),
  );
  const missingPlayer = await handlePlayerStockMarketReadRequest(
    request("read_portfolio", { omitPlayerSessionId: true }),
    "read_portfolio",
    dependencies(),
  );

  await assertErrorResponse(missingGame, 400, "invalid_player_stock_read_request");
  await assertErrorResponse(missingPlayer, 400, "invalid_player_stock_read_request");
});

Deno.test("player stock read rejects array-shaped or multiple session ids", async () => {
  const multipleGame = await handlePlayerStockMarketReadRequest(
    request("read_portfolio", { extraQuery: `gameSessionId=${GAME_SESSION_ID}` }),
    "read_portfolio",
    dependencies(),
  );
  const multiplePlayer = await handlePlayerStockMarketReadRequest(
    request("read_portfolio", { extraQuery: `playerSessionId=${PLAYER_SESSION_ID}` }),
    "read_portfolio",
    dependencies(),
  );

  await assertErrorResponse(multipleGame, 400, "invalid_player_stock_read_request");
  await assertErrorResponse(multiplePlayer, 400, "invalid_player_stock_read_request");
});

Deno.test("player stock read rejects invalid limits", async () => {
  const zero = await handlePlayerStockMarketReadRequest(
    request("read_orders", { limit: "0" }),
    "read_orders",
    dependencies(),
  );
  const decimal = await handlePlayerStockMarketReadRequest(
    request("read_trades", { limit: "1.5" }),
    "read_trades",
    dependencies(),
  );

  await assertErrorResponse(zero, 400, "invalid_player_stock_read_request");
  await assertErrorResponse(decimal, 400, "invalid_player_stock_read_request");
});

Deno.test("player stock read does not require or accept the runner secret", async () => {
  const withoutSecret = await handlePlayerStockMarketReadRequest(
    request("read_portfolio"),
    "read_portfolio",
    dependencies(),
  );
  const withSecret = await handlePlayerStockMarketReadRequest(
    request("read_portfolio", { runnerSecret: "runner-secret" }),
    "read_portfolio",
    dependencies(),
  );

  assertEquals(withoutSecret.status, 200);
  await assertErrorResponse(withSecret, 400, "stock_runner_secret_not_allowed");
});

Deno.test("player stock read returns portfolio DTO through the player-safe route", async () => {
  const response = await handlePlayerStockMarketReadRequest(
    request("read_portfolio"),
    "read_portfolio",
    dependencies(),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, {
    ok: true,
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
    holdings: [holdingDto()],
  });
});

Deno.test("player stock read returns holdings DTO through the player-safe route", async () => {
  const response = await handlePlayerStockMarketReadRequest(
    request("read_holdings"),
    "read_holdings",
    dependencies(),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.action, "read_holdings");
  assertEquals(body.holdings, [holdingDto()]);
  assertEquals(body.cash.balance, 9500);
  assertEquals(body.summary.totalEquity, 10125);
});

Deno.test("player stock read returns orders newest-first through the player-safe route", async () => {
  const response = await handlePlayerStockMarketReadRequest(
    request("read_orders", { limit: "50" }),
    "read_orders",
    dependencies(),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, {
    ok: true,
    action: "read_orders",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    playerId: PLAYER_ID,
    orders: [
      {
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
      },
      {
        orderId: ORDER_ID,
        stockAssetId: STOCK_ASSET_ID,
        ticker: "AURA",
        side: "buy",
        quantity: 5,
        executionPrice: 100,
        grossValue: 500,
        status: "filled",
        rejectionReason: null,
        idempotencyKey: "order-1",
        createdAt: "2026-06-24T00:00:00.000Z",
      },
    ],
  });
});

Deno.test("player stock read returns trades newest-first through the player-safe route", async () => {
  const response = await handlePlayerStockMarketReadRequest(
    request("read_trades"),
    "read_trades",
    dependencies(),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.trades.map((trade: { readonly tradeId: string }) => trade.tradeId), [
    OTHER_TRADE_ID,
    TRADE_ID,
  ]);
  assertEquals(body.trades[0], {
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

Deno.test("player stock read stays read-only", async () => {
  const client = new FakeClient(tables());
  const response = await handlePlayerStockMarketReadRequest(
    request("read_portfolio"),
    "read_portfolio",
    dependencies({ client }),
  );

  assertEquals(response.status, 200);
  assertEquals(client.forbiddenCalls, []);
});

function dependencies(options: {
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

function request(
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
    `https://example.test/players/me/stocks/${pathByAction[action]}?${query}${suffix}`,
    { method: "GET", headers },
  );
}

function tables(): Record<string, readonly Record<string, unknown>[]> {
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
      account_type: "cash",
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

function playerSession(overrides: Record<string, unknown> = {}) {
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

function holdingDto() {
  return {
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
  };
}

class FakeClient {
  readonly forbiddenCalls: string[] = [];

  constructor(
    readonly tables: Record<string, readonly Record<string, unknown>[]>,
  ) {}

  from(tableName: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this, tableName);
  }

  async rpc(functionName: string) {
    this.forbiddenCalls.push(`rpc:${functionName}`);
    return { data: null, error: { message: `Unexpected RPC ${functionName}` } };
  }
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

async function assertErrorResponse(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  const body = await response.json();

  assertEquals(response.status, status);
  assertEquals(body.error.code, code);
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
