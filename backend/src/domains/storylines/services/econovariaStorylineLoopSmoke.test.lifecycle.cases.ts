import { handleStockMarketRunnerRequest } from "../../stocks/api/stockMarketRunnerHttpHandler.ts";
import {
  GAME_SESSION_ID,
  PLAYER_ID,
  SECRET,
} from "./econovariaStorylineLoopSmoke.test.constants.support.ts";
import {
  createStorylineHook,
  InMemoryStockMarketRunnerRepository,
} from "./econovariaStorylineLoopSmoke.test.stockRunnerFixture.support.ts";
import { InMemoryEconovariaRuntime } from "./econovariaStorylineLoopSmoke.test.storyRuntime.support.ts";
import {
  calculateDeterministicTick,
  NoopPublicRealtimePublisher,
  runnerRequest,
} from "./econovariaStorylineLoopSmoke.test.eventFixtures.support.ts";
import {
  assertEquals,
  readJson,
} from "./econovariaStorylineLoopSmoke.test.assertions.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("econovaria demo storyline loop resolves cutscene ledger and contract effects idempotently", async () => {
  const stockRepository = new InMemoryStockMarketRunnerRepository();
  const runtime = new InMemoryEconovariaRuntime();

  runtime.createGameSession(GAME_SESSION_ID);
  runtime.createPlayer({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    cashBalance: 500,
  });
  stockRepository.initializeStockMarketAssetsForGame(
    GAME_SESSION_ID,
    "missing_only",
  );

  const seedResult = runtime.initializeDemoStorylineForGame(
    GAME_SESSION_ID,
    "missing_only",
  );
  const runStorylineEventsAfterTick = createStorylineHook(runtime);

  assertEquals(seedResult.storylineKey, "econovaria_demo_act_1");
  assertEquals(seedResult.storylineEventsAvailable, 3);
  assertEquals(seedResult.gameSessionStorylinesInserted, 1);

  const firstTickResponse = await handleStockMarketRunnerRequest(
    runnerRequest({ gameSessionId: GAME_SESSION_ID, tickIndex: 1 }, SECRET),
    {
      createServiceClient: () => ({}) as never,
      readSupabaseEnv: () => ({
        ok: true as const,
        value: {
          supabaseUrl: "https://example.supabase.co",
          supabaseAnonKey: "anon",
          supabaseServiceRoleKey: "service-role",
        },
      }),
      readRunnerSecret: () => SECRET,
      readMarketOpenState: async () => true,
      createRepository: () => stockRepository,
      calculateNextTick: calculateDeterministicTick,
      createPublicRealtimePublisher: () => new NoopPublicRealtimePublisher(),
      runStorylineEventsAfterTick,
    },
  );
  const firstTickBody = await readJson(firstTickResponse);

  assertEquals(firstTickResponse.status, 200);
  assertEquals(firstTickBody.ok, true);
  assertEquals(firstTickBody.tickIndex, 1);
  assertEquals(runtime.resolutionEventKeys(), ["act_1_market_briefing"]);
  assertEquals(runtime.storyFlagsForGame(GAME_SESSION_ID), {
    demo_act_1_briefing_complete: true,
  });

  const briefingNotification = runtime.notificationForEvent(
    "act_1_market_briefing",
  );
  const briefingDeliveries = runtime.deliveriesForNotification(
    briefingNotification?.id ?? "",
  );

  assertEquals(briefingNotification?.notificationType, "story_cutscene");
  assertEquals(briefingNotification?.displayMode, "modal_on_next_login");
  assertEquals(briefingDeliveries.map((delivery) => delivery.playerId), [
    PLAYER_ID,
  ]);
  assertEquals(
    runtime.ledgerEntries.map((entry) => ({
      functionName: entry.functionName,
      playerId: entry.input.playerId,
      signedAmount: entry.input.signedAmount,
      sourceAction: entry.args.p_source_action,
    })),
    [{
      functionName: "record_player_ledger_entry",
      playerId: PLAYER_ID,
      signedAmount: 75,
      sourceAction: "cash_credit",
    }],
  );
  assertEquals(runtime.playerCashBalance(PLAYER_ID), 500);

  await runStorylineEventsAfterTick({
    gameSessionId: GAME_SESSION_ID,
    currentMarketTick: 1,
    generatedAt: "2026-06-25T12:00:02.000Z",
  });

  assertEquals(runtime.resolutionEventKeys(), [
    "act_1_market_briefing",
    "act_1_contract_unlock",
  ]);
  assertEquals(runtime.contractKeys(), [
    "story_supplier_due_diligence_v1",
  ]);

  const countsBeforeRerun = runtime.snapshotCounts();

  await runStorylineEventsAfterTick({
    gameSessionId: GAME_SESSION_ID,
    currentMarketTick: 1,
    generatedAt: "2026-06-25T12:00:03.000Z",
  });

  assertEquals(runtime.snapshotCounts(), countsBeforeRerun);
  assertEquals(runtime.resolutionEventKeys(), [
    "act_1_market_briefing",
    "act_1_contract_unlock",
  ]);
  assertEquals(runtime.notificationEventKeys(), [
    "act_1_market_briefing",
    "act_1_contract_unlock",
  ]);
  assertEquals(runtime.contractKeys(), [
    "story_supplier_due_diligence_v1",
  ]);
  assertEquals(runtime.ledgerEntries.length, 1);
});
