import type { JsonObject } from "../../../supabase/tableTypes.ts";
import {
  STOCK_MARKET_NEWS_CATEGORIES,
  STOCK_MARKET_NEWS_IMPACT_STRENGTHS,
  STOCK_MARKET_NEWS_SCOPES,
  STOCK_MARKET_NEWS_SENTIMENTS,
  STOCK_MARKET_NEWS_SOURCES,
  type StockMarketNewsCategory,
  type StockMarketNewsImpactStrength,
  type StockMarketNewsScope,
  type StockMarketNewsSentiment,
  type StockMarketNewsSource,
} from "../../stocks/contracts/stockMarketNewsContracts.ts";
import {
  type StoryCondition,
  parseStoryCondition,
} from "./storyConditionContracts.ts";
import {
  type StoryEffect,
  type StoryFlagPayload,
  type StoryPolicyPayload,
  type StoryRevealPayload,
  parseStoryEffect,
  parseStoryFlagPayload,
  parseStoryPolicyPayload,
  parseStoryRevealPayload,
} from "./storyEffectContracts.ts";
import { invalidStorylineContract } from "./storylineContractErrors.ts";
import {
  isEmptyRecord,
  readBooleanWithDefault,
  readArray,
  readEnum,
  readJsonObjectWithDefault,
  readNonNegativeInteger,
  readOptionalArray,
  readOptionalEnum,
  readOptionalIsoDateTimeText,
  readOptionalNonNegativeInteger,
  readOptionalTextWithDefault,
  readRecord,
  readRequiredText,
} from "./storylineContractPrimitives.ts";

export const STORY_TRIGGER_TYPES = [
  "elapsed_time",
  "wall_clock_time",
  "market_tick",
  "condition",
  "manual",
] as const;

export const STORY_PRIORITIES = [
  "low",
  "normal",
  "major",
  "critical",
] as const;

export const GAME_SESSION_STORYLINE_STATUSES = [
  "active",
  "paused",
  "completed",
  "cancelled",
] as const;

export const STORY_EVENT_RESOLUTION_STATUSES = [
  "resolved",
  "skipped",
  "failed",
] as const;

export type StoryTriggerType = typeof STORY_TRIGGER_TYPES[number];
export type StoryPriority = typeof STORY_PRIORITIES[number];
export type GameSessionStorylineStatus =
  typeof GAME_SESSION_STORYLINE_STATUSES[number];
export type StoryEventResolutionStatus =
  typeof STORY_EVENT_RESOLUTION_STATUSES[number];

export interface StorylineConfig {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly isActive: boolean;
}

export interface StorylineEventConfig {
  readonly eventKey: string;
  readonly title: string;
  readonly description: string;
  readonly act: number;
  readonly sequence: number;
  readonly triggerType: StoryTriggerType;
  readonly scheduledOffsetSeconds: number | null;
  readonly scheduledAt: string | null;
  readonly scheduledMarketTick: number | null;
  readonly triggerCondition: StoryCondition | null;
  readonly reveal: StoryRevealPayload | null;
  readonly publicNews: StoryPublicNewsPayload | null;
  readonly playerRules: readonly StoryPlayerRulePayload[];
  readonly policies: readonly StoryPolicyPayload[];
  readonly flags: readonly StoryFlagPayload[];
  readonly contractUnlocks: readonly StoryContractUnlockPayload[];
  readonly priority: StoryPriority;
  readonly isActive: boolean;
}

export interface StoryPlayerRulePayload {
  readonly ruleKey: string;
  readonly condition: StoryCondition;
  readonly effects: readonly StoryEffect[];
}

export interface StoryPublicNewsPayload {
  readonly headline: string;
  readonly explanation: string;
  readonly category: StockMarketNewsCategory;
  readonly scope: StockMarketNewsScope;
  readonly targetKey: string | null;
  readonly sentiment: StockMarketNewsSentiment;
  readonly impactStrength: StockMarketNewsImpactStrength;
  readonly durationTicks: number;
  readonly source: StockMarketNewsSource;
  readonly metadata: JsonObject;
}

export interface StoryContractUnlockPayload {
  readonly contractKey: string;
  readonly label: string | null;
  readonly reason: string | null;
  readonly payload: JsonObject;
}

export interface StorylineEventInsertRow {
  readonly storyline_id: string;
  readonly event_key: string;
  readonly title: string;
  readonly description: string;
  readonly act: number;
  readonly sequence: number;
  readonly trigger_type: StoryTriggerType;
  readonly scheduled_offset_seconds: number | null;
  readonly scheduled_at: string | null;
  readonly scheduled_market_tick: number | null;
  readonly trigger_condition: JsonObject;
  readonly reveal_payload: JsonObject;
  readonly public_news_payload: JsonObject;
  readonly player_rules: readonly JsonObject[];
  readonly policy_payloads: readonly JsonObject[];
  readonly flag_payloads: readonly JsonObject[];
  readonly contract_unlock_payloads: readonly JsonObject[];
  readonly priority: StoryPriority;
  readonly is_active: boolean;
}

