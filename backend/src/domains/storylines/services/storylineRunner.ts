import type { JsonObject } from "../../../supabase/tableTypes.ts";
import type { PlayerStoryContext } from "../contracts/playerStoryContext.ts";
import {
  parseStoryCondition,
  type StoryCondition,
} from "../contracts/storyConditionContracts.ts";
import {
  parseStoryEffect,
  type StoryEffect,
} from "../contracts/storyEffectContracts.ts";
import type {
  StoryEffectBatchExecutionResult,
  StoryEffectExecutionDependencies,
  StoryEffectExecutionResult,
} from "../contracts/storyEffectExecutionContracts.ts";
import type {
  RunDueStorylineEventsInput,
  StorylineRunnerEventResult,
  StorylineRunnerResult,
} from "../contracts/storylineRunnerContracts.ts";
import type { StorylineEventCandidateRecord } from "../contracts/storylineRepositoryContracts.ts";
import { evaluateStoryCondition } from "./storyConditionEngine.ts";
import { executeStoryEffect } from "./storyEffectEngine.ts";

interface ParsedPlayerRule {
  readonly ruleKey: string;
  readonly condition: StoryCondition;
  readonly effects: readonly StoryEffect[];
}

interface MatchedStoryEffect {
  readonly effect: StoryEffect;
  readonly playerContext: PlayerStoryContext;
}

interface PlayerRuleApplicationResult {
  readonly matchCount: number;
  readonly effectResult: StoryEffectBatchExecutionResult;
}

export async function runDueStorylineEvents(
  input: RunDueStorylineEventsInput,
): Promise<StorylineRunnerResult> {
  const candidates = await input.repository.listUnresolvedActiveStorylineEvents(
    {
      gameSessionId: input.gameSessionId,
      now: input.now,
      currentMarketTick: input.currentMarketTick,
    },
  );
  const storyFlags = await input.repository.listGameSessionStoryFlags(
    input.gameSessionId,
  );
  const eventResults: StorylineRunnerEventResult[] = [];

  for (const candidate of candidates) {
    eventResults.push(await resolveCandidate(candidate, input, storyFlags));
  }

  return buildRunnerResult(
    input.gameSessionId,
    candidates.length,
    eventResults,
  );
}

