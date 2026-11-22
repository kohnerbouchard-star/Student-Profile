import type { JsonObject } from "../../../supabase/tableTypes.ts";
import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import { parseStoryCondition } from "../contracts/storyConditionContracts.ts";
import { parseStoryRevealPayload } from "../contracts/storyEffectContracts.ts";
import type {
  StoryEffectBatchExecutionResult,
} from "../contracts/storyEffectExecutionContracts.ts";
import type {
  StoryEventExecutionClaimResult,
} from "../contracts/storyEventExecutionContracts.ts";
import type {
  RunDueStorylineEventsInput,
  StorylineRunnerEventResult,
  StorylineRunnerNotificationResult,
  StorylineRunnerResult,
} from "../contracts/storylineRunnerContracts.ts";
import {
  toStorylineRunnerNotificationCreatedResult,
} from "../contracts/storylineRunnerContracts.ts";
import type {
  StorylineEventCandidateRecord,
} from "../contracts/storylineRepositoryContracts.ts";
import { evaluateStoryCondition } from "./storyConditionEngine.ts";
import {
  buildStoryEventExecutionPlan,
  executeStoryEventExecutionPlan,
  type ParsedStoryEventExecutionPlan,
} from "./storyEventExecutionPlan.ts";
import { createStoryCutsceneNotificationForPlayers } from "./storyNotificationService.ts";

const STORY_EXECUTION_LEASE_SECONDS = 120;

