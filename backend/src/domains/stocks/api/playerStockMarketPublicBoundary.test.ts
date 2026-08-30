import {
  handlePlayerStockMarketReadRequest,
} from "./playerStockMarketReadHttpHandler.ts";
import {
  handlePlayerStockMarketTradingRequest,
} from "./playerStockMarketTradingHttpHandler.ts";
import {
  type PlayerStockMarketTradingRepository,
  type StockMarketBuyQuoteInput,
  type StockMarketBuySettlementInput,
  type StockMarketSellSettlementInput,
  StockMarketTradingError,
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
const BUY_QUOTE_KEY = "sbq_11111111111111111111111111111111";
const SOURCE_ACCOUNT_KEY = "bac_22222222222222222222222222222222";
const DESTINATION_ACCOUNT_KEY = "bac_33333333333333333333333333333333";
const SETTLEMENT_TRANSACTION_KEY = "btx_44444444444444444444444444444444";

Deno.test("public player Stock buy quote derives ownership and emits public evidence only", async () => {
  const repository = new TradingRepository();
  const response = await handlePlayerStockMarketTradingRequest(
    tradingRequest({
      action: "create_buy_quote",
      ticker: "aura",
      quantity: 2,
      expectedPrice: 100,
      expectedTickIndex: 42,
      allocations: [{
        sourceAccountKey: SOURCE_ACCOUNT_KEY,
        targetAmount: 200,
      }],
      idempotencyKey: "stock-quote-public-1",
    }),
    tradingDependencies(repository),
  );
  const body = await response.json();

  assertEquals(response.status, 201);
  assertEquals(repository.inputs, [{
    operation: "create_buy_quote",
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    ticker: "AURA",
    quantity: 2,
    expectedPrice: 100,
    expectedTickIndex: 42,
    allocations: [{
      sourceAccountKey: SOURCE_ACCOUNT_KEY,
      targetAmount: 200,
    }],
    idempotencyKey: "stock-quote-public-1",
  }]);
  assertEquals(body.action, "create_buy_quote");
  assertEquals(body.quote.quoteKey, BUY_QUOTE_KEY);
  assertEquals(body.quote.listingCurrencyCode, "XAL");
  assertEquals(body.quote.funding.quote_key, "pfq_55555555555555555555555555555555");
  assertEquals(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assertNoUuid(body);
});

Deno.test("public player Stock buy and sell settlements derive ownership and expose public keys only", async () => {
  const repository = new TradingRepository();
  const buyResponse = await handlePlayerStockMarketTradingRequest(
    tradingRequest({
      action: "settle_buy_quote",
      quoteKey: BUY_QUOTE_KEY,
      idempotencyKey: "stock-buy-public-1",
    }),
    tradingDependencies(repository),
  );
  const sellResponse = await handlePlayerStockMarketTradingRequest(
    tradingRequest({
      action: "settle_sell",
      ticker: "aura",
      quantity: 1,
      expectedPrice: 105,
      expectedTickIndex: 43,
      destinationAccountKey: DESTINATION_ACCOUNT_KEY,
      idempotencyKey: "stock-sell-public-1",
    }),
    tradingDependencies(repository),
  );
  const buyBody = await buyResponse.json();
  const sellBody = await sellResponse.json();

  assertEquals([buyResponse.status, sellResponse.status], [200, 200]);
  assertEquals(repository.inputs, [{
    operation: "settle_buy_quote",
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    quoteKey: BUY_QUOTE_KEY,
    idempotencyKey: "stock-buy-public-1",
  }, {
    operation: "settle_sell",
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    ticker: "AURA",
    quantity: 1,
    expectedPrice: 105,
    expectedTickIndex: 43,
    destinationAccountKey: DESTINATION_ACCOUNT_KEY,
    idempotencyKey: "stock-sell-public-1",
  }]);
  assertEquals(buyBody.settlement.funding.receipt_key, "pfr_66666666666666666666666666666666");
  assertEquals(sellBody.settlement.destinationAccountKey, DESTINATION_ACCOUNT_KEY);
  assertEquals(sellBody.settlement.settlementTransactionKey, SETTLEMENT_TRANSACTION_KEY);
  assertNoUuid({ buyBody, sellBody });
});

Deno.test("public player Stock trading rejects internal stock UUID injection", async () => {
  const response = await handlePlayerStockMarketTradingRequest(
    tradingRequest({
      action: "create_buy_quote",
      ticker: "AURA",
      stockAssetId: STOCK_ASSET_ID,
      quantity: 1,
      expectedPrice: 100,
      expectedTickIndex: 42,
      allocations: [{
        sourceAccountKey: SOURCE_ACCOUNT_KEY,
        targetAmount: 100,
      }],
      idempotencyKey: "stock-injection-1",
    }),
    tradingDependencies(new TradingRepository()),
  );

  await assertError(response, 400, "invalid_stock_market_trading_request");
});

Deno.test("public player Stock trading preserves quote and settlement conflicts", async () => {
  const cases: readonly [
    Record<string, unknown>,
    StockMarketTradingError,
  ][] = [
    [
      {
        action: "create_buy_quote",
        ticker: "AURA",
        quantity: 1,
        expectedPrice: 99,
        expectedTickIndex: 42,
        allocations: [{
          sourceAccountKey: SOURCE_ACCOUNT_KEY,
          targetAmount: 99,
        }],
        idempotencyKey: "stock-stale-price-1",
      },
      new StockMarketTradingError(
        "stale_stock_price",
        "The reviewed Stock price changed.",
        409,
      ),
    ],
    [
      {
        action: "settle_buy_quote",
        quoteKey: BUY_QUOTE_KEY,
        idempotencyKey: "stock-insufficient-cash-1",
      },
      new StockMarketTradingError(
        "insufficient_cash",
        "Available Checking funds are insufficient.",
        409,
      ),
    ],
    [
      {
        action: "settle_sell",
        ticker: "AURA",
        quantity: 5,
        expectedPrice: 100,
        expectedTickIndex: 42,
        destinationAccountKey: DESTINATION_ACCOUNT_KEY,
        idempotencyKey: "stock-insufficient-shares-1",
      },
      new StockMarketTradingError(
        "insufficient_shares",
        "Available Stock holdings are insufficient.",
        409,
      ),
    ],
  ];

  for (const [requestBody, error] of cases) {
    const response = await handlePlayerStockMarketTradingRequest(
      tradingRequest(requestBody),
      tradingDependencies(new TradingRepository(error)),
    );
    await assertError(response, 409, error.code);
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

class TradingRepository implements PlayerStockMarketTradingRepository {
  readonly inputs: Record<string, unknown>[] = [];

  constructor(private readonly error: StockMarketTradingError | null = null) {}

  async createBuyQuote(input: StockMarketBuyQuoteInput) {
    this.inputs.push({ operation: "create_buy_quote", ...input });
    if (this.error) throw this.error;
    return {
      quoteKey: BUY_QUOTE_KEY,
      ticker: input.ticker,
      listingCurrencyCode: "XAL",
      quantity: input.quantity,
      quotedPrice: input.expectedPrice,
      priceTickIndex: input.expectedTickIndex,
      grossValue: input.quantity * input.expectedPrice,
      expiresAt: "2026-08-30T13:05:00.000Z",
      funding: {
        quote_key: "pfq_55555555555555555555555555555555",
      },
    };
  }

  async settleBuyQuote(input: StockMarketBuySettlementInput) {
    this.inputs.push({ operation: "settle_buy_quote", ...input });
    if (this.error) throw this.error;
    return {
      quoteKey: input.quoteKey,
      ticker: "AURA",
      listingCurrencyCode: "XAL",
      quantity: 2,
      executionPrice: 100,
      priceTickIndex: 42,
      grossValue: 200,
      holdingQuantityAfter: 2,
      averageCostAfter: 100,
      filledAt: "2026-08-30T13:04:00.000Z",
      alreadyCompleted: false,
      funding: {
        receipt_key: "pfr_66666666666666666666666666666666",
      },
    };
  }

  async settleSell(input: StockMarketSellSettlementInput) {
    this.inputs.push({ operation: "settle_sell", ...input });
    if (this.error) throw this.error;
    return {
      ticker: input.ticker,
      listingCurrencyCode: "XAL",
      quantity: input.quantity,
      executionPrice: input.expectedPrice,
      priceTickIndex: input.expectedTickIndex,
      grossValue: input.quantity * input.expectedPrice,
      holdingQuantityAfter: 1,
      averageCostAfter: 100,
      filledAt: "2026-08-30T13:06:00.000Z",
      destinationAccountKey: input.destinationAccountKey,
      settlementTransactionKey: SETTLEMENT_TRANSACTION_KEY,
      alreadyCompleted: false,
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
        accountType: "checking",
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
