import type { JsonObject } from "../../../supabase/tableTypes.ts";
import type {
  StoryEventExecutionClaimResult,
  StoryEventExecutionRepository,
} from "../contracts/storyEventExecutionContracts.ts";
import type {
  RunDueStorylineEventsInput,
  StorylineRunnerEventResult,
  StorylineRunnerResult,
} from "../contracts/storylineRunnerContracts.ts";
import type { StorylineRepository } from "../contracts/storylineRepositoryContracts.ts";
import type { LeaseAwareRunInput } from "./storylineEventResolution.ts";
import { resolveCandidate, buildRunnerResult } from "./storylineEventResolution.ts";

export async function runDueStorylineEvents(
  input: RunDueStorylineEventsInput,
): Promise<StorylineRunnerResult> {
  const resolvedInput: LeaseAwareRunInput = {
    ...input,
    executionRepository: input.executionRepository ??
      new LegacyResolutionExecutionRepository(input.repository),
  };
  const candidates = await input.repository.listUnresolvedActiveStorylineEvents({
    gameSessionId: input.gameSessionId,
    now: input.now,
    currentMarketTick: input.currentMarketTick,
  });
  const storyFlags = await input.repository.listGameSessionStoryFlags(
    input.gameSessionId,
  );
  const eventResults: StorylineRunnerEventResult[] = [];

  for (const candidate of candidates) {
    eventResults.push(await resolveCandidate(candidate, resolvedInput, storyFlags));
  }

  return buildRunnerResult(
    input.gameSessionId,
    candidates.length,
    eventResults,
  );
}

interface LegacyClaimState {
  readonly claimId: string;
  readonly leaseToken: string;
  readonly resolutionId: string;
  readonly effectiveAt: string;
  readonly effectiveMarketTick: number;
  readonly executionPlan: JsonObject;
}

class LegacyResolutionExecutionRepository implements StoryEventExecutionRepository {
  private readonly claims = new Map<string, LegacyClaimState>();

  constructor(private readonly repository: StorylineRepository) {}

  async claim(input: {
    readonly gameSessionId: string;
    readonly storylineEventId: string;
    readonly effectiveAt: string;
    readonly effectiveMarketTick: number;
    readonly executionPlan: JsonObject | null;
  }): Promise<StoryEventExecutionClaimResult> {
    const key = `${input.gameSessionId}:${input.storylineEventId}`;
    const existingClaim = this.claims.get(key);
    if (existingClaim) {
      return {
        outcome: "busy",
        claimId: existingClaim.claimId,
        leaseToken: null,
        leaseExpiresAt: null,
        effectiveAt: existingClaim.effectiveAt,
        effectiveMarketTick: existingClaim.effectiveMarketTick,
        attemptCount: 1,
        executionPlan: existingClaim.executionPlan,
        resolutionId: existingClaim.resolutionId,
      };
    }

    if (input.executionPlan === null) {
      return {
        outcome: "absent",
        claimId: null,
        leaseToken: null,
        leaseExpiresAt: null,
        effectiveAt: input.effectiveAt,
        effectiveMarketTick: input.effectiveMarketTick,
        attemptCount: 0,
        executionPlan: {},
        resolutionId: null,
      };
    }

    const resolution = await this.repository.createStoryEventResolution({
      gameSessionId: input.gameSessionId,
      storylineEventId: input.storylineEventId,
      resolvedAt: input.effectiveAt,
      resolvedMarketTick: input.effectiveMarketTick,
      status: "resolved",
      resultPayload: { resolutionPhase: "legacy_compatibility" },
    });

    if (resolution.status === "existing") {
      return {
        outcome: "already_resolved",
        claimId: null,
        leaseToken: null,
        leaseExpiresAt: null,
        effectiveAt: resolution.resolution.resolvedAt,
        effectiveMarketTick: resolution.resolution.resolvedMarketTick,
        attemptCount: 0,
        executionPlan: input.executionPlan,
        resolutionId: resolution.resolution.id,
      };
    }

    const claim: LegacyClaimState = {
      claimId: `legacy-claim:${resolution.resolution.id}`,
      leaseToken: `legacy-lease:${resolution.resolution.id}`,
      resolutionId: resolution.resolution.id,
      effectiveAt: input.effectiveAt,
      effectiveMarketTick: input.effectiveMarketTick,
      executionPlan: input.executionPlan,
    };
    this.claims.set(key, claim);

    return {
      outcome: "acquired",
      claimId: claim.claimId,
      leaseToken: claim.leaseToken,
      leaseExpiresAt: null,
      effectiveAt: claim.effectiveAt,
      effectiveMarketTick: claim.effectiveMarketTick,
      attemptCount: 1,
      executionPlan: claim.executionPlan,
      resolutionId: null,
    };
  }

  async fail(input: {
    readonly gameSessionId: string;
    readonly storylineEventId: string;
    readonly leaseToken: string;
  }) {
    const claim = this.claims.get(`${input.gameSessionId}:${input.storylineEventId}`);
    if (!claim || claim.leaseToken !== input.leaseToken) {
      throw new Error("Legacy Story execution lease lost.");
    }
    return {
      outcome: "retryable_failed" as const,
      claimId: claim.claimId,
      attemptCount: 1,
    };
  }

  async finalize(input: {
    readonly gameSessionId: string;
    readonly storylineEventId: string;
    readonly leaseToken: string;
  }) {
    const key = `${input.gameSessionId}:${input.storylineEventId}`;
    const claim = this.claims.get(key);
    if (!claim || claim.leaseToken !== input.leaseToken) {
      throw new Error("Legacy Story execution lease lost.");
    }
    this.claims.delete(key);
    return {
      outcome: "finalized" as const,
      claimId: claim.claimId,
      resolutionId: claim.resolutionId,
      attemptCount: 1,
    };
  }
}
