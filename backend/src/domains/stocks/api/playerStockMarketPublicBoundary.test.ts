import {
  handlePlayerStockMarketReadRequest,
} from "./playerStockMarketReadHttpHandler.ts";
import {
  handlePlayerStockMarketTradingRequest,
} from "./playerStockMarketTradingHttpHandler.ts";
import {
  type StockMarketOrderExecuteInput,
  StockMarketTradingError,
  type StockMarketTradingRepository,
} from "../contracts/stockMarketTradingContracts.ts";
import type {
  StockMarketPlayerReadInput,
  StockMarketPlayerReadRepository,
  StockMarketPlayerReadResult,
} from "../contracts/stockMarketPlayerReadContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const STOCK_ASSET_ID = "00000000-0000-4000-8000-000000000101";

Deno.test("public player market order resolves ticker server-side and emits no ownership UUID", async () => {
  const repository = new TradingRepository();
  const response = await handlePlayerStockMarketTradingRequest(
    tradingRequest({
      ticker: "aura",
      expectedPrice: 100,
      side: "buy",
      quantity: 2,
      idempotencyKey: "order-public-1",
    }),
    tradingDependencies(repository),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(repository.inputs, [{
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    stockAssetId: STOCK_ASSET_ID,
    side: "buy",
    quantity: 2,
    idempotencyKey: "order-public-1",
  }]);
  assertEquals(body.order, {
    ticker: "AURA",
    side: "buy",
    quantity: 2,
    executionPrice: 100,
    grossValue: 200,
    status: "filled",
    rejectionReason: null,
  });
  assertNoUuid(body);
});

Deno.test("public player market order rejects a stale reviewed price before settlement", async () => {
  const repository = new TradingRepository();
  const response = await handlePlayerStockMarketTradingRequest(
    tradingRequest({
      ticker: "AURA",
      expectedPrice: 99,
      side: "buy",
      quantity: 1,
      idempotencyKey: "order-stale-1",
    }),
    tradingDependencies(repository),
  );

  await assertError(response, 409, "stale_stock_price");
  assertEquals(repository.inputs, []);
});

Deno.test("public player market order rejects internal stock UUID injection", async () => {
  const response = await handlePlayerStockMarketTradingRequest(
    tradingRequest({
      ticker: "AURA",
      stockAssetId: STOCK_ASSET_ID,
      expectedPrice: 100,
      side: "buy",
      quantity: 1,
      idempotencyKey: "order-injection-1",
    }),
    tradingDependencies(new TradingRepository()),
  );

  await assertError(response, 400, "invalid_stock_market_trading_request");
});

Deno.test("public player market order maps insufficient cash and shares", async () => {
  for (const [code, message] of [
    ["insufficient_cash", "Insufficient player cash for this stock order."],
    ["insufficient_shares", "Insufficient stock holdings for this sell order."],
  ] as const) {
    const repository = new TradingRepository(
      new StockMarketTradingError(code, message, 409),
    );
    const response = await handlePlayerStockMarketTradingRequest(
      tradingRequest({
        ticker: "AURA",
        expectedPrice: 100,
        side: code === "insufficient_cash" ? "buy" : "sell",
        quantity: 5,
        idempotencyKey: `order-${code}`,
      }),
      tradingDependencies(repository),
    );

    await assertError(response, 409, code);
  }
});

Deno.test("public portfolio derives all ownership scope from the player token", async () => {
  const repository = new ReadRepository();
  const response = await handlePlayerStockMarketReadRequest(
    readRequest("/players/me/stocks/portfolio"),
    "read_portfolio",
    readDependencies(repository),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(repository.inputs, [{
    action: "read_portfolio",
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    limit: 100,
  }]);
  assertEquals(body.action, "read_portfolio");
  assertEquals(body.holdings[0].ticker, "AURA");
  assertEquals("stockAssetId" in body.holdings[0], false);
  assertEquals("gameSessionId" in body, false);
  assertEquals("playerSessionId" in body, false);
  assertEquals("playerId" in body, false);
  assertNoUuid(body);
});

Deno.test("public portfolio rejects partial legacy ownership query injection", async () => {
  const response = await handlePlayerStockMarketReadRequest(
    readRequest(`/players/me/stocks/portfolio?gameSessionId=${GAME_SESSION_ID}`),
    "read_portfolio",
    readDependencies(new ReadRepository()),
  );

  await assertError(response, 400, "invalid_player_stock_read_request");
});

function tradingRequest(body: Record<string, unknown>): Request {
  return new Request("https://example.test/players/me/stocks/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-player-session-token": "player-token",
    },
    body: JSON.stringify(body),
  });
}

