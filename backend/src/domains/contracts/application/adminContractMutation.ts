import {
  AdminMutationError,
  type AdminMutationIdentity,
  type AdminMutationRpcClient,
  executeAdminMutationRpc,
} from "../../../platform/supabase/adminMutation.ts";
import {
  type ContractCompletionMode,
  type ContractStatus,
  type ContractTargetingPayload,
  type ContractVisibility,
  parseGameSessionContractConfig,
} from "../contracts/contractContracts.ts";
import {
  type StaffContractDto,
  toStaffContractDto,
} from "../contracts/contractHttpContracts.ts";
import type { CreateGameSessionContractInput } from "../contracts/contractRepositoryContracts.ts";
import {
  type GameSessionContractRow,
  toGameSessionContractRecord,
} from "../infrastructure/supabaseContractRepository.ts";

const CREATE_CONTRACT_STATUSES = ["draft", "scheduled", "active"] as const;

export type AdminContractMutationOperation =
  | "create"
  | "publish"
  | "archive"
  | "duplicate";

export interface AdminContractMutationInput {
  readonly gameSessionId: string;
  readonly staffUserId: string;
  readonly operation: AdminContractMutationOperation;
  readonly contractId?: string | null;
  readonly body: Record<string, unknown>;
  readonly identity: AdminMutationIdentity;
}

export interface AdminContractMutationResult {
  readonly status: number;
  readonly contract: StaffContractDto;
  readonly replayed: boolean;
  readonly alreadyArchived?: boolean;
  readonly sourceContractId?: string;
}

export interface AdminContractMutationDependencies {
  readonly now?: () => string;
}

export async function mutateAdminContract(
  client: AdminMutationRpcClient,
  input: AdminContractMutationInput,
  dependencies: AdminContractMutationDependencies = {},
): Promise<AdminContractMutationResult> {
  const normalized = normalizeMutation(input, dependencies);
  const mutation = await executeAdminMutationRpc(
    client,
    "admin_mutate_contract_v1",
    {
      p_game_session_id: input.gameSessionId,
      p_staff_user_id: input.staffUserId,
      p_operation: input.operation,
      p_contract_id: normalized.contractId,
      p_contract_payload: normalized.contractPayload,
      p_request_payload: {
        operation: input.operation,
        contractId: normalized.contractId,
        contract: normalized.requestPayload,
      },
      p_idempotency_key: input.identity.idempotencyKey,
      p_request_id: input.identity.requestId,
    },
    {
      code: "contract_mutation_failed",
      message: "Contract could not be saved.",
    },
  );

  const contract = readContractRecord(mutation.body.contract);
  const metadata = readOperationMetadata(input.operation, mutation.body);
  return {
    status: mutation.status,
    contract: toStaffContractDto(contract),
    replayed: mutation.replayed,
    ...metadata,
  };
}

export function normalizeAdminContractCreateInput(
  gameSessionId: string,
  staffUserId: string,
  body: Record<string, unknown>,
): CreateGameSessionContractInput {
  if (hasOwn(body, "createdByStaffId")) {
    throw new AdminMutationError(
      "created_by_staff_id_not_allowed",
      "createdByStaffId is derived from the staff session.",
      400,
    );
  }

  if (body.sourceType !== undefined && body.sourceType !== "teacher") {
    throw new AdminMutationError(
      "source_type_not_allowed",
      "Teacher contract routes can only create teacher contracts.",
      400,
    );
  }

  const parsed = parseGameSessionContractConfig({
    gameSessionId,
    contractTemplateId: null,
    contractKey: body.contractKey as string,
    sourceType: "teacher",
    sourceId: null,
    createdByStaffId: staffUserId,
    title: body.title as string,
    description: body.description as string,
    instructions: body.instructions as string,
    category: body.category as string | null | undefined,
    status: readOptionalCreateStatus(body.status),
    visibility: body.visibility as ContractVisibility | null | undefined,
    targetingPayload: body.targetingPayload as
      | CreateGameSessionContractInput["targetingPayload"]
      | undefined,
    requirementsPayload: body.requirementsPayload as
      | CreateGameSessionContractInput["requirementsPayload"]
      | undefined,
    rewardPayload: body.rewardPayload as
      | CreateGameSessionContractInput["rewardPayload"]
      | undefined,
    completionMode: body.completionMode as
      | ContractCompletionMode
      | null
      | undefined,
    publishedAt: body.publishedAt as string | null | undefined,
    deadlineAt: body.deadlineAt as string | null | undefined,
    expiresAt: body.expiresAt as string | null | undefined,
    metadata: body.metadata as CreateGameSessionContractInput["metadata"],
  });

  validateAdminContractTargeting(parsed.visibility, parsed.targetingPayload);
  return parsed;
}

