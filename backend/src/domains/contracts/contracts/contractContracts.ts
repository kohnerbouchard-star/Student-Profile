import type { JsonObject, JsonValue } from "../../../supabase/tableTypes.ts";
import { invalidContractContract } from "./contractContractErrors.ts";

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

export function parseContractTemplateConfig(
  value: unknown,
): ContractTemplateConfig {
  const record = readRecord(value, "contractTemplate");

  return {
    templateKey: readRequiredText(
      record.templateKey,
      "contractTemplate.templateKey",
    ),
    title: readRequiredText(record.title, "contractTemplate.title"),
    description: readRequiredText(
      record.description,
      "contractTemplate.description",
    ),
    instructions: readRequiredText(
      record.instructions,
      "contractTemplate.instructions",
    ),
    category: readRequiredText(record.category, "contractTemplate.category"),
    difficulty: readRequiredText(
      record.difficulty,
      "contractTemplate.difficulty",
    ),
    estimatedDurationMinutes: readOptionalNonNegativeInteger(
      record.estimatedDurationMinutes,
      "contractTemplate.estimatedDurationMinutes",
    ),
    requirementsPayload: parseContractRequirementsPayload(
      record.requirementsPayload,
      "contractTemplate.requirementsPayload",
    ),
    rewardPayload: parseContractRewardPayload(
      record.rewardPayload,
      "contractTemplate.rewardPayload",
    ),
    metadata: readJsonObjectWithDefault(
      record.metadata,
      "contractTemplate.metadata",
    ),
    isActive: readBooleanWithDefault(
      record.isActive,
      "contractTemplate.isActive",
      true,
    ),
  };
}

export function parseGameSessionContractConfig(
  value: unknown,
): GameSessionContractConfig {
  const record = readRecord(value, "contract");

  return {
    gameSessionId: readRequiredText(
      record.gameSessionId,
      "contract.gameSessionId",
    ),
    contractTemplateId: readOptionalText(
      record.contractTemplateId,
      "contract.contractTemplateId",
    ),
    contractKey: readRequiredText(record.contractKey, "contract.contractKey"),
    sourceType: readEnum(
      record.sourceType,
      "contract.sourceType",
      CONTRACT_SOURCE_TYPES,
    ),
    sourceId: readOptionalText(record.sourceId, "contract.sourceId"),
    createdByStaffId: readOptionalText(
      record.createdByStaffId,
      "contract.createdByStaffId",
    ),
    title: readRequiredText(record.title, "contract.title"),
    description: readRequiredText(record.description, "contract.description"),
    instructions: readRequiredText(
      record.instructions,
      "contract.instructions",
    ),
    category: readOptionalTextWithDefault(
      record.category,
      "contract.category",
      "general",
    ),
    status: readOptionalEnum(
      record.status,
      "contract.status",
      CONTRACT_STATUSES,
      "draft",
    ),
    visibility: readOptionalEnum(
      record.visibility,
      "contract.visibility",
      CONTRACT_VISIBILITIES,
      "public",
    ),
    targetingPayload: parseContractTargetingPayload(
      record.targetingPayload,
      "contract.targetingPayload",
    ),
    requirementsPayload: parseContractRequirementsPayload(
      record.requirementsPayload,
      "contract.requirementsPayload",
    ),
    rewardPayload: parseContractRewardPayload(
      record.rewardPayload,
      "contract.rewardPayload",
    ),
    completionMode: readOptionalEnum(
      record.completionMode,
      "contract.completionMode",
      CONTRACT_COMPLETION_MODES,
      "manual_review",
    ),
    publishedAt: readOptionalIsoDateTimeText(
      record.publishedAt,
      "contract.publishedAt",
    ),
    deadlineAt: readOptionalIsoDateTimeText(
      record.deadlineAt,
      "contract.deadlineAt",
    ),
    expiresAt: readOptionalIsoDateTimeText(
      record.expiresAt,
      "contract.expiresAt",
    ),
    metadata: readJsonObjectWithDefault(record.metadata, "contract.metadata"),
  };
}

export function parsePlayerContractProgressConfig(
  value: unknown,
): PlayerContractProgressConfig {
  const record = readRecord(value, "playerContractProgress");

  return {
    gameSessionId: readRequiredText(
      record.gameSessionId,
      "playerContractProgress.gameSessionId",
    ),
    contractId: readRequiredText(
      record.contractId,
      "playerContractProgress.contractId",
    ),
    playerId: readRequiredText(
      record.playerId,
      "playerContractProgress.playerId",
    ),
    status: readOptionalEnum(
      record.status,
      "playerContractProgress.status",
      PLAYER_CONTRACT_STATUSES,
      "available",
    ),
    evidencePayload: readJsonObjectWithDefault(
      record.evidencePayload,
      "playerContractProgress.evidencePayload",
    ),
    resultPayload: readJsonObjectWithDefault(
      record.resultPayload,
      "playerContractProgress.resultPayload",
    ),
    submittedAt: readOptionalIsoDateTimeText(
      record.submittedAt,
      "playerContractProgress.submittedAt",
    ),
    completedAt: readOptionalIsoDateTimeText(
      record.completedAt,
      "playerContractProgress.completedAt",
    ),
    rewardIssuedAt: readOptionalIsoDateTimeText(
      record.rewardIssuedAt,
      "playerContractProgress.rewardIssuedAt",
    ),
  };
}

