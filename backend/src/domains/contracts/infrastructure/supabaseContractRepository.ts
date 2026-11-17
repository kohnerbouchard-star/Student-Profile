import {
  ContractProgressReadProjection,
  PLAYER_CONTRACT_PROGRESS_SELECT,
  type PlayerContractProgressRow,
  toPlayerContractProgressRecord,
} from "./contractProgressReadProjection.ts";
import {
  parseContractTemplateConfig,
  parseGameSessionContractConfig,
  parsePlayerContractProgressConfig,
} from "../contracts/contractContracts.ts";
import type {
  ContractRepository,
  ContractTemplateRecord,
  CreateContractTemplateInput,
  CreateGameSessionContractInput,
  GameSessionContractRecord,
  GetContractProgressByIdInput,
  GetGameSessionContractByIdInput,
  GetPlayerContractProgressInput,
  ListContractProgressForStaffInput,
  ListGameSessionContractsInput,
  ListPlayerAvailableContractsInput,
  ListPlayerContractProgressInput,
  MarkContractRewardIssuedInput,
  PlayerContractProgressRecord,
  ReviewPlayerContractProgressInput,
  UpdateGameSessionContractStatusInput,
  UpsertPlayerContractProgressInput,
} from "../contracts/contractRepositoryContracts.ts";
import { ContractRepositoryError } from "../contracts/contractRepositoryContracts.ts";

import {
  CONTRACT_TEMPLATE_SELECT,
  type ContractTableName,
  type ContractTemplateRow,
  GAME_SESSION_CONTRACT_SELECT,
  type GameSessionContractRow,
  type SupabaseContractClient,
  type SupabaseContractQueryResponse,
} from "./contractRepositoryRows.ts";
import {
  isAvailableToPlayer,
  toContractTemplateRecord,
  toGameSessionContractRecord,
  toPlayerContractProgressUpsertRow,
} from "./contractRepositoryRowMapping.ts";

// Preserve the existing public imports for availability and external consumers.
export type { GameSessionContractRow } from "./contractRepositoryRows.ts";
export { toGameSessionContractRecord } from "./contractRepositoryRowMapping.ts";

export class SupabaseContractRepository implements ContractRepository {
  private readonly progressReads: ContractProgressReadProjection;

  constructor(private readonly client: SupabaseContractClient) {
    // Read projections share this exact client; mutations keep their original owner.
    this.progressReads = new ContractProgressReadProjection(client);
  }

  async createContractTemplate(
    input: CreateContractTemplateInput,
  ): Promise<ContractTemplateRecord> {
    const config = parseContractTemplateConfig({
      ...input,
      estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
      requirementsPayload: input.requirementsPayload ?? {},
      rewardPayload: input.rewardPayload ?? {},
      metadata: input.metadata ?? {},
      isActive: input.isActive ?? true,
    });
    const response = await this.client
      .from("contract_templates")
      .insert({
        template_key: config.templateKey,
        title: config.title,
        description: config.description,
        instructions: config.instructions,
        category: config.category,
        difficulty: config.difficulty,
        estimated_duration_minutes: config.estimatedDurationMinutes,
        requirements_payload: config.requirementsPayload,
        reward_payload: config.rewardPayload,
        metadata: config.metadata,
        is_active: config.isActive,
      })
      .select(CONTRACT_TEMPLATE_SELECT)
      .maybeSingle();

    if (response.error?.code === "23505") {
      throw repositoryError(
        "contract_template_conflict",
        "Contract template key already exists.",
        "contract_templates",
        "insert",
      );
    }

    assertNoError(response, "contract_templates", "insert");

    if (!response.data) {
      throw missingRowError("contract_templates", "insert");
    }

    return toContractTemplateRecord(response.data as ContractTemplateRow);
  }

  async getContractTemplateByKey(
    templateKey: string,
  ): Promise<ContractTemplateRecord | null> {
    const response = await this.client
      .from("contract_templates")
      .select(CONTRACT_TEMPLATE_SELECT)
      .eq("template_key", templateKey.trim())
      .maybeSingle();

    assertNoError(response, "contract_templates", "select");

    return response.data
      ? toContractTemplateRecord(response.data as ContractTemplateRow)
      : null;
  }

