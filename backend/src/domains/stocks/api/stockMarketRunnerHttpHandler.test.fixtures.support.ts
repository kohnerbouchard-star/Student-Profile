import {
  buildGamePublicRealtimeEnvelope,
  buildGamePublicRealtimeStockTickEnvelope,
  type GamePublicRealtimeBroadcastMessage,
  type GamePublicRealtimeEnvelope,
  GamePublicRealtimePublisher,
  type GamePublicRealtimePublishResult,
  type GamePublicRealtimeTransport,
} from "../../game-dashboard/publicRealtime.ts";
export {
  buildGamePublicRealtimeEnvelope,
  buildGamePublicRealtimeStockTickEnvelope,
  type GamePublicRealtimeBroadcastMessage,
  type GamePublicRealtimeEnvelope,
  GamePublicRealtimePublisher,
  type GamePublicRealtimePublishResult,
  type GamePublicRealtimeTransport,
};
import type {
  StockMarketEngineInput,
  StockMarketEngineResult,
} from "../contracts/stockMarketEngineContracts.ts";
import type { StockMarketRunnerRepository } from "../contracts/stockMarketRunnerContracts.ts";
import type {
  StockMarketNewsCreateResult,
  StockMarketNewsInsertInput,
  StockMarketNewsRepository,
} from "../contracts/stockMarketNewsContracts.ts";

export const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";

export const ASSET_ID = "00000000-0000-4000-8000-000000000101";

export const SECRET = "runner-secret";

export const WALL_CLOCK_TIME = "2026-07-20T00:00:00.000Z";

export function dependencies(options: {
  readonly createServiceClient?: () => unknown;
  readonly repository?: StockMarketRunnerRepository;
  readonly readRunnerSecret?: () => string | undefined;
  readonly now?: () => Date;
  readonly readMarketOpenState?: () => Promise<boolean>;
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
    now: options.now ?? (() => new Date(WALL_CLOCK_TIME)),
    readMarketOpenState: options.readMarketOpenState ?? (async () => true),
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

export function request(body: unknown, secret?: string): Request {
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

export function engineResult(input: StockMarketEngineInput): StockMarketEngineResult {
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

export class MockRunnerRepository implements StockMarketRunnerRepository {
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

export class MockMarketNewsRepository implements StockMarketNewsRepository {
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

export class CapturingRealtimeTransport implements GamePublicRealtimeTransport {
  readonly messages: GamePublicRealtimeBroadcastMessage[] = [];

  constructor(private readonly beforeSend?: () => void) {}

  async send(message: GamePublicRealtimeBroadcastMessage) {
    this.beforeSend?.();
    this.messages.push(message);
    return { ok: true as const };
  }
}

export class FailingRealtimeTransport implements GamePublicRealtimeTransport {
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

export class NoopPublicRealtimePublisher {
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

export class ThrowingPublicRealtimePublisher {
  async publish<TEvent extends "stock_tick" | "market_news_posted">(): Promise<
    GamePublicRealtimePublishResult<TEvent>
  > {
    throw new Error("publish unavailable");
  }
}

export async function readJson(response: Response): Promise<any> {
  return await response.json();
}

export function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed.\nActual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}

export function assertNoPrivateRealtimeFields(value: unknown): void {
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

export function privateFieldName(...parts: readonly string[]): string {
  return parts.join("");
}
