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
  type StockMarketRunnerRepository,
  type StockMarketRunnerResult,
  type StockMarketRunnerRunInput,
} from "../contracts/stockMarketRunnerContracts.ts";
import type {
  GamePublicRealtimeEnvelope,
  GamePublicRealtimePublishResult,
} from "../../game-dashboard/realtime/gamePublicRealtimePublisher.ts";
import {
  buildGamePublicRealtimeStockTickEnvelope,
} from "../../game-dashboard/realtime/gamePublicRealtimeStockTick.ts";

// HTTP owns authorization, market-calendar time and the post-tick Story hook.
// This owner keeps the existing load → calculate → atomic apply → public event order.
export interface StockMarketRunnerPublicRealtimePublisher {
  publish<TEvent extends "stock_tick" | "market_news_posted">(
    envelope: GamePublicRealtimeEnvelope<TEvent>,
  ): Promise<GamePublicRealtimePublishResult<TEvent>>;
}

export interface StockMarketRunnerPublicRealtimePublishFailure {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
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

export function logPublicRealtimePublishFailure(
  failure: StockMarketRunnerPublicRealtimePublishFailure,
): void {
  console.warn("stock_market_runner_public_realtime_publish_failed", {
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
