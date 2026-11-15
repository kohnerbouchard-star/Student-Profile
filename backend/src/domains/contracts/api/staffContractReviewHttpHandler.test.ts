import { handleStaffContractRequest } from "./staffContractHttpHandler.ts";
import {
  readStaffContractRoutePath,
  type StaffContractRoute,
} from "./contractRoutePaths.ts";
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

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const CONTRACT_ID = "00000000-0000-4000-8000-000000000101";
const OTHER_CONTRACT_ID = "00000000-0000-4000-8000-000000000102";
const PROGRESS_ID = "00000000-0000-4000-8000-000000000201";
const OTHER_PROGRESS_ID = "00000000-0000-4000-8000-000000000202";
const PLAYER_ID = "00000000-0000-4000-8000-000000000301";
const OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000302";
const STAFF_ID = "00000000-0000-4000-8000-000000000401";
const OTHER_STAFF_ID = "00000000-0000-4000-8000-000000000402";
const NOW = "2026-06-25T12:30:00.000Z";

Deno.test("staff contract route paths parse progress review and reward issue routes", () => {
  assertEquals(
    readStaffContractRoutePath(
      `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress`,
    ),
    progressRoute(),
  );
  assertEquals(
    readStaffContractRoutePath(
      `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
    ),
    reviewRoute(),
  );
  assertEquals(
    readStaffContractRoutePath(
      `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`,
    ),
    rewardRoute(),
  );
});

Deno.test("staff can list progress for one contract with filters", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [
      progressRecord({ id: PROGRESS_ID, status: "submitted" }),
      progressRecord({
        id: OTHER_PROGRESS_ID,
        playerId: OTHER_PLAYER_ID,
        status: "submitted",
      }),
      progressRecord({
        id: "00000000-0000-4000-8000-000000000203",
        contractId: OTHER_CONTRACT_ID,
        status: "submitted",
      }),
      progressRecord({
        id: "00000000-0000-4000-8000-000000000204",
        gameSessionId: OTHER_GAME_SESSION_ID,
        status: "submitted",
      }),
      progressRecord({
        id: "00000000-0000-4000-8000-000000000205",
        status: "completed",
      }),
    ],
  });
  const response = await handleStaffContractRequest(
    request("GET", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress`,
      query: `status=submitted&playerId=${PLAYER_ID}`,
    }),
    progressRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.contract.contractId, CONTRACT_ID);
  assertEquals(
    body.progress.map((row: { readonly progressId: string }) => row.progressId),
    [PROGRESS_ID],
  );
  assertEquals(repository.listStaffProgressInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    statuses: ["submitted"],
    playerId: PLAYER_ID,
  });
});

Deno.test("staff contract progress rejects missing staff and unauthorized game", async () => {
  const missing = await handleStaffContractRequest(
    request("GET", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress`,
    }),
    progressRoute(),
    dependencies({ staffAuth: "missing" }),
  );
  const unauthorized = await handleStaffContractRequest(
    request("GET", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress`,
    }),
    progressRoute(),
    dependencies({
      serviceClient: new FakeServiceClient([{
        id: GAME_SESSION_ID,
        name: "Period 1",
        status: "active",
        owner_staff_user_id: OTHER_STAFF_ID,
      }]),
    }),
  );

  await assertErrorResponse(missing, 401, "missing_staff_auth_user");
  await assertErrorResponse(unauthorized, 404, "game_session_not_found");
});

