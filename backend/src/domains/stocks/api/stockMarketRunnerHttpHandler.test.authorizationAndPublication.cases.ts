import { handleStockMarketRunnerRequest } from "./stockMarketRunnerHttpHandler.ts";
import {
  type GamePublicRealtimeBroadcastMessage,
  GamePublicRealtimePublisher,
} from "./stockMarketRunnerHttpHandler.test.fixtures.support.ts";
import {
  assertEquals,
  assertNoPrivateRealtimeFields,
  ASSET_ID,
  CapturingRealtimeTransport,
  dependencies,
  FailingRealtimeTransport,
  GAME_SESSION_ID,
  MockMarketNewsRepository,
  MockRunnerRepository,
  readJson,
  request,
  SECRET,
  ThrowingPublicRealtimePublisher,
} from "./stockMarketRunnerHttpHandler.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

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

Deno.test("stock market runner rejects ticks while the market is closed", async () => {
  const repository = new MockRunnerRepository();
  const response = await handleStockMarketRunnerRequest(
    request({ gameSessionId: GAME_SESSION_ID, tickIndex: 4 }, SECRET),
    dependencies({
      repository,
      readMarketOpenState: async () => false,
    }),
  );
  const body = await readJson(response);

  assertEquals(response.status, 409);
  assertEquals(body.error.code, "stock_market_closed");
  assertEquals(body.error.retryable, true);
  assertEquals(repository.loadedGameSessionIds, []);
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
