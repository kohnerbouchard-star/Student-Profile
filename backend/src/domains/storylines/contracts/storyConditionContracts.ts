import type { JsonValue } from "../../../supabase/tableTypes.ts";
import {
  readArray,
  readEnum,
  readJsonValue,
  readPercentage,
  readRecord,
  readRequiredText,
} from "./storylineContractPrimitives.ts";
import { invalidStorylineContract } from "./storylineContractErrors.ts";

export const STORY_RELATIONSHIP_STAGES = [
  "contacted",
  "engaged",
  "trusted",
  "strained",
  "broken",
] as const;

export const STORY_RELATIONSHIP_TRUST_OPERATORS = [
  "at_least",
  "at_most",
] as const;

export const STORY_CONDITION_TYPES = [
  "player_current_country_is",
  "player_home_country_is",
  "player_current_country_in",
  "player_home_country_in",
  "player_has_resource",
  "player_resource_quantity_at_least",
  "player_portfolio_sector_exposure_at_least",
  "player_portfolio_country_exposure_at_least",
  "player_cash_below",
  "player_cash_above",
  "player_completed_contract",
  "player_relationship_stage_is",
  "player_relationship_reply_count_at_least",
  "player_relationship_trust_score",
  "player_relationship_story_decision_in",
  "story_flag_equals",
] as const;

export type StoryConditionType = typeof STORY_CONDITION_TYPES[number];
export type StoryRelationshipStage = typeof STORY_RELATIONSHIP_STAGES[number];
export type StoryRelationshipTrustOperator =
  typeof STORY_RELATIONSHIP_TRUST_OPERATORS[number];

export type StoryCondition =
  | StoryAllCondition
  | StoryAnyCondition
  | StoryNotCondition
  | StoryLeafCondition;

export interface StoryAllCondition {
  readonly all: readonly StoryCondition[];
}

export interface StoryAnyCondition {
  readonly any: readonly StoryCondition[];
}

export interface StoryNotCondition {
  readonly not: StoryCondition;
}

export type StoryLeafCondition =
  | StoryCountryIsCondition
  | StoryCountryInCondition
  | StoryResourcePresenceCondition
  | StoryResourceQuantityCondition
  | StorySectorExposureCondition
  | StoryCountryExposureCondition
  | StoryCashThresholdCondition
  | StoryCompletedContractCondition
  | StoryRelationshipStageCondition
  | StoryRelationshipReplyCountCondition
  | StoryRelationshipTrustCondition
  | StoryRelationshipStoryDecisionCondition
  | StoryFlagEqualsCondition;

export interface StoryCountryIsCondition {
  readonly type: "player_current_country_is" | "player_home_country_is";
  readonly countryCode: string;
}

export interface StoryCountryInCondition {
  readonly type: "player_current_country_in" | "player_home_country_in";
  readonly countryCodes: readonly string[];
}

export interface StoryResourcePresenceCondition {
  readonly type: "player_has_resource";
  readonly resourceKey: string;
}

export interface StoryResourceQuantityCondition {
  readonly type: "player_resource_quantity_at_least";
  readonly resourceKey: string;
  readonly quantity: number;
}

export interface StorySectorExposureCondition {
  readonly type: "player_portfolio_sector_exposure_at_least";
  readonly sector: string;
  readonly percent: number;
}

export interface StoryCountryExposureCondition {
  readonly type: "player_portfolio_country_exposure_at_least";
  readonly countryCode: string;
  readonly percent: number;
}

export interface StoryCashThresholdCondition {
  readonly type: "player_cash_below" | "player_cash_above";
  readonly amount: number;
}

export interface StoryCompletedContractCondition {
  readonly type: "player_completed_contract";
  readonly contractKey: string;
}

export interface StoryRelationshipStageCondition {
  readonly type: "player_relationship_stage_is";
  readonly characterKey: string;
  readonly stage: StoryRelationshipStage;
}

export interface StoryRelationshipReplyCountCondition {
  readonly type: "player_relationship_reply_count_at_least";
  readonly characterKey: string;
  readonly count: number;
}

export interface StoryRelationshipTrustCondition {
  readonly type: "player_relationship_trust_score";
  readonly characterKey: string;
  readonly operator: StoryRelationshipTrustOperator;
  readonly score: number;
}

export interface StoryRelationshipStoryDecisionCondition {
  readonly type: "player_relationship_story_decision_in";
  readonly characterKey: string;
  readonly decisionKey: string;
  readonly optionKeys: readonly string[];
}

export interface StoryFlagEqualsCondition {
  readonly type: "story_flag_equals";
  readonly flagKey: string;
  readonly value: JsonValue;
}

