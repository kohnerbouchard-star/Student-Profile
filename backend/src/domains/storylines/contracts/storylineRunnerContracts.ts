import type { JsonObject } from "../../../supabase/tableTypes.ts";
import type { PlayerStoryContext } from "./playerStoryContext.ts";
import type {
  StoryEffectBatchExecutionResult,
  StoryEffectExecutionDependencies,
} from "./storyEffectExecutionContracts.ts";
import type {
  CreateStoryCutsceneNotificationForPlayersResult,
  StoryNotificationRepository,
} from "./storyNotificationContracts.ts";
import type {
  StorylineEventCandidateRecord,
  StorylineRepository,
} from "./storylineRepositoryContracts.ts";

export interface RunDueStorylineEventsInput {
  readonly gameSessionId: string;
  readonly now: string;
  readonly currentMarketTick: number;
  readonly playerContexts: readonly PlayerStoryContext[];
  readonly repository: StorylineRepository;
  readonly effectDependencies: StoryEffectExecutionDependencies;
  readonly notificationRepository?: StoryNotificationRepository | null;
}

export interface StorylineRunnerResult {
  readonly gameSessionId: string;
  readonly candidateCount: number;
  readonly resolvedCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly alreadyExistingCount: number;
  readonly effectAppliedCount: number;
  readonly effectSkippedCount: number;
  readonly effectFailedCount: number;
  readonly notificationCreatedCount: number;
  readonly notificationDeliveryCount: number;
  readonly notificationFailedCount: number;
  readonly events: readonly StorylineRunnerEventResult[];
}

export type StorylineRunnerEventStatus =
  | "resolved"
  | "skipped"
  | "failed"
  | "already_existing";

export type StorylineRunnerSkipReason =
  | "manual_trigger"
  | "trigger_not_due";

export interface StorylineRunnerEventResultBase {
  readonly eventId: string;
  readonly eventKey: string;
  readonly triggerType: StorylineEventCandidateRecord["triggerType"];
  readonly status: StorylineRunnerEventStatus;
}

export interface StorylineRunnerResolvedEventResult
  extends StorylineRunnerEventResultBase {
  readonly status: "resolved";
  readonly resolutionId: string;
  readonly playerRuleMatchCount: number;
  readonly effectResult: StoryEffectBatchExecutionResult;
  readonly notificationResult?: StorylineRunnerNotificationResult;
}

export interface StorylineRunnerSkippedEventResult
  extends StorylineRunnerEventResultBase {
  readonly status: "skipped";
  readonly reason: StorylineRunnerSkipReason;
}

export interface StorylineRunnerAlreadyExistingEventResult
  extends StorylineRunnerEventResultBase {
  readonly status: "already_existing";
  readonly resolutionId: string;
}

export interface StorylineRunnerFailedEventResult
  extends StorylineRunnerEventResultBase {
  readonly status: "failed";
  readonly errorMessage: string;
  readonly effectResult?: StoryEffectBatchExecutionResult;
  readonly notificationResult?: StorylineRunnerNotificationResult;
  readonly resultPayload?: JsonObject;
}

export type StorylineRunnerNotificationStatus = "created" | "failed";

export interface StorylineRunnerNotificationCreatedResult {
  readonly status: "created";
  readonly notificationId: string;
  readonly deliveryCount: number;
  readonly insertedDeliveryCount: number;
  readonly existingDeliveryCount: number;
}

export interface StorylineRunnerNotificationFailedResult {
  readonly status: "failed";
  readonly errorMessage: string;
}

export type StorylineRunnerNotificationResult =
  | StorylineRunnerNotificationCreatedResult
  | StorylineRunnerNotificationFailedResult;

export function toStorylineRunnerNotificationCreatedResult(
  result: CreateStoryCutsceneNotificationForPlayersResult,
): StorylineRunnerNotificationCreatedResult {
  return {
    status: "created",
    notificationId: result.notificationId,
    deliveryCount: result.deliveryCount,
    insertedDeliveryCount: result.insertedDeliveryCount,
    existingDeliveryCount: result.existingDeliveryCount,
  };
}

export type StorylineRunnerEventResult =
  | StorylineRunnerResolvedEventResult
  | StorylineRunnerSkippedEventResult
  | StorylineRunnerAlreadyExistingEventResult
  | StorylineRunnerFailedEventResult;