function readRequest(path: string): Request {
  return new Request(`https://example.test${path}`, {
    headers: { "x-player-session-token": "player-token" },
  });
}

function sessionResult() {
  return Promise.resolve({
    ok: true as const,
    session: {
      id: PLAYER_SESSION_ID,
      game_session_id: GAME_SESSION_ID,
      player_id: PLAYER_ID,
    },
  });
}

function environment() {
  return {
    ok: true as const,
    value: {
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "anon",
      supabaseServiceRoleKey: "service-role",
    },
  };
}

function tradingDependencies(repository: TradingRepository): any {
  return {
    createServiceClient: () => ({}),
    readSupabaseEnv: environment,
    hashSessionToken: async () => "session-token-hash",
    resolvePlayerSession: sessionResult,
    resolveStockAssetByTicker: async (_client: unknown, gameSessionId: string, ticker: string) => {
      assertEquals(gameSessionId, GAME_SESSION_ID);
      assertEquals(ticker, "AURA");
      return {
        stockAssetId: STOCK_ASSET_ID,
        ticker: "AURA",
        currentPrice: 100,
      };
    },
    createRepository: () => repository,
  };
}

function readDependencies(repository: ReadRepository): any {
  return {
    createServiceClient: () => ({}),
    readSupabaseEnv: environment,
    hashSessionToken: async () => "session-token-hash",
    resolvePlayerSession: sessionResult,
    createRepository: () => repository,
  };
}

class TradingRepository implements StockMarketTradingRepository {
  readonly inputs: StockMarketOrderExecuteInput[] = [];

  constructor(private readonly error: StockMarketTradingError | null = null) {}

  async executeOrder(input: StockMarketOrderExecuteInput) {
    this.inputs.push(input);
    if (this.error) throw this.error;
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
        grossValue: input.quantity * 100,
        status: "filled" as const,
        rejectionReason: null,
      },
      cash: {
        accountType: "cash" as const,
        currencyCode: "XAL",
        balance: 9800,
      },
      holding: {
        quantity: input.quantity,
        averageCost: 100,
      },
    };
  }
}

class ReadRepository implements StockMarketPlayerReadRepository {
  readonly inputs: StockMarketPlayerReadInput[] = [];

  async read(input: StockMarketPlayerReadInput): Promise<StockMarketPlayerReadResult> {
    this.inputs.push(input);
    return {
      action: "read_portfolio",
      gameSessionId: input.gameSessionId,
      playerSessionId: input.playerSessionId,
      playerId: PLAYER_ID,
      cash: {
        accountType: "cash",
        currencyCode: "XAL",
        balance: 9800,
      },
      summary: {
        cashBalance: 9800,
        holdingsMarketValue: 200,
        totalEquity: 10000,
        totalCostBasis: 200,
        unrealizedPnl: 0,
        realizedPnl: 0,
        positionsCount: 1,
      },
      holdings: [{
        stockAssetId: STOCK_ASSET_ID,
        ticker: "AURA",
        companyName: "Aura Systems",
        sector: "Technology",
        countryCode: "XA",
        quantity: 2,
        averageCost: 100,
        currentPrice: 100,
        marketValue: 200,
        costBasis: 200,
        unrealizedPnl: 0,
        unrealizedPnlPct: 0,
        realizedPnl: 0,
      }],
    };
  }
}

async function assertError(response: Response, status: number, code: string) {
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
    throw new Error(`UUID leaked in player-safe market payload: ${serialized}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
