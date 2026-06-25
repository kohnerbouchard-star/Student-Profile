import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import type {
  StoryCashAdjustmentWriteInput,
  StoryEffectExecutionDependencies,
  StoryFlagWriteInput,
  StoryPlayerImpactWriteInput,
  StoryPolicyWriteInput,
  StoryWriteResult,
} from "../contracts/storyEffectExecutionContracts.ts";
import type {
  CreateStoryEventResolutionInput,
  CreateStoryEventResolutionResult,
  GameSessionStorylineRecord,
  ListUnresolvedActiveStorylineEventsInput,
  StoryEventResolutionRecord,
  StorylineEventCandidateRecord,
  StorylineRepository,
} from "../contracts/storylineRepositoryContracts.ts";
import { runDueStorylineEvents } from "./storylineRunner.ts";

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

  assertEquals(result.resolvedCount, 1);
  assertEquals(result.skippedCount, 0);
  assertEquals(result.failedCount, 0);
  assertEquals(result.effectAppliedCount, 1);
  assertEquals(repository.resolutions.length, 1);
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

  assertEquals(result.resolvedCount, 0);
  assertEquals(result.skippedCount, 1);
  assertEquals(result.events[0]?.status, "skipped");
  assertEquals(repository.resolutions.length, 0);
  assertEquals(effectDependencies.writes.cashAdjustments.length, 0);
});

Deno.test("storyline runner skips effects when resolution already exists", async () => {
  const repository = new FakeStorylineRepository({
    existingResolutionEventIds: ["event-1"],
    candidates: [
      storylineEventCandidate({
        id: "event-1",
        eventKey: "already-resolved",
        triggerType: "market_tick",
        scheduledMarketTick: 3,
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

  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [playerContext("player-1", "NORTHREACH")],
    repository,
    effectDependencies,
  });

  assertEquals(result.alreadyExistingCount, 1);
  assertEquals(result.resolvedCount, 0);
  assertEquals(result.events[0]?.status, "already_existing");
  assertEquals(repository.resolutions.length, 0);
  assertEquals(effectDependencies.writes.cashAdjustments.length, 0);
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

  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [playerContext("player-1", "NORTHREACH")],
    repository,
    effectDependencies,
  });

  assertEquals(result.skippedCount, 1);
  assertEquals(result.events[0]?.status, "skipped");
  assertEquals(repository.resolutions.length, 0);
  assertEquals(effectDependencies.writes.cashAdjustments.length, 0);
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

  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [],
    repository,
    effectDependencies,
  });

  assertEquals(result.resolvedCount, 1);
  assertEquals(result.skippedCount, 1);
  assertEquals(repository.resolutions.map((item) => item.storylineEventId), [
    "condition-event",
  ]);
});

Deno.test("storyline runner reports failed effects after idempotent resolution insert", async () => {
  const repository = new FakeStorylineRepository({
    candidates: [
      storylineEventCandidate({
        id: "event-1",
        eventKey: "failing-effect",
        triggerType: "market_tick",
        scheduledMarketTick: 1,
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
                reason: "Ledger fails in this test.",
              },
            ],
          },
        ],
      }),
    ],
  });
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

interface FakeStorylineRepositoryOptions {
  readonly candidates?: readonly StorylineEventCandidateRecord[];
  readonly storyFlags?: Record<string, JsonValue>;
  readonly existingResolutionEventIds?: readonly string[];
}

class FakeStorylineRepository implements StorylineRepository {
  readonly resolutions: {
    readonly storylineEventId: string;
    readonly resultPayload: JsonObject;
  }[] = [];
  private readonly candidates: readonly StorylineEventCandidateRecord[];
  private readonly storyFlags: Record<string, JsonValue>;
  private readonly existingResolutionEventIds: Set<string>;

  constructor(options: FakeStorylineRepositoryOptions = {}) {
    this.candidates = options.candidates ?? [];
    this.storyFlags = options.storyFlags ?? {};
    this.existingResolutionEventIds = new Set(
      options.existingResolutionEventIds ?? [],
    );
  }

  listActiveGameSessionStorylines(): Promise<
    readonly GameSessionStorylineRecord[]
  > {
    return Promise.resolve([]);
  }

  listUnresolvedActiveStorylineEvents(
    _input: ListUnresolvedActiveStorylineEventsInput,
  ): Promise<readonly StorylineEventCandidateRecord[]> {
    return Promise.resolve(this.candidates);
  }

  createStoryEventResolution(
    input: CreateStoryEventResolutionInput,
  ): Promise<CreateStoryEventResolutionResult> {
    if (this.existingResolutionEventIds.has(input.storylineEventId)) {
      return Promise.resolve({
        status: "existing",
        resolution: resolutionRecord(input, "existing-resolution-1"),
      });
    }

    this.resolutions.push({
      storylineEventId: input.storylineEventId,
      resultPayload: input.resultPayload ?? {},
    });

    return Promise.resolve({
      status: "inserted",
      resolution: resolutionRecord(
        input,
        `resolution-${this.resolutions.length}`,
      ),
    });
  }

