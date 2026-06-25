import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import type { PlayerStoryContext } from "./playerStoryContext.ts";
import type {
  StoryEffect,
  StoryEffectType,
  StoryPolicyScopeType,
  StoryPolicyType,
} from "./storyEffectContracts.ts";

export type SupportedStoryEffectExecutionType =
  | "cash_credit"
  | "cash_debit"
  | "tax_modifier"
  | "immigration_lock"
  | "story_flag_set";

export type StoryEffectExecutionStatus = "applied" | "skipped" | "failed";

export type StoryEffectSkipReason =
  | "missing_player_context"
  | "unsupported_effect_type";

export interface StoryEffectExecutionInput {
  readonly gameSessionId: string;
  readonly storylineEventId: string;
  readonly effect: StoryEffect;
  readonly effectIndex?: number;
  readonly now: string;
  readonly playerContext?: PlayerStoryContext | null;
  readonly policyScope?: StoryPolicyEffectScope | null;
  readonly dependencies: StoryEffectExecutionDependencies;
}

export interface StoryEffectBatchExecutionInput {
  readonly gameSessionId: string;
  readonly storylineEventId: string;
  readonly effects: readonly StoryEffect[];
  readonly now: string;
  readonly playerContext?: PlayerStoryContext | null;
  readonly policyScope?: StoryPolicyEffectScope | null;
  readonly dependencies: StoryEffectExecutionDependencies;
}

export interface StoryPolicyEffectScope {
  readonly scopeType: StoryPolicyScopeType;
  readonly scopeKey: string | null;
}

export interface StoryEffectExecutionDependencies {
  readonly ledger: StoryEffectLedgerWriter;
  readonly policies: StoryEffectPolicyWriter;
  readonly flags: StoryEffectFlagWriter;
  readonly impacts: StoryEffectImpactWriter;
}

export interface StoryEffectLedgerWriter {
  recordCashAdjustment(
    input: StoryCashAdjustmentWriteInput,
  ): Promise<StoryWriteResult>;
}

export interface StoryEffectPolicyWriter {
  upsertPolicy(input: StoryPolicyWriteInput): Promise<StoryWriteResult>;
}

export interface StoryEffectFlagWriter {
  setStoryFlag(input: StoryFlagWriteInput): Promise<StoryWriteResult>;
}

export interface StoryEffectImpactWriter {
  createPlayerImpact(
    input: StoryPlayerImpactWriteInput,
  ): Promise<StoryWriteResult>;
}

export interface StoryWriteResult {
  readonly id?: string;
}

export interface StoryCashAdjustmentWriteInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly storylineEventId: string;
  readonly effectType: "cash_credit" | "cash_debit";
  readonly amount: number;
  readonly signedAmount: number;
  readonly label: string;
  readonly reason: string;
  readonly payload: JsonObject;
  readonly idempotencyKey: string;
}

export interface StoryPolicyWriteInput {
  readonly gameSessionId: string;
  readonly policyKey: string;
  readonly policyType: StoryPolicyType;
  readonly scopeType: StoryPolicyScopeType;
  readonly scopeKey: string | null;
  readonly startsAt: string;
  readonly expiresAt: string | null;
  readonly durationSeconds: number | null;
  readonly payload: JsonObject;
  readonly sourceStoryEventId: string;
  readonly idempotencyKey: string;
}

export interface StoryFlagWriteInput {
  readonly gameSessionId: string;
  readonly flagKey: string;
  readonly value: JsonValue;
  readonly sourceStoryEventId: string;
  readonly idempotencyKey: string;
}

export interface StoryPlayerImpactWriteInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly storylineEventId: string;
  readonly effectType: SupportedStoryEffectExecutionType;
  readonly impactLabel: string;
  readonly impactReason: string;
  readonly amount: number | null;
  readonly payload: JsonObject;
  readonly idempotencyKey: string;
}

export type StoryEffectExecutionResult =
  | StoryEffectAppliedResult
  | StoryEffectSkippedResult
  | StoryEffectFailedResult;

export interface StoryEffectExecutionResultBase {
  readonly status: StoryEffectExecutionStatus;
  readonly effectType: StoryEffectType;
  readonly effectIndex: number;
  readonly playerId: string | null;
}

export interface StoryEffectAppliedResult
  extends StoryEffectExecutionResultBase {
  readonly status: "applied";
  readonly appliedWriteIds: readonly string[];
}

export interface StoryEffectSkippedResult
  extends StoryEffectExecutionResultBase {
  readonly status: "skipped";
  readonly reason: StoryEffectSkipReason;
}

export interface StoryEffectFailedResult
  extends StoryEffectExecutionResultBase {
  readonly status: "failed";
  readonly errorMessage: string;
}

export interface StoryEffectBatchExecutionResult {
  readonly results: readonly StoryEffectExecutionResult[];
  readonly appliedCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
}