export function parseStoryCondition(value: unknown): StoryCondition {
  const record = readRecord(value, "condition");

  if (Object.prototype.hasOwnProperty.call(record, "all")) {
    return { all: readArray(record.all, "condition.all").map(parseStoryCondition) };
  }
  if (Object.prototype.hasOwnProperty.call(record, "any")) {
    return { any: readArray(record.any, "condition.any").map(parseStoryCondition) };
  }
  if (Object.prototype.hasOwnProperty.call(record, "not")) {
    return { not: parseStoryCondition(record.not) };
  }

  const type = readStoryConditionType(record.type);

  if (type === "player_current_country_is" || type === "player_home_country_is") {
    return { type, countryCode: readRequiredText(record.countryCode, "condition.countryCode") };
  }
  if (type === "player_current_country_in" || type === "player_home_country_in") {
    return { type, countryCodes: readTextArray(record.countryCodes, "condition.countryCodes") };
  }
  if (type === "player_has_resource") {
    return { type, resourceKey: readRequiredText(record.resourceKey, "condition.resourceKey") };
  }
  if (type === "player_resource_quantity_at_least") {
    return {
      type,
      resourceKey: readRequiredText(record.resourceKey, "condition.resourceKey"),
      quantity: readNonNegativeNumberField(record.quantity, "condition.quantity"),
    };
  }
  if (type === "player_portfolio_sector_exposure_at_least") {
    return {
      type,
      sector: readRequiredText(record.sector, "condition.sector"),
      percent: readPercentage(record.percent, "condition.percent"),
    };
  }
  if (type === "player_portfolio_country_exposure_at_least") {
    return {
      type,
      countryCode: readRequiredText(record.countryCode, "condition.countryCode"),
      percent: readPercentage(record.percent, "condition.percent"),
    };
  }
  if (type === "player_cash_below" || type === "player_cash_above") {
    return { type, amount: readNonNegativeNumberField(record.amount, "condition.amount") };
  }
  if (type === "player_completed_contract") {
    return { type, contractKey: readRequiredText(record.contractKey, "condition.contractKey") };
  }
  if (type === "player_relationship_stage_is") {
    return {
      type,
      characterKey: readRequiredText(record.characterKey, "condition.characterKey"),
      stage: readEnum(record.stage, "condition.stage", STORY_RELATIONSHIP_STAGES),
    };
  }
  if (type === "player_relationship_reply_count_at_least") {
    return {
      type,
      characterKey: readRequiredText(record.characterKey, "condition.characterKey"),
      count: readNonNegativeIntegerField(record.count, "condition.count"),
    };
  }
  if (type === "player_relationship_trust_score") {
    return {
      type,
      characterKey: readRequiredText(record.characterKey, "condition.characterKey"),
      operator: readEnum(record.operator, "condition.operator", STORY_RELATIONSHIP_TRUST_OPERATORS),
      score: readRelationshipTrustScore(record.score, "condition.score"),
    };
  }
  if (type === "player_relationship_story_decision_in") {
    return {
      type,
      characterKey: readRequiredText(record.characterKey, "condition.characterKey"),
      decisionKey: readRequiredText(record.decisionKey, "condition.decisionKey"),
      optionKeys: readTextArray(record.optionKeys, "condition.optionKeys"),
    };
  }
  if (type === "story_flag_equals") {
    return {
      type,
      flagKey: readRequiredText(record.flagKey, "condition.flagKey"),
      value: readJsonValue(record.value, "condition.value"),
    };
  }

  throw invalidStorylineContract("condition.type is not implemented.");
}

function readStoryConditionType(value: unknown): StoryConditionType {
  const text = typeof value === "string" ? value.trim() : "";
  if (!STORY_CONDITION_TYPES.includes(text as StoryConditionType)) {
    throw invalidStorylineContract("condition.type is invalid.");
  }
  return text as StoryConditionType;
}

function readTextArray(value: unknown, fieldName: string): readonly string[] {
  const values = readArray(value, fieldName).map((item, index) =>
    readRequiredText(item, `${fieldName}[${index}]`)
  );
  if (values.length === 0) {
    throw invalidStorylineContract(`${fieldName} must include at least one item.`);
  }
  return values;
}

function readNonNegativeNumberField(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw invalidStorylineContract(`${fieldName} must be a non-negative number.`);
  }
  return value;
}

function readNonNegativeIntegerField(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw invalidStorylineContract(`${fieldName} must be a non-negative integer.`);
  }
  return value;
}

function readRelationshipTrustScore(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < -100 || value > 100) {
    throw invalidStorylineContract(`${fieldName} must be an integer between -100 and 100.`);
  }
  return value;
}
