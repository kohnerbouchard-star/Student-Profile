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

// Characterizes only the historical fallback while it remains; not current production semantics.
Deno.test("legacy Story fallback writes a resolution even when effects fail", async () => {
  const repository = failingEffectRepository(true);
  const effectDependencies = createFakeEffectDependencies({ failLedger: true });
  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [playerContext("player-1", "NORTHREACH")],
    repository,
    effectDependencies,
  });
  assertEquals(result.failedCount, 1);
  assertEquals(result.resolvedCount, 0);
  assertEquals(repository.resolutions.length, 1);
  assertEquals(result.events[0]?.status, "failed");
});

Deno.test("legacy Story fallback writes a resolution even when notification creation fails", async () => {
  const repository = new FakeStorylineRepository({
    allowDirectResolution: true,
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
