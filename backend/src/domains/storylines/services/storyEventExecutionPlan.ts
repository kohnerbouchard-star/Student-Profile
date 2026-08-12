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
import type { StorylineEventCandidateRecord } from "../contracts/storylineRepositoryContracts.ts";
import { evaluateStoryCondition } from "./storyConditionEngine.ts";
import { executeStoryEffect } from "./storyEffectEngine.ts";

interface ParsedStoryEffect {
  readonly effect: StoryEffect;
  readonly authoredEffectIndex: number;
}

interface ParsedPlayerRule {
  readonly authoredRuleIndex: number;
  readonly condition: StoryCondition;
  readonly effects: readonly ParsedStoryEffect[];
}

interface PlannedStoryEffect {
  readonly effect: StoryEffect;
  readonly effectIndex: number;
  readonly playerId: string | null;
}

export interface ParsedStoryEventExecutionPlan {
  readonly version: 1;
  readonly matchCount: number;
  readonly effects: readonly PlannedStoryEffect[];
  readonly notificationPlayerIds: readonly string[];
  readonly revealPayload: JsonObject;
  readonly priority: string;
}

export interface ExecuteStoryEventExecutionPlanResult {
  readonly plan: ParsedStoryEventExecutionPlan;
  readonly effectResult: StoryEffectBatchExecutionResult;
}

export function buildStoryEventExecutionPlan(
  candidate: StorylineEventCandidateRecord,
  playerContexts: readonly PlayerStoryContext[],
): JsonObject {
  const effects: PlannedStoryEffect[] = [];
  const appliedGameScopedEffectIdentities = new Set<string>();
  const parsedRules = candidate.playerRules.map((rule, ruleIndex) =>
    parsePlayerRule(rule, ruleIndex)
  );
  const gameEffectIndexByIdentity = buildGameScopedEffectIndexes(parsedRules);
  let matchCount = 0;

  for (const rule of parsedRules) {
    let ruleMatched = false;

    for (const playerContext of playerContexts) {
      if (!evaluateStoryCondition(rule.condition, playerContext)) continue;

      matchCount += 1;
      ruleMatched = true;

      for (const parsedEffect of rule.effects) {
        if (isGameScopedStoryEffect(parsedEffect.effect)) continue;
        effects.push({
          effect: parsedEffect.effect,
          effectIndex: encodePlayerScopedEffectIndex(
            rule.authoredRuleIndex,
            parsedEffect.authoredEffectIndex,
          ),
          playerId: playerContext.playerId,
        });
      }
    }

    if (!ruleMatched) continue;

    for (const parsedEffect of rule.effects) {
      if (!isGameScopedStoryEffect(parsedEffect.effect)) continue;
      const identity = gameScopedStoryEffectIdentity(parsedEffect.effect);
      if (appliedGameScopedEffectIdentities.has(identity)) continue;
      const effectIndex = gameEffectIndexByIdentity.get(identity);
      if (effectIndex === undefined) {
        throw new Error("Game-scoped Story effect index was not initialized.");
      }
      appliedGameScopedEffectIdentities.add(identity);
      effects.push({ effect: parsedEffect.effect, effectIndex, playerId: null });
    }
  }

  return toJsonObject({
    version: 1,
    matchCount,
    effects: effects.map((entry) => ({
      effectIndex: entry.effectIndex,
      playerId: entry.playerId,
      effect: entry.effect,
    })),
    notificationPlayerIds: uniquePlayerIds(playerContexts),
    revealPayload: candidate.revealPayload,
    priority: candidate.priority,
  });
}