Deno.test("staff contract progress rejects invalid status filters", async () => {
  const response = await handleStaffContractRequest(
    request("GET", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress`,
      query: "status=reviewed",
    }),
    progressRoute(),
    dependencies(),
  );

  await assertErrorResponse(
    response,
    400,
    "invalid_contract_progress_status_filter",
  );
});

Deno.test("staff can approve submitted progress without issuing rewards", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [progressRecord({ status: "submitted" })],
  });
  const ledger = new CapturingRewardLedgerWriter();
  const response = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: {
        action: "approve",
        resultPayload: {
          score: "approved",
        },
      },
    }),
    reviewRoute(),
    dependencies({ repository, ledger }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.progress.status, "completed");
  assertEquals(body.progress.completedAt, NOW);
  assertEquals(body.progress.rewardIssuedAt, null);
  assertEquals(body.progress.resultPayload, { score: "approved" });
  assertEquals(repository.reviewInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
    status: "completed",
    resultPayload: {
      score: "approved",
    },
    completedAt: NOW,
  });
  assertEquals(ledger.inputs.length, 0);
});

Deno.test("staff can reject submitted progress", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [progressRecord({ status: "submitted" })],
  });
  const response = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: {
        action: "reject",
        resultPayload: {
          reason: "Incomplete memo.",
        },
      },
    }),
    reviewRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.progress.status, "failed");
  assertEquals(body.progress.resultPayload, { reason: "Incomplete memo." });
  assertEquals(body.progress.rewardIssuedAt, null);
  assertEquals(repository.reviewInputs[0].completedAt, undefined);
});

Deno.test("staff can request revision without clearing evidence or submittedAt", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [
      progressRecord({
        status: "submitted",
        evidencePayload: {
          memo: "draft",
        },
        submittedAt: "2026-06-25T12:00:00.000Z",
      }),
    ],
  });
  const response = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: {
        action: "request_revision",
        resultPayload: {
          note: "Add citations.",
        },
      },
    }),
    reviewRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.progress.status, "in_progress");
  assertEquals(body.progress.evidencePayload, { memo: "draft" });
  assertEquals(body.progress.submittedAt, "2026-06-25T12:00:00.000Z");
  assertEquals(body.progress.completedAt, null);
  assertEquals(body.progress.rewardIssuedAt, null);
});

Deno.test("staff review rejects invalid body action authority payload and issued rewards", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [
      progressRecord({
        rewardIssuedAt: "2026-06-25T12:05:00.000Z",
      }),
    ],
  });
  const invalidAction = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: { action: "maybe" },
    }),
    reviewRoute(),
    dependencies({ repository }),
  );
  const invalidPayload = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: {
        action: "approve",
        resultPayload: [],
      },
    }),
    reviewRoute(),
    dependencies({ repository }),
  );
  const staffId = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: {
        action: "approve",
        staffId: OTHER_STAFF_ID,
      },
    }),
    reviewRoute(),
    dependencies({ repository }),
  );
  const alreadyIssued = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: { action: "approve" },
    }),
    reviewRoute(),
    dependencies({ repository }),
  );

  await assertErrorResponse(
    invalidAction,
    400,
    "invalid_contract_review_action",
  );
  await assertErrorResponse(invalidPayload, 400, "invalid_contract_request");
  await assertErrorResponse(staffId, 400, "staff_id_not_allowed");
  await assertErrorResponse(
    alreadyIssued,
    409,
    "contract_reward_already_issued",
  );
});

Deno.test("staff review rejects progress from another game or contract", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [
      progressRecord({
        gameSessionId: OTHER_GAME_SESSION_ID,
      }),
      progressRecord({
        id: OTHER_PROGRESS_ID,
        contractId: OTHER_CONTRACT_ID,
      }),
    ],
  });
  const response = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/review`,
      body: { action: "approve" },
    }),
    reviewRoute(),
    dependencies({ repository }),
  );

  await assertErrorResponse(response, 404, "contract_progress_not_found");
});

