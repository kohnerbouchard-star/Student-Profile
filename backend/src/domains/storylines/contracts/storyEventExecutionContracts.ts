import type { JsonObject } from "../../../supabase/tableTypes.ts";

export interface StoryEventExecutionRepository {
  claim(
    input: ClaimStoryEventExecutionInput,
  ): Promise<StoryEventExecutionClaimResult>;

  fail(
    input: FailStoryEventExecutionInput,
  ): Promise<StoryEventExecutionFailureResult>;

  finalize(
    input: FinalizeStoryEventExecutionInput,
  ): Promise<StoryEventExecutionFinalizeResult>;
}

export interface ClaimStoryEventExecutionInput {
  readonly gameSessionId: string;
  readonly storylineEventId: string;
  readonly effectiveAt: string;
  readonly effectiveMarketTick: number;
  readonly executionPlan: JsonObject | null;
  readonly leaseSeconds?: number;
}

export type StoryEventExecutionClaimOutcome =
  | "absent"
  | "acquired"
  | "busy"
  | "already_resolved";

export interface StoryEventExecutionClaimResult {
  readonly outcome: StoryEventExecutionClaimOutcome;
  readonly claimId: string | null;
  readonly leaseToken: string | null;
  readonly leaseExpiresAt: string | null;
  readonly effectiveAt: string;
  readonly effectiveMarketTick: number | null;
  readonly attemptCount: number;
  readonly executionPlan: JsonObject;
  readonly resolutionId: string | null;
}

export interface FailStoryEventExecutionInput {
  readonly gameSessionId: string;
  readonly storylineEventId: string;
  readonly leaseToken: string;
  readonly errorMessage: string;
}

export interface StoryEventExecutionFailureResult {
  readonly outcome: "retryable_failed" | "already_resolved";
  readonly claimId: string;
  readonly attemptCount: number;
}

export interface FinalizeStoryEventExecutionInput {
  readonly gameSessionId: string;
  readonly storylineEventId: string;
  readonly leaseToken: string;
  readonly resultPayload: JsonObject;
}

export interface StoryEventExecutionFinalizeResult {
  readonly outcome: "finalized" | "already_resolved";
  readonly claimId: string;
  readonly resolutionId: string;
  readonly attemptCount: number;
}

export class StoryEventExecutionRepositoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly operation: "claim" | "fail" | "finalize",
  ) {
    super(message);
    this.name = "StoryEventExecutionRepositoryError";
  }
}