export function parseStoryEventExecutionPlan(
  value: JsonObject,
): ParsedStoryEventExecutionPlan {
  const record = value as Record<string, unknown>;
  if (record.version !== 1) {
    throw new Error("Story execution plan version is invalid.");
  }
  const matchCount = readNonNegativeInteger(record.matchCount, "matchCount");
  if (!Array.isArray(record.effects)) {
    throw new Error("Story execution plan effects must be an array.");
  }
  if (record.effects.length > 5000) {
    throw new Error("Story execution plan effects exceed the reviewed bound.");
  }

  const effects = record.effects.map((entry, index): PlannedStoryEffect => {
    if (!isRecord(entry)) {
      throw new Error(`Story execution plan effects[${index}] must be an object.`);
    }
    const effectIndex = readNonNegativeInteger(
      entry.effectIndex,
      `effects[${index}].effectIndex`,
    );
    const playerId = readNullablePlayerId(entry.playerId, index);
    const effect = parseStoryEffect(entry.effect);
    const gameScoped = isGameScopedStoryEffect(effect);
    if (gameScoped && playerId !== null) {
      throw new Error(`Story execution plan game effect ${index} cannot target a player.`);
    }
    if (!gameScoped && playerId === null) {
      throw new Error(`Story execution plan player effect ${index} requires a player.`);
    }
    return { effect, effectIndex, playerId };
  });

  if (!Array.isArray(record.notificationPlayerIds)) {
    throw new Error("Story execution plan notificationPlayerIds must be an array.");
  }
  const notificationPlayerIds = record.notificationPlayerIds.map((value, index) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      throw new Error(`Story execution plan notificationPlayerIds[${index}] is invalid.`);
    }
    return text;
  });
  if (new Set(notificationPlayerIds).size !== notificationPlayerIds.length) {
    throw new Error("Story execution plan notificationPlayerIds contain duplicates.");
  }
  if (!isRecord(record.revealPayload)) {
    throw new Error("Story execution plan revealPayload must be an object.");
  }
  const priority = typeof record.priority === "string" && record.priority.trim()
    ? record.priority.trim()
    : "normal";

  return {
    version: 1,
    matchCount,
    effects,
    notificationPlayerIds,
    revealPayload: record.revealPayload as JsonObject,
    priority,
  };
}

export async function executeStoryEventExecutionPlan(input: {
  readonly gameSessionId: string;
  readonly storylineEventId: string;
  readonly plan: JsonObject;
  readonly effectiveAt: string;
  readonly effectiveMarketTick: number;
  readonly dependencies: StoryEffectExecutionDependencies;
}): Promise<ExecuteStoryEventExecutionPlanResult> {
  const plan = parseStoryEventExecutionPlan(input.plan);
  const results: StoryEffectExecutionResult[] = [];

  for (const planned of plan.effects) {
    results.push(await executeStoryEffect({
      gameSessionId: input.gameSessionId,
      storylineEventId: input.storylineEventId,
      effect: freezeGameScopedEffect(planned.effect, input.effectiveMarketTick),
      effectIndex: planned.effectIndex,
      now: input.effectiveAt,
      effectiveMarketTick: input.effectiveMarketTick,
      playerContext: planned.playerId
        ? executionPlayerContext(input.gameSessionId, planned.playerId)
        : null,
      dependencies: input.dependencies,
    }));
  }

  return {
    plan,
    effectResult: {
      results,
      appliedCount: results.filter((result) => result.status === "applied").length,
      skippedCount: results.filter((result) => result.status === "skipped").length,
      failedCount: results.filter((result) => result.status === "failed").length,
    },
  };
}

function parsePlayerRule(
  value: JsonObject,
  authoredRuleIndex: number,
): ParsedPlayerRule {
  const record = value as Record<string, unknown>;
  return {
    authoredRuleIndex,
    condition: parseStoryCondition(record.condition),
    effects: Array.isArray(record.effects)
      ? record.effects.map((effect, authoredEffectIndex) => ({
        effect: parseStoryEffect(effect),
        authoredEffectIndex,
      }))
      : [],
  };
}

function buildGameScopedEffectIndexes(
  rules: readonly ParsedPlayerRule[],
): ReadonlyMap<string, number> {
  const indexes = new Map<string, number>();
  let authoredOrdinal = 0;

  for (const rule of rules) {
    for (const parsedEffect of rule.effects) {
      if (!isGameScopedStoryEffect(parsedEffect.effect)) continue;
      const identity = gameScopedStoryEffectIdentity(parsedEffect.effect);
      if (indexes.has(identity)) continue;
      indexes.set(identity, encodeGameScopedEffectIndex(authoredOrdinal));
      authoredOrdinal += 1;
    }
  }
  return indexes;
}

