import {
  handleStockMarketRunnerRequest,
} from "./stockMarketRunnerHttpHandler.ts";
import {
  type GamePublicRealtimeBroadcastMessage,
  type GamePublicRealtimeEnvelope,
  GamePublicRealtimePublisher,
  type GamePublicRealtimePublishResult,
  type GamePublicRealtimeTransport,
} from "../../game-dashboard/realtime/gamePublicRealtimePublisher.ts";
import type {
  StockMarketEngineInput,
  StockMarketEngineResult,
} from "../contracts/stockMarketEngineContracts.ts";
import type {
  StockMarketRunnerRepository,
} from "../contracts/stockMarketRunnerContracts.ts";
import type {
  StockMarketNewsCreateResult,
  StockMarketNewsInsertInput,
  StockMarketNewsRepository,
} from "../contracts/stockMarketNewsContracts.ts";

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

Deno.test("stock market runner publishes one public stock tick after persistence", async () => {
  const repository = new MockRunnerRepository();
  const transport = new CapturingRealtimeTransport(() => {
    assertEquals(repository.applyCalls, 1);
  });
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    dependencies({
      repository,
      publicRealtimePublisher: new GamePublicRealtimePublisher(transport),
    }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body, {
    ok: true,
    gameSessionId: GAME_SESSION_ID,
    tickIndex: 4,
    assetsProcessed: 1,
    ticksInserted: 1,
    generatedAt: "tick-4",
  });
  assertEquals(transport.messages.length, 1);

  const message = transport.messages[0] as GamePublicRealtimeBroadcastMessage<
    "stock_tick"
  >;

  assertEquals(message.channel, `game:${GAME_SESSION_ID}:public`);
  assertEquals(message.event, "stock_tick");
  assertEquals(message.payload.sequence, 4);
  assertEquals(message.payload.eventType, "stock_tick");
  assertEquals(message.payload.payload, {
    tick: 4,
    stocks: [{
      stockAssetId: ASSET_ID,
      ticker: "AURA",
      companyName: "Aurora Works",
      sector: "TECHNOLOGY",
      countryCode: "SOLVEND",
      currentPrice: 105,
      previousClose: 100,
      changePct: 5,
      volume: 1000,
    }],
  });
  assertNoPrivateRealtimeFields(message);
});

