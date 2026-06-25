import type { JsonObject } from "../../../supabase/tableTypes.ts";
import type {
  ContractCompletionMode,
  ContractRequirementsPayload,
  ContractRewardPayload,
  ContractSourceType,
  ContractStatus,
  ContractTargetingPayload,
  ContractVisibility,
  PlayerContractStatus,
} from "./contractContracts.ts";

export interface ContractRepository {
  createContractTemplate(
    input: CreateContractTemplateInput,
  ): Promise<ContractTemplateRecord>;

  getContractTemplateByKey(
    templateKey: string,
  ): Promise<ContractTemplateRecord | null>;

  createGameSessionContract(
    input: CreateGameSessionContractInput,
  ): Promise<GameSessionContractRecord>;

  listGameSessionContracts(
    input: ListGameSessionContractsInput,
  ): Promise<readonly GameSessionContractRecord[]>;

  getGameSessionContractById(
    input: GetGameSessionContractByIdInput,
  ): Promise<GameSessionContractRecord | null>;

  updateGameSessionContractStatus(
    input: UpdateGameSessionContractStatusInput,
  ): Promise<GameSessionContractRecord | null>;

  listPlayerAvailableContracts(
    input: ListPlayerAvailableContractsInput,
  ): Promise<readonly GameSessionContractRecord[]>;

  getPlayerContractProgress(
    input: GetPlayerContractProgressInput,
  ): Promise<PlayerContractProgressRecord | null>;

  upsertPlayerContractProgress(
    input: UpsertPlayerContractProgressInput,
  ): Promise<PlayerContractProgressRecord>;

  listPlayerContractProgress(
    input: ListPlayerContractProgressInput,
  ): Promise<readonly PlayerContractProgressRecord[]>;

  listContractProgressForStaff(
    input: ListContractProgressForStaffInput,
  ): Promise<readonly PlayerContractProgressRecord[]>;

  getContractProgressById(
    input: GetContractProgressByIdInput,
  ): Promise<PlayerContractProgressRecord | null>;

  reviewPlayerContractProgress(
    input: ReviewPlayerContractProgressInput,
  ): Promise<PlayerContractProgressRecord | null>;

  markContractRewardIssued(
    input: MarkContractRewardIssuedInput,
  ): Promise<PlayerContractProgressRecord | null>;
}

export interface ContractTemplateRecord {
  readonly id: string;
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
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GameSessionContractRecord {
  readonly id: string;
  readonly gameSessionId: string;
  readonly contractTemplateId: string | null;
  readonly contractKey: string;
  readonly sourceType: ContractSourceType | string;
  readonly sourceId: string | null;
  readonly createdByStaffId: string | null;
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly category: string;
  readonly status: ContractStatus | string;
  readonly visibility: ContractVisibility | string;
  readonly targetingPayload: ContractTargetingPayload;
  readonly requirementsPayload: ContractRequirementsPayload;
  readonly rewardPayload: ContractRewardPayload;
  readonly completionMode: ContractCompletionMode | string;
  readonly publishedAt: string | null;
  readonly deadlineAt: string | null;
  readonly expiresAt: string | null;
  readonly metadata: JsonObject;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlayerContractProgressRecord {
  readonly id: string;
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly playerId: string;
  readonly status: PlayerContractStatus | string;
  readonly evidencePayload: JsonObject;
  readonly resultPayload: JsonObject;
  readonly submittedAt: string | null;
  readonly completedAt: string | null;
  readonly rewardIssuedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateContractTemplateInput {
  readonly templateKey: string;
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly category: string;
  readonly difficulty: string;
  readonly estimatedDurationMinutes?: number | null;
  readonly requirementsPayload?: ContractRequirementsPayload;
  readonly rewardPayload?: ContractRewardPayload;
  readonly metadata?: JsonObject;
  readonly isActive?: boolean;
}

export interface CreateGameSessionContractInput {
  readonly gameSessionId: string;
  readonly contractTemplateId?: string | null;
  readonly contractKey: string;
  readonly sourceType: ContractSourceType;
  readonly sourceId?: string | null;
  readonly createdByStaffId?: string | null;
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly category?: string | null;
  readonly status?: ContractStatus | null;
  readonly visibility?: ContractVisibility | null;
  readonly targetingPayload?: ContractTargetingPayload;
  readonly requirementsPayload?: ContractRequirementsPayload;
  readonly rewardPayload?: ContractRewardPayload;
  readonly completionMode?: ContractCompletionMode | null;
  readonly publishedAt?: string | null;
  readonly deadlineAt?: string | null;
  readonly expiresAt?: string | null;
  readonly metadata?: JsonObject;
}

export interface ListGameSessionContractsInput {
  readonly gameSessionId: string;
  readonly statuses?: readonly ContractStatus[];
  readonly sourceTypes?: readonly ContractSourceType[];
  readonly visibility?: ContractVisibility | null;
}

export interface GetGameSessionContractByIdInput {
  readonly gameSessionId: string;
  readonly contractId: string;
}

export interface UpdateGameSessionContractStatusInput {
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly status: ContractStatus;
  readonly publishedAt?: string | null;
}

export interface ListPlayerAvailableContractsInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly countryCode?: string | null;
  readonly rosterLabel?: string | null;
}

export interface GetPlayerContractProgressInput {
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly playerId: string;
}

export interface UpsertPlayerContractProgressInput {
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly playerId: string;
  readonly status?: PlayerContractStatus | null;
  readonly evidencePayload?: JsonObject;
  readonly resultPayload?: JsonObject;
  readonly submittedAt?: string | null;
  readonly completedAt?: string | null;
  readonly rewardIssuedAt?: string | null;
}

export interface ListPlayerContractProgressInput {
  readonly gameSessionId: string;
  readonly playerId: string;
  readonly statuses?: readonly PlayerContractStatus[];
}

export interface ListContractProgressForStaffInput {
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly statuses?: readonly PlayerContractStatus[];
  readonly playerId?: string | null;
}

export interface GetContractProgressByIdInput {
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly progressId: string;
}

export interface ReviewPlayerContractProgressInput {
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly progressId: string;
  readonly status: PlayerContractStatus;
  readonly resultPayload?: JsonObject;
  readonly completedAt?: string | null;
}

export interface MarkContractRewardIssuedInput {
  readonly gameSessionId: string;
  readonly contractId: string;
  readonly progressId: string;
  readonly rewardIssuedAt: string;
}

export type ContractRepositoryErrorCode =
  | "contract_template_conflict"
  | "contract_repository_query_failed"
  | "contract_repository_missing_row";

export class ContractRepositoryError extends Error {
  readonly code: ContractRepositoryErrorCode;
  readonly tableName: string;
  readonly operation: string;

  constructor(
    code: ContractRepositoryErrorCode,
    message: string,
    tableName: string,
    operation: string,
  ) {
    super(message);
    this.name = "ContractRepositoryError";
    this.code = code;
    this.tableName = tableName;
    this.operation = operation;
  }
}
