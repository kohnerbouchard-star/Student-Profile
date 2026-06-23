import {
  handleStockMarketTradingRequest,
} from "./stockMarketTradingHttpHandler.ts";
import type {
  StockMarketOrderExecuteInput,
  StockMarketTradingRepository,
} from "../contracts/stockMarketTradingContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const STOCK_ASSET_ID = "00000000-0000-4000-8000-000000000101";
const SECRET = "runner-secret";

Deno.test("stock trading rejects non-POST requests", async () => {
  const response = await handleStockMarketTradingRequest(
    new Request("https://example.test/stock-market-trading", { method: "GET" }),
    dependencies(),
  );

  assertEquals(response.status, 405);
});

Deno.test("stock trading rejects missing configured secret", async () => {
  const response = await handleStockMarketTradingRequest(
    request(executeBody(), SECRET),
    dependencies({ readRunnerSecret: () => undefined }),
  );
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body.error.code, "stock_market_runner_secret_not_configured");
});

Deno.test("stock trading rejects missing or invalid request secret", async () => {
  const missing = await handleStockMarketTradingRequest(
    request(executeBody()),
    dependencies(),
  );
  const invalid = await handleStockMarketTradingRequest(
    request(executeBody(), "wrong"),
    dependencies(),
  );

  assertEquals(missing.status, 401);
  assertEquals(invalid.status, 401);
});

Deno.test("stock trading rejects invalid action", async () => {
  const response = await handleStockMarketTradingRequest(
    request({ ...executeBody(), action: "initialize_portfolio" }, SECRET),
    dependencies(),
  );

  assertEquals(response.status, 400);
});

Deno.test("stock trading rejects missing gameSessionId or playerSessionId", async () => {
  const missingGame = await handleStockMarketTradingRequest(
    request({
      action: "execute_order",
      playerSessionId: PLAYER_SESSION_ID,
      stockAssetId: STOCK_ASSET_ID,
      side: "buy",
      quantity: 5,
      idempotencyKey: "order-1",
    }, SECRET),
    dependencies(),
  );
  const missingPlayer = await handleStockMarketTradingRequest(
    request(
      {
        action: "execute_order",
        gameSessionId: GAME_SESSION_ID,
        stockAssetId: STOCK_ASSET_ID,
        side: "buy",
        quantity: 5,
        idempotencyKey: "order-1",
      },
      SECRET,
    ),
    dependencies(),
  );
  const multiple = await handleStockMarketTradingRequest(
    request({
      ...executeBody(),
      gameSessionIds: [GAME_SESSION_ID],
    }, SECRET),
    dependencies(),
  );

  assertEquals(missingGame.status, 400);
  assertEquals(missingPlayer.status, 400);
  assertEquals(multiple.status, 400);
});

Deno.test("stock trading rejects invalid side", async () => {
  const response = await handleStockMarketTradingRequest(
    request({ ...executeBody(), side: "hold" }, SECRET),
    dependencies(),
  );

  assertEquals(response.status, 400);
});

Deno.test("stock trading rejects invalid quantity", async () => {
  const response = await handleStockMarketTradingRequest(
    request({ ...executeBody(), quantity: 0 }, SECRET),
    dependencies(),
  );

  assertEquals(response.status, 400);
});

Deno.test("stock trading routes execute_order", async () => {
  const repository = new MockTradingRepository();
  const response = await handleStockMarketTradingRequest(
    request(executeBody({ side: "SELL", quantity: 3 }), SECRET),
    dependencies({ repository }),
  );

  assertEquals(response.status, 200);
  assertEquals(repository.executeInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    stockAssetId: STOCK_ASSET_ID,
    side: "sell",
    quantity: 3,
    idempotencyKey: "order-1",
  });
});

Deno.test("stock trading returns execute success response shape with actual cash", async () => {
  const response = await handleStockMarketTradingRequest(
    request(executeBody(), SECRET),
    dependencies(),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, {
    ok: true,
    action: "execute_order",
    order: {
      orderId: "00000000-0000-4000-8000-000000000201",
      gameSessionId: GAME_SESSION_ID,
      playerSessionId: PLAYER_SESSION_ID,
      stockAssetId: STOCK_ASSET_ID,
      ticker: "AURA",
      side: "buy",
      quantity: 5,
      executionPrice: 100,
      grossValue: 500,
      status: "filled",
      rejectionReason: null,
    },
    cash: {
      accountType: "cash",
      currencyCode: "ECO",
      balance: 9500,
    },
    holding: {
      quantity: 5,
      averageCost: 100,
    },
  });
});

function dependencies(options: {
  readonly repository?: StockMarketTradingRepository;
  readonly readRunnerSecret?: () => string | undefined;
} = {}) {
  const repository = options.repository ?? new MockTradingRepository();

  return {
    createServiceClient: () => ({}) as any,
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service-role",
      },
    }),
    readRunnerSecret: options.readRunnerSecret ?? (() => SECRET),
    createRepository: () => repository,
  };
}

function request(body: unknown, secret?: string): Request {
  const headers = new Headers({ "content-type": "application/json" });

  if (secret) {
    headers.set("x-stock-market-runner-secret", secret);
  }

  return new Request("https://example.test/stock-market-trading", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function executeBody(overrides: Record<string, unknown> = {}) {
  return {
    action: "execute_order",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    stockAssetId: STOCK_ASSET_ID,
    side: "buy",
    quantity: 5,
    idempotencyKey: "order-1",
    ...overrides,
  };
}

class MockTradingRepository implements StockMarketTradingRepository {
  readonly executeInputs: StockMarketOrderExecuteInput[] = [];

  async executeOrder(input: StockMarketOrderExecuteInput) {
    this.executeInputs.push(input);

    return {
      order: {
        orderId: "00000000-0000-4000-8000-000000000201",
        gameSessionId: input.gameSessionId,
        playerSessionId: input.playerSessionId,
        stockAssetId: input.stockAssetId,
        ticker: "AURA",
        side: input.side,
        quantity: input.quantity,
        executionPrice: 100,
        grossValue: 500,
        status: "filled" as const,
        rejectionReason: null,
      },
      cash: {
        accountType: "cash" as const,
        currencyCode: "ECO",
        balance: 9500,
      },
      holding: {
        quantity: 5,
        averageCost: 100,
      },
    };
  }
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
