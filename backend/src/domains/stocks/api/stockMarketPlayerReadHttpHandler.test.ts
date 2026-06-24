import {
  handleStockMarketPlayerReadRequest,
} from "./stockMarketPlayerReadHttpHandler.ts";
import type {
  StockMarketPlayerReadAction,
  StockMarketPlayerReadInput,
  StockMarketPlayerReadRepository,
} from "../contracts/stockMarketPlayerReadContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const STOCK_ASSET_ID = "00000000-0000-4000-8000-000000000101";
const ORDER_ID = "00000000-0000-4000-8000-000000000201";
const TRADE_ID = "00000000-0000-4000-8000-000000000301";
const SECRET = "runner-secret";

const ACTIONS: readonly StockMarketPlayerReadAction[] = [
  "read_portfolio",
  "read_holdings",
  "read_orders",
  "read_trades",
];

Deno.test("stock player read rejects non-POST requests", async () => {
  const response = await handleStockMarketPlayerReadRequest(
    new Request("https://example.test/stock-market-player-read", {
      method: "GET",
    }),
    dependencies(),
  );

  assertEquals(response.status, 405);
});

Deno.test("stock player read rejects missing configured secret", async () => {
  const response = await handleStockMarketPlayerReadRequest(
    request(playerReadBody(), SECRET),
    dependencies({ readRunnerSecret: () => undefined }),
  );
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body.error.code, "stock_market_runner_secret_not_configured");
});

Deno.test("stock player read rejects missing or invalid request secret", async () => {
  const missing = await handleStockMarketPlayerReadRequest(
    request(playerReadBody()),
    dependencies(),
  );
  const invalid = await handleStockMarketPlayerReadRequest(
    request(playerReadBody(), "wrong"),
    dependencies(),
  );

  assertEquals(missing.status, 401);
  assertEquals(invalid.status, 401);
});

Deno.test("stock player read rejects invalid action", async () => {
  const response = await handleStockMarketPlayerReadRequest(
    request({ ...playerReadBody(), action: "execute_order" }, SECRET),
    dependencies(),
  );

  assertEquals(response.status, 400);
});

Deno.test("stock player read rejects missing gameSessionId or playerSessionId", async () => {
  const missingGame = await handleStockMarketPlayerReadRequest(
    request({
      action: "read_portfolio",
      playerSessionId: PLAYER_SESSION_ID,
    }, SECRET),
    dependencies(),
  );
  const missingPlayer = await handleStockMarketPlayerReadRequest(
    request({
      action: "read_portfolio",
      gameSessionId: GAME_SESSION_ID,
    }, SECRET),
    dependencies(),
  );

  assertEquals(missingGame.status, 400);
  assertEquals(missingPlayer.status, 400);
});

Deno.test("stock player read rejects multiple or array-shaped ids", async () => {
  const multipleGame = await handleStockMarketPlayerReadRequest(
    request({
      ...playerReadBody(),
      gameSessionIds: [GAME_SESSION_ID],
    }, SECRET),
    dependencies(),
  );
  const arrayPlayer = await handleStockMarketPlayerReadRequest(
    request({
      ...playerReadBody(),
      playerSessionId: [PLAYER_SESSION_ID],
    }, SECRET),
    dependencies(),
  );

  assertEquals(multipleGame.status, 400);
  assertEquals(arrayPlayer.status, 400);
});

Deno.test("stock player read rejects invalid limits", async () => {
  const zero = await handleStockMarketPlayerReadRequest(
    request({ ...playerReadBody({ action: "read_orders" }), limit: 0 }, SECRET),
    dependencies(),
  );
  const decimal = await handleStockMarketPlayerReadRequest(
    request({ ...playerReadBody({ action: "read_trades" }), limit: 1.5 }, SECRET),
    dependencies(),
  );

  assertEquals(zero.status, 400);
  assertEquals(decimal.status, 400);
});

Deno.test("stock player read routes each valid action to the repository", async () => {
  const repository = new MockPlayerReadRepository();

  for (const action of ACTIONS) {
    const response = await handleStockMarketPlayerReadRequest(
      request(playerReadBody({ action, limit: 999 }), SECRET),
      dependencies({ repository }),
    );

    assertEquals(response.status, 200);
  }

  assertEquals(repository.inputs.map((input) => input.action), ACTIONS);
  assertEquals(repository.inputs.map((input) => input.limit), [500, 500, 500, 500]);
});

Deno.test("stock player read returns portfolio DTOs", async () => {
  const response = await handleStockMarketPlayerReadRequest(
    request(playerReadBody(), SECRET),
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

function dependencies(options: {
  readonly repository?: StockMarketPlayerReadRepository;
  readonly readRunnerSecret?: () => string | undefined;
} = {}) {
  const repository = options.repository ?? new MockPlayerReadRepository();

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

  return new Request("https://example.test/stock-market-player-read", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function playerReadBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    action: "read_portfolio",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    ...overrides,
  };
}

class MockPlayerReadRepository implements StockMarketPlayerReadRepository {
  readonly inputs: StockMarketPlayerReadInput[] = [];

  async read(input: StockMarketPlayerReadInput) {
    this.inputs.push(input);

    if (input.action === "read_orders") {
      return {
        action: "read_orders" as const,
        gameSessionId: input.gameSessionId,
        playerSessionId: input.playerSessionId,
        playerId: PLAYER_ID,
        orders: [{
          orderId: ORDER_ID,
          stockAssetId: STOCK_ASSET_ID,
          ticker: "AURA",
          side: "buy" as const,
          quantity: 5,
          executionPrice: 100,
          grossValue: 500,
          status: "filled" as const,
          rejectionReason: null,
          idempotencyKey: "order-1",
          createdAt: "2026-06-24T00:00:00.000Z",
        }],
      };
    }

    if (input.action === "read_trades") {
      return {
        action: "read_trades" as const,
        gameSessionId: input.gameSessionId,
        playerSessionId: input.playerSessionId,
        playerId: PLAYER_ID,
        trades: [{
          tradeId: TRADE_ID,
          orderId: ORDER_ID,
          stockAssetId: STOCK_ASSET_ID,
          ticker: "AURA",
          side: "buy" as const,
          quantity: 5,
          executionPrice: 100,
          grossValue: 500,
          createdAt: "2026-06-24T00:00:00.000Z",
        }],
      };
    }

    return {
      action: input.action,
      gameSessionId: input.gameSessionId,
      playerSessionId: input.playerSessionId,
      playerId: PLAYER_ID,
      cash: {
        accountType: "cash" as const,
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
    };
  }
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

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
