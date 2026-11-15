import { runDueStorylineEvents } from "./storylineRunner.ts";
import {
  assertEquals,
  createFakeEffectDependencies,
  cutsceneRevealPayload,
  FakeStorylineRepository,
  FakeStoryNotificationRepository,
  playerContext,
  storylineEventCandidate,
} from "./storylineRunner.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("storyline runner passes contract writer dependencies to contract_unlock effects", async () => {
  const repository = new FakeStorylineRepository({
    candidates: [
      storylineEventCandidate({
        id: "event-contract-1",
        eventKey: "unlock-northreach-brief",
        triggerType: "market_tick",
        scheduledMarketTick: 1,
        playerRules: [
          {
            condition: {
              type: "player_current_country_is",
              countryCode: "NORTHREACH",
            },
            effects: [
              {
                type: "contract_unlock",
                contractKey: "northreach_market_brief",
                label: "Northreach Market Brief",
                reason: "A storyline unlocked a new market contract.",
                payload: {
                  title: "Northreach Market Brief",
                  description: "Analyze the border closure.",
                  instructions: "Submit a short market brief.",
                  category: "research",
                  rewardPayload: {
                    cash: { amount: 100, currencyCode: "SLV" },
                  },
                },
              },
            ],
          },
        ],
      }),
    ],
  });
  const effectDependencies = createFakeEffectDependencies({
    enableContracts: true,
  });

  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [
      playerContext("player-1", "NORTHREACH"),
      playerContext("player-2", "YRETHIA"),
    ],
    repository,
    effectDependencies,
  });

  const eventResult = result.events[0] as {
    readonly effectResult?: { readonly appliedCount: number };
  };

  assertEquals(result.resolvedCount, 1);
  assertEquals(result.failedCount, 0);
  assertEquals(eventResult.effectResult?.appliedCount, 1);
  assertEquals(effectDependencies.writes.contracts.length, 1);
  assertEquals(
    effectDependencies.writes.contracts[0]?.contractKey,
    "northreach_market_brief",
  );
  assertEquals(effectDependencies.writes.contracts[0]?.gameSessionId, "game-1");
  assertEquals(
    effectDependencies.writes.contracts[0]?.sourceType,
    "story_event",
  );
  assertEquals(
    effectDependencies.writes.contracts[0]?.sourceId,
    "event-contract-1",
  );
  assertEquals(
    effectDependencies.writes.contracts[0]?.title,
    "Northreach Market Brief",
  );
  assertEquals(effectDependencies.writes.contracts[0]?.visibility, "public");
  assertEquals(effectDependencies.writes.contracts[0]?.status, "active");
});

Deno.test("storyline runner creates cutscene notification deliveries after inserted resolution", async () => {
  const repository = new FakeStorylineRepository({
    candidates: [
      storylineEventCandidate({
        id: "event-1",
        eventKey: "cutscene-event",
        triggerType: "market_tick",
        scheduledMarketTick: 1,
        revealPayload: cutsceneRevealPayload(),
      }),
    ],
  });
  const effectDependencies = createFakeEffectDependencies();
  const notificationRepository = new FakeStoryNotificationRepository();

  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [
      playerContext("player-1", "NORTHREACH"),
      playerContext("player-2", "YRETHIA"),
      playerContext("player-1", "NORTHREACH"),
    ],
    repository,
    effectDependencies,
    notificationRepository,
  });

  assertEquals(result.resolvedCount, 1);
  assertEquals(result.notificationCreatedCount, 1);
  assertEquals(result.notificationDeliveryCount, 2);
  assertEquals(result.notificationFailedCount, 0);
  assertEquals(
    notificationRepository.createdNotifications[0]?.sourceId,
    "event-1",
  );
  assertEquals(
    notificationRepository.createdNotifications[0]?.notificationType,
    "story_cutscene",
  );
  assertEquals(notificationRepository.createdDeliveries[0]?.playerIds, [
    "player-1",
    "player-2",
  ]);
});

Deno.test("storyline runner works with reveal payload when notification dependency is omitted", async () => {
  const repository = new FakeStorylineRepository({
    candidates: [
      storylineEventCandidate({
        id: "event-1",
        eventKey: "cutscene-without-notification-dependency",
        triggerType: "market_tick",
        scheduledMarketTick: 1,
        revealPayload: cutsceneRevealPayload(),
      }),
    ],
  });
  const effectDependencies = createFakeEffectDependencies();

  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [playerContext("player-1", "NORTHREACH")],
    repository,
    effectDependencies,
  });

  assertEquals(result.resolvedCount, 1);
  assertEquals(result.failedCount, 0);
  assertEquals(result.notificationCreatedCount, 0);
  assertEquals(result.notificationDeliveryCount, 0);
});

Deno.test("storyline runner reports notification creation failure safely", async () => {
  const repository = new FakeStorylineRepository({
    candidates: [
      storylineEventCandidate({
        id: "event-1",
        eventKey: "cutscene-notification-fails",
        triggerType: "market_tick",
        scheduledMarketTick: 1,
        revealPayload: cutsceneRevealPayload(),
      }),
    ],
  });
  const effectDependencies = createFakeEffectDependencies();
  const notificationRepository = new FakeStoryNotificationRepository({
    failCreateNotification: true,
  });

  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [playerContext("player-1", "NORTHREACH")],
    repository,
    effectDependencies,
    notificationRepository,
  });

  assertEquals(result.failedCount, 1);
  assertEquals(result.resolvedCount, 0);
  assertEquals(result.notificationFailedCount, 1);
  assertEquals(repository.resolutions.length, 1);
  assertEquals(result.events[0]?.status, "failed");
});
