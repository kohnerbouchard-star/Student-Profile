import type {
  EdgeSupabaseClient,
} from "../../../src/platform/supabase/edgeStaffSession.ts";
import {
  SupabaseStockMarketNewsRepository,
} from "../../../src/domains/stocks/infrastructure/supabaseStockMarketNewsRepository.ts";
import {
  withOptionalStoryEventOverrideReads,
} from "../../../src/domains/storylines/infrastructure/optionalStoryEventOverrideClient.ts";
import {
  SupabasePlayerStoryContextRepository,
} from "../../../src/domains/storylines/infrastructure/supabasePlayerStoryContextRepository.ts";
import {
  StockMarketStoryNewsWriter,
} from "../../../src/domains/storylines/infrastructure/stockMarketStoryNewsWriter.ts";
import {
  SupabaseStoryContractWriter,
} from "../../../src/domains/storylines/infrastructure/supabaseStoryContractWriter.ts";
import {
  SupabaseStoryEffectLedgerWriter,
} from "../../../src/domains/storylines/infrastructure/supabaseStoryEffectLedgerWriter.ts";
import {
  SupabaseStoryEventExecutionRepository,
} from "../../../src/domains/storylines/infrastructure/supabaseStoryEventExecutionRepository.ts";
import {
  SupabaseStoryImpactWriter,
} from "../../../src/domains/storylines/infrastructure/supabaseStoryImpactWriter.ts";
import {
  SupabaseStoryNotificationRepository,
} from "../../../src/domains/storylines/infrastructure/supabaseStoryNotificationRepository.ts";
import {
  SupabaseStorylineRepository,
} from "../../../src/domains/storylines/infrastructure/supabaseStorylineRepository.ts";
import {
  SupabaseStoryWorldFxWriter,
} from "../../../src/domains/storylines/infrastructure/supabaseStoryWorldFxWriter.ts";
import {
  runDueStorylineEvents,
} from "../../../src/domains/storylines/services/storylineRunner.ts";

interface StorylineTickInput {
  readonly gameSessionId: string;
  readonly currentMarketTick: number;
  readonly generatedAt: string;
}

export function createStorylineRunnerAfterTick(
  client: EdgeSupabaseClient,
): (input: StorylineTickInput) => Promise<void> {
  const storylineRepository = new SupabaseStorylineRepository(
    withOptionalStoryEventOverrideReads(client as any) as any,
  );
  const executionRepository = new SupabaseStoryEventExecutionRepository(
    client as any,
  );
  const notificationRepository = new SupabaseStoryNotificationRepository(
    client as any,
  );
  const playerContextRepository = new SupabasePlayerStoryContextRepository(
    client as any,
  );
  const contractWriter = new SupabaseStoryContractWriter(client as any);
  const impactWriter = new SupabaseStoryImpactWriter(client as any);
  const marketNews = new StockMarketStoryNewsWriter(
    new SupabaseStockMarketNewsRepository(client as any),
  );
  const ledger = new SupabaseStoryEffectLedgerWriter(client as any);
  const worldFx = new SupabaseStoryWorldFxWriter(client as any);

  return async (input: StorylineTickInput): Promise<void> => {
    const playerContexts = await playerContextRepository
      .listPlayerStoryContexts(input.gameSessionId);

    await runDueStorylineEvents({
      gameSessionId: input.gameSessionId,
      now: input.generatedAt,
      currentMarketTick: input.currentMarketTick,
      playerContexts,
      repository: storylineRepository,
      executionRepository,
      notificationRepository,
      effectDependencies: {
        ledger,
        policies: storylineRepository,
        flags: storylineRepository,
        impacts: impactWriter,
        contracts: contractWriter,
        marketNews,
        world: worldFx,
        currency: worldFx,
      },
    });
  };
}
