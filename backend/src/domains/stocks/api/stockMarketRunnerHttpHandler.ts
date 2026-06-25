import {
  EdgeActivationError,
  jsonError,
  jsonResponse,
} from "../../../platform/supabase/edgeResponse.ts";
import { isRecord } from "../../../platform/supabase/edgeParsing.ts";
import {
  type SupabaseRealtimeBroadcastClient,
  SupabaseRealtimeBroadcastTransport,
} from "../../../platform/supabase/supabaseRealtimeBroadcastTransport.ts";
import {
  type EdgeSupabaseClient,
  readSupabaseEnv,
  type SupabaseEnv,
} from "../../../platform/supabase/edgeStaffSession.ts";
import {
  buildGamePublicRealtimeEnvelope,
  type GamePublicRealtimeEnvelope,
  GamePublicRealtimePublisher,
  type GamePublicRealtimePublishResult,
} from "../../game-dashboard/realtime/gamePublicRealtimePublisher.ts";
import {
  buildGamePublicRealtimeStockTickEnvelope,
} from "../../game-dashboard/realtime/gamePublicRealtimeStockTick.ts";
import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import { calculateNextStockMarketTick } from "../calculations/stockMarketEngine.ts";
import type {
  StockMarketChartPoint,
  StockMarketEngineInput,
  StockMarketEngineResult,
  StockPriceMovementExplanation,
} from "../contracts/stockMarketEngineContracts.ts";
import {
  type CalculateStockMarketTick,
  StockMarketRunnerError,
  type StockMarketRunnerPersistencePayload,
  type StockMarketRunnerPostMarketNewsRequestBody,
  type StockMarketRunnerPostMarketNewsSuccessBody,
  type StockMarketRunnerRepository,
  type StockMarketRunnerRequestBody,
  type StockMarketRunnerResult,
  type StockMarketRunnerRunInput,
  type StockMarketRunnerSuccessBody,
} from "../contracts/stockMarketRunnerContracts.ts";
import {
  SupabaseStockMarketRunnerRepository,
} from "../infrastructure/supabaseStockMarketRunnerRepository.ts";
import {
  parseStockMarketNewsCreateRequest,
  type StockMarketNewsCreateResult,
  StockMarketNewsError,
  type StockMarketNewsRepository,
} from "../contracts/stockMarketNewsContracts.ts";
import {
  SupabaseStockMarketNewsRepository,
} from "../infrastructure/supabaseStockMarketNewsRepository.ts";
import {
  SupabaseContractRepository,
} from "../../contracts/infrastructure/supabaseContractRepository.ts";
import {
  SupabasePlayerStoryContextRepository,
} from "../../storylines/infrastructure/supabasePlayerStoryContextRepository.ts";
import {
  SupabaseStoryNotificationRepository,
} from "../../storylines/infrastructure/supabaseStoryNotificationRepository.ts";
import {
  SupabaseStorylineRepository,
} from "../../storylines/infrastructure/supabaseStorylineRepository.ts";
import type {
  StoryEffectLedgerWriter,
} from "../../storylines/contracts/storyEffectExecutionContracts.ts";
import {
  runDueStorylineEvents,
} from "../../storylines/services/storylineRunner.ts";

declare const Deno: {
  readonly env: {
    get(name: string): string | undefined;
  };
};

interface StockMarketRunnerHttpDependencies {
  readonly createServiceClient: (env: SupabaseEnv) => EdgeSupabaseClient;
  readonly readSupabaseEnv?: () =>
    | { readonly ok: true; readonly value: SupabaseEnv }
    | { readonly ok: false; readonly missing: readonly string[] };
  readonly readRunnerSecret?: () => string | undefined;
  readonly createRepository?: (
    client: EdgeSupabaseClient,
  ) => StockMarketRunnerRepository;
  readonly createNewsRepository?: (
    client: EdgeSupabaseClient,
  ) => StockMarketNewsRepository;
  readonly calculateNextTick?: CalculateStockMarketTick;
  readonly createPublicRealtimePublisher?: (
    client: EdgeSupabaseClient,
  ) => StockMarketRunnerPublicRealtimePublisher;
  readonly logPublicRealtimePublishFailure?: (
    failure: StockMarketRunnerPublicRealtimePublishFailure,
  ) => void;
  readonly runStorylineEventsAfterTick?: StockMarketRunnerStorylineTickHook;
  readonly createStorylineRunnerAfterTick?: (
    client: EdgeSupabaseClient,
  ) => StockMarketRunnerStorylineTickHook | null | undefined;
  readonly logStorylineRunnerFailure?: (
    failure: StockMarketRunnerStorylineTickHookFailure,
  ) => void;
}

