import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import type {
  GameSessionStorylineStatus,
  StoryEventResolutionStatus,
  StoryPriority,
  StoryTriggerType,
} from "./storylineContracts.ts";
import type {
  StoryEffectFlagWriter,
  StoryEffectImpactWriter,
  StoryEffectPolicyWriter,
  StoryFlagWriteInput,
  StoryPlayerImpactWriteInput,
  StoryPolicyWriteInput,
  StoryWriteResult,
} from "./storyEffectExecutionContracts.ts";

export interface StorylineRepository
  extends
    StoryEffectPolicyWriter,
    StoryEffectFlagWriter,
    StoryEffectImpactWriter {
  listActiveGameSessionStorylines(
    gameSessionId: string,
  ): Promise<readonly GameSessionStorylineRecord[]>;

  listUnresolvedActiveStorylineEvents(
    input: ListUnresolvedActiveStorylineEventsInput,
  ): Promise<readonly StorylineEventCandidateRecord[]>;

  createStoryEventResolution(
    input: CreateStoryEventResolutionInput,
  ): Promise<CreateStoryEventResolutionResult>;

  createPlayerStoryImpact(
    input: StoryPlayerImpactWriteInput,
  ): Promise<StoryWriteResult>;

  upsertGameSessionPolicy(
    input: StoryPolicyWriteInput,
  ): Promise<StoryWriteResult>;

  setGameSessionStoryFlag(
    input: StoryFlagWriteInput,
  ): Promise<StoryWriteResult>;

  listGameSessionStoryFlags(
    gameSessionId: string,
  ): Promise<Record<string, JsonValue>>;
}

export interface ListUnresolvedActiveStorylineEventsInput {
  readonly gameSessionId: string;
  readonly now: string;
  readonly currentMarketTick: number;
}

export interface GameSessionStorylineRecord {
  readonly id: string;
  readonly gameSessionId: string;
  readonly storylineId: string;
  readonly status: GameSessionStorylineStatus | string;
  readonly storyStartedAt: string;
  readonly pausedAt: string | null;
  readonly accumulatedPauseSeconds: number;
  readonly timeScale: number;
  readonly createdAt: string;
}

export interface StorylineEventCandidateRecord {
  readonly id: string;
  readonly storylineId: string;
  readonly gameSessionId: string;
  readonly gameSessionStorylineId: string;
  readonly eventKey: string;
  readonly title: string;
  readonly description: string;
  readonly act: number;
  readonly sequence: number;
  readonly triggerType: StoryTriggerType;
  readonly scheduledOffsetSeconds: number | null;
  readonly scheduledAt: string | null;
  readonly scheduledMarketTick: number | null;
  readonly triggerCondition: JsonObject;
  readonly revealPayload: JsonObject;
  readonly publicNewsPayload: JsonObject;
  readonly playerRules: readonly JsonObject[];
  readonly policyPayloads: readonly JsonObject[];
  readonly flagPayloads: readonly JsonObject[];
  readonly contractUnlockPayloads: readonly JsonObject[];
  readonly priority: StoryPriority | string;
  readonly createdAt: string;
}

export interface CreateStoryEventResolutionInput {
  readonly gameSessionId: string;
  readonly storylineEventId: string;
  readonly resolvedAt: string;
  readonly resolvedMarketTick?: number | null;
  readonly status?: StoryEventResolutionStatus;
  readonly resultPayload?: JsonObject;
}

export type StoryEventResolutionCreateStatus = "inserted" | "existing";

export interface CreateStoryEventResolutionResult {
  readonly status: StoryEventResolutionCreateStatus;
  readonly resolution: StoryEventResolutionRecord;
}

export interface StoryEventResolutionRecord {
  readonly id: string;
  readonly gameSessionId: string;
  readonly storylineEventId: string;
  readonly resolvedAt: string;
  readonly resolvedMarketTick: number | null;
  readonly status: StoryEventResolutionStatus | string;
  readonly resultPayload: JsonObject;
  readonly createdAt: string;
}

export class StorylineRepositoryError extends Error {
  readonly code: string;
  readonly tableName: string;
  readonly operation: string;

  constructor(
    code: string,
    message: string,
    tableName: string,
    operation: string,
  ) {
    super(message);
    this.name = "StorylineRepositoryError";
    this.code = code;
    this.tableName = tableName;
    this.operation = operation;
  }
}
