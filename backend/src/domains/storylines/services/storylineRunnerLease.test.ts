import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import type {
  StoryCashAdjustmentWriteInput,
  StoryEffectExecutionDependencies,
  StoryFlagWriteInput,
  StoryPlayerImpactWriteInput,
} from "../contracts/storyEffectExecutionContracts.ts";
import type { StorylineEventCandidateRecord } from "../contracts/storylineRepositoryContracts.ts";
import { runDueStorylineEvents } from "./storylineRunner.ts";
import { InMemoryStoryEventExecutionRepository } from "./testing/inMemoryStoryEventExecutionRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("failed Story execution retries the frozen target plan and finalizes only after success", async () => {
  const executionRepository = new InMemoryStoryEventExecutionRepository();
  const writes = {
    failLedger: true,
    cashPlayers: [] as string[],
    cashKeys: [] as string[],
    impactPlayers: [] as string[],
    flagKeys: [] as string[],
  };
  const dependencies: StoryEffectExecutionDependencies = {
    ledger: {
      async recordCashAdjustment(input: StoryCashAdjustmentWriteInput) {
        writes.cashPlayers.push(input.playerId);
        writes.cashKeys.push(input.idempotencyKey);
        if (writes.failLedger) throw new Error("temporary ledger outage");
        return { id: "ledger-1" };
      },
    },
    policies: { async upsertPolicy() { return {}; } },
    flags: {
      async setStoryFlag(input: StoryFlagWriteInput) {
        writes.flagKeys.push(input.idempotencyKey);
        return { id: "flag-1" };
      },
    },
    impacts: {
      async createPlayerImpact(input: StoryPlayerImpactWriteInput) {
        writes.impactPlayers.push(input.playerId);
        return { id: "impact-1" };
      },
    },
  };
  const repository = new FakeStorylineRepository();

  const first = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-08-13T00:00:00.000Z",
    currentMarketTick: 40,
    playerContexts: [player("player-original", "NORTHREACH")],
    repository: repository as never,
    executionRepository,
    effectDependencies: dependencies,
  });

  assertEquals(first.failedCount, 1);
  assertEquals(first.resolvedCount, 0);
  assertEquals(executionRepository.readClaim("game-1", "event-lease")?.status, "retryable_failed");
  assertEquals(executionRepository.readClaim("game-1", "event-lease")?.resolutionId, null);
  assertEquals(writes.cashPlayers, ["player-original"]);
  assertEquals(writes.impactPlayers, []);
  assertEquals(writes.flagKeys.length, 1);
  assertEquals(repository.legacyResolutionCalls, 0);

  writes.failLedger = false;
  const second = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-08-13T00:15:00.000Z",
    currentMarketTick: 55,
    playerContexts: [player("player-new", "NORTHREACH")],
    repository: repository as never,
    executionRepository,
    effectDependencies: dependencies,
  });

  assertEquals(second.failedCount, 0);
  assertEquals(second.resolvedCount, 1);
  assertEquals(executionRepository.readClaim("game-1", "event-lease")?.status, "completed");
  assertEquals(executionRepository.readClaim("game-1", "event-lease")?.attemptCount, 2);
  assertEquals(writes.cashPlayers, ["player-original", "player-original"]);
  assertEquals(writes.impactPlayers, ["player-original"]);
  assertEquals(writes.cashKeys[0], writes.cashKeys[1]);
  assertEquals(writes.flagKeys[0], writes.flagKeys[1]);
  assertEquals(repository.legacyResolutionCalls, 0);

  const frozen = executionRepository.readClaim("game-1", "event-lease");
  assertEquals(frozen?.effectiveAt, "2026-08-13T00:00:00.000Z");
  assertEquals(frozen?.effectiveMarketTick, 40);

  const third = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-08-13T00:30:00.000Z",
    currentMarketTick: 70,
    playerContexts: [player("player-third", "NORTHREACH")],
    repository: repository as never,
    executionRepository,
    effectDependencies: dependencies,
  });
  assertEquals(third.alreadyExistingCount, 1);
  assertEquals(writes.cashPlayers, ["player-original", "player-original"]);
});

