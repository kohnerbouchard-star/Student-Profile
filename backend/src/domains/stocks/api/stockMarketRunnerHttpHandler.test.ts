import {
  handleStockMarketRunnerRequest,
} from "./stockMarketRunnerHttpHandler.ts";
import type {
  StockMarketEngineInput,
  StockMarketEngineResult,
} from "../contracts/stockMarketEngineContracts.ts";
import type {
  StockMarketRunnerRepository,
} from "../contracts/stockMarketRunnerContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const ASSET_ID = "00000000-0000-4000-8000-000000000101";
const SECRET = "runner-secret";

Deno.test("stock market runner rejects non-POST requests", async () => {
  const response = await handleStockMarketRunnerRequest(
    new Request("https://example.test/stock-market-runner", { method: "GET" }),
    dependencies(),
  );

  assertEquals(response.status, 405);
});

Deno.test("stock market runner rejects missing configured secret", async () => {
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID }, SECRET),
    dependencies({ readRunnerSecret: () => undefined }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 500);
  assertEquals(body.error.code, "stock_market_runner_secret_not_configured");
});

Deno.test("stock market runner rejects missing or invalid request secret", async () => {
  const missingResponse = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID }),
    dependencies(),
  );
  const invalidResponse = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID }, "wrong-secret"),
    dependencies(),
  );

  assertEquals(missingResponse.status, 401);
  assertEquals(invalidResponse.status, 401);
});

Deno.test("stock market runner rejects missing gameSessionId", async () => {
  const response = await handleStockMarketRunnerRequest(
    request({}, SECRET),
    dependencies(),
  );
  const body = await readJson(response);

  assertEquals(response.status, 400);
  assertEquals(body.error.code, "invalid_stock_market_runner_request");
});

Deno.test("stock market runner rejects multiple game session request shapes", async () => {
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionIds: [GAME_SESSION_ID] }, SECRET),
    dependencies(),
  );

  assertEquals(response.status, 400);
});

Deno.test("stock market runner returns success shape", async () => {
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    dependencies(),
  );
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.gameSessionId, GAME_SESSION_ID);
  assertEquals(body.tickIndex, 4);
  assertEquals(body.assetsProcessed, 1);
  assertEquals(body.ticksInserted, 1);
  assertEquals(body.generatedAt, "tick-4");
});

Deno.test("stock market runner derives the default seed from one game session", async () => {
  const engineInputs: StockMarketEngineInput[] = [];
  const repository = new MockRunnerRepository();
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID }, SECRET),
    dependencies({
      repository,
      calculateNextTick: (input) => {
        engineInputs.push(input);
        return engineResult(input);
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(repository.loadedGameSessionIds, [GAME_SESSION_ID]);
  assertEquals(engineInputs.length, 1);
  assertEquals(
    engineInputs[0].seed,
    `stock-market-runner-v1:${GAME_SESSION_ID}`,
  );
});

function dependencies(options: {
  readonly repository?: StockMarketRunnerRepository;
  readonly readRunnerSecret?: () => string | undefined;
  readonly calculateNextTick?: (input: StockMarketEngineInput) => StockMarketEngineResult;
} = {}) {
  const repository = options.repository ?? new MockRunnerRepository();

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
    calculateNextTick: options.calculateNextTick ?? engineResult,
  };
}

function request(body: unknown, secret?: string): Request {
  const headers = new Headers({ "content-type": "application/json" });

  if (secret) {
    headers.set("x-stock-market-runner-secret", secret);
  }

  return new Request("https://example.test/stock-market-runner", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function engineResult(input: StockMarketEngineInput): StockMarketEngineResult {
  return {
    gameSessionId: input.gameSessionId,
    seed: input.seed,
    tickIndex: input.tickIndex,
    generatedAt: `tick-${input.tickIndex}`,
    rows: [{
      gameSessionId: input.gameSessionId,
      ticker: "AURA",
      companyName: "Aurora Works",
      sector: "TECHNOLOGY",
      currentPrice: 105,
      changePct: "5.00%",
      previousClose: 100,
      openPrice: 100,
      dayHigh: 105,
      dayLow: 100,
      volume: 1000,
      marketCap: 105000000,
      beta: 1,
      history: [{
        gameSessionId: input.gameSessionId,
        tickIndex: input.tickIndex,
        timestamp: `tick-${input.tickIndex}`,
        label: `Tick ${input.tickIndex}`,
        price: 105,
        volume: 1000,
      }],
      lastUpdated: `tick-${input.tickIndex}`,
      trend: "up",
      assetType: "Stock",
    }],
    ticks: [{
      gameSessionId: input.gameSessionId,
      tickIndex: input.tickIndex,
      assetId: ASSET_ID,
      ticker: "AURA",
      price: 105,
      previousPrice: 100,
      logReturn: 0.04879016,
      changePct: 5,
      volume: 1000,
      currentVolatility: 0.05,
      longRunVolatility: 0.05,
      createdAt: `tick-${input.tickIndex}`,
      explanation: {
        gameSessionId: input.gameSessionId,
        tickIndex: input.tickIndex,
        ticker: "AURA",
        headline: "AURA rises",
        summary: "Market pressure moved AURA.",
        studentText: "AURA moved because modeled market factors changed.",
        components: {
          marketFactorPct: 1,
          countryFactorPct: 1,
          sectorFactorPct: 1,
          fundamentalsFactorPct: 1,
          regimeFactorPct: 0,
          shockFactorPct: 0,
          volatilityNoisePct: 1,
          momentumFactorPct: 0,
          meanReversionFactorPct: 0,
          finalReturnPct: 5,
        },
        appliedShockIds: [],
        regime: "sideways",
      },
    }],
    explanations: [],
  };
}

class MockRunnerRepository implements StockMarketRunnerRepository {
  readonly loadedGameSessionIds: string[] = [];

  async load(input: { readonly gameSessionId: string; readonly tickIndex?: number }) {
    this.loadedGameSessionIds.push(input.gameSessionId);

    return {
      gameSessionId: input.gameSessionId,
      tickIndex: input.tickIndex ?? 1,
      assets: [{
        gameSessionId: input.gameSessionId,
        assetId: ASSET_ID,
        ticker: "AURA",
        companyName: "Aurora Works",
        sector: "TECHNOLOGY",
        countryCode: "SOLVEND",
        currentPrice: 100,
        beta: 1,
        liquidity: 0.8,
        currentVolatility: 0.05,
        longRunVolatility: 0.05,
        recentReturns: [],
      }],
      macro: { gameSessionId: input.gameSessionId },
      countries: [],
      sectors: [],
      shocks: [],
    };
  }

  async apply() {
    return {
      assetsUpdated: 1,
      ticksInserted: 1,
    };
  }
}

async function readJson(response: Response): Promise<any> {
  return await response.json();
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed.\nActual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
