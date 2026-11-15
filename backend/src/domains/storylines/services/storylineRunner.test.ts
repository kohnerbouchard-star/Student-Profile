import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import type {
  StoryCashAdjustmentWriteInput,
  StoryContractCreateWriteInput,
  StoryEffectExecutionDependencies,
  StoryFlagWriteInput,
  StoryPlayerImpactWriteInput,
  StoryPolicyWriteInput,
  StoryWriteResult,
} from "../contracts/storyEffectExecutionContracts.ts";
import type {
  CreateNotificationDeliveriesInput,
  CreateNotificationDeliveriesResult,
  CreateStoryNotificationInput,
  CreateStoryNotificationResult,
  MarkNotificationDeliveryInput,
  StoryNotificationDeliveryRecord,
  StoryNotificationDeliveryWithNotification,
  StoryNotificationRepository,
} from "../contracts/storyNotificationContracts.ts";
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

  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [playerContext("player-1", "NORTHREACH")],
    repository,
    effectDependencies,
    notificationRepository,
  });

  assertEquals(result.alreadyExistingCount, 1);
  assertEquals(result.resolvedCount, 0);
  assertEquals(result.events[0]?.status, "already_existing");
  assertEquals(repository.resolutions.length, 0);
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

  const result = await runDueStorylineEvents({
    gameSessionId: "game-1",
    now: "2026-06-25T12:10:00.000Z",
    currentMarketTick: 5,
    playerContexts: [playerContext("player-1", "NORTHREACH")],
    repository,
    effectDependencies,
    notificationRepository,
  });

  assertEquals(result.skippedCount, 1);
  assertEquals(result.events[0]?.status, "skipped");
  assertEquals(repository.resolutions.length, 0);
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
    readonly contracts: StoryContractCreateWriteInput[];
  };
}

interface FakeEffectOptions {
  readonly failLedger?: boolean;
  readonly enableContracts?: boolean;
  readonly failContracts?: boolean;
}

interface FakeStoryNotificationRepositoryOptions {
  readonly failCreateNotification?: boolean;
}

class FakeStoryNotificationRepository implements StoryNotificationRepository {
  readonly createdNotifications: CreateStoryNotificationInput[] = [];
  readonly createdDeliveries: CreateNotificationDeliveriesInput[] = [];
  private readonly failCreateNotification: boolean;

  constructor(options: FakeStoryNotificationRepositoryOptions = {}) {
    this.failCreateNotification = options.failCreateNotification ?? false;
  }

  createStoryNotification(
    input: CreateStoryNotificationInput,
  ): Promise<CreateStoryNotificationResult> {
    if (this.failCreateNotification) {
      throw new Error("notification repository unavailable");
    }

    this.createdNotifications.push(input);

    return Promise.resolve({
      status: "inserted",
      notification: {
        id: `notification-${this.createdNotifications.length}`,
        gameSessionId: input.gameSessionId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        notificationType: input.notificationType,
        title: input.title,
        summary: input.summary,
        priority: input.priority,
        displayMode: input.displayMode,
        payload: input.payload,
        publishedAt: input.publishedAt,
      },
    });
  }

  createNotificationDeliveries(
    input: CreateNotificationDeliveriesInput,
  ): Promise<CreateNotificationDeliveriesResult> {
    this.createdDeliveries.push(input);

    return Promise.resolve({
      deliveryIds: input.playerIds.map((_, index) => `delivery-${index + 1}`),
      insertedCount: input.playerIds.length,
      existingCount: 0,
    });
  }

  listUnseenStoryCutsceneDeliveries(): Promise<
    readonly StoryNotificationDeliveryWithNotification[]
  > {
    return Promise.resolve([]);
  }

  markNotificationDeliverySeen(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(notificationDeliveryRecord(input.deliveryId));
  }

  markNotificationDeliveryDismissed(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(notificationDeliveryRecord(input.deliveryId));
  }

  markNotificationDeliveryAcknowledged(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(notificationDeliveryRecord(input.deliveryId));
  }
}

function createFakeEffectDependencies(
  options: FakeEffectOptions = {},
): FakeEffectDependencies {
  const writes: FakeEffectDependencies["writes"] = {
    cashAdjustments: [],
    impacts: [],
    policies: [],
    flags: [],
    contracts: [],
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
    contracts: options.enableContracts
      ? {
        async createGameSessionContract(input) {
          if (options.failContracts) {
            throw new Error("contract repository unavailable");
          }

          writes.contracts.push(input);
          return { id: `contract-${writes.contracts.length}` };
        },
      }
      : undefined,
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

function cutsceneRevealPayload(): JsonObject {
  return {
    notificationType: "story_cutscene",
    displayMode: "modal_on_next_login",
    videoAssetKey: "cutscene-1",
    posterAssetKey: "poster-1",
    headline: "Cutscene Event",
    summary: "A major story cutscene.",
    requiresAcknowledgement: true,
    payload: {
      route: "intel",
    },
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

function notificationDeliveryRecord(
  id: string,
): StoryNotificationDeliveryRecord {
  return {
    id,
    notificationId: "notification-1",
    gameSessionId: "game-1",
    playerId: "player-1",
    deliveredAt: "2026-06-25T12:10:00.000Z",
    seenAt: null,
    dismissedAt: null,
    acknowledgedAt: null,
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