interface StockMarketRunnerPublicRealtimePublisher {
  publish<TEvent extends "stock_tick" | "market_news_posted">(
    envelope: GamePublicRealtimeEnvelope<TEvent>,
  ): Promise<GamePublicRealtimePublishResult<TEvent>>;
}

interface StockMarketRunnerPublicRealtimePublishFailure {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

type StockMarketRunnerStorylineTickHook = (
  input: StockMarketRunnerStorylineTickHookInput,
) => Promise<void>;

interface StockMarketRunnerStorylineTickHookInput {
  readonly gameSessionId: string;
  readonly currentMarketTick: number;
  readonly generatedAt: string;
}

interface StockMarketRunnerStorylineTickHookFailure {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export async function handleStockMarketRunnerRequest(
  request: Request,
  dependencies: StockMarketRunnerHttpDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonError(405, {
      code: "method_not_allowed",
      message: "Use POST to run one stock market tick.",
      retryable: false,
    });
  }

  const expectedSecret = readConfiguredRunnerSecret(dependencies);

  if (!expectedSecret) {
    return jsonError(500, {
      code: "stock_market_runner_secret_not_configured",
      message: "Stock market runner secret is not configured.",
      retryable: false,
    });
  }

  if (request.headers.get("x-stock-market-runner-secret") !== expectedSecret) {
    return jsonError(401, {
      code: "unauthorized_stock_market_runner",
      message: "Stock market runner secret is missing or invalid.",
      retryable: false,
    });
  }

  try {
    const envResult = (dependencies.readSupabaseEnv ?? readSupabaseEnv)();

    if (!envResult.ok) {
      return jsonError(500, {
        code: "missing_edge_runtime_config",
        message: "Supabase Edge runtime configuration is missing.",
        retryable: false,
      });
    }

    const body = await readStockMarketRunnerRequestBody(request);
    const serviceClient = dependencies.createServiceClient(envResult.value);
    const repository = dependencies.createRepository
      ? dependencies.createRepository(serviceClient)
      : new SupabaseStockMarketRunnerRepository(serviceClient as any);
    const publicRealtimePublisher = dependencies.createPublicRealtimePublisher
      ? dependencies.createPublicRealtimePublisher(serviceClient)
      : createDefaultPublicRealtimePublisher(serviceClient);

    if (body.action === "post_market_news") {
      const newsRepository = dependencies.createNewsRepository
        ? dependencies.createNewsRepository(serviceClient)
        : new SupabaseStockMarketNewsRepository(serviceClient as any);
      const result = await postStockMarketNews(body, {
        newsRepository,
        publicRealtimePublisher,
        logPublicRealtimePublishFailure: dependencies
          .logPublicRealtimePublishFailure,
      });

      return jsonResponse<StockMarketRunnerPostMarketNewsSuccessBody>(200, {
        ok: true,
        action: "post_market_news",
        gameSessionId: body.gameSessionId,
        news: result.news,
      });
    }

    const storylineRunnerAfterTick = dependencies.runStorylineEventsAfterTick ??
      (dependencies.createStorylineRunnerAfterTick
        ? dependencies.createStorylineRunnerAfterTick(serviceClient)
        : createDefaultStorylineRunnerAfterTick(serviceClient));

    const result = await runStockMarketRunner(body, {
      repository,
      calculateNextTick: dependencies.calculateNextTick ??
        calculateNextStockMarketTick,
      publicRealtimePublisher,
      logPublicRealtimePublishFailure: dependencies
        .logPublicRealtimePublishFailure,
    });

    await runStorylineEventsAfterStockTickBestEffort({
      hook: storylineRunnerAfterTick ?? undefined,
      result,
      onFailure: dependencies.logStorylineRunnerFailure ??
        logStorylineRunnerFailure,
    });

    return jsonResponse<StockMarketRunnerSuccessBody>(200, {
      ok: true,
      gameSessionId: result.gameSessionId,
      tickIndex: result.tickIndex,
      assetsProcessed: result.assetsProcessed,
      ticksInserted: result.ticksInserted,
      generatedAt: result.generatedAt,
    });
  } catch (error) {
    if (error instanceof StockMarketNewsError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }

    if (error instanceof StockMarketRunnerError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: false,
      });
    }

