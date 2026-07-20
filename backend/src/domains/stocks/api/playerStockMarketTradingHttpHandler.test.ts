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
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const STOCK_ASSET_ID = "00000000-0000-4000-8000-000000000101";
const ORDER_ID = "00000000-0000-4000-8000-000000000201";

Deno.test("player stock trading rejects unsupported methods and missing player session token", async () => {
  const method = await handlePlayerStockMarketTradingRequest(
    request(orderBody(), { method: "GET" }),
    dependencies(),
  );
  await assertErrorResponse(method, 405, "method_not_allowed");

  const missing = await handlePlayerStockMarketTradingRequest(
    request(orderBody(), { playerSessionToken: null }),
    dependencies(),
  );
  await assertErrorResponse(missing, 401, "invalid_player_session");
});

Deno.test("player stock trading rejects invalid sessions and runner secrets", async () => {
  const invalid = await handlePlayerStockMarketTradingRequest(
    request(orderBody()),
    dependencies({
      resolvePlayerSession: () => Promise.resolve({
        ok: false as const,
        status: 401,
        error: {
          code: "invalid_player_session",
          message: "Player session is invalid.",
          retryable: false,
        },
      }),
    }),
  );
  await assertErrorResponse(invalid, 401, "invalid_player_session");

  const secret = await handlePlayerStockMarketTradingRequest(
    request(orderBody(), { runnerSecret: "runner-secret" }),
    dependencies(),
  );
  await assertErrorResponse(secret, 400, "stock_runner_secret_not_allowed");
});

Deno.test("player stock trading rejects private scope injection", async () => {
  for (const body of [
    orderBody({ gameSessionId: GAME_SESSION_ID }),
    orderBody({ playerSessionId: PLAYER_SESSION_ID }),
    orderBody({ playerId: PLAYER_ID }),
    orderBody({ stockAssetId: STOCK_ASSET_ID }),
  ]) {
    const response = await handlePlayerStockMarketTradingRequest(
      request(body),
      dependencies(),
    );
    await assertErrorResponse(
      response,
      400,
      "invalid_stock_market_trading_request",
    );
  }
});

Deno.test("player stock trading validates ticker, reviewed price, side, quantity, and idempotency", async () => {
  for (const body of [
    orderBody({ ticker: undefined }),
    orderBody({ ticker: "bad ticker" }),
    orderBody({ expectedPrice: undefined }),
    orderBody({ expectedPrice: 0 }),
    orderBody({ side: "hold" }),
    orderBody({ quantity: 0 }),
    orderBody({ quantity: 1.5 }),
    orderBody({ idempotencyKey: undefined }),
    orderBody({ ticker: ["AURA"] }),
  ]) {
    const response = await handlePlayerStockMarketTradingRequest(
      request(body),
      dependencies(),
    );
    await assertErrorResponse(
      response,
      400,
      "invalid_stock_market_trading_request",
    );
  }
});

Deno.test("player stock trading resolves the public ticker inside authenticated game scope", async () => {
  const repository = new MockTradingRepository();
  const resolved: unknown[] = [];
  const response = await handlePlayerStockMarketTradingRequest(
    request(orderBody({ ticker: "aura", side: "BUY", quantity: 3 })),
    dependencies({
      repository,
      resolveStockAssetByTicker: async (_client, gameSessionId, ticker) => {
        resolved.push({ gameSessionId, ticker });
        return {
          stockAssetId: STOCK_ASSET_ID,
          ticker: "AURA",
          currentPrice: 100,
        };
      },
    }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(resolved, [{ gameSessionId: GAME_SESSION_ID, ticker: "AURA" }]);
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
  assertNoUuid(body);
});

Deno.test("player stock trading rejects stale reviewed prices before repository execution", async () => {
  const repository = new MockTradingRepository();
  const response = await handlePlayerStockMarketTradingRequest(
    request(orderBody({ expectedPrice: 99 })),
    dependencies({ repository }),
  );

  await assertErrorResponse(response, 409, "stale_stock_price");
  assertEquals(repository.inputs, []);
});

Deno.test("player stock trading preserves repository rejection states", async () => {
  for (const error of [
    new StockMarketTradingError(
      "stock_market_closed",
      "Stock market is closed.",
      409,
    ),
    new StockMarketTradingError(
      "insufficient_cash",
      "Insufficient player cash for this stock order.",
      409,
    ),
    new StockMarketTradingError(
      "insufficient_shares",
      "Insufficient stock holdings for this sell order.",
      409,
    ),
    new StockMarketTradingError(
      "invalid_stock_market_trading_state",
      "Game mutations are paused.",
      409,
    ),
  ]) {
    const response = await handlePlayerStockMarketTradingRequest(
      request(orderBody()),
      dependencies({ repository: new MockTradingRepository(error) }),
    );
    await assertErrorResponse(response, error.status, error.code);
  }
});

function dependencies(options: {
  readonly repository?: StockMarketTradingRepository;
  readonly resolvePlayerSession?: () => Promise<any>;
  readonly resolveStockAssetByTicker?: (
    client: unknown,
    gameSessionId: string,
    ticker: string,
  ) => Promise<{
    readonly stockAssetId: string;
    readonly ticker: string;
    readonly currentPrice: number;
  }>;
} = {}): any {
  const repository = options.repository ?? new MockTradingRepository();
  return {
    createServiceClient: () => ({}),
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service-role",
      },
    }),
    hashSessionToken: async () => "session-token-hash",
    resolvePlayerSession: options.resolvePlayerSession ?? (() => Promise.resolve({
      ok: true as const,
      session: {
        id: PLAYER_SESSION_ID,
        game_session_id: GAME_SESSION_ID,
        player_id: PLAYER_ID,
      },
    })),
    resolveStockAssetByTicker: options.resolveStockAssetByTicker ??
      (async (_client: unknown, gameSessionId: string, ticker: string) => {
        assertEquals(gameSessionId, GAME_SESSION_ID);
        assertEquals(ticker, "AURA");
        return {
          stockAssetId: STOCK_ASSET_ID,
          ticker: "AURA",
          currentPrice: 100,
        };
      }),
    createRepository: () => repository,
  };
}

function request(
  body: Record<string, unknown>,
  options: {
    readonly method?: string;
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
    method: options.method ?? "POST",
    headers,
    body: options.method === "GET" ? undefined : JSON.stringify(body),
  });
}

function orderBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ticker: "AURA",
    expectedPrice: 100,
    side: "buy",
    quantity: 3,
    idempotencyKey: "order-1",
    ...overrides,
  };
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) delete body[key];
  }
  return body;
}

class MockTradingRepository implements StockMarketTradingRepository {
  readonly inputs: StockMarketOrderExecuteInput[] = [];

  constructor(private readonly error: StockMarketTradingError | null = null) {}

  async executeOrder(input: StockMarketOrderExecuteInput) {
    this.inputs.push(input);
    if (this.error) throw this.error;
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

async function assertErrorResponse(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  const body = await response.json();
  assertEquals(response.status, status);
  assertEquals(body.error.code, code);
}

function assertNoUuid(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
      .test(serialized)
  ) {
    throw new Error(`UUID leaked: ${serialized}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
