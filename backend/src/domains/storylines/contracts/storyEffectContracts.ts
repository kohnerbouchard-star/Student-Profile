import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import {
  isEmptyRecord,
  readBooleanWithDefault,
  readEnum,
  readJsonObjectWithDefault,
  readJsonValue,
  readOptionalEnum,
  readOptionalIsoDateTimeText,
  readOptionalPositiveInteger,
  readOptionalRecord,
  readOptionalText,
  readPositiveNumber,
  readRecord,
  readRequiredText,
} from "./storylineContractPrimitives.ts";

export const STORY_EFFECT_TYPES = [
  "cash_credit",
  "cash_debit",
  "tax_modifier",
  "immigration_lock",
  "contract_unlock",
  "notification_cutscene",
  "notification_impact",
  "market_news_post",
  "market_status_change",
  "story_flag_set",
] as const;

export const STORY_POLICY_TYPES = [
  "immigration_lock",
  "tax_modifier",
  "store_price_modifier",
  "contract_reward_modifier",
  "resource_restriction",
  "market_status_policy",
] as const;

export const STORY_POLICY_SCOPE_TYPES = [
  "global",
  "country",
  "sector",
  "ticker",
  "player",
  "resource",
  "contract",
  "store_item",
] as const;

export const STORY_NOTIFICATION_TYPES = [
  "story_cutscene",
  "story_impact",
  "market_news",
  "contract_unlocked",
  "policy_changed",
] as const;

export const STORY_NOTIFICATION_DISPLAY_MODES = [
  "notification_only",
  "modal_immediate",
  "modal_on_next_login",
] as const;

export type StoryEffectType = typeof STORY_EFFECT_TYPES[number];
export type StoryPolicyType = typeof STORY_POLICY_TYPES[number];
export type StoryPolicyScopeType = typeof STORY_POLICY_SCOPE_TYPES[number];
export type StoryNotificationType = typeof STORY_NOTIFICATION_TYPES[number];
export type StoryNotificationDisplayMode =
  typeof STORY_NOTIFICATION_DISPLAY_MODES[number];

export type StoryEffect =
  | StoryCashEffect
  | StoryPolicyEffect
  | StoryContractUnlockEffect
  | StoryNotificationEffect
  | StoryMarketNewsPostEffect
  | StoryMarketStatusChangeEffect
  | StoryFlagSetEffect;

export interface StoryCashEffect {
  readonly type: "cash_credit" | "cash_debit";
  readonly amount: number;
  readonly label: string;
  readonly reason: string;
  readonly payload: JsonObject;
}

export interface StoryPolicyEffect {
  readonly type: "tax_modifier" | "immigration_lock";
  readonly policyKey: string;
  readonly durationSeconds: number | null;
  readonly label: string | null;
  readonly reason: string | null;
  readonly payload: JsonObject;
}

export interface StoryContractUnlockEffect {
  readonly type: "contract_unlock";
  readonly contractKey: string;
  readonly label: string | null;
  readonly reason: string | null;
  readonly payload: JsonObject;
}

export interface StoryNotificationEffect {
  readonly type: "notification_cutscene" | "notification_impact";
  readonly title: string;
  readonly summary: string;
  readonly displayMode: StoryNotificationDisplayMode;
  readonly payload: JsonObject;
}

export interface StoryMarketNewsPostEffect {
  readonly type: "market_news_post";
  readonly payload: JsonObject;
}

export interface StoryMarketStatusChangeEffect {
  readonly type: "market_status_change";
  readonly status: string;
  readonly reason: string | null;
  readonly payload: JsonObject;
}

export interface StoryFlagSetEffect {
  readonly type: "story_flag_set";
  readonly flagKey: string;
  readonly value: JsonValue;
}

export interface StoryRevealPayload {
  readonly notificationType: "story_cutscene";
  readonly displayMode: StoryNotificationDisplayMode;
  readonly videoAssetKey: string;
  readonly posterAssetKey: string | null;
  readonly headline: string;
  readonly summary: string;
  readonly requiresAcknowledgement: boolean;
  readonly payload: JsonObject;
}

export interface StoryPolicyPayload {
  readonly policyKey: string;
  readonly policyType: StoryPolicyType;
  readonly scopeType: StoryPolicyScopeType;
  readonly scopeKey: string | null;
  readonly startsAt: string | null;
  readonly expiresAt: string | null;
  readonly durationSeconds: number | null;
  readonly payload: JsonObject;
}

export interface StoryFlagPayload {
  readonly flagKey: string;
  readonly value: JsonValue;
}

