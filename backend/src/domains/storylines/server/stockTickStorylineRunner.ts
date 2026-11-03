import type { EdgeSupabaseClient } from "../../../platform/supabase/edgeStaffSession.ts";
import { createStoryNotificationPublisher } from "../../notifications/public/storyNotifications.ts";
import type { StoryEffectContractWriter } from "../contracts/storyEffectExecutionContracts.ts";
import { SupabaseStoryEffectLedgerWriter } from "../infrastructure/supabaseStoryEffectLedgerWriter.ts";
import { SupabaseStorylineRepository } from "../infrastructure/supabaseStorylineRepository.ts";
import type { runDueStorylineEvents as RunDueStorylineEvents } from "../services/storylineRunner.ts";
import { createPlayerStoryContextReadQuery } from "./playerContextReadQuery.ts";

export interface StorylineAfterStockTickInput {
  readonly gameSessionId: string;
  readonly currentMarketTick: number;
  readonly generatedAt: string;
}

/** Compose the default server-side Story hook without owning the caller's Contract adapter. */
export function createStockTickStorylineRunner(
  client: EdgeSupabaseClient,
  createContractWriter: (
    client: EdgeSupabaseClient,
  ) => StoryEffectContractWriter,
  runDueStorylineEvents: typeof RunDueStorylineEvents,
): (input: StorylineAfterStockTickInput) => Promise<void> {
  const storylineRepository = new SupabaseStorylineRepository(
    client as unknown as ConstructorParameters<
      typeof SupabaseStorylineRepository
    >[0],
  );
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
