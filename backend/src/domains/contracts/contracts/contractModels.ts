import type { JsonObject } from "../../../supabase/tableTypes.ts";

export const CONTRACT_SOURCE_TYPES = [
  "teacher",
  "system",
  "story_event",
] as const;

export const CONTRACT_STATUSES = [
  "draft",
  "scheduled",
  "active",
  "paused",
  "completed",
  "expired",
  "archived",
] as const;

export const CONTRACT_VISIBILITIES = [
  "public",
  "targeted",
  "hidden",
] as const;

export const CONTRACT_COMPLETION_MODES = [
  "manual_review",
  "auto_check",
  "attendance_scan",
  "purchase_check",
  "stock_trade_check",
  "story_flag_check",
] as const;

export const PLAYER_CONTRACT_STATUSES = [
  "available",
  "in_progress",
  "submitted",
  "completed",
  "failed",
  "expired",
  "dismissed",
] as const;

export type ContractSourceType = typeof CONTRACT_SOURCE_TYPES[number];

export type ContractStatus = typeof CONTRACT_STATUSES[number];

export type ContractVisibility = typeof CONTRACT_VISIBILITIES[number];

export type ContractCompletionMode = typeof CONTRACT_COMPLETION_MODES[number];

export type PlayerContractStatus = typeof PLAYER_CONTRACT_STATUSES[number];

export type ContractTargetingPayload = JsonObject & {
  readonly allPlayers?: boolean;
  readonly countryCodes?: readonly string[];
  readonly playerIds?: readonly string[];
  readonly rosterLabels?: readonly string[];
  readonly storyFlagConditions?: readonly JsonObject[];
};

export type ContractRequirementsPayload = JsonObject & {
  readonly manualText?: string;
  readonly requiredItemIds?: readonly string[];
  readonly requiredStockTrade?: JsonObject;
  readonly requiredAttendance?: JsonObject;
  readonly requiredStoryFlags?: readonly JsonObject[];
};

export type ContractRewardPayload = JsonObject & {
  readonly cash?: JsonObject;
  readonly items?: readonly JsonObject[];
  readonly scoreModifier?: JsonObject;
  readonly storyFlagsToSet?: readonly JsonObject[];
};

export interface ContractTemplateConfig {
  readonly templateKey: string;
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly category: string;
  readonly difficulty: string;
  readonly estimatedDurationMinutes: number | null;
  readonly requirementsPayload: ContractRequirementsPayload;
  readonly rewardPayload: ContractRewardPayload;
  readonly metadata: JsonObject;
  readonly isActive: boolean;
}

export interface GameSessionContractConfig {
  readonly gameSessionId: string;
  readonly contractTemplateId: string | null;
  readonly contractKey: string;
  readonly sourceType: ContractSourceType;
  readonly sourceId: string | null;
  readonly createdByStaffId: string | null;
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly category: string;
  readonly status: ContractStatus;
  readonly visibility: ContractVisibility;
  readonly targetingPayload: ContractTargetingPayload;
  readonly requirementsPayload: ContractRequirementsPayload;
  readonly rewardPayload: ContractRewardPayload;
  readonly completionMode: ContractCompletionMode;
  readonly publishedAt: string | null;
  readonly deadlineAt: string | null;
  readonly expiresAt: string | null;
  readonly metadata: JsonObject;
}

export interface PlayerContractProgressConfig {
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly playerId: string;
  readonly status: PlayerContractStatus;
  readonly evidencePayload: JsonObject;
  readonly resultPayload: JsonObject;
  readonly submittedAt: string | null;
  readonly completedAt: string | null;
  readonly rewardIssuedAt: string | null;
}

export interface ContractTemplateInsertRow {
  readonly template_key: string;
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly category: string;
  readonly difficulty: string;
  readonly estimated_duration_minutes: number | null;
  readonly requirements_payload: ContractRequirementsPayload;
  readonly reward_payload: ContractRewardPayload;
  readonly metadata: JsonObject;
  readonly is_active: boolean;
}

export interface GameSessionContractInsertRow {
  readonly game_session_id: string;
  readonly contract_template_id: string | null;
  readonly contract_key: string;
  readonly source_type: ContractSourceType;
  readonly source_id: string | null;
  readonly created_by_staff_id: string | null;
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly category: string;
  readonly status: ContractStatus;
  readonly visibility: ContractVisibility;
  readonly targeting_payload: ContractTargetingPayload;
  readonly requirements_payload: ContractRequirementsPayload;
  readonly reward_payload: ContractRewardPayload;
  readonly completion_mode: ContractCompletionMode;
  readonly published_at: string | null;
  readonly deadline_at: string | null;
  readonly expires_at: string | null;
  readonly metadata: JsonObject;
}

export interface PlayerContractProgressInsertRow {
  readonly game_session_id: string;
  readonly contract_id: string;
  readonly player_id: string;
  readonly status: PlayerContractStatus;
  readonly evidence_payload: JsonObject;
  readonly result_payload: JsonObject;
  readonly submitted_at: string | null;
  readonly completed_at: string | null;
  readonly reward_issued_at: string | null;
}