Deno.test("stock market runner posts market news and broadcasts public event", async () => {
  const newsRepository = new MockMarketNewsRepository();
  const transport = new CapturingRealtimeTransport();
  const response = await handleStockMarketRunnerRequest(
    request({
      action: "post_market_news",
      gameSessionId: GAME_SESSION_ID,
      headline: "Border escalation lifts emergency energy demand",
      explanation:
        "Government procurement increases oil, steel, and logistics pressure.",
      category: "war_conflict",
      scope: "sector",
      targetKey: "ENERGY",
      sentiment: "positive",
      impactStrength: "medium",
      durationTicks: 5,
      metadata: {
        affectedResources: ["oil", "steel"],
      },
    }, SECRET),
    dependencies({
      newsRepository,
      publicRealtimePublisher: new GamePublicRealtimePublisher(transport),
    }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.action, "post_market_news");
  assertEquals(body.gameSessionId, GAME_SESSION_ID);
  assertEquals(body.news.category, "war_conflict");
  assertEquals(body.news.sentiment, "positive");

  assertEquals(newsRepository.createdInputs.length, 1);
  assertEquals(newsRepository.createdInputs[0].gameSessionId, GAME_SESSION_ID);
  assertEquals(newsRepository.createdInputs[0].createdTick, 8);
  assertEquals(newsRepository.createdInputs[0].scope, "sector");
  assertEquals(newsRepository.createdInputs[0].targetKey, "ENERGY");

  assertEquals(transport.messages.length, 1);

  const message = transport.messages[0] as GamePublicRealtimeBroadcastMessage<
    "market_news_posted"
  >;

  assertEquals(message.channel, `game:${GAME_SESSION_ID}:public`);
  assertEquals(message.event, "market_news_posted");
  assertEquals(message.payload.sequence, 8);
  assertEquals(message.payload.payload.news.category, "war_conflict");
  assertEquals(message.payload.payload.news.sentiment, "positive");
  assertEquals(message.payload.payload.news.source, "runner");
  assertNoPrivateRealtimeFields(message);
});

Deno.test("stock market runner keeps successful tick response when realtime publish fails", async () => {
  const failures: unknown[] = [];
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    dependencies({
      publicRealtimePublisher: new GamePublicRealtimePublisher(
        new FailingRealtimeTransport(),
      ),
      logPublicRealtimePublishFailure: (failure) => failures.push(failure),
    }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.tickIndex, 4);
  assertEquals(failures, [{
    code: "game_public_realtime_broadcast_failed",
    message: "broadcast unavailable",
    retryable: true,
  }]);
});

Deno.test("stock market runner keeps successful tick response when realtime publisher throws", async () => {
  const failures: unknown[] = [];
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    dependencies({
      publicRealtimePublisher: new ThrowingPublicRealtimePublisher(),
      logPublicRealtimePublishFailure: (failure) => failures.push(failure),
    }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.tickIndex, 4);
  assertEquals(failures, [{
    code: "stock_tick_public_realtime_publish_failed",
    message: "Stock tick public realtime event could not be published.",
    retryable: true,
  }]);
});

Deno.test("stock market runner creates storyline hook from factory after successful tick", async () => {
  const serviceClient = { source: "test-client" };
  const calls: unknown[] = [];
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    dependencies({
      createServiceClient: () => serviceClient,
      createStorylineRunnerAfterTick: (client) => async (input) => {
        calls.push({ client, input });
      },
    }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(calls, [{
    client: serviceClient,
    input: {
      gameSessionId: GAME_SESSION_ID,
      currentMarketTick: 4,
      generatedAt: "tick-4",
    },
  }]);
});

Deno.test("stock market runner invokes storyline hook after successful tick", async () => {
  const calls: unknown[] = [];
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    dependencies({
      runStorylineEventsAfterTick: async (input) => {
        calls.push(input);
      },
    }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(calls, [{
    gameSessionId: GAME_SESSION_ID,
    currentMarketTick: 4,
    generatedAt: "tick-4",
  }]);
});

Deno.test("stock market runner keeps successful tick response when storyline hook fails", async () => {
  const failures: unknown[] = [];
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    dependencies({
      runStorylineEventsAfterTick: async () => {
        throw new Error("storyline repository unavailable");
      },
      logStorylineRunnerFailure: (failure) => failures.push(failure),
    }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.tickIndex, 4);
  assertEquals(failures, [{
    code: "storyline_runner_after_stock_tick_failed",
    message: "storyline repository unavailable",
    retryable: true,
  }]);
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
  readonly createServiceClient?: () => unknown;
  readonly repository?: StockMarketRunnerRepository;
  readonly readRunnerSecret?: () => string | undefined;
  readonly calculateNextTick?: (
    input: StockMarketEngineInput,
  ) => StockMarketEngineResult;
  readonly publicRealtimePublisher?: {
    publish<TEvent extends "stock_tick" | "market_news_posted">(
      envelope: GamePublicRealtimeEnvelope<TEvent>,
    ): Promise<GamePublicRealtimePublishResult<TEvent>>;
  };
  readonly newsRepository?: StockMarketNewsRepository;
  readonly logPublicRealtimePublishFailure?: (failure: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  }) => void;
  readonly runStorylineEventsAfterTick?: (input: {
    readonly gameSessionId: string;
    readonly currentMarketTick: number;
    readonly generatedAt: string;
  }) => Promise<void>;
  readonly createStorylineRunnerAfterTick?: (
    client: unknown,
  ) =>
    | ((input: {
      readonly gameSessionId: string;
      readonly currentMarketTick: number;
      readonly generatedAt: string;
    }) => Promise<void>)
    | null
    | undefined;
  readonly logStorylineRunnerFailure?: (failure: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  }) => void;
} = {}) {
  const repository = options.repository ?? new MockRunnerRepository();

  return {
    createServiceClient: () => (options.createServiceClient?.() ?? {}) as any,
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
    createNewsRepository: () =>
      options.newsRepository ?? new MockMarketNewsRepository(),
    calculateNextTick: options.calculateNextTick ?? engineResult,
    createPublicRealtimePublisher: () =>
      options.publicRealtimePublisher ?? new NoopPublicRealtimePublisher(),
    logPublicRealtimePublishFailure: options.logPublicRealtimePublishFailure ??
      (() => {}),
    runStorylineEventsAfterTick: options.runStorylineEventsAfterTick,
    createStorylineRunnerAfterTick: options.createStorylineRunnerAfterTick ??
      (() => undefined),
    logStorylineRunnerFailure: options.logStorylineRunnerFailure ?? (() => {}),
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
  applyCalls = 0;

  async load(
    input: { readonly gameSessionId: string; readonly tickIndex?: number },
  ) {
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
    this.applyCalls += 1;

    return {
      assetsUpdated: 1,
      ticksInserted: 1,
    };
  }
}

class MockMarketNewsRepository implements StockMarketNewsRepository {
  readonly createdInputs: StockMarketNewsInsertInput[] = [];
  currentTick = 7;

  async readCurrentTick(_gameSessionId: string): Promise<number> {
    return this.currentTick;
  }

  async create(
    input: StockMarketNewsInsertInput,
  ): Promise<StockMarketNewsCreateResult> {
    this.createdInputs.push(input);

    return {
      news: {
        id: "event-news-1",
        shockId: input.shockId,
        category: input.category,
        sentiment: input.sentiment,
        source: input.source,
        scope: input.scope,
        targetKey: input.targetKey,
        headline: input.headline,
        explanation: input.explanation,
        createdTick: input.createdTick,
        expiresTick: input.createdTick + input.durationTicks,
        createdAt: "2026-01-01T00:00:00Z",
      },
    };
  }
}

class CapturingRealtimeTransport implements GamePublicRealtimeTransport {
  readonly messages: GamePublicRealtimeBroadcastMessage[] = [];

  constructor(private readonly beforeSend?: () => void) {}

  async send(message: GamePublicRealtimeBroadcastMessage) {
    this.beforeSend?.();
    this.messages.push(message);
    return { ok: true as const };
  }
}

class FailingRealtimeTransport implements GamePublicRealtimeTransport {
  async send() {
    return {
      ok: false as const,
      error: {
        code: "broadcast_failed",
        message: "broadcast unavailable",
        retryable: true,
      },
    };
  }
}

class NoopPublicRealtimePublisher {
  async publish<TEvent extends "stock_tick" | "market_news_posted">(
    envelope: GamePublicRealtimeEnvelope<TEvent>,
  ) {
    return {
      ok: true as const,
      message: {
        channel: envelope.channel,
        event: envelope.eventType,
        payload: envelope,
      },
    };
  }
}

class ThrowingPublicRealtimePublisher {
  async publish<TEvent extends "stock_tick" | "market_news_posted">(): Promise<
    GamePublicRealtimePublishResult<TEvent>
  > {
    throw new Error("publish unavailable");
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

function assertNoPrivateRealtimeFields(value: unknown): void {
  const serialized = JSON.stringify(value).toLowerCase();

  for (
    const fieldName of [
      privateFieldName("player", "Session", "Id"),
      privateFieldName("session", "Token"),
      privateFieldName("session", "Token", "Hash"),
      privateFieldName("access", "Code"),
      privateFieldName("runner", "Secret"),
      privateFieldName("player", "Cash"),
      "holdings",
      "orders",
      "trades",
      "inventory",
      "purchases",
      "ledger",
    ]
  ) {
    assertEquals(serialized.includes(fieldName.toLowerCase()), false);
  }
}

function privateFieldName(...parts: readonly string[]): string {
  return parts.join("");
}
