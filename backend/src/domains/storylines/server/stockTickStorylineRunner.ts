import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import type { StoryEffectContractWriter } from "../contracts/storyEffectExecutionContracts.ts";
import { SupabaseStoryEffectLedgerWriter } from "../infrastructure/supabaseStoryEffectLedgerWriter.ts";
import { SupabaseStoryContractWriter } from "../infrastructure/supabaseStoryContractWriter.ts";
import { SupabaseStoryEventExecutionRepository } from "../infrastructure/supabaseStoryEventExecutionRepository.ts";
import { SupabaseStorylineRepository } from "../infrastructure/supabaseStorylineRepository.ts";
import { runDueStorylineEvents as executeDueStorylineEvents } from "../services/storylineRunner.ts";
import { createStoryNotificationPublisher } from "./notificationCapabilities.ts";
import { createPlayerStoryContextReadQuery } from "./playerContextReadQuery.ts";

export interface StorylineAfterStockTickInput {
  readonly gameSessionId: string;
  readonly currentMarketTick: number;
  readonly generatedAt: string;
}

/** Compose Story-owned replay-safe execution; explicit writer injection is retained for tests. */
export function createStockTickStorylineRunner(
  client: EdgeSupabaseClient,
  createContractWriter: (
    client: EdgeSupabaseClient,
  ) => StoryEffectContractWriter = (client) => new SupabaseStoryContractWriter(client),
  runDueStorylineEvents: typeof executeDueStorylineEvents =
    executeDueStorylineEvents,
): (input: StorylineAfterStockTickInput) => Promise<void> {
  const storylineRepository = new SupabaseStorylineRepository(
    client as unknown as ConstructorParameters<
      typeof SupabaseStorylineRepository
    >[0],
  );
  const executionRepository = new SupabaseStoryEventExecutionRepository(client);
  const notificationRepository = createStoryNotificationPublisher(
    client as unknown as Parameters<typeof createStoryNotificationPublisher>[0],
  );
  const playerContextReadQuery = createPlayerStoryContextReadQuery(client);
  const contractRepository = createContractWriter(client);
  const ledger = new SupabaseStoryEffectLedgerWriter(
    client as unknown as ConstructorParameters<
      typeof SupabaseStoryEffectLedgerWriter
    >[0],
  );

  return async (input) => {
    const playerContexts = await playerContextReadQuery
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
        impacts: storylineRepository,
        contracts: contractRepository,
      },
    });
  };
}