export function parseStoryEffect(value: unknown): StoryEffect {
  const record = readRecord(value, "effect");
  const type = readEnum(record.type, "effect.type", STORY_EFFECT_TYPES);

  if (type === "cash_credit" || type === "cash_debit") {
    return {
      type,
      amount: readPositiveNumber(record.amount, "effect.amount"),
      label: readRequiredText(record.label, "effect.label"),
      reason: readRequiredText(record.reason, "effect.reason"),
      payload: readJsonObjectWithDefault(record.payload, "effect.payload"),
    };
  }

  if (type === "tax_modifier" || type === "immigration_lock") {
    return {
      type,
      policyKey: readRequiredText(record.policyKey, "effect.policyKey"),
      durationSeconds: readOptionalPositiveInteger(
        record.durationSeconds,
        "effect.durationSeconds",
      ),
      label: readOptionalText(record.label, "effect.label"),
      reason: readOptionalText(record.reason, "effect.reason"),
      payload: readJsonObjectWithDefault(record.payload, "effect.payload"),
    };
  }

  if (type === "contract_unlock") {
    return {
      type,
      contractKey: readRequiredText(record.contractKey, "effect.contractKey"),
      label: readOptionalText(record.label, "effect.label"),
      reason: readOptionalText(record.reason, "effect.reason"),
      payload: readJsonObjectWithDefault(record.payload, "effect.payload"),
    };
  }

  if (type === "notification_cutscene" || type === "notification_impact") {
    return {
      type,
      title: readRequiredText(record.title, "effect.title"),
      summary: readOptionalText(record.summary, "effect.summary") ?? "",
      displayMode: readOptionalEnum(
        record.displayMode,
        "effect.displayMode",
        STORY_NOTIFICATION_DISPLAY_MODES,
        "notification_only",
      ),
      payload: readJsonObjectWithDefault(record.payload, "effect.payload"),
    };
  }

  if (type === "market_news_post") {
    return {
      type,
      payload: readJsonObjectWithDefault(record.payload, "effect.payload"),
    };
  }

  if (type === "market_status_change") {
    return {
      type,
      status: readRequiredText(record.status, "effect.status"),
      reason: readOptionalText(record.reason, "effect.reason"),
      payload: readJsonObjectWithDefault(record.payload, "effect.payload"),
    };
  }

  return {
    type,
    flagKey: readRequiredText(record.flagKey, "effect.flagKey"),
    value: readJsonValue(record.value, "effect.value"),
  };
}

export function parseStoryRevealPayload(
  value: unknown,
): StoryRevealPayload | null {
  const record = readOptionalRecord(value, "reveal");

  if (record === null || isEmptyRecord(record)) {
    return null;
  }

  return {
    notificationType: readEnum(
      record.notificationType,
      "reveal.notificationType",
      ["story_cutscene"] as const,
    ),
    displayMode: readOptionalEnum(
      record.displayMode,
      "reveal.displayMode",
      STORY_NOTIFICATION_DISPLAY_MODES,
      "modal_on_next_login",
    ),
    videoAssetKey: readRequiredText(record.videoAssetKey, "reveal.videoAssetKey"),
    posterAssetKey: readOptionalText(record.posterAssetKey, "reveal.posterAssetKey"),
    headline: readRequiredText(record.headline, "reveal.headline"),
    summary: readOptionalText(record.summary, "reveal.summary") ?? "",
    requiresAcknowledgement: readBooleanWithDefault(
      record.requiresAcknowledgement,
      "reveal.requiresAcknowledgement",
      false,
    ),
    payload: readJsonObjectWithDefault(record.payload, "reveal.payload"),
  };
}

export function parseStoryPolicyPayload(value: unknown): StoryPolicyPayload {
  const record = readRecord(value, "policy");
  const scopeType = readEnum(
    record.scopeType,
    "policy.scopeType",
    STORY_POLICY_SCOPE_TYPES,
  );
  const scopeKey = scopeType === "global"
    ? readOptionalText(record.scopeKey, "policy.scopeKey")
    : readRequiredText(record.scopeKey, "policy.scopeKey");

  return {
    policyKey: readRequiredText(record.policyKey, "policy.policyKey"),
    policyType: readEnum(
      record.policyType,
      "policy.policyType",
      STORY_POLICY_TYPES,
    ),
    scopeType,
    scopeKey,
    startsAt: readOptionalIsoDateTimeText(record.startsAt, "policy.startsAt"),
    expiresAt: readOptionalIsoDateTimeText(record.expiresAt, "policy.expiresAt"),
    durationSeconds: readOptionalPositiveInteger(
      record.durationSeconds,
      "policy.durationSeconds",
    ),
    payload: readJsonObjectWithDefault(record.payload, "policy.payload"),
  };
}

export function parseStoryFlagPayload(value: unknown): StoryFlagPayload {
  const record = readRecord(value, "flag");

  return {
    flagKey: readRequiredText(record.flagKey, "flag.flagKey"),
    value: record.value === undefined
      ? true
      : readJsonValue(record.value, "flag.value"),
  };
}
