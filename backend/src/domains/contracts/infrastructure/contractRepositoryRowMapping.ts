import {
  parseContractTemplateConfig,
  parseGameSessionContractConfig,
  parsePlayerContractProgressConfig,
} from "../contracts/contractContracts.ts";
import type {
  ContractTemplateRecord,
  GameSessionContractRecord,
  ListPlayerAvailableContractsInput,
  UpsertPlayerContractProgressInput,
} from "../contracts/contractRepositoryContracts.ts";
import type {
  ContractTemplateRow,
  GameSessionContractRow,
} from "./contractRepositoryRows.ts";

// Pure translation only. The repository retains all queries and mutations.
export function toContractTemplateRecord(
  row: ContractTemplateRow,
): ContractTemplateRecord {
  const parsed = parseContractTemplateConfig({
    templateKey: row.template_key,
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    category: row.category,
    difficulty: row.difficulty,
    estimatedDurationMinutes: readNullableNumber(
      row.estimated_duration_minutes,
    ),
    requirementsPayload: row.requirements_payload,
    rewardPayload: row.reward_payload,
    metadata: row.metadata,
    isActive: row.is_active,
  });

  return {
    id: row.id,
    ...parsed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toGameSessionContractRecord(
  row: GameSessionContractRow,
): GameSessionContractRecord {
  const parsed = parseGameSessionContractConfig({
    gameSessionId: row.game_session_id,
    contractTemplateId: row.contract_template_id ?? null,
    contractKey: row.contract_key,
    sourceType: row.source_type,
    sourceId: row.source_id ?? null,
    createdByStaffId: row.created_by_staff_id ?? null,
    title: row.title,
    description: row.description,
    instructions: row.instructions,
    category: row.category,
    status: row.status,
    visibility: row.visibility,
    targetingPayload: row.targeting_payload,
    requirementsPayload: row.requirements_payload,
    rewardPayload: row.reward_payload,
    completionMode: row.completion_mode,
    publishedAt: row.published_at ?? null,
    deadlineAt: row.deadline_at ?? null,
    expiresAt: row.expires_at ?? null,
    metadata: row.metadata,
  });

  return {
    id: row.id,
    ...parsed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPlayerContractProgressUpsertRow(
  input: UpsertPlayerContractProgressInput,
): Record<string, unknown> {
  const parsed = parsePlayerContractProgressConfig({
    gameSessionId: input.gameSessionId,
    contractId: input.contractId,
    playerId: input.playerId,
    status: input.status ?? undefined,
    evidencePayload: input.evidencePayload ?? {},
    resultPayload: input.resultPayload ?? {},
    submittedAt: input.submittedAt ?? null,
    completedAt: input.completedAt ?? null,
    rewardIssuedAt: input.rewardIssuedAt ?? null,
  });
  const row: Record<string, unknown> = {
    game_session_id: parsed.gameSessionId,
    contract_id: parsed.contractId,
    player_id: parsed.playerId,
  };

  if (input.status !== undefined && input.status !== null) {
    row.status = parsed.status;
  }

  if (input.evidencePayload !== undefined) {
    row.evidence_payload = parsed.evidencePayload;
  }

  if (input.resultPayload !== undefined) {
    row.result_payload = parsed.resultPayload;
  }

  if (input.submittedAt !== undefined) {
    row.submitted_at = parsed.submittedAt;
  }

  if (input.completedAt !== undefined) {
    row.completed_at = parsed.completedAt;
  }

  if (input.rewardIssuedAt !== undefined) {
    row.reward_issued_at = parsed.rewardIssuedAt;
  }

  return row;
}

export function isAvailableToPlayer(
  contract: GameSessionContractRecord,
  input: ListPlayerAvailableContractsInput,
): boolean {
  if (contract.visibility === "public") {
    return true;
  }

  if (contract.visibility !== "targeted") {
    return false;
  }

  const targeting = contract.targetingPayload;

  if (stringArrayIncludes(targeting.playerIds, input.playerId)) {
    return true;
  }

  if (
    input.countryCode &&
    stringArrayIncludes(targeting.countryCodes, input.countryCode)
  ) {
    return true;
  }

  return !!input.rosterLabel &&
    stringArrayIncludes(targeting.rosterLabels, input.rosterLabel);
}

function stringArrayIncludes(value: unknown, expected: string): boolean {
  return Array.isArray(value) &&
    value.some((item) => typeof item === "string" && item === expected);
}

function readNullableNumber(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
}
