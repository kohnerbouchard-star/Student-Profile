import type { JsonValue } from "../../../supabase/tableTypes.ts";
import {
  readArray,
  readJsonValue,
  readPercentage,
  readRecord,
  readRequiredText,
} from "./storylineContractPrimitives.ts";
import { invalidStorylineContract } from "./storylineContractErrors.ts";

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
  "story_flag_equals",
] as const;

export type StoryConditionType = typeof STORY_CONDITION_TYPES[number];

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

export interface StoryFlagEqualsCondition {
  readonly type: "story_flag_equals";
  readonly flagKey: string;
  readonly value: JsonValue;
}

export function parseStoryCondition(value: unknown): StoryCondition {
  const record = readRecord(value, "condition");

  if (Object.prototype.hasOwnProperty.call(record, "all")) {
    return {
      all: readArray(record.all, "condition.all").map(parseStoryCondition),
    };
  }

  if (Object.prototype.hasOwnProperty.call(record, "any")) {
    return {
      any: readArray(record.any, "condition.any").map(parseStoryCondition),
    };
  }

  if (Object.prototype.hasOwnProperty.call(record, "not")) {
    return {
      not: parseStoryCondition(record.not),
    };
  }

  const type = readStoryConditionType(record.type);

  if (
    type === "player_current_country_is" ||
    type === "player_home_country_is"
  ) {
    return {
      type,
      countryCode: readRequiredText(record.countryCode, "condition.countryCode"),
    };
  }

  if (
    type === "player_current_country_in" ||
    type === "player_home_country_in"
  ) {
    return {
      type,
      countryCodes: readTextArray(
        record.countryCodes,
        "condition.countryCodes",
      ),
    };
  }

  if (type === "player_has_resource") {
    return {
      type,
      resourceKey: readRequiredText(record.resourceKey, "condition.resourceKey"),
    };
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
    return {
      type,
      amount: readNonNegativeNumberField(record.amount, "condition.amount"),
    };
  }

  return {
    type,
    flagKey: readRequiredText(record.flagKey, "condition.flagKey"),
    value: readJsonValue(record.value, "condition.value"),
  };
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
    throw invalidStorylineContract(
      `${fieldName} must be a non-negative number.`,
    );
  }

  return value;
}
