import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import type {
  StoryCashAdjustmentWriteInput,
  StoryEffectExecutionDependencies,
  StoryFlagWriteInput,
  StoryPlayerImpactWriteInput,
} from "../contracts/storyEffectExecutionContracts.ts";
import type {
  CreateStoryEventResolutionInput,
  StorylineEventCandidateRecord,
} from "../contracts/storylineRepositoryContracts.ts";
import { runDueStorylineEvents } from "./storylineRunner.ts";
import { InMemoryStoryEventExecutionRepository } from "./testing/inMemoryStoryEventExecutionRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Story replay identities remain stable across Player order and roster changes", async () => {
  const bothForward = await execute([
    player("player-northreach", "NORTHREACH"),
    player("player-yrethia", "YRETHIA"),
  ]);
  const bothReverse = await execute([
    player("player-yrethia", "YRETHIA"),
    player("player-northreach", "NORTHREACH"),
  ]);
  const yrethiaOnly = await execute([
    player("player-yrethia", "YRETHIA"),
  ]);

  assertEquals(bothForward.cashKeys, bothReverse.cashKeys);
  assertEquals(bothForward.impactKeys, bothReverse.impactKeys);
  assertEquals(bothForward.flagKeys, bothReverse.flagKeys);

  assertEquals(
    bothForward.cashKeys["player-yrethia"],
    yrethiaOnly.cashKeys["player-yrethia"],
  );
  assertEquals(
    bothForward.impactKeys["player-yrethia"],
    yrethiaOnly.impactKeys["player-yrethia"],
  );
  assertEquals(bothForward.flagKeys, yrethiaOnly.flagKeys);

  assertEquals(bothForward.cashKeys, {
    "player-northreach":
      "story_effect:game-1:event-replay-identity:1:cash_credit:player-northreach:ledger",
    "player-yrethia":
      "story_effect:game-1:event-replay-identity:3:cash_credit:player-yrethia:ledger",
  });
  assertEquals(bothForward.flagKeys, [
    "story_effect:game-1:event-replay-identity:0:story_flag_set:meridian_response_active_v1:flag",
  ]);
});

async function execute(playerContexts: readonly PlayerStoryContext[]) {
  const cashKeys: Record<string, string> = {};
  const impactKeys: Record<string, string> = {};
  const flagKeys: string[] = [];
  const dependencies: StoryEffectExecutionDependencies = {
    ledger: {
      async recordCashAdjustment(input: StoryCashAdjustmentWriteInput) {
        cashKeys[input.playerId] = input.idempotencyKey;
        return { id: `ledger-${input.playerId}` };
      },
    },
    policies: { async upsertPolicy() { return {}; } },
    flags: {
      async setStoryFlag(input: StoryFlagWriteInput) {
        flagKeys.push(input.idempotencyKey);
        return { id: "flag-1" };
      },
    },
    impacts: {
      async createPlayerImpact(input: StoryPlayerImpactWriteInput) {
        impactKeys[input.playerId] = input.idempotencyKey;
        return { id: `impact-${input.playerId}` };
      },
    },
  };

  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-08-13T00:00:00.000Z",
    currentMarketTick: 30,
    playerContexts,
    repository: new FakeStorylineRepository() as never,
    executionRepository: new InMemoryStoryEventExecutionRepository(),
    effectDependencies: dependencies,
  });

  assertEquals(result.failedCount, 0);
  assertEquals(result.resolvedCount, 1);

  return {
    cashKeys: sortedRecord(cashKeys),
    impactKeys: sortedRecord(impactKeys),
    flagKeys: [...flagKeys].sort(),
  };
}

class FakeStorylineRepository {
  async listUnresolvedActiveStorylineEvents(): Promise<readonly StorylineEventCandidateRecord[]> {
    return [candidate()];
  }

  async listGameSessionStoryFlags(): Promise<Record<string, JsonValue>> {
    return {};
  }

  async createStoryEventResolution(input: CreateStoryEventResolutionInput) {
    return {
      status: "inserted" as const,
      resolution: {
        id: "resolution-1",
        gameSessionId: input.gameSessionId,
        storylineEventId: input.storylineEventId,
        resolvedAt: input.resolvedAt,
        resolvedMarketTick: input.resolvedMarketTick ?? null,
        status: input.status ?? "resolved",
        resultPayload: input.resultPayload ?? {},
        createdAt: input.resolvedAt,
      },
    };
  }
}

function candidate(): StorylineEventCandidateRecord {
  const sharedFlag: JsonObject = {
    type: "story_flag_set",
    flagKey: "meridian_response_active_v1",
    value: true,
  };

  return {
    id: "event-replay-identity",
    storylineId: "storyline-1",
    gameSessionId: "game-1",
    gameSessionStorylineId: "activation-1",
    storyStartedAt: "2026-08-10T00:00:00.000Z",
    accumulatedPauseSeconds: 0,
    timeScale: 1,
    eventKey: "replay_identity_probe",
    title: "Replay Identity Probe",
    description: "Tests deterministic effect identity independent of roster order.",
    act: 4,
    sequence: 200,
    triggerType: "elapsed_time",
    scheduledOffsetSeconds: 60,
    scheduledAt: null,
    scheduledMarketTick: null,
    triggerCondition: {},
    revealPayload: {},
    publicNewsPayload: {},
    playerRules: [
      {
        ruleKey: "northreach-response",
        condition: {
          type: "player_current_country_is",
          countryCode: "NORTHREACH",
        },
        effects: [cashEffect(), sharedFlag],
      },
      {
        ruleKey: "yrethia-response",
        condition: {
          type: "player_current_country_is",
          countryCode: "YRETHIA",
        },
        effects: [cashEffect(), sharedFlag],
      },
    ],
    policyPayloads: [],
    flagPayloads: [],
    contractUnlockPayloads: [],
    priority: "normal",
    createdAt: "2026-08-12T00:00:00.000Z",
  };
}

function cashEffect(): JsonObject {
  return {
    type: "cash_credit",
    amount: 50,
    label: "Emergency continuity grant",
    reason: "Temporary household continuity assistance.",
    payload: { stage: 6 },
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

function sortedRecord(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) =>
    left.localeCompare(right)
  ));
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
