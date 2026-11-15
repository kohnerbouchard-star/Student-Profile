import type {
  CreateGameSessionContractInput,
  GameSessionContractRecord,
} from "../contracts/contractRepositoryContracts.ts";
import {
  CONTRACT_ID,
  GAME_SESSION_ID,
  MockContractRepository,
  STAFF_ID,
} from "./staffContractHttpHandler.test.requestFixtures.support.ts";

export class FakeServiceClient {
  constructor(
    private readonly gameSessions: readonly Record<string, unknown>[],
    private readonly repository?: MockContractRepository,
  ) {}

  from(tableName: string): FakeGameSessionQuery {
    if (tableName !== "game_sessions") {
      throw new Error(`Unexpected table ${tableName}`);
    }

    return new FakeGameSessionQuery(this.gameSessions);
  }

  async rpc<T>(
    functionName: string,
    rawArgs: unknown,
  ): Promise<{
    readonly data: T | null;
    readonly error: { readonly message: string } | null;
  }> {
    if (functionName !== "admin_mutate_contract_v1" || !this.repository) {
      throw new Error(`Unexpected RPC ${functionName}`);
    }

    const args = rawArgs as Record<string, unknown>;
    const operation = args.p_operation;
    const payload = args.p_contract_payload as Record<string, unknown>;
    let contract: GameSessionContractRecord;
    let status: number;

    if (operation === "create") {
      contract = await this.repository.createGameSessionContract({
        ...payload,
        gameSessionId: String(args.p_game_session_id),
        createdByStaffId: String(args.p_staff_user_id),
      } as unknown as CreateGameSessionContractInput);
      status = 201;
    } else if (operation === "publish") {
      const gameSessionId = String(args.p_game_session_id);
      const contractId = String(args.p_contract_id);
      const existing = await this.repository.getGameSessionContractById({
        gameSessionId,
        contractId,
      });

      if (!existing) {
        return {
          data: null,
          error: { message: "ADMIN_CONTRACT_NOT_FOUND" },
        };
      }
      if (existing.status !== "draft" && existing.status !== "scheduled") {
        return {
          data: null,
          error: { message: "ADMIN_CONTRACT_NOT_PUBLISHABLE" },
        };
      }

      const updated = await this.repository.updateGameSessionContractStatus({
        gameSessionId,
        contractId,
        status: "active",
        publishedAt: String(payload.publishedAt),
      });
      if (!updated) {
        return {
          data: null,
          error: { message: "ADMIN_CONTRACT_NOT_FOUND" },
        };
      }
      contract = updated;
      status = 200;
    } else {
      throw new Error(`Unexpected contract operation ${String(operation)}`);
    }

    return {
      data: [{
        response_status: status,
        response_body: { contract: contractRow(contract) },
        was_replayed: false,
      }] as unknown as T,
      error: null,
    };
  }
}

export class FakeGameSessionQuery {
  private readonly filters: {
    readonly column: string;
    readonly value: unknown;
  }[] = [];

  constructor(private readonly rows: readonly Record<string, unknown>[]) {}

  select(_columns: string): FakeGameSessionQuery {
    return this;
  }

  eq(column: string, value: unknown): FakeGameSessionQuery {
    this.filters.push({ column, value });
    return this;
  }

  maybeSingle(): Promise<{
    readonly data: Record<string, unknown> | null;
    readonly error: null;
  }> {
    return Promise.resolve({
      data: this.rows.find((row) =>
        this.filters.every((filter) =>
          row[filter.column] === filter.value
        )
      ) ?? null,
      error: null,
    });
  }
}

export function contractRecord(
  overrides: Partial<GameSessionContractRecord> = {},
): GameSessionContractRecord {
  return {
    id: CONTRACT_ID,
    gameSessionId: GAME_SESSION_ID,
    contractTemplateId: null,
    contractKey: "aurora-export-drive",
    sourceType: "teacher",
    sourceId: null,
    createdByStaffId: STAFF_ID,
    title: "Aurora Export Drive",
    description: "Prepare a basic export plan.",
    instructions: "Submit a memo and complete the required action.",
    category: "trade",
    status: "draft",
    visibility: "public",
    targetingPayload: {},
    requirementsPayload: {},
    rewardPayload: {},
    completionMode: "manual_review",
    publishedAt: null,
    deadlineAt: null,
    expiresAt: null,
    metadata: {},
    createdAt: "2026-06-25T12:00:00.000Z",
    updatedAt: "2026-06-25T12:00:00.000Z",
    ...overrides,
  };
}

export function contractRow(
  contract: GameSessionContractRecord,
): Record<string, unknown> {
  return {
    id: contract.id,
    game_session_id: contract.gameSessionId,
    contract_template_id: contract.contractTemplateId,
    contract_key: contract.contractKey,
    source_type: contract.sourceType,
    source_id: contract.sourceId,
    created_by_staff_id: contract.createdByStaffId,
    title: contract.title,
    description: contract.description,
    instructions: contract.instructions,
    category: contract.category,
    status: contract.status,
    visibility: contract.visibility,
    targeting_payload: contract.targetingPayload,
    requirements_payload: contract.requirementsPayload,
    reward_payload: contract.rewardPayload,
    completion_mode: contract.completionMode,
    published_at: contract.publishedAt,
    deadline_at: contract.deadlineAt,
    expires_at: contract.expiresAt,
    metadata: contract.metadata,
    created_at: contract.createdAt,
    updated_at: contract.updatedAt,
  };
}

export async function assertErrorResponse(
  response: Response,
  expectedStatus: number,
  expectedCode: string,
): Promise<void> {
  const body = await response.json();

  assertEquals(response.status, expectedStatus);
  assertEquals(body.ok, false);
  assertEquals(body.error.code, expectedCode);
}

export function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
