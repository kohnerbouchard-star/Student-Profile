import { type StaffContractRoute } from "./contractRoutePaths.ts";
import type {
  ContractRepository,
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
import type {
  ContractCashRewardWriteInput,
  ContractRewardLedgerWriter,
} from "../services/contractRewardService.ts";

export const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";

export const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";

export const CONTRACT_ID = "00000000-0000-4000-8000-000000000101";

export const OTHER_CONTRACT_ID = "00000000-0000-4000-8000-000000000102";

export const PROGRESS_ID = "00000000-0000-4000-8000-000000000201";

export const OTHER_PROGRESS_ID = "00000000-0000-4000-8000-000000000202";

export const PLAYER_ID = "00000000-0000-4000-8000-000000000301";

export const OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000302";

export const STAFF_ID = "00000000-0000-4000-8000-000000000401";

export const OTHER_STAFF_ID = "00000000-0000-4000-8000-000000000402";

export const NOW = "2026-06-25T12:30:00.000Z";

export function dependencies(options: {
  readonly repository?: MockContractRepository;
  readonly ledger?: CapturingRewardLedgerWriter;
  readonly serviceClient?: FakeServiceClient;
  readonly staffAuth?: "ok" | "missing";
} = {}) {
  const repository = options.repository ?? new MockContractRepository({
    contracts: [contractRecord()],
    progress: [progressRecord()],
  });
  const ledger = options.ledger ?? new CapturingRewardLedgerWriter();
  const serviceClient = options.serviceClient ?? new FakeServiceClient([
    {
      id: GAME_SESSION_ID,
      name: "Period 1",
      status: "active",
      owner_staff_user_id: STAFF_ID,
    },
  ]);

  return {
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service-role",
      },
    }),
    resolveStaffForRequest: () => {
      if (options.staffAuth === "missing") {
        return Promise.resolve({
          ok: false as const,
          status: 401,
          error: {
            code: "missing_staff_auth_user",
            message: "A verified Supabase Auth user is required.",
            retryable: false,
          },
        });
      }

      return Promise.resolve({
        ok: true as const,
        staff: {
          id: STAFF_ID,
          email: "teacher@example.test",
        },
        serviceClient: serviceClient as never,
      });
    },
    createRepository: () => repository,
    createRewardLedgerWriter: () => ledger,
    now: () => NOW,
  };
}