    if (error instanceof EdgeActivationError) {
      return jsonError(error.status, {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      });
    }

    return jsonError(500, {
      code: "stock_market_runner_failed",
      message: "Stock market runner failed.",
      retryable: false,
    });
  }
}

export async function postStockMarketNews(
  input: StockMarketRunnerPostMarketNewsRequestBody,
  dependencies: {
    readonly newsRepository: StockMarketNewsRepository;
    readonly publicRealtimePublisher?: StockMarketRunnerPublicRealtimePublisher;
    readonly logPublicRealtimePublishFailure?: (
      failure: StockMarketRunnerPublicRealtimePublishFailure,
    ) => void;
  },
): Promise<StockMarketNewsCreateResult> {
  const currentTick = await dependencies.newsRepository.readCurrentTick(
    input.gameSessionId,
  );
  const createdTick = currentTick + 1;
  const result = await dependencies.newsRepository.create({
    ...input,
    shockId: buildStockMarketNewsShockId(input, createdTick),
    createdTick,
  });

  await publishMarketNewsPublicRealtimeBestEffort({
    publisher: dependencies.publicRealtimePublisher,
    gameSessionId: input.gameSessionId,
    result,
    onFailure: dependencies.logPublicRealtimePublishFailure ??
      logPublicRealtimePublishFailure,
  });

  return result;
}

async function publishMarketNewsPublicRealtimeBestEffort(args: {
  readonly publisher?: StockMarketRunnerPublicRealtimePublisher;
  readonly gameSessionId: string;
  readonly result: StockMarketNewsCreateResult;
  readonly onFailure: (
    failure: StockMarketRunnerPublicRealtimePublishFailure,
  ) => void;
}): Promise<void> {
  if (!args.publisher) {
    return;
  }

  const news = args.result.news;
  let envelope: GamePublicRealtimeEnvelope<"market_news_posted">;

  try {
    envelope = buildGamePublicRealtimeEnvelope({
      gameSessionId: args.gameSessionId,
      sequence: news.createdTick,
      eventType: "market_news_posted",
      occurredAt: news.createdAt,
      payload: {
        news: {
          id: news.id,
          headline: news.headline,
          explanation: news.explanation,
          category: String(news.category),
          sentiment: String(news.sentiment),
          source: String(news.source),
          scope: String(news.scope),
          targetKey: news.targetKey,
          createdTick: news.createdTick,
          expiresTick: news.expiresTick,
          createdAt: news.createdAt,
        },
      },
    });
  } catch (_error) {
    args.onFailure({
      code: "market_news_public_realtime_envelope_failed",
      message: "Market news public realtime event could not be built.",
      retryable: false,
    });
    return;
  }

  let publishResult: GamePublicRealtimePublishResult<"market_news_posted">;

  try {
    publishResult = await args.publisher.publish(envelope);
  } catch (_error) {
    args.onFailure({
      code: "market_news_public_realtime_publish_failed",
      message: "Market news public realtime event could not be published.",
      retryable: true,
    });
    return;
  }

  if (!publishResult.ok) {
    args.onFailure(publishResult.error);
  }
}

function buildStockMarketNewsShockId(
  input: StockMarketRunnerPostMarketNewsRequestBody,
  createdTick: number,
): string {
  const target = input.targetKey ?? "global";

  return [
    "market-news",
    input.gameSessionId,
    createdTick,
    input.category,
    input.scope,
    target,
    Date.now(),
  ].join(":");
}