export function parseStorylineConfig(value: unknown): StorylineConfig {
  const record = readRecord(value, "storyline");

  return {
    key: readRequiredText(record.key, "storyline.key"),
    title: readRequiredText(record.title, "storyline.title"),
    description: readOptionalTextWithDefault(
      record.description,
      "storyline.description",
      "",
    ),
    isActive: readBooleanWithDefault(record.isActive, "storyline.isActive", true),
  };
}

export function parseStorylineEventConfig(
  value: unknown,
): StorylineEventConfig {
  const record = readRecord(value, "storylineEvent");
  const triggerType = readEnum(
    record.triggerType,
    "storylineEvent.triggerType",
    STORY_TRIGGER_TYPES,
  );
  const triggerCondition = parseTriggerCondition(
    record.triggerCondition,
    triggerType,
  );
  const scheduledOffsetSeconds = readOptionalNonNegativeInteger(
    record.scheduledOffsetSeconds,
    "storylineEvent.scheduledOffsetSeconds",
  );
  const scheduledAt = readOptionalIsoDateTimeText(
    record.scheduledAt,
    "storylineEvent.scheduledAt",
  );
  const scheduledMarketTick = readOptionalNonNegativeInteger(
    record.scheduledMarketTick,
    "storylineEvent.scheduledMarketTick",
  );

  validateTriggerSchedule({
    triggerType,
    scheduledOffsetSeconds,
    scheduledAt,
    scheduledMarketTick,
    triggerCondition,
  });

  return {
    eventKey: readRequiredText(record.eventKey, "storylineEvent.eventKey"),
    title: readRequiredText(record.title, "storylineEvent.title"),
    description: readOptionalTextWithDefault(
      record.description,
      "storylineEvent.description",
      "",
    ),
    act: readOptionalPositiveIntegerWithDefault(
      record.act,
      "storylineEvent.act",
      1,
    ),
    sequence: readOptionalPositiveIntegerWithDefault(
      record.sequence,
      "storylineEvent.sequence",
      1,
    ),
    triggerType,
    scheduledOffsetSeconds,
    scheduledAt,
    scheduledMarketTick,
    triggerCondition,
    reveal: parseStoryRevealPayload(record.reveal ?? record.revealPayload),
    publicNews: parseStoryPublicNewsPayload(
      record.publicNews ?? record.publicNewsPayload,
    ),
    playerRules: readOptionalArray(
      record.playerRules ?? record.playerRulePayloads,
      "storylineEvent.playerRules",
    ).map(parseStoryPlayerRulePayload),
    policies: readOptionalArray(
      record.policies ?? record.policyPayloads,
      "storylineEvent.policies",
    ).map(parseStoryPolicyPayload),
    flags: readOptionalArray(
      record.flags ?? record.flagPayloads,
      "storylineEvent.flags",
    ).map(parseStoryFlagPayload),
    contractUnlocks: readOptionalArray(
      record.contractUnlocks ?? record.contractUnlockPayloads,
      "storylineEvent.contractUnlocks",
    ).map(parseStoryContractUnlockPayload),
    priority: readOptionalEnum(
      record.priority,
      "storylineEvent.priority",
      STORY_PRIORITIES,
      "normal",
    ),
    isActive: readBooleanWithDefault(
      record.isActive,
      "storylineEvent.isActive",
      true,
    ),
  };
}

export function parseStoryPublicNewsPayload(
  value: unknown,
): StoryPublicNewsPayload | null {
  if (value === undefined || value === null || isEmptyRecord(value)) {
    return null;
  }

  const record = readRecord(value, "publicNews");
  const scope = readEnum(
    record.scope,
    "publicNews.scope",
    STOCK_MARKET_NEWS_SCOPES,
  );

  return {
    headline: readRequiredText(record.headline, "publicNews.headline"),
    explanation: readRequiredText(record.explanation, "publicNews.explanation"),
    category: readEnum(
      record.category,
      "publicNews.category",
      STOCK_MARKET_NEWS_CATEGORIES,
    ),
    scope,
    targetKey: readPublicNewsTargetKey(record.targetKey, scope),
    sentiment: readEnum(
      record.sentiment,
      "publicNews.sentiment",
      STOCK_MARKET_NEWS_SENTIMENTS,
    ),
    impactStrength: readEnum(
      record.impactStrength,
      "publicNews.impactStrength",
      STOCK_MARKET_NEWS_IMPACT_STRENGTHS,
    ),
    durationTicks: readDurationTicks(record.durationTicks),
    source: readOptionalEnum(
      record.source,
      "publicNews.source",
      STOCK_MARKET_NEWS_SOURCES,
      "system",
    ),
    metadata: readJsonObjectWithDefault(
      record.metadata,
      "publicNews.metadata",
    ),
  };
}

