import { StorylineExecutionFixture } from "./storylineExecutionFixture.test.support.ts";
import { runDueStorylineEvents } from "./storylineRunner.ts";
import {
  assertEquals,
  createFakeEffectDependencies,
  cutsceneRevealPayload,
  failingEffectRepository,
  FakeStorylineRepository,
  FakeStoryNotificationRepository,
  playerContext,
  storylineEventCandidate,
} from "./storylineRunner.test.fixtures.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("storyline runner resolves eligible event and applies player rules only to matching players", async () => {
  const repository = new FakeStorylineRepository({
    candidates: [
      storylineEventCandidate({
        id: "event-1",
        eventKey: "northreach-levy",
        triggerType: "elapsed_time",
        scheduledOffsetSeconds: 300,
        playerRules: [
          {
            ruleKey: "northreach-only",
            condition: {
              type: "player_current_country_is",
              countryCode: "NORTHREACH",
            },
            effects: [
              {
                type: "cash_debit",
                amount: 150,
                label: "Emergency security levy",
                reason: "You were located in Northreach.",
              },
            ],
          },
        ],
      }),
    ],
  });
  const effectDependencies = createFakeEffectDependencies();

  const executionRepository = new StorylineExecutionFixture();
  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [
      playerContext("player-1", "NORTHREACH"),
      playerContext("player-2", "YRETHIA"),
    ],
    repository,
    executionRepository,
    effectDependencies,
  });

  assertEquals(result.resolvedCount, 1);
  assertEquals(result.skippedCount, 0);
  assertEquals(result.failedCount, 0);
  assertEquals(result.effectAppliedCount, 1);
  assertEquals(executionRepository.finalized.length, 1);
  assertEquals(effectDependencies.writes.cashAdjustments.length, 1);
  assertEquals(
    effectDependencies.writes.cashAdjustments[0]?.playerId,
    "player-1",
  );
  assertEquals(
    effectDependencies.writes.cashAdjustments[0]?.signedAmount,
    -150,
  );
  assertEquals(
    effectDependencies.writes.impacts[0]?.impactLabel,
    "Emergency security levy",
  );
  assertEquals(result.events[0]?.status, "resolved");
});

Deno.test("storyline runner does not create resolutions for ineligible events", async () => {
  const repository = new FakeStorylineRepository({
    candidates: [
      storylineEventCandidate({
        id: "future-event",
        eventKey: "future-event",
        triggerType: "wall_clock_time",
        scheduledAt: "2026-06-25T13:00:00.000Z",
        revealPayload: cutsceneRevealPayload(),
      }),
    ],
  });
  const effectDependencies = createFakeEffectDependencies();

  const executionRepository = new StorylineExecutionFixture();
  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [playerContext("player-1", "NORTHREACH")],
    repository,
    executionRepository,
    effectDependencies,
  });

  assertEquals(result.resolvedCount, 0);
  assertEquals(result.skippedCount, 1);
  assertEquals(result.events[0]?.status, "skipped");
  assertEquals(executionRepository.finalized.length, 0);
  assertEquals(effectDependencies.writes.cashAdjustments.length, 0);
});

Deno.test("storyline runner skips effects when resolution already exists", async () => {
  const repository = new FakeStorylineRepository({
    candidates: [
      storylineEventCandidate({
        id: "event-1",
        eventKey: "already-resolved",
        triggerType: "market_tick",
        scheduledMarketTick: 3,
        revealPayload: cutsceneRevealPayload(),
        playerRules: [
          {
            ruleKey: "matching-rule",
            condition: {
              type: "player_current_country_is",
              countryCode: "NORTHREACH",
            },
            effects: [
              {
                type: "cash_credit",
                amount: 25,
                label: "Aid",
                reason: "This should not rerun.",
              },
            ],
          },
        ],
      }),
    ],
  });
  const effectDependencies = createFakeEffectDependencies();
  const notificationRepository = new FakeStoryNotificationRepository();

  const executionRepository = new StorylineExecutionFixture();
  await executionRepository.seedResolved({
    gameSessionId: "game-1",
    storylineEventId: "event-1",
    effectiveAt: "2026-06-25T12:00:00.000Z",
    effectiveMarketTick: 3,
    executionPlan: {},
  });
  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [playerContext("player-1", "NORTHREACH")],
    repository,
    executionRepository,
    effectDependencies,
    notificationRepository,
  });

  assertEquals(result.alreadyExistingCount, 1);
  assertEquals(result.resolvedCount, 0);
  assertEquals(result.events[0]?.status, "already_existing");
  assertEquals(executionRepository.finalized.length, 0);
  assertEquals(effectDependencies.writes.cashAdjustments.length, 0);
  assertEquals(notificationRepository.createdNotifications.length, 0);
});

