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
  StorylineEventCandidateRecord,
  StorylineRepository,
} from "../contracts/storylineRepositoryContracts.ts";

export interface FakeStorylineRepositoryOptions {
  readonly candidates?: readonly StorylineEventCandidateRecord[];
  readonly storyFlags?: Record<string, JsonValue>;
  readonly existingResolutionEventIds?: readonly string[];
}

export class FakeStorylineRepository implements StorylineRepository {
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

export interface FakeEffectDependencies extends StoryEffectExecutionDependencies {
  readonly writes: {
    readonly cashAdjustments: StoryCashAdjustmentWriteInput[];
    readonly impacts: StoryPlayerImpactWriteInput[];
    readonly policies: StoryPolicyWriteInput[];
    readonly flags: StoryFlagWriteInput[];
    readonly contracts: StoryContractCreateWriteInput[];
  };
}

export interface FakeEffectOptions {
  readonly failLedger?: boolean;
  readonly enableContracts?: boolean;
  readonly failContracts?: boolean;
}

export interface FakeStoryNotificationRepositoryOptions {
  readonly failCreateNotification?: boolean;
}

export class FakeStoryNotificationRepository implements StoryNotificationRepository {
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

export function createFakeEffectDependencies(
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

export function storylineEventCandidate(
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

export function cutsceneRevealPayload(): JsonObject {
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

export function playerContext(
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

export function resolutionRecord(
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

export function notificationDeliveryRecord(
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

export function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
