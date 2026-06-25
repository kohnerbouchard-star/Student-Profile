import {
  buildGamePublicRealtimeChannel,
  buildGamePublicRealtimeEnvelope,
  type GamePublicRealtimeBroadcastMessage,
  GamePublicRealtimePublisher,
  type GamePublicRealtimeTransport,
  validateGamePublicRealtimeEnvelope,
} from "./gamePublicRealtimePublisher.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";

Deno.test("game public realtime channel builder returns the public game channel", () => {
  assertEquals(
    buildGamePublicRealtimeChannel(GAME_SESSION_ID),
    `game:${GAME_SESSION_ID}:public`,
  );
});

Deno.test("game public realtime publisher accepts stock_tick and serializes the public envelope", async () => {
  const transport = new CapturingTransport();
  const publisher = new GamePublicRealtimePublisher(transport);
  const envelope = buildGamePublicRealtimeEnvelope({
    gameSessionId: GAME_SESSION_ID,
    sequence: 42,
    eventType: "stock_tick",
    occurredAt: "2026-06-24T00:00:00.000Z",
    payload: {
      tick: 42,
      stocks: [{
        stockAssetId: "00000000-0000-4000-8000-000000000101",
        ticker: "AURA",
        companyName: "Aurora Aerospace Systems",
        sector: "AI_AEROSPACE",
        countryCode: "SOLVEND",
        currentPrice: 125,
        previousClose: 100,
        changePct: 25,
        volume: 1000,
      }],
    },
  });

  const result = await publisher.publish(envelope);

  assertEquals(result.ok, true);
  assertEquals(transport.messages, [{
    channel: `game:${GAME_SESSION_ID}:public`,
    event: "stock_tick",
    payload: envelope,
  }]);
  assertEquals(
    JSON.stringify(transport.messages).includes(privateSessionFieldName()),
    false,
  );
  assertEquals(
    JSON.stringify(transport.messages).includes(privateHashFieldName()),
    false,
  );
});

Deno.test("game public realtime publisher accepts market_news_posted", async () => {
  const transport = new CapturingTransport();
  const publisher = new GamePublicRealtimePublisher(transport);
  const envelope = buildGamePublicRealtimeEnvelope({
    gameSessionId: GAME_SESSION_ID,
    sequence: 43,
    eventType: "market_news_posted",
    occurredAt: "2026-06-24T00:01:00.000Z",
    payload: {
      news: {
        id: "00000000-0000-4000-8000-000000000701",
        headline: "Aurora wins a launch contract",
        explanation: "A game-public market event.",
        category: "supply_chain",
        sentiment: "negative",
        source: "runner",
        scope: "ticker",
        targetKey: "AURA",
        createdTick: 43,
        expiresTick: null,
        createdAt: "2026-06-24T00:01:00.000Z",
      },
    },
  });

  const result = await publisher.publish(envelope);
  const message = transport.messages[0] as GamePublicRealtimeBroadcastMessage<
    "market_news_posted"
  >;

  assertEquals(result.ok, true);
  assertEquals(message.event, "market_news_posted");
  assertEquals(message.payload.payload.news.headline, "Aurora wins a launch contract");
});

Deno.test("game public realtime publisher accepts market_status_changed", async () => {
  const transport = new CapturingTransport();
  const publisher = new GamePublicRealtimePublisher(transport);
  const envelope = buildGamePublicRealtimeEnvelope({
    gameSessionId: GAME_SESSION_ID,
    sequence: null,
    eventType: "market_status_changed",
    occurredAt: "2026-06-24T00:02:00.000Z",
    payload: {
      marketStatus: "closed",
      currentTick: 43,
    },
  });

  const result = await publisher.publish(envelope);

  assertEquals(result.ok, true);
  assertEquals(transport.messages[0].event, "market_status_changed");
  assertEquals(transport.messages[0].payload.sequence, null);
});

Deno.test("game public realtime publisher rejects private/session fields", async () => {
  const transport = new CapturingTransport();
  const publisher = new GamePublicRealtimePublisher(transport);
  const privateFieldName = privateSessionFieldName();
  const envelope = {
    gameSessionId: GAME_SESSION_ID,
    channel: buildGamePublicRealtimeChannel(GAME_SESSION_ID),
    sequence: 44,
    eventType: "market_status_changed",
    occurredAt: "2026-06-24T00:03:00.000Z",
    payload: {
      marketStatus: "open",
      currentTick: 44,
      [privateFieldName]: "private-session",
    },
  } as never;

  const result = await publisher.publish(envelope);

  assertEquals(result, {
    ok: false,
    error: {
      code: "invalid_game_public_realtime_event",
      message: `Public realtime payload contains private field payload.${privateFieldName}.`,
      retryable: false,
    },
  });
  assertEquals(transport.messages, []);
});

Deno.test("game public realtime publisher rejects mismatched channel", () => {
  const envelope = {
    ...buildGamePublicRealtimeEnvelope({
      gameSessionId: GAME_SESSION_ID,
      sequence: 45,
      eventType: "market_status_changed",
      occurredAt: "2026-06-24T00:04:00.000Z",
      payload: {
        marketStatus: "open",
        currentTick: 45,
      },
    }),
    channel: "game:other:public",
  } as never;

  assertEquals(validateGamePublicRealtimeEnvelope(envelope), {
    ok: false,
    error: {
      code: "invalid_game_public_realtime_event",
      message: "Public realtime channel must match the game session.",
      retryable: false,
    },
  });
});

Deno.test("game public realtime publisher returns transport failures without throwing", async () => {
  const publisher = new GamePublicRealtimePublisher(
    new FailingTransport("broadcast service unavailable"),
  );
  const envelope = buildGamePublicRealtimeEnvelope({
    gameSessionId: GAME_SESSION_ID,
    sequence: 46,
    eventType: "market_status_changed",
    occurredAt: "2026-06-24T00:05:00.000Z",
    payload: {
      marketStatus: "open",
      currentTick: 46,
    },
  });

  const result = await publisher.publish(envelope);

  assertEquals(result, {
    ok: false,
    error: {
      code: "game_public_realtime_broadcast_failed",
      message: "broadcast service unavailable",
      retryable: true,
    },
  });
});

class CapturingTransport implements GamePublicRealtimeTransport {
  readonly messages: GamePublicRealtimeBroadcastMessage[] = [];

  async send(message: GamePublicRealtimeBroadcastMessage) {
    this.messages.push(message);
    return { ok: true as const };
  }
}

class FailingTransport implements GamePublicRealtimeTransport {
  constructor(private readonly message: string) {}

  async send() {
    return {
      ok: false as const,
      error: {
        code: "broadcast_failed",
        message: this.message,
        retryable: true,
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

function privateSessionFieldName(): string {
  return ["player", "Session", "Id"].join("");
}

function privateHashFieldName(): string {
  return ["session", "Token", "Hash"].join("");
}