  async createGameSessionContract(
    input: CreateGameSessionContractInput,
  ): Promise<GameSessionContractRecord> {
    const config = parseGameSessionContractConfig({
      ...input,
      contractTemplateId: input.contractTemplateId ?? null,
      sourceId: input.sourceId ?? null,
      createdByStaffId: input.createdByStaffId ?? null,
      category: input.category ?? "general",
      status: input.status ?? "draft",
      visibility: input.visibility ?? "public",
      targetingPayload: input.targetingPayload ?? {},
      requirementsPayload: input.requirementsPayload ?? {},
      rewardPayload: input.rewardPayload ?? {},
      completionMode: input.completionMode ?? "manual_review",
      publishedAt: input.publishedAt ?? null,
      deadlineAt: input.deadlineAt ?? null,
      expiresAt: input.expiresAt ?? null,
      metadata: input.metadata ?? {},
    });
    const response = await this.client
      .from("game_session_contracts")
      .insert({
        game_session_id: config.gameSessionId,
        contract_template_id: config.contractTemplateId,
        contract_key: config.contractKey,
        source_type: config.sourceType,
        source_id: config.sourceId,
        created_by_staff_id: config.createdByStaffId,
        title: config.title,
        description: config.description,
        instructions: config.instructions,
        category: config.category,
        status: config.status,
        visibility: config.visibility,
        targeting_payload: config.targetingPayload,
        requirements_payload: config.requirementsPayload,
        reward_payload: config.rewardPayload,
        completion_mode: config.completionMode,
        published_at: config.publishedAt,
        deadline_at: config.deadlineAt,
        expires_at: config.expiresAt,
        metadata: config.metadata,
      })
      .select(GAME_SESSION_CONTRACT_SELECT)
      .maybeSingle();

    assertNoError(response, "game_session_contracts", "insert");

    if (!response.data) {
      throw missingRowError("game_session_contracts", "insert");
    }

    return toGameSessionContractRecord(
      response.data as GameSessionContractRow,
    );
  }

  async listGameSessionContracts(
    input: ListGameSessionContractsInput,
  ): Promise<readonly GameSessionContractRecord[]> {
    let query = this.client
      .from("game_session_contracts")
      .select(GAME_SESSION_CONTRACT_SELECT)
      .eq("game_session_id", input.gameSessionId);

    if (input.statuses && input.statuses.length > 0) {
      query = query.in("status", input.statuses);
    }

    if (input.sourceTypes && input.sourceTypes.length > 0) {
      query = query.in("source_type", input.sourceTypes);
    }

    if (input.visibility) {
      query = query.eq("visibility", input.visibility);
    }

    const response = await query
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    assertNoError(response, "game_session_contracts", "select");

    return (response.data ?? []).map((row) =>
      toGameSessionContractRecord(row as GameSessionContractRow)
    );
  }