export async function runStockMarketRunner(
  input: StockMarketRunnerRunInput,
  dependencies: {
    readonly repository: StockMarketRunnerRepository;
    readonly calculateNextTick?: CalculateStockMarketTick;
    readonly publicRealtimePublisher?: StockMarketRunnerPublicRealtimePublisher;
    readonly logPublicRealtimePublishFailure?: (
      failure: StockMarketRunnerPublicRealtimePublishFailure,
    ) => void;
  },
): Promise<StockMarketRunnerResult> {
  const loaded = await dependencies.repository.load({
    gameSessionId: input.gameSessionId,
    tickIndex: input.tickIndex,
  });
  const seed = input.seed?.trim() ||
    `stock-market-runner-v1:${input.gameSessionId}`;
  const engineInput: StockMarketEngineInput = {
    gameSessionId: loaded.gameSessionId,
    seed,
    tickIndex: loaded.tickIndex,
    assets: loaded.assets,
    macro: loaded.macro,
    countries: loaded.countries,
    sectors: loaded.sectors,
    shocks: loaded.shocks,
    regime: loaded.regime,
  };
  let result: StockMarketEngineResult;

  try {
    result = (dependencies.calculateNextTick ?? calculateNextStockMarketTick)(
      engineInput,
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Stock market engine failed.";

    throw new StockMarketRunnerError(
      "stock_market_engine_failed",
      message,
      500,
    );
  }

  const applyResult = await dependencies.repository.apply(
    buildStockMarketRunnerPersistencePayload({ loaded, result }),
  );

  await publishStockTickPublicRealtimeBestEffort({
    publisher: dependencies.publicRealtimePublisher,
    loaded,
    result,
    onFailure: dependencies.logPublicRealtimePublishFailure ??
      logPublicRealtimePublishFailure,
  });

  return {
    gameSessionId: loaded.gameSessionId,
    tickIndex: loaded.tickIndex,
    assetsProcessed: result.rows.length,
    ticksInserted: applyResult.ticksInserted,
    generatedAt: result.generatedAt,
  };
}

async function publishStockTickPublicRealtimeBestEffort(args: {
  readonly publisher?: StockMarketRunnerPublicRealtimePublisher;
  readonly loaded: {
    readonly gameSessionId: string;
    readonly tickIndex: number;
    readonly assets: readonly {
      readonly assetId: string;
      readonly ticker: string;
      readonly countryCode: string;
    }[];
  };
  readonly result: StockMarketEngineResult;
  readonly onFailure: (
    failure: StockMarketRunnerPublicRealtimePublishFailure,
  ) => void;
}): Promise<void> {
  if (!args.publisher) {
    return;
  }

  let envelope: GamePublicRealtimeEnvelope<"stock_tick">;

  try {
    envelope = buildGamePublicRealtimeStockTickEnvelope({
      gameSessionId: args.loaded.gameSessionId,
      tickIndex: args.loaded.tickIndex,
      generatedAt: args.result.generatedAt,
      assets: args.loaded.assets,
      rows: args.result.rows,
      ticks: args.result.ticks,
    });
  } catch (_error) {
    args.onFailure({
      code: "stock_tick_public_realtime_envelope_failed",
      message: "Stock tick public realtime event could not be built.",
      retryable: false,
    });
    return;
  }

  let publishResult: GamePublicRealtimePublishResult<"stock_tick">;

  try {
    publishResult = await args.publisher.publish(envelope);
  } catch (_error) {
    args.onFailure({
      code: "stock_tick_public_realtime_publish_failed",
      message: "Stock tick public realtime event could not be published.",
      retryable: true,
    });
    return;
  }

  if (!publishResult.ok) {
    args.onFailure(publishResult.error);
  }
}

function createDefaultStorylineRunnerAfterTick(
  client: EdgeSupabaseClient,
): StockMarketRunnerStorylineTickHook {
  const storylineRepository = new SupabaseStorylineRepository(client as any);
  const notificationRepository = new SupabaseStoryNotificationRepository(
    client as any,
  );
  const playerContextRepository = new SupabasePlayerStoryContextRepository(
    client as any,
  );
  const contractRepository = new SupabaseContractRepository(client as any);
  const ledger = createFailClosedStorylineLedgerWriter();

  return async (input) => {
    const playerContexts = await playerContextRepository
      .listPlayerStoryContexts(
        input.gameSessionId,
      );

    await runDueStorylineEvents({
      gameSessionId: input.gameSessionId,
      now: input.generatedAt,
      currentMarketTick: input.currentMarketTick,
      playerContexts,
      repository: storylineRepository,
      notificationRepository,
      effectDependencies: {
        ledger,
        policies: storylineRepository,
        flags: storylineRepository,
        impacts: storylineRepository,
        contracts: contractRepository,
      },
    });
  };
}

function createFailClosedStorylineLedgerWriter(): StoryEffectLedgerWriter {
  return {
    async recordCashAdjustment() {
      throw new Error(
        "Storyline cash effects require a ledger writer before production execution.",
      );
    },
  };
}

async function runStorylineEventsAfterStockTickBestEffort(args: {
  readonly hook?: (
    input: StockMarketRunnerStorylineTickHookInput,
  ) => Promise<void>;
  readonly result: StockMarketRunnerResult;
  readonly onFailure: (
    failure: StockMarketRunnerStorylineTickHookFailure,
  ) => void;
}): Promise<void> {
  if (!args.hook) {
    return;
  }

  try {
    await args.hook({
      gameSessionId: args.result.gameSessionId,
      currentMarketTick: args.result.tickIndex,
      generatedAt: args.result.generatedAt,
    });
  } catch (error) {
    args.onFailure({
      code: "storyline_runner_after_stock_tick_failed",
      message: error instanceof Error
        ? error.message
        : "Storyline runner failed after stock tick.",
      retryable: true,
    });
  }
}

function createDefaultPublicRealtimePublisher(
  client: EdgeSupabaseClient,
): StockMarketRunnerPublicRealtimePublisher {
  return new GamePublicRealtimePublisher(
    new SupabaseRealtimeBroadcastTransport(
      client as unknown as SupabaseRealtimeBroadcastClient,
    ),
  );
}

function logPublicRealtimePublishFailure(
  failure: StockMarketRunnerPublicRealtimePublishFailure,
): void {
  console.warn("stock_market_runner_public_realtime_publish_failed", {
    code: failure.code,
    message: failure.message,
    retryable: failure.retryable,
  });
}

function logStorylineRunnerFailure(
  failure: StockMarketRunnerStorylineTickHookFailure,
): void {
  console.warn("stock_market_runner_storyline_after_tick_failed", {
    code: failure.code,
    message: failure.message,
    retryable: failure.retryable,
  });
}

export function buildStockMarketRunnerPersistencePayload(args: {
  readonly loaded: {
    readonly gameSessionId: string;
    readonly tickIndex: number;
    readonly assets: readonly {
      readonly assetId: string;
      readonly recentReturns?: readonly number[];
    }[];
  };
  readonly result: StockMarketEngineResult;
}): StockMarketRunnerPersistencePayload {
  const assetById = new Map(
    args.loaded.assets.map((asset) => [asset.assetId, asset]),
  );
  const rowByTicker = new Map(
    args.result.rows.map((row) => [row.ticker, row]),
  );
  const assetUpdates = args.result.ticks.map((tick) => {
    const row = rowByTicker.get(tick.ticker);
    const loadedAsset = assetById.get(tick.assetId);

    if (!row || !loadedAsset) {
      throw new StockMarketRunnerError(
        "stock_market_tick_apply_failed",
        "Stock market engine result did not match the loaded assets.",
        500,
      );
    }

    return {
      game_session_id: args.loaded.gameSessionId,
      asset_id: tick.assetId,
      current_price: row.currentPrice,
      previous_close: row.previousClose,
      open_price: row.openPrice,
      day_high: row.dayHigh,
      day_low: row.dayLow,
      market_cap: row.marketCap,
      current_volatility: tick.currentVolatility,
      long_run_volatility: tick.longRunVolatility,
      recent_returns: appendRecentReturn(
        loadedAsset.recentReturns ?? [],
        tick.changePct / 100,
      ),
      chart_history: row.history.map(toJsonObject),
    };
  });
  const tickRows = args.result.ticks.map((tick) => ({
    game_session_id: args.loaded.gameSessionId,
    stock_asset_id: tick.assetId,
    tick_index: tick.tickIndex,
    ticker: tick.ticker,
    price: tick.price,
    previous_price: tick.previousPrice,
    log_return: tick.logReturn,
    change_pct: tick.changePct,
    volume: tick.volume,
    current_volatility: tick.currentVolatility,
    long_run_volatility: tick.longRunVolatility,
    explanation: toExplanationJson(tick.explanation),
  }));

  return {
    gameSessionId: args.loaded.gameSessionId,
    tickIndex: args.loaded.tickIndex,
    assetUpdates,
    tickRows,
  };
}

async function readStockMarketRunnerRequestBody(
  request: Request,
): Promise<StockMarketRunnerRequestBody> {
  let value: unknown;

  try {
    value = await request.json();
  } catch (_error) {
    throw new StockMarketRunnerError(
      "invalid_stock_market_runner_request",
      "Request body must be valid JSON.",
      400,
    );
  }

  if (!isRecord(value)) {
    throw new StockMarketRunnerError(
      "invalid_stock_market_runner_request",
      "Request body must be a JSON object.",
      400,
    );
  }

  if (
    Array.isArray(value.gameSessionId) ||
    Array.isArray(value.gameSessionIds) ||
    Array.isArray(value.gameSessions) ||
    Array.isArray(value.sessions)
  ) {
    throw new StockMarketRunnerError(
      "invalid_stock_market_runner_request",
      "Stock market runner accepts exactly one gameSessionId per request.",
      400,
    );
  }

  const action = typeof value.action === "string"
    ? value.action.trim()
    : "run_tick";

  if (action === "post_market_news") {
    return {
      action,
      ...parseStockMarketNewsCreateRequest(value),
    };
  }

  if (action !== "run_tick") {
    throw new StockMarketRunnerError(
      "invalid_stock_market_runner_request",
      "Unsupported stock market runner action.",
      400,
    );
  }

  const gameSessionId = typeof value.gameSessionId === "string"
    ? value.gameSessionId.trim()
    : "";

  if (!gameSessionId) {
    throw new StockMarketRunnerError(
      "invalid_stock_market_runner_request",
      "gameSessionId is required.",
      400,
    );
  }

  return {
    action: "run_tick",
    gameSessionId,
    tickIndex: readOptionalTickIndex(value.tickIndex),
    seed: readOptionalSeed(value.seed),
  };
}

function readConfiguredRunnerSecret(
  dependencies: StockMarketRunnerHttpDependencies,
): string | undefined {
  return dependencies.readRunnerSecret
    ? dependencies.readRunnerSecret()
    : Deno.env.get("STOCK_MARKET_RUNNER_SECRET");
}

function readOptionalTickIndex(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new StockMarketRunnerError(
      "invalid_stock_market_runner_request",
      "tickIndex must be a non-negative integer when provided.",
      400,
    );
  }

  return value;
}

