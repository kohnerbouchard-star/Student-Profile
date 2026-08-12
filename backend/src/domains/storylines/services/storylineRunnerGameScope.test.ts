import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import type {
  StoryEffectExecutionDependencies,
  StoryFlagWriteInput,
  StoryMarketNewsWriteInput,
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

Deno.test("storyline runner executes identical game-scoped effects once across country rules", async () => {
  const repository = new FakeStorylineRepository();
  const flags: StoryFlagWriteInput[] = [];
  const marketNews: StoryMarketNewsWriteInput[] = [];
  const contractKeys: string[] = [];
  const dependencies: StoryEffectExecutionDependencies = {
    ledger: { async recordCashAdjustment() { return {}; } },
    policies: { async upsertPolicy() { return {}; } },
    flags: {
      async setStoryFlag(input) {
        flags.push(input);
        return { id: "flag-1" };
      },
    },
    impacts: { async createPlayerImpact() { return {}; } },
    contracts: {
      async createGameSessionContract(input) {
        contractKeys.push(input.contractKey);
        return { id: "contract-1" };
      },
    },
    marketNews: {
      async createMarketNews(input) {
        marketNews.push(input);
        return { id: "market-1" };
      },
    },
  };

  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-08-12T03:00:00.000Z",
    currentMarketTick: 12,
    playerContexts: [
      player("player-northreach", "NORTHREACH"),
      player("player-yrethia", "YRETHIA"),
    ],
    repository: repository as never,
    executionRepository: new InMemoryStoryEventExecutionRepository(),
    effectDependencies: dependencies,
  });

  assertEquals(result.failedCount, 0);
  assertEquals(result.resolvedCount, 1);
  const eventResult = result.events[0];
  if (!eventResult || eventResult.status !== "resolved") {
    throw new Error(`Expected resolved event, received ${eventResult?.status ?? "missing"}.`);
  }
  assertEquals(eventResult.playerRuleMatchCount, 2);
  assertEquals(result.effectAppliedCount, 3);
  assertEquals(flags.length, 1);
  assertEquals(flags[0]?.flagKey, "meridian_customs_intrusion_detected_v1");
  assertEquals(marketNews.length, 1);
  assertEquals(marketNews[0]?.shockKey, "meridian-customs-security-intrusion-v1");
  assertEquals(contractKeys, ["contract.meridian.respond-first-disruption.v1"]);
});

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
  const gameEffects: JsonObject[] = [
    {
      type: "market_news_post",
      payload: {
        shockKey: "meridian-customs-security-intrusion-v1",
        headline: "Meridian verification records diverge",
        explanation: "Cargo and payment records no longer reconcile reliably.",
        category: "supply_chain",
        scope: "global",
        sentiment: "negative",
        impactStrength: "medium",
        durationTicks: 6,
      },
    },
    {
      type: "story_flag_set",
      flagKey: "meridian_customs_intrusion_detected_v1",
      value: true,
    },
    {
      type: "contract_unlock",
      contractKey: "contract.meridian.respond-first-disruption.v1",
      label: "Meridian Disruption Response",
      reason: "Verification records no longer reconcile.",
      payload: {
        title: "Meridian Disruption Response",
        description: "Recommend a continuity and security response.",
        instructions: "Separate verified facts from attribution claims.",
      },
    },
  ];

  return {
    id: "event-customs-intrusion",
    storylineId: "storyline-1",
    gameSessionId: "game-1",
    gameSessionStorylineId: "activation-1",
    storyStartedAt: "2026-08-10T00:00:00.000Z",
    accumulatedPauseSeconds: 0,
    timeScale: 1,
    eventKey: "meridian_customs_security_intrusion",
    title: "Meridian Customs Verification Failure",
    description: "Conflicting verification records create a systemic confidence shock.",
    act: 3,
    sequence: 140,
    triggerType: "elapsed_time",
    scheduledOffsetSeconds: 172800,
    scheduledAt: null,
    scheduledMarketTick: null,
    triggerCondition: {},
    revealPayload: {},
    publicNewsPayload: {},
    playerRules: [
      {
        ruleKey: "northreach-crisis",
        condition: {
          type: "player_current_country_is",
          countryCode: "NORTHREACH",
        },
        effects: gameEffects,
      },
      {
        ruleKey: "yrethia-crisis",
        condition: {
          type: "player_current_country_is",
          countryCode: "YRETHIA",
        },
        effects: gameEffects,
      },
    ],
    policyPayloads: [],
    flagPayloads: [],
    contractUnlockPayloads: [],
    priority: "major",
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
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
