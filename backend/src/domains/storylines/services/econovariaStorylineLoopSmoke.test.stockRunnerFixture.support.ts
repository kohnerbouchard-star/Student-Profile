import type {
  StockMarketRunnerPersistencePayload,
  StockMarketRunnerRepository,
} from "../../stocks/contracts/stockMarketRunnerContracts.ts";
import { runDueStorylineEvents } from "./storylineRunner.ts";
import { ASSET_ID } from "./econovariaStorylineLoopSmoke.test.constants.support.ts";
import { InMemoryEconovariaRuntime } from "./econovariaStorylineLoopSmoke.test.storyRuntime.support.ts";

export function createStorylineHook(runtime: InMemoryEconovariaRuntime): (
  input: {
    readonly gameSessionId: string;
    readonly currentMarketTick: number;
    readonly generatedAt: string;
  },
) => Promise<void> {
  return async (input) => {
    const playerContexts = await runtime.listPlayerStoryContexts(
      input.gameSessionId,
    );

    await runDueStorylineEvents({
      gameSessionId: input.gameSessionId,
      now: input.generatedAt,
      currentMarketTick: input.currentMarketTick,
      playerContexts,
      repository: runtime,
      executionRepository: runtime.executionRepository,
      notificationRepository: runtime,
      effectDependencies: {
        ledger: runtime,
        policies: runtime,
        flags: runtime,
        impacts: runtime,
        contracts: runtime,
      },
    });
  };
}

export class InMemoryStockMarketRunnerRepository
  implements StockMarketRunnerRepository {
  private readonly initializedGameSessionIds = new Set<string>();
  readonly appliedPayloads: StockMarketRunnerPersistencePayload[] = [];

  initializeStockMarketAssetsForGame(
    gameSessionId: string,
    mode: "missing_only" | "reset_empty_only",
  ): void {
    if (
      mode === "reset_empty_only" && this.initializedGameSessionIds.has(
        gameSessionId,
      )
    ) {
      throw new Error("STOCK_MARKET_RESET_EMPTY_ONLY_CONFLICT");
    }

    this.initializedGameSessionIds.add(gameSessionId);
  }

  load(
    input: { readonly gameSessionId: string; readonly tickIndex?: number },
  ) {
    if (!this.initializedGameSessionIds.has(input.gameSessionId)) {
      throw new Error("Stock market assets were not initialized.");
    }

    return Promise.resolve({
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
    });
  }

  apply(payload: StockMarketRunnerPersistencePayload) {
    this.appliedPayloads.push(payload);

    return Promise.resolve({
      assetsUpdated: payload.assetUpdates.length,
      ticksInserted: payload.tickRows.length,
    });
  }
}