Deno.test("storyline runner does not auto-run manual events", async () => {
  const repository = new FakeStorylineRepository({
    candidates: [
      storylineEventCandidate({
        id: "manual-event",
        eventKey: "manual-event",
        triggerType: "manual",
        playerRules: [
          {
            ruleKey: "manual-rule",
            condition: {
              type: "player_current_country_is",
              countryCode: "NORTHREACH",
            },
            effects: [
              {
                type: "cash_credit",
                amount: 25,
                label: "Manual grant",
                reason: "Manual events must not auto-run.",
              },
            ],
          },
        ],
      }),
    ],
  });
  const effectDependencies = createFakeEffectDependencies();
  const notificationRepository = new FakeStoryNotificationRepository();

  const executionRepository = new StorylineExecutionFixture();
  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [playerContext("player-1", "NORTHREACH")],
    repository,
    executionRepository,
    effectDependencies,
    notificationRepository,
  });

  assertEquals(result.skippedCount, 1);
  assertEquals(result.events[0]?.status, "skipped");
  assertEquals(executionRepository.finalized.length, 0);
  assertEquals(effectDependencies.writes.cashAdjustments.length, 0);
  assertEquals(notificationRepository.createdNotifications.length, 0);
});

Deno.test("storyline runner evaluates condition triggers using game story flags", async () => {
  const repository = new FakeStorylineRepository({
    storyFlags: {
      northreach_border_closed: true,
    },
    candidates: [
      storylineEventCandidate({
        id: "condition-event",
        eventKey: "condition-event",
        triggerType: "condition",
        triggerCondition: {
          type: "story_flag_equals",
          flagKey: "northreach_border_closed",
          value: true,
        },
      }),
      storylineEventCandidate({
        id: "condition-not-met",
        eventKey: "condition-not-met",
        triggerType: "condition",
        triggerCondition: {
          type: "story_flag_equals",
          flagKey: "missing_flag",
          value: true,
        },
      }),
    ],
  });
  const effectDependencies = createFakeEffectDependencies();

  const executionRepository = new StorylineExecutionFixture();
  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [],
    repository,
    executionRepository,
    effectDependencies,
  });

  assertEquals(result.resolvedCount, 1);
  assertEquals(result.skippedCount, 1);
  assertEquals(executionRepository.finalized.map((item) => item.storylineEventId), [
    "condition-event",
  ]);
});

Deno.test("durable storyline runner retries failed effects without finalizing the first attempt", async () => {
  const repository = failingEffectRepository();
  const effectDependencies = createFakeEffectDependencies({ failLedger: true });
  const executionRepository = new StorylineExecutionFixture();
  const input = {
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [playerContext("player-1", "NORTHREACH")],
    repository,
    executionRepository,
    effectDependencies,
  };
  const result = await runDueStorylineEvents(input);

  assertEquals(result.failedCount, 1);
  assertEquals(result.resolvedCount, 0);
  assertEquals(executionRepository.finalized.length, 0);
  assertEquals(executionRepository.readClaim("game-1", "event-1")?.status, "retryable_failed");
  assertEquals(result.events[0]?.status, "failed");

  const retryEffects = createFakeEffectDependencies();
  const retry = await runDueStorylineEvents({
    ...input,
    now: "2026-06-25T12:30:00.000Z",
    currentMarketTick: 8,
    effectDependencies: retryEffects,
  });
  assertEquals(retry.failedCount, 0);
  assertEquals(retry.resolvedCount, 1);
  assertEquals(retryEffects.writes.cashAdjustments.length, 1);
  assertEquals(executionRepository.finalized.length, 1);
  assertEquals(executionRepository.readClaim("game-1", "event-1")?.attemptCount, 2);
});