export async function resolveCandidate(
  candidate: StorylineEventCandidateRecord,
  input: RunDueStorylineEventsInput,
  storyFlags: PlayerStoryContext["storyFlags"],
): Promise<StorylineRunnerEventResult> {
  let activeLeaseToken: string | null = null;

  try {
    if (candidate.triggerType === "manual") {
      return skipped(candidate, "manual_trigger");
    }

    let claim = await claimExecution(candidate, input, null);
    const preexisting = claimTerminalResult(candidate, claim);
    if (preexisting) return preexisting;

    if (claim.outcome === "absent") {
      if (!isTriggerEligible(candidate, input, storyFlags)) {
        return skipped(candidate, "trigger_not_due");
      }

      claim = await claimExecution(
        candidate,
        input,
        buildStoryEventExecutionPlan(candidate, input.playerContexts),
      );
      const raced = claimTerminalResult(candidate, claim);
      if (raced) return raced;
    }

    if (claim.outcome !== "acquired") {
      throw new Error(`Unexpected Story execution claim outcome: ${claim.outcome}.`);
    }
    if (
      !claim.leaseToken ||
      claim.effectiveMarketTick === null ||
      !Number.isSafeInteger(claim.effectiveMarketTick)
    ) {
      throw new Error("Acquired Story execution claim is incomplete.");
    }

    activeLeaseToken = claim.leaseToken;
    const application = await executeStoryEventExecutionPlan({
      gameSessionId: input.gameSessionId,
      storylineEventId: candidate.id,
      plan: claim.executionPlan,
      effectiveAt: claim.effectiveAt,
      effectiveMarketTick: claim.effectiveMarketTick,
      dependencies: input.effectDependencies,
    });

    if (application.effectResult.failedCount > 0) {
      await input.executionRepository.fail({
        gameSessionId: input.gameSessionId,
        storylineEventId: candidate.id,
        leaseToken: activeLeaseToken,
        errorMessage: "One or more Story effects failed.",
      });
      activeLeaseToken = null;
      return {
        status: "failed",
        eventId: candidate.id,
        eventKey: candidate.eventKey,
        triggerType: candidate.triggerType,
        errorMessage: "One or more story effects failed.",
        resultPayload: buildEffectResultPayload(application.effectResult),
        effectResult: application.effectResult,
      };
    }

    const notificationResult = await createCutsceneNotificationIfConfigured({
      storylineEventId: candidate.id,
      gameSessionId: input.gameSessionId,
      plan: application.plan,
      now: claim.effectiveAt,
      repository: input.notificationRepository,
    });

    if (notificationResult?.status === "failed") {
      await input.executionRepository.fail({
        gameSessionId: input.gameSessionId,
        storylineEventId: candidate.id,
        leaseToken: activeLeaseToken,
        errorMessage: notificationResult.errorMessage,
      });
      activeLeaseToken = null;
      return {
        status: "failed",
        eventId: candidate.id,
        eventKey: candidate.eventKey,
        triggerType: candidate.triggerType,
        errorMessage: notificationResult.errorMessage,
        resultPayload: {
          ...buildEffectResultPayload(application.effectResult),
          notificationStatus: "failed",
        },
        effectResult: application.effectResult,
        notificationResult,
      };
    }

    const finalizeResult = await input.executionRepository.finalize({
      gameSessionId: input.gameSessionId,
      storylineEventId: candidate.id,
      leaseToken: activeLeaseToken,
      resultPayload: {
        eventKey: candidate.eventKey,
        triggerType: candidate.triggerType,
        resolutionPhase: "completed",
        playerRuleMatchCount: application.plan.matchCount,
        ...buildEffectResultPayload(application.effectResult),
        notificationStatus: notificationResult?.status ?? "not_configured",
      },
    });
    activeLeaseToken = null;

    return {
      status: "resolved",
      eventId: candidate.id,
      eventKey: candidate.eventKey,
      triggerType: candidate.triggerType,
      resolutionId: finalizeResult.resolutionId,
      playerRuleMatchCount: application.plan.matchCount,
      effectResult: application.effectResult,
      ...(notificationResult ? { notificationResult } : {}),
    };
  } catch (error) {
    if (activeLeaseToken) {
      await failLeaseBestEffort(candidate, input, activeLeaseToken, error);
    }

    return {
      status: "failed",
      eventId: candidate.id,
      eventKey: candidate.eventKey,
      triggerType: candidate.triggerType,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function claimExecution(
  candidate: StorylineEventCandidateRecord,
  input: RunDueStorylineEventsInput,
  executionPlan: JsonObject | null,
): Promise<StoryEventExecutionClaimResult> {
  return input.executionRepository.claim({
    gameSessionId: input.gameSessionId,
    storylineEventId: candidate.id,
    effectiveAt: input.now,
    effectiveMarketTick: input.currentMarketTick,
    executionPlan,
    leaseSeconds: STORY_EXECUTION_LEASE_SECONDS,
  });
}

function claimTerminalResult(
  candidate: StorylineEventCandidateRecord,
  claim: StoryEventExecutionClaimResult,
): StorylineRunnerEventResult | null {
  if (claim.outcome === "busy") {
    return skipped(candidate, "execution_in_progress");
  }

  if (claim.outcome === "already_resolved") {
    if (!claim.resolutionId) {
      throw new Error("Resolved Story execution claim is missing resolutionId.");
    }
    return {
      status: "already_existing",
      eventId: candidate.id,
      eventKey: candidate.eventKey,
      triggerType: candidate.triggerType,
      resolutionId: claim.resolutionId,
    };
  }

  return null;
}

async function failLeaseBestEffort(
  candidate: StorylineEventCandidateRecord,
  input: RunDueStorylineEventsInput,
  leaseToken: string,
  error: unknown,
): Promise<void> {
  try {
    await input.executionRepository.fail({
      gameSessionId: input.gameSessionId,
      storylineEventId: candidate.id,
      leaseToken,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  } catch (_secondaryError) {
    // The lease may already have expired/reacquired. Side effects are
    // deterministic and replay-safe; another owner may continue the plan.
  }
}

async function createCutsceneNotificationIfConfigured(input: {
  readonly storylineEventId: string;
  readonly gameSessionId: string;
  readonly plan: ParsedStoryEventExecutionPlan;
  readonly now: string;
  readonly repository: RunDueStorylineEventsInput["notificationRepository"];
}): Promise<StorylineRunnerNotificationResult | null> {
  if (!input.repository) return null;

  const reveal = parseStoryRevealPayload(input.plan.revealPayload);
  if (!reveal) return null;

  try {
    return toStorylineRunnerNotificationCreatedResult(
      await createStoryCutsceneNotificationForPlayers({
        gameSessionId: input.gameSessionId,
        storylineEventId: input.storylineEventId,
        targetPlayerIds: input.plan.notificationPlayerIds,
        reveal,
        priority: toNotificationPriority(input.plan.priority),
        now: input.now,
        repository: input.repository,
      }),
    );
  } catch (error) {
    return {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function isTriggerEligible(
  candidate: StorylineEventCandidateRecord,
  input: RunDueStorylineEventsInput,
  storyFlags: PlayerStoryContext["storyFlags"],
): boolean {
  if (candidate.triggerType === "condition") {
    return evaluateStoryCondition(
      parseStoryCondition(candidate.triggerCondition),
      buildGameStoryFlagContext(input.gameSessionId, storyFlags),
    );
  }

  if (candidate.triggerType === "market_tick") {
    return candidate.scheduledMarketTick !== null &&
      candidate.scheduledMarketTick <= input.currentMarketTick;
  }

  if (candidate.triggerType === "wall_clock_time") {
    return candidate.scheduledAt !== null &&
      Date.parse(candidate.scheduledAt) <= Date.parse(input.now);
  }

  if (candidate.triggerType === "elapsed_time") {
    return candidate.scheduledOffsetSeconds !== null &&
      candidate.scheduledOffsetSeconds <= readStoryElapsedSeconds(candidate, input.now);
  }

  return false;
}

function readStoryElapsedSeconds(
  candidate: StorylineEventCandidateRecord,
  now: string,
): number {
  const startedAtMs = Date.parse(candidate.storyStartedAt);
  const nowMs = Date.parse(now);

  if (Number.isNaN(startedAtMs) || Number.isNaN(nowMs) || nowMs < startedAtMs) {
    return 0;
  }

  return Math.max(
    0,
    ((nowMs - startedAtMs) / 1000 - candidate.accumulatedPauseSeconds) *
      candidate.timeScale,
  );
}

function buildGameStoryFlagContext(
  gameSessionId: string,
  storyFlags: PlayerStoryContext["storyFlags"],
): PlayerStoryContext {
  return {
    playerId: "__game_story_flags__",
    gameSessionId,
    homeCountryId: null,
    homeCountryCode: null,
    currentCountryId: null,
    currentCountryCode: null,
    cashBalance: null,
    resources: {},
    sectorExposurePct: {},
    countryExposurePct: {},
    activeContractKeys: [],
    completedContractKeys: [],
    storyFlags,
  };
}

function buildEffectResultPayload(
  effectResult: StoryEffectBatchExecutionResult,
): JsonObject {
  return {
    effectAppliedCount: effectResult.appliedCount,
    effectSkippedCount: effectResult.skippedCount,
    effectFailedCount: effectResult.failedCount,
  };
}

function toNotificationPriority(
  priority: string,
): "low" | "normal" | "major" | "critical" {
  if (
    priority === "low" ||
    priority === "normal" ||
    priority === "major" ||
    priority === "critical"
  ) {
    return priority;
  }

  return "normal";
}

function skipped(
  candidate: StorylineEventCandidateRecord,
  reason: "manual_trigger" | "trigger_not_due" | "execution_in_progress",
): StorylineRunnerEventResult {
  return {
    status: "skipped",
    eventId: candidate.id,
    eventKey: candidate.eventKey,
    triggerType: candidate.triggerType,
    reason,
  };
}

export function buildRunnerResult(
  gameSessionId: string,
  candidateCount: number,
  events: readonly StorylineRunnerEventResult[],
): StorylineRunnerResult {
  const resolvedEvents = events.filter((event) => event.status === "resolved");
  const effectTotals = events.reduce(
    (totals, event) => {
      if (!("effectResult" in event) || !event.effectResult) return totals;
      return {
        applied: totals.applied + event.effectResult.appliedCount,
        skipped: totals.skipped + event.effectResult.skippedCount,
        failed: totals.failed + event.effectResult.failedCount,
      };
    },
    { applied: 0, skipped: 0, failed: 0 },
  );
  const notificationTotals = events.reduce(
    (totals, event) => {
      if (!("notificationResult" in event) || !event.notificationResult) {
        return totals;
      }
      if (event.notificationResult.status === "failed") {
        return { ...totals, failed: totals.failed + 1 };
      }
      return {
        created: totals.created + 1,
        deliveries: totals.deliveries + event.notificationResult.deliveryCount,
        failed: totals.failed,
      };
    },
    { created: 0, deliveries: 0, failed: 0 },
  );

  return {
    gameSessionId,
    candidateCount,
    resolvedCount: resolvedEvents.length,
    skippedCount: events.filter((event) => event.status === "skipped").length,
    failedCount: events.filter((event) => event.status === "failed").length,
    alreadyExistingCount:
      events.filter((event) => event.status === "already_existing").length,
    effectAppliedCount: effectTotals.applied,
    effectSkippedCount: effectTotals.skipped,
    effectFailedCount: effectTotals.failed,
    notificationCreatedCount: notificationTotals.created,
    notificationDeliveryCount: notificationTotals.deliveries,
    notificationFailedCount: notificationTotals.failed,
    events,
  };
}