export function parseContractTargetingPayload(
  value: unknown,
  fieldName = "targetingPayload",
): ContractTargetingPayload {
  return readJsonObjectWithDefault(
    value,
    fieldName,
  ) as ContractTargetingPayload;
}

export function parseContractRequirementsPayload(
  value: unknown,
  fieldName = "requirementsPayload",
): ContractRequirementsPayload {
  return readJsonObjectWithDefault(
    value,
    fieldName,
  ) as ContractRequirementsPayload;
}

export function parseContractRewardPayload(
  value: unknown,
  fieldName = "rewardPayload",
): ContractRewardPayload {
  return readJsonObjectWithDefault(value, fieldName) as ContractRewardPayload;
}

export function buildContractTemplateInsertRow(
  input: ContractTemplateConfig,
): ContractTemplateInsertRow {
  return {
    template_key: input.templateKey,
    title: input.title,
    description: input.description,
    instructions: input.instructions,
    category: input.category,
    difficulty: input.difficulty,
    estimated_duration_minutes: input.estimatedDurationMinutes,
    requirements_payload: input.requirementsPayload,
    reward_payload: input.rewardPayload,
    metadata: input.metadata,
    is_active: input.isActive,
  };
}

export function buildGameSessionContractInsertRow(
  input: GameSessionContractConfig,
): GameSessionContractInsertRow {
  return {
    game_session_id: input.gameSessionId,
    contract_template_id: input.contractTemplateId,
    contract_key: input.contractKey,
    source_type: input.sourceType,
    source_id: input.sourceId,
    created_by_staff_id: input.createdByStaffId,
    title: input.title,
    description: input.description,
    instructions: input.instructions,
    category: input.category,
    status: input.status,
    visibility: input.visibility,
    targeting_payload: input.targetingPayload,
    requirements_payload: input.requirementsPayload,
    reward_payload: input.rewardPayload,
    completion_mode: input.completionMode,
    published_at: input.publishedAt,
    deadline_at: input.deadlineAt,
    expires_at: input.expiresAt,
    metadata: input.metadata,
  };
}

export function buildPlayerContractProgressInsertRow(
  input: PlayerContractProgressConfig,
): PlayerContractProgressInsertRow {
  return {
    game_session_id: input.gameSessionId,
    contract_id: input.contractId,
    player_id: input.playerId,
    status: input.status,
    evidence_payload: input.evidencePayload,
    result_payload: input.resultPayload,
    submitted_at: input.submittedAt,
    completed_at: input.completedAt,
    reward_issued_at: input.rewardIssuedAt,
  };
}

function readRecord(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw invalidContractContract(`${fieldName} must be a JSON object.`);
  }

  return value;
}

function readRequiredText(value: unknown, fieldName: string): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw invalidContractContract(`${fieldName} is required.`);
  }

  return text;
}

function readOptionalText(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw invalidContractContract(`${fieldName} must be non-empty text.`);
  }

  return text;
}

function readOptionalTextWithDefault(
  value: unknown,
  fieldName: string,
  fallback: string,
): string {
  return readOptionalText(value, fieldName) ?? fallback;
}

function readEnum<TAllowed extends readonly string[]>(
  value: unknown,
  fieldName: string,
  allowed: TAllowed,
): TAllowed[number] {
  const text = typeof value === "string" ? value.trim() : "";

  if (!allowed.includes(text)) {
    throw invalidContractContract(`${fieldName} is invalid.`);
  }

  return text as TAllowed[number];
}

function readOptionalEnum<TAllowed extends readonly string[]>(
  value: unknown,
  fieldName: string,
  allowed: TAllowed,
  fallback: TAllowed[number],
): TAllowed[number] {
  if (value === undefined || value === null) {
    return fallback;
  }

  return readEnum(value, fieldName, allowed);
}

function readBooleanWithDefault(
  value: unknown,
  fieldName: string,
  fallback: boolean,
): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw invalidContractContract(`${fieldName} must be a boolean.`);
  }

  return value;
}

function readOptionalNonNegativeInteger(
  value: unknown,
  fieldName: string,
): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isInteger(value) || typeof value !== "number" || value < 0) {
    throw invalidContractContract(
      `${fieldName} must be a non-negative integer.`,
    );
  }

  return value;
}

function readJsonObjectWithDefault(
  value: unknown,
  fieldName: string,
): JsonObject {
  if (value === undefined || value === null) {
    return {};
  }

  if (!isRecord(value) || !isJsonValue(value)) {
    throw invalidContractContract(`${fieldName} must be a JSON object.`);
  }

  return value as JsonObject;
}

function readIsoDateTimeText(value: unknown, fieldName: string): string {
  const text = readRequiredText(value, fieldName);

  if (Number.isNaN(Date.parse(text))) {
    throw invalidContractContract(`${fieldName} must be an ISO date string.`);
  }

  return text;
}

function readOptionalIsoDateTimeText(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return readIsoDateTimeText(value, fieldName);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value !== "number" || Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}