function readOptionalSeed(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const seed = typeof value === "string" ? value.trim() : "";

  if (!seed) {
    throw new StockMarketRunnerError(
      "invalid_stock_market_runner_request",
      "seed must be a non-empty string when provided.",
      400,
    );
  }

  return seed;
}

function appendRecentReturn(
  existing: readonly number[],
  nextReturn: number,
): readonly JsonValue[] {
  return [...existing, nextReturn].slice(-30);
}

function toJsonObject(point: StockMarketChartPoint): JsonObject {
  const value: JsonObject = {
    tickIndex: point.tickIndex,
    timestamp: point.timestamp,
    label: point.label,
    price: point.price,
  };

  if (point.gameSessionId) {
    return {
      ...value,
      gameSessionId: point.gameSessionId,
      volume: point.volume ?? null,
    };
  }

  return {
    ...value,
    volume: point.volume ?? null,
  };
}

function toExplanationJson(
  explanation: StockPriceMovementExplanation,
): JsonObject {
  return {
    gameSessionId: explanation.gameSessionId,
    tickIndex: explanation.tickIndex,
    ticker: explanation.ticker,
    headline: explanation.headline,
    summary: explanation.summary,
    studentText: explanation.studentText,
    components: { ...explanation.components },
    appliedShockIds: [...explanation.appliedShockIds],
    regime: explanation.regime,
  };
}