  async getGameSessionContractById(
    input: GetGameSessionContractByIdInput,
  ): Promise<GameSessionContractRecord | null> {
    const response = await this.client
      .from("game_session_contracts")
      .select(GAME_SESSION_CONTRACT_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("id", input.contractId)
      .maybeSingle();

    assertNoError(response, "game_session_contracts", "select");

    return response.data
      ? toGameSessionContractRecord(response.data as GameSessionContractRow)
      : null;
  }

  async updateGameSessionContractStatus(
    input: UpdateGameSessionContractStatusInput,
  ): Promise<GameSessionContractRecord | null> {
    const parsed = parseGameSessionContractConfig({
      gameSessionId: input.gameSessionId,
      contractTemplateId: null,
      contractKey: "status-update-validation-placeholder",
      sourceType: "teacher",
      sourceId: null,
      createdByStaffId: null,
      title: "Status update validation placeholder",
      description: "Status update validation placeholder",
      instructions: "Status update validation placeholder",
      status: input.status,
      publishedAt: input.publishedAt ?? null,
    });
    const row: Record<string, unknown> = {
      status: parsed.status,
    };

    if (input.publishedAt !== undefined) {
      row.published_at = parsed.publishedAt;
    }

    const response = await this.client
      .from("game_session_contracts")
      .update(row)
      .eq("game_session_id", input.gameSessionId)
      .eq("id", input.contractId)
      .select(GAME_SESSION_CONTRACT_SELECT)
      .maybeSingle();

    assertNoError(response, "game_session_contracts", "update");

    return response.data
      ? toGameSessionContractRecord(response.data as GameSessionContractRow)
      : null;
  }

  async listPlayerAvailableContracts(
    input: ListPlayerAvailableContractsInput,
  ): Promise<readonly GameSessionContractRecord[]> {
    const response = await this.client
      .from("game_session_contracts")
      .select(GAME_SESSION_CONTRACT_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("status", "active")
      .in("visibility", ["public", "targeted"])
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    assertNoError(response, "game_session_contracts", "select");

    return (response.data ?? [])
      .map((row) => toGameSessionContractRecord(row as GameSessionContractRow))
      .filter((contract) => isAvailableToPlayer(contract, input));
  }

  async getPlayerContractProgress(
    input: GetPlayerContractProgressInput,
  ): Promise<PlayerContractProgressRecord | null> {
    return this.progressReads.getPlayerContractProgress(input);
  }

  async upsertPlayerContractProgress(
    input: UpsertPlayerContractProgressInput,
  ): Promise<PlayerContractProgressRecord> {
    const row = toPlayerContractProgressUpsertRow(input);
    const response = await this.client
      .from("player_contract_progress")
      .upsert(row, { onConflict: "game_session_id,contract_id,player_id" })
      .select(PLAYER_CONTRACT_PROGRESS_SELECT)
      .maybeSingle();

    assertNoError(response, "player_contract_progress", "upsert");

    if (!response.data) {
      throw missingRowError("player_contract_progress", "upsert");
    }

    return toPlayerContractProgressRecord(
      response.data as PlayerContractProgressRow,
    );
  }

  async listPlayerContractProgress(
    input: ListPlayerContractProgressInput,
  ): Promise<readonly PlayerContractProgressRecord[]> {
    return this.progressReads.listPlayerContractProgress(input);
  }

  async listContractProgressForStaff(
    input: ListContractProgressForStaffInput,
  ): Promise<readonly PlayerContractProgressRecord[]> {
    return this.progressReads.listContractProgressForStaff(input);
  }

  async getContractProgressById(
    input: GetContractProgressByIdInput,
  ): Promise<PlayerContractProgressRecord | null> {
    return this.progressReads.getContractProgressById(input);
  }

  async reviewPlayerContractProgress(
    input: ReviewPlayerContractProgressInput,
  ): Promise<PlayerContractProgressRecord | null> {
    const parsed = parsePlayerContractProgressConfig({
      gameSessionId: input.gameSessionId,
      contractId: input.contractId,
      playerId: "review-validation-placeholder",
      status: input.status,
      resultPayload: input.resultPayload ?? {},
      completedAt: input.completedAt ?? null,
    });
    const row: Record<string, unknown> = {
      status: parsed.status,
    };

    if (input.resultPayload !== undefined) {
      row.result_payload = parsed.resultPayload;
    }

    if (input.completedAt !== undefined) {
      row.completed_at = parsed.completedAt;
    }

    const response = await this.client
      .from("player_contract_progress")
      .update(row)
      .eq("game_session_id", input.gameSessionId)
      .eq("contract_id", input.contractId)
      .eq("id", input.progressId)
      .select(PLAYER_CONTRACT_PROGRESS_SELECT)
      .maybeSingle();

    assertNoError(response, "player_contract_progress", "update");

    return response.data
      ? toPlayerContractProgressRecord(
        response.data as PlayerContractProgressRow,
      )
      : null;
  }

  async markContractRewardIssued(
    input: MarkContractRewardIssuedInput,
  ): Promise<PlayerContractProgressRecord | null> {
    const parsed = parsePlayerContractProgressConfig({
      gameSessionId: input.gameSessionId,
      contractId: input.contractId,
      playerId: "reward-validation-placeholder",
      status: "completed",
      rewardIssuedAt: input.rewardIssuedAt,
    });
    const response = await this.client
      .from("player_contract_progress")
      .update({
        reward_issued_at: parsed.rewardIssuedAt,
      })
      .eq("game_session_id", input.gameSessionId)
      .eq("contract_id", input.contractId)
      .eq("id", input.progressId)
      .is("reward_issued_at", null)
      .select(PLAYER_CONTRACT_PROGRESS_SELECT)
      .maybeSingle();

    assertNoError(response, "player_contract_progress", "update");

    return response.data
      ? toPlayerContractProgressRecord(
        response.data as PlayerContractProgressRow,
      )
      : null;
  }
}

function assertNoError(
  response: SupabaseContractQueryResponse<unknown>,
  tableName: ContractTableName,
  operation: string,
): void {
  if (response.error) {
    throw repositoryError(
      "contract_repository_query_failed",
      response.error.message || "Contract repository query failed.",
      tableName,
      operation,
    );
  }
}

function missingRowError(
  tableName: ContractTableName,
  operation: string,
): ContractRepositoryError {
  return repositoryError(
    "contract_repository_missing_row",
    "Contract repository write returned no row.",
    tableName,
    operation,
  );
}

function repositoryError(
  code: ContractRepositoryError["code"],
  message: string,
  tableName: ContractTableName,
  operation: string,
): ContractRepositoryError {
  return new ContractRepositoryError(code, message, tableName, operation);
}
