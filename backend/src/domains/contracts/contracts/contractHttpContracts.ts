import type {
  GameSessionContractRecord,
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

export interface StaffContractListResponseBody {
  readonly ok: true;
  readonly contracts: readonly StaffContractDto[];
}

export interface StaffContractWriteResponseBody {
  readonly ok: true;
  readonly contract: StaffContractDto;
}

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
