import {
  handlePlayerStockMarketTradingRequest,
} from "./playerStockMarketTradingHttpHandler.ts";
import {
  type StockMarketOrderExecuteInput,
  StockMarketTradingError,
  type StockMarketTradingRepository,
} from "../contracts/stockMarketTradingContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const OTHER_PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000012";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const STOCK_ASSET_ID = "00000000-0000-4000-8000-000000000101";
const ORDER_ID = "00000000-0000-4000-8000-000000000201";

Deno.test("player stock trading rejects missing player session token", async () => {
  const response = await handlePlayerStockMarketTradingRequest(
    request(orderBody(), { playerSessionToken: null }),
    dependencies(),
  );

  await assertErrorResponse(response, 401, "invalid_player_session");
});

Deno.test("player stock trading rejects invalid player session", async () => {
  const response = await handlePlayerStockMarketTradingRequest(
    request(orderBody()),
    dependencies({ client: new FakeClient({ ...tables(), player_sessions: [] }) }),
  );

  await assertErrorResponse(response, 401, "invalid_player_session");
});

Deno.test("player stock trading rejects revoked, expired, and inactive sessions", async () => {
  for (const session of [
    playerSession({ status: "revoked", revoked_at: "2026-06-24T00:00:00.000Z" }),
    playerSession({ expires_at: "2020-01-01T00:00:00.000Z" }),
    playerSession({ status: "expired" }),
  ]) {
    const response = await handlePlayerStockMarketTradingRequest(
      request(orderBody()),
      dependencies({ client: new FakeClient({ ...tables(), player_sessions: [session] }) }),
    );

    await assertErrorResponse(response, 401, "invalid_player_session");
  }
});

Deno.test("player stock trading rejects runner secret on player route", async () => {
  const response = await handlePlayerStockMarketTradingRequest(
    request(orderBody(), { runnerSecret: "runner-secret" }),
    dependencies(),
  );

  await assertErrorResponse(response, 400, "stock_runner_secret_not_allowed");
});

Deno.test("player stock trading rejects mismatched game session", async () => {
  const response = await handlePlayerStockMarketTradingRequest(
    request(orderBody({ gameSessionId: OTHER_GAME_SESSION_ID })),
    dependencies(),
  );

  await assertErrorResponse(response, 401, "invalid_player_session_scope");
});

Deno.test("player stock trading rejects body-supplied playerSessionId", async () => {
  for (const body of [
    orderBody({ playerSessionId: PLAYER_SESSION_ID }),
    orderBody({ playerSessionIds: [PLAYER_SESSION_ID] }),
  ]) {
    const response = await handlePlayerStockMarketTradingRequest(
      request(body),
      dependencies(),
    );

    await assertErrorResponse(response, 400, "invalid_stock_market_trading_request");
  }
});