export function request(
  method: string,
  options: {
    readonly path: string;
    readonly body?: unknown;
    readonly query?: string;
  },
): Request {
  const url = `https://example.test${options.path}${
    options.query ? `?${options.query}` : ""
  }`;
  const init: RequestInit = {
    method,
    headers: {
      "content-type": "application/json",
      authorization: "Bearer staff-token",
    },
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  return new Request(url, init);
}

export function progressRoute(): StaffContractRoute {
  return {
    kind: "progress",
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
  };
}

export function reviewRoute(): StaffContractRoute {
  return {
    kind: "review",
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
  };
}

export function rewardRoute(): StaffContractRoute {
  return {
    kind: "issueRewards",
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
  };
}

export class CapturingRewardLedgerWriter implements ContractRewardLedgerWriter {
  readonly inputs: ContractCashRewardWriteInput[] = [];

  constructor(private readonly mode: "ok" | "fail" = "ok") {}

  recordCashReward(
    input: ContractCashRewardWriteInput,
  ): Promise<{ readonly id: string; readonly balance: number }> {
    this.inputs.push(input);

    if (this.mode === "fail") {
      return Promise.reject(new Error("ledger unavailable"));
    }

    return Promise.resolve({
      id: "ledger-1",
      balance: 9500,
    });
  }
}

export class MockContractRepository implements ContractRepository {
  readonly listStaffProgressInputs: ListContractProgressForStaffInput[] = [];
  readonly reviewInputs: ReviewPlayerContractProgressInput[] = [];
  readonly markRewardInputs: MarkContractRewardIssuedInput[] = [];

  private readonly contracts: GameSessionContractRecord[];
  private readonly progress: PlayerContractProgressRecord[];

  constructor(options: {
    readonly contracts?: readonly GameSessionContractRecord[];
    readonly progress?: readonly PlayerContractProgressRecord[];
  } = {}) {
    this.contracts = [...(options.contracts ?? [])];
    this.progress = [...(options.progress ?? [])];
  }

  createContractTemplate(
    _input: CreateContractTemplateInput,
  ): Promise<never> {
    throw new Error("Not implemented in staff review handler tests.");
  }

  getContractTemplateByKey(): Promise<null> {
    return Promise.resolve(null);
  }

  createGameSessionContract(
    _input: CreateGameSessionContractInput,
  ): Promise<never> {
    throw new Error("Not implemented in staff review handler tests.");
  }

  listGameSessionContracts(
    _input: ListGameSessionContractsInput,
  ): Promise<readonly GameSessionContractRecord[]> {
    return Promise.resolve([]);
  }

  getGameSessionContractById(
    input: GetGameSessionContractByIdInput,
  ): Promise<GameSessionContractRecord | null> {
    return Promise.resolve(
      this.contracts.find((contract) =>
        contract.gameSessionId === input.gameSessionId &&
        contract.id === input.contractId
      ) ?? null,
    );
  }

  updateGameSessionContractStatus(
    _input: UpdateGameSessionContractStatusInput,
  ): Promise<GameSessionContractRecord | null> {
    return Promise.resolve(null);
  }

  listPlayerAvailableContracts(
    _input: ListPlayerAvailableContractsInput,
  ): Promise<readonly GameSessionContractRecord[]> {
    return Promise.resolve([]);
  }

  getPlayerContractProgress(
    _input: GetPlayerContractProgressInput,
  ): Promise<PlayerContractProgressRecord | null> {
    return Promise.resolve(null);
  }

  upsertPlayerContractProgress(
    _input: UpsertPlayerContractProgressInput,
  ): Promise<never> {
    throw new Error("Not implemented in staff review handler tests.");
  }

  listPlayerContractProgress(
    _input: ListPlayerContractProgressInput,
  ): Promise<readonly PlayerContractProgressRecord[]> {
    return Promise.resolve([]);
  }

  listContractProgressForStaff(
    input: ListContractProgressForStaffInput,
  ): Promise<readonly PlayerContractProgressRecord[]> {
    this.listStaffProgressInputs.push(input);

    return Promise.resolve(
      this.progress.filter((row) => {
        if (
          row.gameSessionId !== input.gameSessionId ||
          row.contractId !== input.contractId
        ) {
          return false;
        }

        if (
          input.statuses?.length &&
          !input.statuses.includes(row.status as never)
        ) {
          return false;
        }

        return !input.playerId || row.playerId === input.playerId;
      }),
    );
  }

  getContractProgressById(
    input: GetContractProgressByIdInput,
  ): Promise<PlayerContractProgressRecord | null> {
    return Promise.resolve(
      this.progress.find((row) =>
        row.gameSessionId === input.gameSessionId &&
        row.contractId === input.contractId &&
        row.id === input.progressId
      ) ?? null,
    );
  }

  reviewPlayerContractProgress(
    input: ReviewPlayerContractProgressInput,
  ): Promise<PlayerContractProgressRecord | null> {
    this.reviewInputs.push(input);
    const index = this.progress.findIndex((row) =>
      row.gameSessionId === input.gameSessionId &&
      row.contractId === input.contractId &&
      row.id === input.progressId
    );

    if (index < 0) {
      return Promise.resolve(null);
    }

    const updated = {
      ...this.progress[index],
      status: input.status,
      resultPayload: input.resultPayload ?? this.progress[index].resultPayload,
      completedAt: input.completedAt !== undefined
        ? input.completedAt
        : this.progress[index].completedAt,
      updatedAt: NOW,
    } as PlayerContractProgressRecord;
    this.progress[index] = updated;

    return Promise.resolve(updated);
  }

  markContractRewardIssued(
    input: MarkContractRewardIssuedInput,
  ): Promise<PlayerContractProgressRecord | null> {
    this.markRewardInputs.push(input);
    const index = this.progress.findIndex((row) =>
      row.gameSessionId === input.gameSessionId &&
      row.contractId === input.contractId &&
      row.id === input.progressId &&
      row.rewardIssuedAt === null
    );

    if (index < 0) {
      return Promise.resolve(null);
    }

    const updated = {
      ...this.progress[index],
      rewardIssuedAt: input.rewardIssuedAt,
      updatedAt: NOW,
    } as PlayerContractProgressRecord;
    this.progress[index] = updated;

    return Promise.resolve(updated);
  }
}

export class FakeServiceClient {
  constructor(
    private readonly gameSessions: readonly Record<string, unknown>[],
  ) {}

  from(tableName: string): FakeGameSessionQuery {
    if (tableName !== "game_sessions") {
      throw new Error(`Unexpected table ${tableName}`);
    }

    return new FakeGameSessionQuery(this.gameSessions);
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

  maybeSingle(): Promise<{ readonly data: unknown; readonly error: null }> {
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
    status: "active",
    visibility: "public",
    targetingPayload: {},
    requirementsPayload: {},
    rewardPayload: {
      cash: {
        amount: 500,
        currencyCode: "ECO",
      },
    },
    completionMode: "manual_review",
    publishedAt: "2026-06-25T12:00:00.000Z",
    deadlineAt: null,
    expiresAt: null,
    metadata: {},
    createdAt: "2026-06-25T12:00:00.000Z",
    updatedAt: "2026-06-25T12:00:00.000Z",
    ...overrides,
  };
}

export function progressRecord(
  overrides: Partial<PlayerContractProgressRecord> = {},
): PlayerContractProgressRecord {
  return {
    id: PROGRESS_ID,
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    playerId: PLAYER_ID,
    status: "submitted",
    evidencePayload: {},
    resultPayload: {},
    submittedAt: "2026-06-25T12:00:00.000Z",
    completedAt: null,
    rewardIssuedAt: null,
    createdAt: "2026-06-25T12:00:00.000Z",
    updatedAt: "2026-06-25T12:00:00.000Z",
    ...overrides,
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