async function resolveCandidate(
  candidate: StorylineEventCandidateRecord,
  input: RunDueStorylineEventsInput,
  storyFlags: PlayerStoryContext["storyFlags"],
): Promise<StorylineRunnerEventResult> {
  try {
    if (candidate.triggerType === "manual") {
      return skipped(candidate, "manual_trigger");
    }

    if (!isTriggerEligible(candidate, input, storyFlags)) {
      return skipped(candidate, "trigger_not_due");
    }

    const resolutionResult = await input.repository.createStoryEventResolution({
      gameSessionId: input.gameSessionId,
      storylineEventId: candidate.id,
      resolvedAt: input.now,
      resolvedMarketTick: input.currentMarketTick,
      status: "resolved",
      resultPayload: {
        eventKey: candidate.eventKey,
        triggerType: candidate.triggerType,
        resolutionPhase: "accepted",
      },
    });

    if (resolutionResult.status === "existing") {
      return {
        status: "already_existing",
        eventId: candidate.id,
        eventKey: candidate.eventKey,
        triggerType: candidate.triggerType,
        resolutionId: resolutionResult.resolution.id,
      };
    }

    const applicationResult = await applyPlayerRuleEffects(candidate, input);
    const hasFailedEffect = applicationResult.effectResult.failedCount > 0;

    if (hasFailedEffect) {
      return {
        status: "failed",
        eventId: candidate.id,
        eventKey: candidate.eventKey,
        triggerType: candidate.triggerType,
        errorMessage: "One or more story effects failed.",
        resultPayload: buildEffectResultPayload(applicationResult.effectResult),
        effectResult: applicationResult.effectResult,
      };
    }

    return {
      status: "resolved",
      eventId: candidate.id,
      eventKey: candidate.eventKey,
      triggerType: candidate.triggerType,
      resolutionId: resolutionResult.resolution.id,
      playerRuleMatchCount: applicationResult.matchCount,
      effectResult: applicationResult.effectResult,
    };
  } catch (error) {
    return {
      status: "failed",
      eventId: candidate.id,
      eventKey: candidate.eventKey,
      triggerType: candidate.triggerType,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

async function applyPlayerRuleEffects(
  candidate: StorylineEventCandidateRecord,
  input: RunDueStorylineEventsInput,
): Promise<PlayerRuleApplicationResult> {
  const matchingEffects: MatchedStoryEffect[] = [];
  let matchCount = 0;

  for (const rule of candidate.playerRules.map(parsePlayerRule)) {
    for (const playerContext of input.playerContexts) {
      if (evaluateStoryCondition(rule.condition, playerContext)) {
        matchCount += 1;
        matchingEffects.push(
          ...rule.effects.map((effect) => ({
            effect,
            playerContext,
          })),
        );
      }
    }
  }

  return {
    matchCount,
    effectResult: await executeEffectsForMatchedPlayers({
      gameSessionId: input.gameSessionId,
      storylineEventId: candidate.id,
      now: input.now,
      matchingEffects,
      effectDependencies: input.effectDependencies,
    }),
  };
}

async function executeEffectsForMatchedPlayers(input: {
  readonly gameSessionId: string;
  readonly storylineEventId: string;
  readonly now: string;
  readonly matchingEffects: readonly MatchedStoryEffect[];
  readonly effectDependencies: StoryEffectExecutionDependencies;
}): Promise<StoryEffectBatchExecutionResult> {
  const results: StoryEffectExecutionResult[] = [];

  for (let index = 0; index < input.matchingEffects.length; index += 1) {
    const matched = input.matchingEffects[index];
    results.push(
      await executeStoryEffect({
        gameSessionId: input.gameSessionId,
        storylineEventId: input.storylineEventId,
        effect: matched.effect,
        effectIndex: index,
        now: input.now,
        playerContext: matched.playerContext,
        dependencies: input.effectDependencies,
      }),
    );
  }

  return {
    results,
    appliedCount:
      results.filter((result) => result.status === "applied").length,
    skippedCount:
      results.filter((result) => result.status === "skipped").length,
    failedCount: results.filter((result) => result.status === "failed").length,
  };
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
      candidate.scheduledOffsetSeconds <=
        readStoryElapsedSeconds(candidate, input.now);
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

function parsePlayerRule(value: JsonObject): ParsedPlayerRule {
  const record = value as Record<string, unknown>;
  const ruleKey = typeof record.ruleKey === "string" && record.ruleKey.trim()
    ? record.ruleKey.trim()
    : "story_rule";
  const effects = Array.isArray(record.effects)
    ? record.effects.map(parseStoryEffect)
    : [];

  return {
    ruleKey,
    condition: parseStoryCondition(record.condition),
    effects,
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

function skipped(
  candidate: StorylineEventCandidateRecord,
  reason: "manual_trigger" | "trigger_not_due",
): StorylineRunnerEventResult {
  return {
    status: "skipped",
    eventId: candidate.id,
    eventKey: candidate.eventKey,
    triggerType: candidate.triggerType,
    reason,
  };
}

function buildRunnerResult(
  gameSessionId: string,
  candidateCount: number,
  events: readonly StorylineRunnerEventResult[],
): StorylineRunnerResult {
  const resolvedEvents = events.filter((event) => event.status === "resolved");
  const effectTotals = events.reduce(
    (totals, event) => {
      if (!("effectResult" in event) || !event.effectResult) {
        return totals;
      }

      return {
        applied: totals.applied + event.effectResult.appliedCount,
        skipped: totals.skipped + event.effectResult.skippedCount,
        failed: totals.failed + event.effectResult.failedCount,
      };
    },
    { applied: 0, skipped: 0, failed: 0 },
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
    events,
  };
}