Deno.test("player stock trading derives playerSessionId from authenticated session", async () => {
  const repository = new MockTradingRepository();
  const response = await handlePlayerStockMarketTradingRequest(
    request(orderBody()),
    dependencies({
      client: new FakeClient({
        ...tables(),
        player_sessions: [playerSession({ id: OTHER_PLAYER_SESSION_ID })],
      }),
      repository,
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(repository.inputs[0].playerSessionId, OTHER_PLAYER_SESSION_ID);
});

Deno.test("player stock trading rejects missing IDs and idempotency key", async () => {
  for (const body of [
    orderBody({ gameSessionId: undefined }),
    orderBody({ stockAssetId: undefined }),
    orderBody({ idempotencyKey: undefined }),
  ]) {
    const response = await handlePlayerStockMarketTradingRequest(
      request(body),
      dependencies(),
    );

    await assertErrorResponse(response, 400, "invalid_stock_market_trading_request");
  }
});

Deno.test("player stock trading rejects array-shaped IDs", async () => {
  for (const body of [
    orderBody({ gameSessionId: [GAME_SESSION_ID] }),
    orderBody({ stockAssetId: [STOCK_ASSET_ID] }),
    orderBody({ idempotencyKey: ["order-1"] }),
  ]) {
    const response = await handlePlayerStockMarketTradingRequest(
      request(body),
      dependencies(),
    );

    await assertErrorResponse(response, 400, "invalid_stock_market_trading_request");
  }
});

Deno.test("player stock trading rejects invalid side and quantity", async () => {
  const invalidSide = await handlePlayerStockMarketTradingRequest(
    request(orderBody({ side: "hold" })),
    dependencies(),
  );
  const invalidQuantity = await handlePlayerStockMarketTradingRequest(
    request(orderBody({ quantity: 0 })),
    dependencies(),
  );

  await assertErrorResponse(invalidSide, 400, "invalid_stock_market_trading_request");
  await assertErrorResponse(invalidQuantity, 400, "invalid_stock_market_trading_request");
});

Deno.test("player stock trading executes buy through repository and returns country cash currency", async () => {
  const repository = new MockTradingRepository();
  const response = await handlePlayerStockMarketTradingRequest(
    request(orderBody({ side: "BUY", quantity: 3 })),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(repository.inputs, [{
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    stockAssetId: STOCK_ASSET_ID,
    side: "buy",
    quantity: 3,
    idempotencyKey: "order-1",
  }]);
  assertEquals(body, {
    ok: true,
    action: "execute_order",
    order: {
      orderId: ORDER_ID,
      gameSessionId: GAME_SESSION_ID,
      playerSessionId: PLAYER_SESSION_ID,
      stockAssetId: STOCK_ASSET_ID,
      ticker: "AURA",
      side: "buy",
      quantity: 3,
      executionPrice: 100,
      grossValue: 300,
      status: "filled",
      rejectionReason: null,
    },
    cash: {
      accountType: "cash",
      currencyCode: "XAL",
      balance: 9700,
    },
    holding: {
      quantity: 3,
      averageCost: 100,
    },
  });
});

Deno.test("player stock trading executes sell through repository", async () => {
  const repository = new MockTradingRepository();
  const response = await handlePlayerStockMarketTradingRequest(
    request(orderBody({ side: "sell", quantity: 2 })),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(repository.inputs[0].side, "sell");
  assertEquals(body.order.side, "sell");
  assertEquals(body.cash.currencyCode, "XAL");
});

Deno.test("player stock trading maps repository errors", async () => {
  const response = await handlePlayerStockMarketTradingRequest(
    request(orderBody()),
    dependencies({
      repository: new MockTradingRepository(
        new StockMarketTradingError(
          "insufficient_cash",
          "Insufficient player cash for this stock order.",
          409,
        ),
      ),
    }),
  );

  await assertErrorResponse(response, 409, "insufficient_cash");
});

Deno.test("player stock trading does not call direct service writes or RPCs in handler", async () => {
  const client = new FakeClient(tables());
  const repository = new MockTradingRepository();
  const response = await handlePlayerStockMarketTradingRequest(
    request(orderBody()),
    dependencies({ client, repository }),
  );

  assertEquals(response.status, 200);
  assertEquals(client.forbiddenCalls, []);
  assertEquals(repository.inputs.length, 1);
});

function dependencies(options: {
  readonly client?: FakeClient;
  readonly repository?: StockMarketTradingRepository;
} = {}): any {
  const client = options.client ?? new FakeClient(tables());
  const repository = options.repository ?? new MockTradingRepository();

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
    createRepository: () => repository,
  };
}

function request(
  body: Record<string, unknown>,
  options: {
    readonly playerSessionToken?: string | null;
    readonly runnerSecret?: string;
  } = {},
): Request {
  const headers = new Headers({ "content-type": "application/json" });

  if (options.playerSessionToken !== null) {
    headers.set("x-player-session-token", options.playerSessionToken ?? "player-token");
  }

  if (options.runnerSecret) {
    headers.set("x-stock-market-runner-secret", options.runnerSecret);
  }

  return new Request("https://example.test/players/me/stocks/orders", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function orderBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const body = {
    gameSessionId: GAME_SESSION_ID,
    stockAssetId: STOCK_ASSET_ID,
    side: "buy",
    quantity: 3,
    idempotencyKey: "order-1",
    ...overrides,
  };

  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) {
      delete body[key as keyof typeof body];
    }
  }

  return body;
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

class MockTradingRepository implements StockMarketTradingRepository {
  readonly inputs: StockMarketOrderExecuteInput[] = [];

  constructor(private readonly error: StockMarketTradingError | null = null) {}

  async executeOrder(input: StockMarketOrderExecuteInput) {
    this.inputs.push(input);

    if (this.error) {
      throw this.error;
    }

    return {
      order: {
        orderId: ORDER_ID,
        gameSessionId: input.gameSessionId,
        playerSessionId: input.playerSessionId,
        stockAssetId: input.stockAssetId,
        ticker: "AURA",
        side: input.side,
        quantity: input.quantity,
        executionPrice: 100,
        grossValue: input.quantity * 100,
        status: "filled" as const,
        rejectionReason: null,
      },
      cash: {
        accountType: "cash" as const,
        currencyCode: "XAL",
        balance: input.side === "buy" ? 9700 : 10200,
      },
      holding: {
        quantity: input.side === "buy" ? input.quantity : 0,
        averageCost: input.side === "buy" ? 100 : 0,
      },
    };
  }
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

    return { data: rows, error: null };
  }
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
