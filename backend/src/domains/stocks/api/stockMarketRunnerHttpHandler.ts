import {
  runStockMarketRunner,
  logPublicRealtimePublishFailure,
  type StockMarketRunnerPublicRealtimePublisher,
  type StockMarketRunnerPublicRealtimePublishFailure,
} from "../application/runStockMarketRunner.ts";
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
import { calculateNextStockMarketTick } from "../calculations/stockMarketEngine.ts";
import {
  readStockMarketOpenState,
} from "../infrastructure/supabaseStockMarketWindowRepository.ts";
import {
  type CalculateStockMarketTick,
  StockMarketRunnerError,
  type StockMarketRunnerPostMarketNewsRequestBody,
  type StockMarketRunnerPostMarketNewsSuccessBody,
  type StockMarketRunnerRepository,
  type StockMarketRunnerRequestBody,
  type StockMarketRunnerResult,
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
  createStoryNotificationPublisher,
} from "../../notifications/public/storyNotifications.ts";
import {
  SupabaseStorylineRepository,
} from "../../storylines/infrastructure/supabaseStorylineRepository.ts";
import {
  SupabaseStoryEffectLedgerWriter,
} from "../../storylines/infrastructure/supabaseStoryEffectLedgerWriter.ts";
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
  readonly now?: () => Date;
  readonly readMarketOpenState?: (
    client: EdgeSupabaseClient,
    gameSessionId: string,
    at: Date,
  ) => Promise<boolean>;
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

    const tickOccurredAt = (dependencies.now ?? (() => new Date()))();
    if (!Number.isFinite(tickOccurredAt.getTime())) {
      throw new StockMarketRunnerError(
        "stock_market_clock_invalid",
        "Stock market runner clock returned an invalid timestamp.",
        500,
      );
    }

    const marketOpen = await (dependencies.readMarketOpenState ??
      readStockMarketOpenState)(
        serviceClient,
        body.gameSessionId,
        tickOccurredAt,
      );

    if (!marketOpen) {
      throw new StockMarketRunnerError(
        "stock_market_closed",
        "Stock market is closed in the configured game timezone.",
        409,
      );
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
      occurredAt: tickOccurredAt.toISOString(),
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
        retryable: error.code === "stock_market_closed",
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

function createDefaultStorylineRunnerAfterTick(
  client: EdgeSupabaseClient,
): StockMarketRunnerStorylineTickHook {
  const storylineRepository = new SupabaseStorylineRepository(client as any);
  const notificationRepository = createStoryNotificationPublisher(
    client as any,
  );
  const playerContextRepository = new SupabasePlayerStoryContextRepository(
    client as any,
  );
  const contractRepository = new SupabaseContractRepository(client as any);
  const ledger = new SupabaseStoryEffectLedgerWriter(client as any);

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

async function runStorylineEventsAfterStockTickBestEffort(args: {
  readonly hook?: (
    input: StockMarketRunnerStorylineTickHookInput,
  ) => Promise<void>;
  readonly result: StockMarketRunnerResult;
  readonly occurredAt: string;
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
      generatedAt: args.occurredAt,
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

function logStorylineRunnerFailure(
  failure: StockMarketRunnerStorylineTickHookFailure,
): void {
  console.warn("stock_market_runner_storyline_after_tick_failed", {
    code: failure.code,
    message: failure.message,
    retryable: failure.retryable,
  });
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