  createPlayerStoryImpact(
    input: StoryPlayerImpactWriteInput,
  ): Promise<StoryWriteResult> {
    return this.createPlayerImpact(input);
  }

  createPlayerImpact(
    _input: StoryPlayerImpactWriteInput,
  ): Promise<StoryWriteResult> {
    return Promise.resolve({ id: "impact-from-repository" });
  }

  upsertGameSessionPolicy(
    input: StoryPolicyWriteInput,
  ): Promise<StoryWriteResult> {
    return this.upsertPolicy(input);
  }

  upsertPolicy(_input: StoryPolicyWriteInput): Promise<StoryWriteResult> {
    return Promise.resolve({ id: "policy-from-repository" });
  }

  setGameSessionStoryFlag(
    input: StoryFlagWriteInput,
  ): Promise<StoryWriteResult> {
    return this.setStoryFlag(input);
  }

  setStoryFlag(_input: StoryFlagWriteInput): Promise<StoryWriteResult> {
    return Promise.resolve({ id: "flag-from-repository" });
  }

  listGameSessionStoryFlags(): Promise<Record<string, JsonValue>> {
    return Promise.resolve(this.storyFlags);
  }
}

interface FakeEffectDependencies extends StoryEffectExecutionDependencies {
  readonly writes: {
    readonly cashAdjustments: StoryCashAdjustmentWriteInput[];
    readonly impacts: StoryPlayerImpactWriteInput[];
    readonly policies: StoryPolicyWriteInput[];
    readonly flags: StoryFlagWriteInput[];
  };
}

interface FakeEffectOptions {
  readonly failLedger?: boolean;
}

function createFakeEffectDependencies(
  options: FakeEffectOptions = {},
): FakeEffectDependencies {
  const writes: FakeEffectDependencies["writes"] = {
    cashAdjustments: [],
    impacts: [],
    policies: [],
    flags: [],
  };

  return {
    writes,
    ledger: {
      recordCashAdjustment(input) {
        if (options.failLedger) {
          throw new Error("ledger unavailable");
        }

        writes.cashAdjustments.push(input);
        return Promise.resolve({
          id: `ledger-${writes.cashAdjustments.length}`,
        });
      },
    },
    impacts: {
      createPlayerImpact(input) {
        writes.impacts.push(input);
        return Promise.resolve({ id: `impact-${writes.impacts.length}` });
      },
    },
    policies: {
      upsertPolicy(input) {
        writes.policies.push(input);
        return Promise.resolve({ id: `policy-${writes.policies.length}` });
      },
    },
    flags: {
      setStoryFlag(input) {
        writes.flags.push(input);
        return Promise.resolve({ id: `flag-${writes.flags.length}` });
      },
    },
  };
}

function storylineEventCandidate(
  overrides: Partial<StorylineEventCandidateRecord>,
): StorylineEventCandidateRecord {
  return {
    id: "event-1",
    storylineId: "storyline-1",
    gameSessionId: "game-1",
    gameSessionStorylineId: "activation-1",
    storyStartedAt: "2026-06-25T12:00:00.000Z",
    accumulatedPauseSeconds: 0,
    timeScale: 1,
    eventKey: "event-1",
    title: "Story Event",
    description: "",
    act: 1,
    sequence: 1,
    triggerType: "elapsed_time",
    scheduledOffsetSeconds: 60,
    scheduledAt: null,
    scheduledMarketTick: null,
    triggerCondition: {},
    revealPayload: {},
    publicNewsPayload: {},
    playerRules: [],
    policyPayloads: [],
    flagPayloads: [],
    contractUnlockPayloads: [],
    priority: "normal",
    createdAt: "2026-06-25T12:00:00.000Z",
    ...overrides,
  };
}

function playerContext(
  playerId: string,
  currentCountryCode: string,
): PlayerStoryContext {
  return {
    playerId,
    gameSessionId: "game-1",
    homeCountryId: null,
    homeCountryCode: null,
    currentCountryId: null,
    currentCountryCode,
    cashBalance: 500,
    resources: {},
    sectorExposurePct: {},
    countryExposurePct: {},
    activeContractKeys: [],
    completedContractKeys: [],
    storyFlags: {},
  };
}

function resolutionRecord(
  input: CreateStoryEventResolutionInput,
  id: string,
) {
  return {
    id,
    gameSessionId: input.gameSessionId,
    storylineEventId: input.storylineEventId,
    resolvedAt: input.resolvedAt,
    resolvedMarketTick: input.resolvedMarketTick ?? null,
    status: input.status ?? "resolved",
    resultPayload: input.resultPayload ?? {},
    createdAt: input.resolvedAt,
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
