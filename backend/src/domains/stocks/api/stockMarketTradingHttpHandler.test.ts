import {
  handleStockMarketTradingRequest,
} from "./stockMarketTradingHttpHandler.ts";
import type {
  StockMarketOrderExecuteInput,
  StockMarketPortfolioInitializeInput,
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
    request(initializeBody(), SECRET),
    dependencies({ readRunnerSecret: () => undefined }),
  );
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body.error.code, "stock_market_runner_secret_not_configured");
});

Deno.test("stock trading rejects missing or invalid request secret", async () => {
  const missing = await handleStockMarketTradingRequest(
    request(initializeBody()),
    dependencies(),
  );
  const invalid = await handleStockMarketTradingRequest(
    request(initializeBody(), "wrong"),
    dependencies(),
  );

  assertEquals(missing.status, 401);
  assertEquals(invalid.status, 401);
});

Deno.test("stock trading rejects invalid action", async () => {
  const response = await handleStockMarketTradingRequest(
    request({ ...initializeBody(), action: "cancel_order" }, SECRET),
    dependencies(),
  );

  assertEquals(response.status, 400);
});

Deno.test("stock trading rejects missing gameSessionId or playerSessionId", async () => {
  const missingGame = await handleStockMarketTradingRequest(
    request({
      action: "initialize_portfolio",
      playerSessionId: PLAYER_SESSION_ID,
    }, SECRET),
    dependencies(),
  );
  const missingPlayer = await handleStockMarketTradingRequest(
    request(
      { action: "initialize_portfolio", gameSessionId: GAME_SESSION_ID },
      SECRET,
    ),
    dependencies(),
  );
  const multiple = await handleStockMarketTradingRequest(
    request({
      action: "initialize_portfolio",
      gameSessionIds: [GAME_SESSION_ID],
      playerSessionId: PLAYER_SESSION_ID,
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

Deno.test("stock trading routes initialize_portfolio", async () => {
  const repository = new MockTradingRepository();
  const response = await handleStockMarketTradingRequest(
    request(initializeBody({ startingCash: 25000 }), SECRET),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(repository.initializeInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    startingCash: 25000,
  });
  assertEquals(body.ok, true);
  assertEquals(body.action, "initialize_portfolio");
  assertEquals(body.portfolio.cashBalance, 25000);
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

Deno.test("stock trading returns execute success response shape", async () => {
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
    portfolio: {
      cashBalance: 9500,
      reservedCash: 0,
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

function initializeBody(overrides: Record<string, unknown> = {}) {
  return {
    action: "initialize_portfolio",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    ...overrides,
  };
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
  readonly initializeInputs: StockMarketPortfolioInitializeInput[] = [];
  readonly executeInputs: StockMarketOrderExecuteInput[] = [];

  async initializePortfolio(input: StockMarketPortfolioInitializeInput) {
    this.initializeInputs.push(input);

    return {
      portfolioId: "00000000-0000-4000-8000-000000000301",
      gameSessionId: input.gameSessionId,
      playerSessionId: input.playerSessionId,
      cashBalance: input.startingCash,
      reservedCash: 0,
      realizedPnl: 0,
    };
  }

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
      portfolio: {
        cashBalance: 9500,
        reservedCash: 0,
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