function encodeGameScopedEffectIndex(authoredOrdinal: number): number {
  assertNonNegativeSafeInteger(authoredOrdinal, "game Story effect ordinal");
  const encoded = authoredOrdinal * 2;
  assertNonNegativeSafeInteger(encoded, "game Story effect index");
  return encoded;
}

function encodePlayerScopedEffectIndex(
  authoredRuleIndex: number,
  authoredEffectIndex: number,
): number {
  assertNonNegativeSafeInteger(authoredRuleIndex, "Story rule index");
  assertNonNegativeSafeInteger(authoredEffectIndex, "Story effect index");
  const sum = authoredRuleIndex + authoredEffectIndex;
  const paired = (sum * (sum + 1)) / 2 + authoredEffectIndex;
  const encoded = paired * 2 + 1;
  assertNonNegativeSafeInteger(encoded, "player Story effect identity");
  return encoded;
}

function isGameScopedStoryEffect(effect: StoryEffect): boolean {
  return effect.type === "contract_unlock" ||
    effect.type === "market_news_post" ||
    effect.type === "market_status_change" ||
    effect.type === "story_flag_set" ||
    effect.type === "world_route_state_change" ||
    effect.type === "world_location_state_change" ||
    effect.type === "currency_volatility";
}

function freezeGameScopedEffect(effect: StoryEffect, currentMarketTick: number): StoryEffect {
  if (effect.type !== "market_news_post") return effect;
  assertNonNegativeSafeInteger(currentMarketTick, "Story market tick");
  const createdTick = currentMarketTick + 1;
  assertNonNegativeSafeInteger(createdTick, "Story market-news created tick");
  return { ...effect, payload: { ...effect.payload, createdTick } };
}

function gameScopedStoryEffectIdentity(effect: StoryEffect): string {
  if (effect.type === "contract_unlock") {
    return `contract_unlock:${effect.contractKey}`;
  }
  if (effect.type === "story_flag_set") {
    return `story_flag_set:${effect.flagKey}:${JSON.stringify(effect.value)}`;
  }
  if (effect.type === "market_news_post") {
    const shockKey = effect.payload.shockKey;
    return `market_news_post:${
      typeof shockKey === "string" && shockKey.trim()
        ? shockKey.trim()
        : JSON.stringify(effect.payload)
    }`;
  }
  if (effect.type === "market_status_change") {
    return `market_status_change:${JSON.stringify(effect.payload)}`;
  }
  if (effect.type === "world_route_state_change") {
    return `world_route_state_change:${JSON.stringify(effect.payload)}`;
  }
  if (effect.type === "world_location_state_change") {
    return `world_location_state_change:${JSON.stringify(effect.payload)}`;
  }
  if (effect.type === "currency_volatility") {
    return `currency_volatility:${JSON.stringify(effect.payload)}`;
  }
  return `${effect.type}:${JSON.stringify(effect)}`;
}

function executionPlayerContext(
  gameSessionId: string,
  playerId: string,
): PlayerStoryContext {
  return {
    playerId,
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
    storyFlags: {},
    relationships: {},
  };
}

function uniquePlayerIds(playerContexts: readonly PlayerStoryContext[]): readonly string[] {
  return [...new Set(playerContexts.map((player) => player.playerId))];
}

function readNonNegativeInteger(value: unknown, fieldName: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`Story execution plan ${fieldName} must be a non-negative integer.`);
  }
  return Number(value);
}

function readNullablePlayerId(value: unknown, index: number): string | null {
  if (value === null) return null;
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new Error(`Story execution plan effects[${index}].playerId is invalid.`);
  }
  return text;
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} is outside the supported deterministic range.`);
  }
}

function toJsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
