import type { JsonObject } from "../../../supabase/tableTypes.ts";
import {
  parsePlayerContractProgressConfig,
  type PlayerContractStatus,
} from "../contracts/contractContracts.ts";
import {
  ContractRepositoryError,
  type GetContractProgressByIdInput,
  type GetPlayerContractProgressInput,
  type ListContractProgressForStaffInput,
  type ListPlayerContractProgressInput,
  type PlayerContractProgressRecord,
} from "../contracts/contractRepositoryContracts.ts";

interface ProgressReadResponse<T> {
  readonly data: T | null;
  readonly error: { readonly message: string } | null;
}

// This internal port deliberately exposes no writes or per-row client factory.
interface ProgressReadClient {
  from(tableName: "player_contract_progress"): {
    select(columns: string): ProgressReadQuery;
  };
}
interface ProgressReadQuery
  extends PromiseLike<ProgressReadResponse<unknown[]>> {
  eq(column: string, value: unknown): ProgressReadQuery;
  in(column: string, values: readonly unknown[]): ProgressReadQuery;
  order(
    column: string,
    options?: { readonly ascending?: boolean; readonly nullsFirst?: boolean },
  ): ProgressReadQuery;
  maybeSingle(): PromiseLike<ProgressReadResponse<unknown>>;
}

export interface PlayerContractProgressRow {
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

export const PLAYER_CONTRACT_PROGRESS_SELECT = [
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

// One scoped query per operation. The repository also reuses the same row
// projection for write results, preserving validation and nullable timestamps.
export class ContractProgressReadProjection {
  constructor(private readonly client: ProgressReadClient) {}

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

  async listContractProgressForStaff(
    input: ListContractProgressForStaffInput,
  ): Promise<readonly PlayerContractProgressRecord[]> {
    let query = this.client
      .from("player_contract_progress")
      .select(PLAYER_CONTRACT_PROGRESS_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("contract_id", input.contractId);

    if (input.statuses && input.statuses.length > 0) {
      query = query.in("status", input.statuses);
    }

    if (input.playerId) {
      query = query.eq("player_id", input.playerId);
    }

    const response = await query
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    assertNoError(response, "player_contract_progress", "select");

    return (response.data ?? []).map((row) =>
      toPlayerContractProgressRecord(row as PlayerContractProgressRow)
    );
  }

  async getContractProgressById(
    input: GetContractProgressByIdInput,
  ): Promise<PlayerContractProgressRecord | null> {
    const response = await this.client
      .from("player_contract_progress")
      .select(PLAYER_CONTRACT_PROGRESS_SELECT)
      .eq("game_session_id", input.gameSessionId)
      .eq("contract_id", input.contractId)
      .eq("id", input.progressId)
      .maybeSingle();

    assertNoError(response, "player_contract_progress", "select");

    return response.data
      ? toPlayerContractProgressRecord(
        response.data as PlayerContractProgressRow,
      )
      : null;
  }
}

export function toPlayerContractProgressRecord(
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

function assertNoError(
  response: ProgressReadResponse<unknown>,
  tableName: "player_contract_progress",
  operation: "select",
): void {
  if (response.error) {
    throw new ContractRepositoryError(
      "contract_repository_query_failed",
      response.error.message || "Contract repository query failed.",
      tableName,
      operation,
    );
  }
}
