import type { CreateGameSessionContractInput } from "../../contracts/contracts/contractRepositoryContracts.ts";
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
  | "contract_unlock"
  | "character_message"
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
  readonly effectIdentity?: string;
  readonly now: string;
  readonly effectiveMarketTick?: number;
  readonly playerContext?: PlayerStoryContext | null;
  readonly policyScope?: StoryPolicyEffectScope | null;
  readonly dependencies: StoryEffectExecutionDependencies;
}

export interface StoryEffectBatchExecutionInput {
  readonly gameSessionId: string;
  readonly storylineEventId: string;
  readonly effects: readonly StoryEffect[];
  readonly now: string;
  readonly effectiveMarketTick?: number;
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
  readonly contracts?: StoryEffectContractWriter;
  readonly marketNews?: StoryEffectMarketNewsWriter;
  readonly world?: StoryEffectWorldWriter;
  readonly currency?: StoryEffectCurrencyWriter;
}

export interface StoryEffectLedgerWriter {
  recordCashAdjustment(input: StoryCashAdjustmentWriteInput): Promise<StoryWriteResult>;
}

export interface StoryEffectPolicyWriter {
  upsertPolicy(input: StoryPolicyWriteInput): Promise<StoryWriteResult>;
}

export interface StoryEffectFlagWriter {
  setStoryFlag(input: StoryFlagWriteInput): Promise<StoryWriteResult>;
}

export interface StoryEffectImpactWriter {
  createPlayerImpact(input: StoryPlayerImpactWriteInput): Promise<StoryWriteResult>;
}

export type StoryContractCreateWriteInput = CreateGameSessionContractInput;

export interface StoryEffectContractWriter {
  createGameSessionContract(input: StoryContractCreateWriteInput): Promise<StoryWriteResult>;
}

export interface StoryEffectMarketNewsWriter {
  createMarketNews(input: StoryMarketNewsWriteInput): Promise<StoryWriteResult>;
}

export interface StoryEffectWorldWriter {
  applyRouteState(input: StoryWorldRouteStateWriteInput): Promise<StoryWriteResult>;
  applyLocationState(input: StoryWorldLocationStateWriteInput): Promise<StoryWriteResult>;
}

export interface StoryEffectCurrencyWriter {
  applyCurrencyVolatility(
    input: StoryCurrencyVolatilityWriteInput,
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

export interface StoryMarketNewsWriteInput {
  readonly gameSessionId: string;
  readonly storylineEventId: string;
  readonly shockKey: string;
  readonly payload: JsonObject;
  readonly idempotencyKey: string;
  readonly createdTick?: number;
}

export interface StoryWorldRouteStateWriteInput {
  readonly gameSessionId: string;
  readonly storylineEventId: string;
  readonly routeIds: readonly string[];
  readonly status: "open" | "restricted" | "closed";
  readonly reason: "normal" | "shortage" | "meridian_disruption" | "war" | "recovery";
  readonly costMultiplierBasisPoints: number;
  readonly durationMultiplierBasisPoints: number;
  readonly appliedAt: string;
  readonly idempotencyKey: string;
}

export interface StoryWorldLocationStateWriteInput {
  readonly gameSessionId: string;
  readonly storylineEventId: string;
  readonly locationIds: readonly string[];
  readonly availability: "normal" | "shortage" | "conflict" | "closed";
  readonly appliedAt: string;
  readonly idempotencyKey: string;
}

export interface StoryCurrencyVolatilityWriteInput {
  readonly gameSessionId: string;
  readonly storylineEventId: string;
  readonly adjustmentsBasisPoints: JsonObject;
  readonly appliedAt: string;
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

export interface StoryEffectAppliedResult extends StoryEffectExecutionResultBase {
  readonly status: "applied";
  readonly appliedWriteIds: readonly string[];
}

export interface StoryEffectSkippedResult extends StoryEffectExecutionResultBase {
  readonly status: "skipped";
  readonly reason: StoryEffectSkipReason;
}

export interface StoryEffectFailedResult extends StoryEffectExecutionResultBase {
  readonly status: "failed";
  readonly errorMessage: string;
}

export interface StoryEffectBatchExecutionResult {
  readonly results: readonly StoryEffectExecutionResult[];
  readonly appliedCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
}