Deno.test("busy Story execution is skipped without applying side effects", async () => {
  const executionRepository = new InMemoryStoryEventExecutionRepository();
  await executionRepository.claim({
    gameSessionId: "game-1",
    storylineEventId: "event-lease",
    effectiveAt: "2026-08-13T00:00:00.000Z",
    effectiveMarketTick: 40,
    executionPlan: {
      version: 1,
      matchCount: 0,
      effects: [],
      notificationPlayerIds: [],
      revealPayload: {},
      priority: "normal",
    },
  });
  let cashWrites = 0;

  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-08-13T00:01:00.000Z",
    currentMarketTick: 41,
    playerContexts: [player("player-1", "NORTHREACH")],
    repository: new FakeStorylineRepository() as never,
    executionRepository,
    effectDependencies: {
      ledger: {
        async recordCashAdjustment() {
          cashWrites += 1;
          return {};
        },
      },
      policies: { async upsertPolicy() { return {}; } },
      flags: { async setStoryFlag() { return {}; } },
      impacts: { async createPlayerImpact() { return {}; } },
    },
  });

  assertEquals(result.skippedCount, 1);
  assertEquals(result.events[0]?.status, "skipped");
  assertEquals(
    result.events[0]?.status === "skipped" ? result.events[0].reason : null,
    "execution_in_progress",
  );
  assertEquals(cashWrites, 0);
});

class FakeStorylineRepository {
  legacyResolutionCalls = 0;

  async listUnresolvedActiveStorylineEvents(): Promise<readonly StorylineEventCandidateRecord[]> {
    return [candidate()];
  }

  async listGameSessionStoryFlags(): Promise<Record<string, JsonValue>> {
    return {};
  }

  async createStoryEventResolution(): Promise<never> {
    this.legacyResolutionCalls += 1;
    throw new Error("Explicit lease path must not use legacy resolution insert.");
  }
}

function candidate(): StorylineEventCandidateRecord {
  return {
    id: "event-lease",
    storylineId: "storyline-1",
    gameSessionId: "game-1",
    gameSessionStorylineId: "activation-1",
    storyStartedAt: "2026-08-12T00:00:00.000Z",
    accumulatedPauseSeconds: 0,
    timeScale: 1,
    eventKey: "lease_retry_probe",
    title: "Lease Retry Probe",
    description: "Proves failed execution retries a frozen player/effect plan.",
    act: 4,
    sequence: 250,
    triggerType: "elapsed_time",
    scheduledOffsetSeconds: 60,
    scheduledAt: null,
    scheduledMarketTick: null,
    triggerCondition: {},
    revealPayload: {},
    publicNewsPayload: {},
    playerRules: [
      {
        ruleKey: "northreach-player",
        condition: {
          type: "player_current_country_is",
          countryCode: "NORTHREACH",
        },
        effects: [
          {
            type: "cash_credit",
            amount: 50,
            label: "Continuity grant",
            reason: "A temporary Story grant.",
            payload: { probe: "lease" },
          },
          {
            type: "story_flag_set",
            flagKey: "lease_retry_probe_v1",
            value: true,
          },
        ],
      },
    ],
    policyPayloads: [],
    flagPayloads: [],
    contractUnlockPayloads: [],
    priority: "normal",
    createdAt: "2026-08-12T00:00:00.000Z",
  };
}

function player(playerId: string, countryCode: string): PlayerStoryContext {
  return {
    playerId,
    gameSessionId: "game-1",
    homeCountryId: null,
    homeCountryCode: countryCode,
    currentCountryId: null,
    currentCountryCode: countryCode,
    cashBalance: 100,
    resources: {},
    sectorExposurePct: {},
    countryExposurePct: {},
    activeContractKeys: [],
    completedContractKeys: [],
    storyFlags: {},
    relationships: {},
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
