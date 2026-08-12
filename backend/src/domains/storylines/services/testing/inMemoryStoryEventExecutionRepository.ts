import type { JsonObject } from "../../../../supabase/tableTypes.ts";
import type {
  ClaimStoryEventExecutionInput,
  FailStoryEventExecutionInput,
  FinalizeStoryEventExecutionInput,
  StoryEventExecutionClaimResult,
  StoryEventExecutionFailureResult,
  StoryEventExecutionFinalizeResult,
  StoryEventExecutionRepository,
} from "../../contracts/storyEventExecutionContracts.ts";

interface ClaimState {
  readonly claimId: string;
  status: "executing" | "retryable_failed" | "completed";
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  readonly effectiveAt: string;
  readonly effectiveMarketTick: number;
  attemptCount: number;
  readonly executionPlan: JsonObject;
  resolutionId: string | null;
}

export class InMemoryStoryEventExecutionRepository
  implements StoryEventExecutionRepository {
  private readonly claims = new Map<string, ClaimState>();
  private sequence = 0;

  async claim(
    input: ClaimStoryEventExecutionInput,
  ): Promise<StoryEventExecutionClaimResult> {
    const key = scopeKey(input.gameSessionId, input.storylineEventId);
    const existing = this.claims.get(key);

    if (!existing) {
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

      const claim = this.createClaim(input);
      this.claims.set(key, claim);
      return toClaimResult("acquired", claim);
    }

    if (existing.status === "completed") {
      return toClaimResult("already_resolved", existing);
    }

    if (existing.status === "executing") {
      return toClaimResult("busy", existing);
    }

    existing.status = "executing";
    existing.attemptCount += 1;
    existing.leaseToken = this.nextId("lease");
    existing.leaseExpiresAt = leaseExpiry(existing.effectiveAt);
    return toClaimResult("acquired", existing);
  }

  async fail(
    input: FailStoryEventExecutionInput,
  ): Promise<StoryEventExecutionFailureResult> {
    const claim = this.requireClaim(input.gameSessionId, input.storylineEventId);
    if (claim.status === "completed") {
      return {
        outcome: "already_resolved",
        claimId: claim.claimId,
        attemptCount: claim.attemptCount,
      };
    }
    requireLease(claim, input.leaseToken);
    claim.status = "retryable_failed";
    claim.leaseToken = null;
    claim.leaseExpiresAt = null;
    return {
      outcome: "retryable_failed",
      claimId: claim.claimId,
      attemptCount: claim.attemptCount,
    };
  }

  async finalize(
    input: FinalizeStoryEventExecutionInput,
  ): Promise<StoryEventExecutionFinalizeResult> {
    const claim = this.requireClaim(input.gameSessionId, input.storylineEventId);
    if (claim.status === "completed" && claim.resolutionId) {
      return {
        outcome: "already_resolved",
        claimId: claim.claimId,
        resolutionId: claim.resolutionId,
        attemptCount: claim.attemptCount,
      };
    }
    requireLease(claim, input.leaseToken);
    claim.status = "completed";
    claim.leaseToken = null;
    claim.leaseExpiresAt = null;
    claim.resolutionId = this.nextId("resolution");
    return {
      outcome: "finalized",
      claimId: claim.claimId,
      resolutionId: claim.resolutionId,
      attemptCount: claim.attemptCount,
    };
  }

  readClaim(gameSessionId: string, storylineEventId: string): Readonly<ClaimState> | null {
    return this.claims.get(scopeKey(gameSessionId, storylineEventId)) ?? null;
  }

  private createClaim(input: ClaimStoryEventExecutionInput): ClaimState {
    return {
      claimId: this.nextId("claim"),
      status: "executing",
      leaseToken: this.nextId("lease"),
      leaseExpiresAt: leaseExpiry(input.effectiveAt),
      effectiveAt: input.effectiveAt,
      effectiveMarketTick: input.effectiveMarketTick,
      attemptCount: 1,
      executionPlan: input.executionPlan ?? {},
      resolutionId: null,
    };
  }

  private requireClaim(gameSessionId: string, storylineEventId: string): ClaimState {
    const claim = this.claims.get(scopeKey(gameSessionId, storylineEventId));
    if (!claim) throw new Error("Story execution claim not found.");
    return claim;
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }
}

function toClaimResult(
  outcome: "acquired" | "busy" | "already_resolved",
  claim: ClaimState,
): StoryEventExecutionClaimResult {
  return {
    outcome,
    claimId: claim.claimId,
    leaseToken: outcome === "acquired" ? claim.leaseToken : null,
    leaseExpiresAt: claim.leaseExpiresAt,
    effectiveAt: claim.effectiveAt,
    effectiveMarketTick: claim.effectiveMarketTick,
    attemptCount: claim.attemptCount,
    executionPlan: claim.executionPlan,
    resolutionId: claim.resolutionId,
  };
}

function requireLease(claim: ClaimState, leaseToken: string): void {
  if (claim.status !== "executing" || !claim.leaseToken || claim.leaseToken !== leaseToken) {
    throw new Error("Story execution lease lost.");
  }
}

function scopeKey(gameSessionId: string, storylineEventId: string): string {
  return `${gameSessionId}:${storylineEventId}`;
}

function leaseExpiry(effectiveAt: string): string {
  const base = Date.parse(effectiveAt);
  return new Date((Number.isFinite(base) ? base : 0) + 120_000).toISOString();
}