Deno.test("staff can issue cash rewards for completed progress", async () => {
  const repository = new MockContractRepository({
    contracts: [
      contractRecord({
        rewardPayload: {
          cash: {
            amount: 500,
            currencyCode: "ECO",
          },
        },
      }),
    ],
    progress: [progressRecord({ status: "completed" })],
  });
  const ledger = new CapturingRewardLedgerWriter();
  const response = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`,
    }),
    rewardRoute(),
    dependencies({ repository, ledger }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.rewardIssued, true);
  assertEquals(body.alreadyIssued, false);
  assertEquals(body.progress.rewardIssuedAt, NOW);
  assertEquals(body.rewardResult.appliedRewards[0].ledgerEntryId, "ledger-1");
  assertEquals(ledger.inputs[0].playerId, PLAYER_ID);
  assertEquals(ledger.inputs[0].amount, 500);
  assertEquals(repository.markRewardInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
    rewardIssuedAt: NOW,
  });
});

Deno.test("staff reward issue is idempotent after rewardIssuedAt", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [
      progressRecord({
        status: "completed",
        rewardIssuedAt: "2026-06-25T12:05:00.000Z",
      }),
    ],
  });
  const ledger = new CapturingRewardLedgerWriter();
  const response = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`,
    }),
    rewardRoute(),
    dependencies({ repository, ledger }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.rewardIssued, false);
  assertEquals(body.alreadyIssued, true);
  assertEquals(ledger.inputs.length, 0);
  assertEquals(repository.markRewardInputs.length, 0);
});

Deno.test("staff reward issue rejects unsupported rewards before ledger or mark", async () => {
  const repository = new MockContractRepository({
    contracts: [
      contractRecord({
        rewardPayload: {
          items: [{
            itemId: "00000000-0000-4000-8000-000000000901",
            quantity: 1,
          }],
        },
      }),
    ],
    progress: [progressRecord({ status: "completed" })],
  });
  const ledger = new CapturingRewardLedgerWriter();
  const response = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`,
    }),
    rewardRoute(),
    dependencies({ repository, ledger }),
  );

  await assertErrorResponse(response, 400, "unsupported_reward_type");
  assertEquals(ledger.inputs.length, 0);
  assertEquals(repository.markRewardInputs.length, 0);
});

Deno.test("staff reward issue rejects non-completed progress and ledger failure leaves unmarked", async () => {
  const notCompletedRepository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [progressRecord({ status: "submitted" })],
  });
  const notCompleted = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`,
    }),
    rewardRoute(),
    dependencies({ repository: notCompletedRepository }),
  );

  await assertErrorResponse(
    notCompleted,
    409,
    "contract_progress_not_completed",
  );
  assertEquals(notCompletedRepository.markRewardInputs.length, 0);

  const failedRepository = new MockContractRepository({
    contracts: [contractRecord()],
    progress: [progressRecord({ status: "completed" })],
  });
  const failed = await handleStaffContractRequest(
    request("POST", {
      path:
        `/staff/game-sessions/${GAME_SESSION_ID}/contracts/${CONTRACT_ID}/progress/${PROGRESS_ID}/rewards/issue`,
    }),
    rewardRoute(),
    dependencies({
      repository: failedRepository,
      ledger: new CapturingRewardLedgerWriter("fail"),
    }),
  );

  await assertErrorResponse(failed, 500, "contract_reward_issue_failed");
  assertEquals(failedRepository.markRewardInputs.length, 0);
});

function dependencies(options: {
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

function request(
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

function progressRoute(): StaffContractRoute {
  return {
    kind: "progress",
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
  };
}

function reviewRoute(): StaffContractRoute {
  return {
    kind: "review",
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
  };
}

function rewardRoute(): StaffContractRoute {
  return {
    kind: "issueRewards",
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    progressId: PROGRESS_ID,
  };
}

class CapturingRewardLedgerWriter implements ContractRewardLedgerWriter {
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

class MockContractRepository implements ContractRepository {
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

class FakeServiceClient {
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

class FakeGameSessionQuery {
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

function contractRecord(
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

function progressRecord(
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

async function assertErrorResponse(
  response: Response,
  expectedStatus: number,
  expectedCode: string,
): Promise<void> {
  const body = await response.json();

  assertEquals(response.status, expectedStatus);
  assertEquals(body.ok, false);
  assertEquals(body.error.code, expectedCode);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
