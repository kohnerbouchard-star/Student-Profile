import type {
  GameSessionContractRecord,
  PlayerContractProgressRecord,
} from "./contractRepositoryContracts.ts";

export interface StaffContractDto {
  readonly contractId: string;
  readonly gameSessionId: string;
  readonly contractKey: string;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly createdByStaffId: string | null;
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly category: string;
  readonly status: string;
  readonly visibility: string;
  readonly targetingPayload: Record<string, unknown>;
  readonly requirementsPayload: Record<string, unknown>;
  readonly rewardPayload: Record<string, unknown>;
  readonly completionMode: string;
  readonly publishedAt: string | null;
  readonly deadlineAt: string | null;
  readonly expiresAt: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlayerContractDto {
  readonly contractId: string;
  readonly gameSessionId: string;
  readonly contractKey: string;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly category: string;
  readonly status: string;
  readonly visibility: string;
  readonly targetingPayload: Record<string, unknown>;
  readonly requirementsPayload: Record<string, unknown>;
  readonly rewardPayload: Record<string, unknown>;
  readonly completionMode: string;
  readonly publishedAt: string | null;
  readonly deadlineAt: string | null;
  readonly expiresAt: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlayerContractProgressDto {
  readonly progressId: string;
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly playerId: string;
  readonly status: string;
  readonly evidencePayload: Record<string, unknown>;
  readonly resultPayload: Record<string, unknown>;
  readonly submittedAt: string | null;
  readonly completedAt: string | null;
  readonly rewardIssuedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StaffContractSummaryDto {
  readonly contractId: string;
  readonly gameSessionId: string;
  readonly contractKey: string;
  readonly title: string;
  readonly status: string;
  readonly sourceType: string;
  readonly visibility: string;
  readonly completionMode: string;
  readonly deadlineAt: string | null;
  readonly expiresAt: string | null;
}

export interface StaffContractListResponseBody {
  readonly ok: true;
  readonly contracts: readonly StaffContractDto[];
}

export interface StaffContractWriteResponseBody {
  readonly ok: true;
  readonly contract: StaffContractDto;
}

export interface PlayerContractListResponseBody {
  readonly ok: true;
  readonly contracts: readonly PlayerContractDto[];
  readonly progress: readonly PlayerContractProgressDto[];
}

export interface PlayerContractSubmitResponseBody {
  readonly ok: true;
  readonly contract: PlayerContractDto;
  readonly progress: PlayerContractProgressDto;
}

export interface StaffContractProgressListResponseBody {
  readonly ok: true;
  readonly contract: StaffContractSummaryDto;
  readonly progress: readonly PlayerContractProgressDto[];
}

export interface StaffContractProgressReviewResponseBody {
  readonly ok: true;
  readonly contract: StaffContractSummaryDto;
  readonly progress: PlayerContractProgressDto;
}

export interface StaffContractRewardIssueResponseBody {
  readonly ok: true;
  readonly rewardIssued: boolean;
  readonly alreadyIssued: boolean;
  readonly contract: StaffContractSummaryDto;
  readonly progress: PlayerContractProgressDto;
  readonly rewardResult: Record<string, unknown>;
}

const PLAYER_REDACTED_KEYS = new Set([
  "correctAnswer",
  "correctAnswers",
  "correctChoice",
  "correctChoices",
  "answerKey",
  "answerKeys",
  "expectedAnswer",
  "expectedAnswers",
  "acceptedAnswer",
  "acceptedAnswers",
]);

export function toStaffContractDto(
  contract: GameSessionContractRecord,
): StaffContractDto {
  return {
    contractId: contract.id,
    gameSessionId: contract.gameSessionId,
    contractKey: contract.contractKey,
    sourceType: contract.sourceType,
    sourceId: contract.sourceId,
    createdByStaffId: contract.createdByStaffId,
    title: contract.title,
    description: contract.description,
    instructions: contract.instructions,
    category: contract.category,
    status: contract.status,
    visibility: contract.visibility,
    targetingPayload: contract.targetingPayload,
    requirementsPayload: contract.requirementsPayload,
    rewardPayload: contract.rewardPayload,
    completionMode: contract.completionMode,
    publishedAt: contract.publishedAt,
    deadlineAt: contract.deadlineAt,
    expiresAt: contract.expiresAt,
    metadata: contract.metadata,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
  };
}

export function toStaffContractSummaryDto(
  contract: GameSessionContractRecord,
): StaffContractSummaryDto {
  return {
    contractId: contract.id,
    gameSessionId: contract.gameSessionId,
    contractKey: contract.contractKey,
    title: contract.title,
    status: contract.status,
    sourceType: contract.sourceType,
    visibility: contract.visibility,
    completionMode: contract.completionMode,
    deadlineAt: contract.deadlineAt,
    expiresAt: contract.expiresAt,
  };
}

export function toPlayerContractDto(
  contract: GameSessionContractRecord,
): PlayerContractDto {
  return {
    contractId: contract.id,
    gameSessionId: contract.gameSessionId,
    contractKey: contract.contractKey,
    sourceType: contract.sourceType,
    sourceId: contract.sourceId,
    title: contract.title,
    description: contract.description,
    instructions: contract.instructions,
    category: contract.category,
    status: contract.status,
    visibility: contract.visibility,
    targetingPayload: redactPlayerObject(contract.targetingPayload),
    requirementsPayload: redactPlayerObject(contract.requirementsPayload),
    rewardPayload: redactPlayerObject(contract.rewardPayload),
    completionMode: contract.completionMode,
    publishedAt: contract.publishedAt,
    deadlineAt: contract.deadlineAt,
    expiresAt: contract.expiresAt,
    metadata: redactPlayerObject(contract.metadata),
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
  };
}

export function toPlayerContractProgressDto(
  progress: PlayerContractProgressRecord,
): PlayerContractProgressDto {
  return {
    progressId: progress.id,
    gameSessionId: progress.gameSessionId,
    contractId: progress.contractId,
    playerId: progress.playerId,
    status: progress.status,
    evidencePayload: progress.evidencePayload,
    resultPayload: progress.resultPayload,
    submittedAt: progress.submittedAt,
    completedAt: progress.completedAt,
    rewardIssuedAt: progress.rewardIssuedAt,
    createdAt: progress.createdAt,
    updatedAt: progress.updatedAt,
  };
}

function redactPlayerObject(value: Record<string, unknown>): Record<string, unknown> {
  return redactPlayerValue(value) as Record<string, unknown>;
}

function redactPlayerValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactPlayerValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const result: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (PLAYER_REDACTED_KEYS.has(key)) continue;
    result[key] = redactPlayerValue(nestedValue);
  }

  return result;
}