function validateAdminContractTargeting(
  visibility: ContractVisibility,
  targeting: ContractTargetingPayload,
): void {
  const allPlayers = targeting.allPlayers === true;
  const hasNarrowTarget = hasTargetValues(targeting.countryCodes) ||
    hasTargetValues(targeting.playerIds) ||
    hasTargetValues(targeting.rosterLabels) ||
    hasTargetValues(targeting.storyFlagConditions);

  if (allPlayers && hasNarrowTarget) {
    throw new AdminMutationError(
      "contract_targeting_ambiguous",
      "Choose All players or specific targets, not both.",
      400,
    );
  }
  if (visibility === "public" && !allPlayers) {
    throw new AdminMutationError(
      "contract_targeting_required",
      "Public contracts require an explicit All players target.",
      400,
    );
  }
  if (visibility === "targeted" && (allPlayers || !hasNarrowTarget)) {
    throw new AdminMutationError(
      "contract_targeting_required",
      "Targeted contracts require at least one explicit country, player, roster, or story target.",
      400,
    );
  }
}

function hasTargetValues(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    if (typeof entry === "string") return entry.trim().length > 0;
    return isRecord(entry) && Object.keys(entry).length > 0;
  });
}

function normalizeMutation(
  input: AdminContractMutationInput,
  dependencies: AdminContractMutationDependencies,
): {
  readonly contractId: string | null;
  readonly contractPayload: Record<string, unknown>;
  readonly requestPayload: Record<string, unknown>;
} {
  if (input.operation === "create") {
    const normalized = normalizeAdminContractCreateInput(
      input.gameSessionId,
      input.staffUserId,
      input.body,
    );
    const {
      gameSessionId: _gameSessionId,
      createdByStaffId: _createdByStaffId,
      ...contractPayload
    } = normalized;
    return {
      contractId: null,
      contractPayload,
      requestPayload: contractPayload,
    };
  }

  const contractId = String(input.contractId ?? "").trim();
  if (!contractId) {
    throw new AdminMutationError(
      "missing_contract_id",
      "A contract id is required.",
      400,
    );
  }

  if (input.operation === "publish") {
    const requestedPublishedAt = readOptionalIsoDateTimeText(
      input.body.publishedAt,
      "publishedAt",
    );
    const publishedAt = requestedPublishedAt ??
      (dependencies.now ?? (() => new Date().toISOString()))();

    return {
      contractId,
      contractPayload: { publishedAt },
      requestPayload: { publishedAt: requestedPublishedAt },
    };
  }

  return {
    contractId,
    contractPayload: {},
    requestPayload: {},
  };
}

function readOperationMetadata(
  operation: AdminContractMutationOperation,
  body: Record<string, unknown>,
): Pick<AdminContractMutationResult, "alreadyArchived" | "sourceContractId"> {
  if (operation === "archive") {
    if (typeof body.alreadyArchived !== "boolean") {
      throw contractMutationFailed();
    }
    return { alreadyArchived: body.alreadyArchived };
  }

  if (operation === "duplicate") {
    const sourceContractId = typeof body.sourceContractId === "string"
      ? body.sourceContractId.trim()
      : "";
    if (!sourceContractId) {
      throw contractMutationFailed();
    }
    return { sourceContractId };
  }

  return {};
}

function readContractRecord(value: unknown) {
  if (!isRecord(value)) {
    throw contractMutationFailed();
  }

  try {
    return toGameSessionContractRecord(
      value as unknown as GameSessionContractRow,
    );
  } catch {
    throw contractMutationFailed();
  }
}

function readOptionalCreateStatus(value: unknown): ContractStatus {
  if (value === undefined || value === null) {
    return "draft";
  }

  if (!isAllowedText(value, CREATE_CONTRACT_STATUSES)) {
    throw new AdminMutationError(
      "invalid_contract_status",
      "status must be draft, scheduled, or active.",
      400,
    );
  }

  return value;
}

function readOptionalIsoDateTimeText(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const text = typeof value === "string" ? value.trim() : "";
  if (!text || Number.isNaN(Date.parse(text))) {
    throw new AdminMutationError(
      "invalid_contract_request",
      `${fieldName} must be an ISO date string.`,
      400,
    );
  }

  return text;
}

function contractMutationFailed(): AdminMutationError {
  return new AdminMutationError(
    "contract_mutation_failed",
    "Contract could not be saved.",
    500,
  );
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isAllowedText<TAllowed extends readonly string[]>(
  value: unknown,
  allowed: TAllowed,
): value is TAllowed[number] {
  return typeof value === "string" && allowed.includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
