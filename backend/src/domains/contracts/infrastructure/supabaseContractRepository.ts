import type { JsonObject } from "../../../supabase/tableTypes.ts";
import {
  type ContractSourceType,
  type ContractStatus,
  type ContractVisibility,
  parseContractTemplateConfig,
  parseGameSessionContractConfig,
  parsePlayerContractProgressConfig,
  type PlayerContractStatus,
} from "../contracts/contractContracts.ts";
import type {
  ContractRepository,
  ContractTemplateRecord,
  CreateContractTemplateInput,
  CreateGameSessionContractInput,
  GameSessionContractRecord,
  GetGameSessionContractByIdInput,
  GetPlayerContractProgressInput,
  ListGameSessionContractsInput,
  ListPlayerAvailableContractsInput,
  ListPlayerContractProgressInput,
  PlayerContractProgressRecord,
  UpdateGameSessionContractStatusInput,
  UpsertPlayerContractProgressInput,
} from "../contracts/contractRepositoryContracts.ts";
import { ContractRepositoryError } from "../contracts/contractRepositoryContracts.ts";

type ContractTableName =
  | "contract_templates"
  | "game_session_contracts"
  | "player_contract_progress";

interface SupabaseContractQueryError {
  readonly message: string;
  readonly code?: string;
  readonly details?: string | null;
  readonly hint?: string | null;
}

interface SupabaseContractQueryResponse<T = unknown> {
  readonly data: T | null;
  readonly error: SupabaseContractQueryError | null;
}

interface SupabaseContractClient {
  from(tableName: ContractTableName): SupabaseContractQueryBuilder;
}

interface SupabaseContractQueryBuilder {
  select(columns: string): SupabaseContractFilterBuilder;
  insert(row: unknown): SupabaseContractWriteBuilder;
  update(row: unknown): SupabaseContractUpdateBuilder;
  upsert(
    row: unknown,
    options?: { readonly onConflict?: string },
  ): SupabaseContractWriteBuilder;
}

interface SupabaseContractFilterBuilder
  extends PromiseLike<SupabaseContractQueryResponse<unknown[]>> {
  eq(column: string, value: unknown): SupabaseContractFilterBuilder;
  in(
    column: string,
    values: readonly unknown[],
  ): SupabaseContractFilterBuilder;
  order(
    column: string,
    options?: {
      readonly ascending?: boolean;
      readonly nullsFirst?: boolean;
    },
  ): SupabaseContractFilterBuilder;
  maybeSingle(): PromiseLike<SupabaseContractQueryResponse<unknown>>;
}

interface SupabaseContractWriteBuilder {
  select(columns: string): SupabaseContractWriteSelectBuilder;
}

interface SupabaseContractUpdateBuilder {
  eq(column: string, value: unknown): SupabaseContractUpdateBuilder;
  select(columns: string): SupabaseContractWriteSelectBuilder;
}

interface SupabaseContractWriteSelectBuilder {
  maybeSingle(): PromiseLike<SupabaseContractQueryResponse<unknown>>;
}

interface ContractTemplateRow {
  readonly id: string;
  readonly template_key: string;
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly category: string;
  readonly difficulty: string;
  readonly estimated_duration_minutes?: number | string | null;
  readonly requirements_payload: JsonObject;
  readonly reward_payload: JsonObject;
  readonly metadata: JsonObject;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

interface GameSessionContractRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly contract_template_id?: string | null;
  readonly contract_key: string;
  readonly source_type: ContractSourceType | string;
  readonly source_id?: string | null;
  readonly created_by_staff_id?: string | null;
  readonly title: string;
  readonly description: string;
  readonly instructions: string;
  readonly category: string;
  readonly status: ContractStatus | string;
  readonly visibility: ContractVisibility | string;
  readonly targeting_payload: JsonObject;
  readonly requirements_payload: JsonObject;
  readonly reward_payload: JsonObject;
  readonly completion_mode: string;
  readonly published_at?: string | null;
  readonly deadline_at?: string | null;
  readonly expires_at?: string | null;
  readonly metadata: JsonObject;
  readonly created_at: string;
  readonly updated_at: string;
}

interface PlayerContractProgressRow {
  readonly id: string;
  readonly game_session_id: string;
  readonly contract_id: string;
  readonly player_id: string;
  readonly status: PlayerContractStatus | string;
  readonly evidence_payload: JsonObject;
  readonly result_payload: JsonObject;
  readonly submitted_at?: string | null;
  readonly completed_at?: string | null;
  readonly reward_issued_at?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

const CONTRACT_TEMPLATE_SELECT = [
  "id",
  "template_key",
  "title",
  "description",
  "instructions",
  "category",
  "difficulty",
  "estimated_duration_minutes",
  "requirements_payload",
  "reward_payload",
  "metadata",
  "is_active",
  "created_at",
  "updated_at",
].join(",");

const GAME_SESSION_CONTRACT_SELECT = [
  "id",
  "game_session_id",
  "contract_template_id",
  "contract_key",
  "source_type",
  "source_id",
  "created_by_staff_id",
  "title",
  "description",
  "instructions",
  "category",
  "status",
  "visibility",
  "targeting_payload",
  "requirements_payload",
  "reward_payload",
  "completion_mode",
  "published_at",
  "deadline_at",
  "expires_at",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

const PLAYER_CONTRACT_PROGRESS_SELECT = [
  "id",
  "game_session_id",
  "contract_id",
  "player_id",
  "status",
  "evidence_payload",
  "result_payload",
  "submitted_at",
  "completed_at",
  "reward_issued_at",
  "created_at",
  "updated_at",
].join(",");

export class SupabaseContractRepository implements ContractRepository {
  constructor(private readonly client: SupabaseContractClient) {}

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
    const response = await this.client
      .from("player_contract_progress")
      .select(PLAYER_CONTRACT_PROGRESS_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("contract_id", input.contractId)
      .eq("player_id", input.playerId)
      .maybeSingle();

    assertNoError(response, "player_contract_progress", "select");

    return response.data
      ? toPlayerContractProgressRecord(
        response.data as PlayerContractProgressRow,
      )
      : null;
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
    let query = this.client
      .from("player_contract_progress")
      .select(PLAYER_CONTRACT_PROGRESS_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("player_id", input.playerId);

    if (input.statuses && input.statuses.length > 0) {
      query = query.in("status", input.statuses);
    }

    const response = await query.order("created_at", { ascending: false });

    assertNoError(response, "player_contract_progress", "select");

    return (response.data ?? []).map((row) =>
      toPlayerContractProgressRecord(row as PlayerContractProgressRow)
    );
  }
}

function toContractTemplateRecord(
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

function toGameSessionContractRecord(
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

function toPlayerContractProgressRecord(
  row: PlayerContractProgressRow,
): PlayerContractProgressRecord {
  const parsed = parsePlayerContractProgressConfig({
    gameSessionId: row.game_session_id,
    contractId: row.contract_id,
    playerId: row.player_id,
    status: row.status,
    evidencePayload: row.evidence_payload,
    resultPayload: row.result_payload,
    submittedAt: row.submitted_at ?? null,
    completedAt: row.completed_at ?? null,
    rewardIssuedAt: row.reward_issued_at ?? null,
  });

  return {
    id: row.id,
    ...parsed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPlayerContractProgressUpsertRow(
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

function isAvailableToPlayer(
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

function readNullableNumber(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
}