export function buildStorylineEventInsertRow(
  storylineId: string,
  input: StorylineEventConfig,
): StorylineEventInsertRow {
  const storyline_id = readRequiredText(storylineId, "storylineId");

  return {
    storyline_id,
    event_key: input.eventKey,
    title: input.title,
    description: input.description,
    act: input.act,
    sequence: input.sequence,
    trigger_type: input.triggerType,
    scheduled_offset_seconds: input.scheduledOffsetSeconds,
    scheduled_at: input.scheduledAt,
    scheduled_market_tick: input.scheduledMarketTick,
    trigger_condition: (input.triggerCondition ?? {}) as JsonObject,
    reveal_payload: (input.reveal ?? {}) as JsonObject,
    public_news_payload: (input.publicNews ?? {}) as JsonObject,
    player_rules: input.playerRules as unknown as readonly JsonObject[],
    policy_payloads: input.policies as unknown as readonly JsonObject[],
    flag_payloads: input.flags as unknown as readonly JsonObject[],
    contract_unlock_payloads: input.contractUnlocks as unknown as readonly JsonObject[],
    priority: input.priority,
    is_active: input.isActive,
  };
}

function parseStoryPlayerRulePayload(value: unknown): StoryPlayerRulePayload {
  const record = readRecord(value, "playerRule");
  const effects = readArray(record.effects, "playerRule.effects").map(
    parseStoryEffect,
  );

  if (effects.length === 0) {
    throw invalidStorylineContract("playerRule.effects must not be empty.");
  }

  return {
    ruleKey: readRequiredText(record.ruleKey, "playerRule.ruleKey"),
    condition: parseStoryCondition(record.condition),
    effects,
  };
}

function parseStoryContractUnlockPayload(
  value: unknown,
): StoryContractUnlockPayload {
  const record = readRecord(value, "contractUnlock");

  return {
    contractKey: readRequiredText(
      record.contractKey,
      "contractUnlock.contractKey",
    ),
    label: record.label === undefined
      ? null
      : readRequiredText(record.label, "contractUnlock.label"),
    reason: record.reason === undefined
      ? null
      : readRequiredText(record.reason, "contractUnlock.reason"),
    payload: readJsonObjectWithDefault(record.payload, "contractUnlock.payload"),
  };
}

function parseTriggerCondition(
  value: unknown,
  triggerType: StoryTriggerType,
): StoryCondition | null {
  if (value === undefined || value === null || isEmptyRecord(value)) {
    if (triggerType === "condition") {
      throw invalidStorylineContract(
        "storylineEvent.triggerCondition is required for condition triggers.",
      );
    }

    return null;
  }

  return parseStoryCondition(value);
}

function validateTriggerSchedule(input: {
  readonly triggerType: StoryTriggerType;
  readonly scheduledOffsetSeconds: number | null;
  readonly scheduledAt: string | null;
  readonly scheduledMarketTick: number | null;
  readonly triggerCondition: StoryCondition | null;
}): void {
  if (
    input.triggerType === "elapsed_time" &&
    input.scheduledOffsetSeconds === null
  ) {
    throw invalidStorylineContract(
      "scheduledOffsetSeconds is required for elapsed_time triggers.",
    );
  }

  if (input.triggerType === "wall_clock_time" && input.scheduledAt === null) {
    throw invalidStorylineContract(
      "scheduledAt is required for wall_clock_time triggers.",
    );
  }

  if (
    input.triggerType === "market_tick" &&
    input.scheduledMarketTick === null
  ) {
    throw invalidStorylineContract(
      "scheduledMarketTick is required for market_tick triggers.",
    );
  }

  if (input.triggerType === "condition" && input.triggerCondition === null) {
    throw invalidStorylineContract(
      "triggerCondition is required for condition triggers.",
    );
  }
}

function readPublicNewsTargetKey(
  value: unknown,
  scope: StockMarketNewsScope,
): string | null {
  const text = typeof value === "string" ? value.trim() : "";

  if (scope === "global") {
    if (text) {
      throw invalidStorylineContract(
        "publicNews.targetKey must be omitted for global news.",
      );
    }

    return null;
  }

  if (!text) {
    throw invalidStorylineContract(
      "publicNews.targetKey is required for country, sector, and ticker news.",
    );
  }

  return scope === "ticker" ? text.toUpperCase() : text;
}

function readDurationTicks(value: unknown): number {
  if (value === undefined || value === null) {
    return 5;
  }

  const durationTicks = readNonNegativeInteger(
    value,
    "publicNews.durationTicks",
  );

  if (durationTicks < 1 || durationTicks > 12) {
    throw invalidStorylineContract(
      "publicNews.durationTicks must be between 1 and 12.",
    );
  }

  return durationTicks;
}

function readOptionalPositiveIntegerWithDefault(
  value: unknown,
  fieldName: string,
  fallback: number,
): number {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    throw invalidStorylineContract(`${fieldName} must be a positive integer.`);
  }

  return value;
}
