import { handleStaffContractRequest } from "./staffContractHttpHandler.ts";
import type {
  ContractRepository,
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
import type { StaffContractRoute } from "./contractRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const CONTRACT_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const OTHER_STAFF_ID = "00000000-0000-4000-8000-000000000202";
const NOW = "2026-06-25T12:30:00.000Z";

Deno.test("staff contract route lists contracts for a game session", async () => {
  const repository = new MockContractRepository([
    contractRecord({ id: CONTRACT_ID, gameSessionId: GAME_SESSION_ID }),
  ]);

  const response = await handleStaffContractRequest(
    request("GET"),
    contractsRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(
    body.contracts.map((contract: { contractId: string }) =>
      contract.contractId
    ),
    [
      CONTRACT_ID,
    ],
  );
  assertEquals(repository.listInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    visibility: null,
  });
});

Deno.test("staff contract list excludes other game sessions", async () => {
  const repository = new MockContractRepository([
    contractRecord({ id: CONTRACT_ID, gameSessionId: GAME_SESSION_ID }),
    contractRecord({
      id: "00000000-0000-4000-8000-000000000102",
      gameSessionId: OTHER_GAME_SESSION_ID,
      contractKey: "other-game-contract",
    }),
  ]);

  const response = await handleStaffContractRequest(
    request("GET"),
    contractsRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(
    body.contracts.map((contract: { gameSessionId: string }) =>
      contract.gameSessionId
    ),
    [
      GAME_SESSION_ID,
    ],
  );
});

Deno.test("staff contract list supports status sourceType and visibility filters", async () => {
  const repository = new MockContractRepository([
    contractRecord({
      id: CONTRACT_ID,
      status: "active",
      sourceType: "teacher",
      visibility: "public",
    }),
    contractRecord({
      id: "00000000-0000-4000-8000-000000000102",
      status: "draft",
      sourceType: "teacher",
      visibility: "public",
    }),
    contractRecord({
      id: "00000000-0000-4000-8000-000000000103",
      status: "active",
      sourceType: "system",
      visibility: "public",
    }),
    contractRecord({
      id: "00000000-0000-4000-8000-000000000104",
      status: "active",
      sourceType: "teacher",
      visibility: "hidden",
    }),
  ]);

  const response = await handleStaffContractRequest(
    request("GET", {
      query: "status=active&sourceType=teacher&visibility=public",
    }),
    contractsRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(
    body.contracts.map((contract: { contractId: string }) =>
      contract.contractId
    ),
    [
      CONTRACT_ID,
    ],
  );
  assertEquals(repository.listInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    statuses: ["active"],
    sourceTypes: ["teacher"],
    visibility: "public",
  });
});

Deno.test("staff contract list rejects invalid filters", async () => {
  const response = await handleStaffContractRequest(
    request("GET", { query: "status=posted" }),
    contractsRoute(),
    dependencies(),
  );
  const empty = await handleStaffContractRequest(
    request("GET", { query: "sourceType=" }),
    contractsRoute(),
    dependencies(),
  );

  await assertErrorResponse(response, 400, "invalid_contract_status_filter");
  await assertErrorResponse(empty, 400, "invalid_contract_source_type_filter");
});

Deno.test("staff can create teacher contract", async () => {
  const repository = new MockContractRepository();
  const response = await handleStaffContractRequest(
    request("POST", { body: createContractBody() }),
    contractsRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 201);
  assertEquals(body.ok, true);
  assertEquals(body.contract.contractId, "created-contract");
  assertEquals(body.contract.sourceType, "teacher");
  assertEquals(repository.createInputs[0]?.sourceType, "teacher");
  assertEquals(repository.createInputs[0]?.createdByStaffId, STAFF_ID);
  assertEquals(repository.createInputs[0]?.gameSessionId, GAME_SESSION_ID);
});

Deno.test("staff contract create rejects client-supplied createdByStaffId", async () => {
  const response = await handleStaffContractRequest(
    request("POST", {
      body: {
        ...createContractBody(),
        createdByStaffId: OTHER_STAFF_ID,
      },
    }),
    contractsRoute(),
    dependencies(),
  );

  await assertErrorResponse(response, 400, "created_by_staff_id_not_allowed");
});

Deno.test("staff contract create rejects non-teacher sourceType", async () => {
  const response = await handleStaffContractRequest(
    request("POST", {
      body: {
        ...createContractBody(),
        sourceType: "system",
      },
    }),
    contractsRoute(),
    dependencies(),
  );

  await assertErrorResponse(response, 400, "source_type_not_allowed");
});

Deno.test("staff contract create rejects invalid payloads and enums", async () => {
  const invalidPayload = await handleStaffContractRequest(
    request("POST", {
      body: {
        ...createContractBody(),
        targetingPayload: [],
      },
    }),
    contractsRoute(),
    dependencies(),
  );
  const invalidEnum = await handleStaffContractRequest(
    request("POST", {
      body: {
        ...createContractBody(),
        visibility: "classroom",
      },
    }),
    contractsRoute(),
    dependencies(),
  );
  const invalidCreateStatus = await handleStaffContractRequest(
    request("POST", {
      body: {
        ...createContractBody(),
        status: "paused",
      },
    }),
    contractsRoute(),
    dependencies(),
  );

  await assertErrorResponse(invalidPayload, 400, "invalid_contract_request");
  await assertErrorResponse(invalidEnum, 400, "invalid_contract_request");
  await assertErrorResponse(
    invalidCreateStatus,
    400,
    "invalid_contract_status",
  );
});

Deno.test("staff contract publish updates draft contract to active", async () => {
  const repository = new MockContractRepository([
    contractRecord({
      id: CONTRACT_ID,
      status: "draft",
      publishedAt: null,
    }),
  ]);
  const response = await handleStaffContractRequest(
    request("POST"),
    publishRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.contract.status, "active");
  assertEquals(body.contract.publishedAt, NOW);
  assertEquals(repository.updateStatusInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
    status: "active",
    publishedAt: NOW,
  });
});

Deno.test("staff contract publish rejects not-found contract", async () => {
  const response = await handleStaffContractRequest(
    request("POST"),
    publishRoute(),
    dependencies({ repository: new MockContractRepository() }),
  );

  await assertErrorResponse(response, 404, "contract_not_found");
});

Deno.test("staff contract publish is scoped by gameSessionId", async () => {
  const repository = new MockContractRepository([
    contractRecord({
      id: CONTRACT_ID,
      gameSessionId: OTHER_GAME_SESSION_ID,
      status: "draft",
    }),
  ]);
  const response = await handleStaffContractRequest(
    request("POST"),
    publishRoute(),
    dependencies({ repository }),
  );

  await assertErrorResponse(response, 404, "contract_not_found");
  assertEquals(repository.updateStatusInputs.length, 0);
});

Deno.test("staff contract publish rejects non-draft scheduled contracts", async () => {
  const repository = new MockContractRepository([
    contractRecord({
      id: CONTRACT_ID,
      status: "active",
      publishedAt: NOW,
    }),
  ]);
  const response = await handleStaffContractRequest(
    request("POST"),
    publishRoute(),
    dependencies({ repository }),
  );

  await assertErrorResponse(response, 409, "contract_not_publishable");
});

Deno.test("staff contract route rejects missing staff session", async () => {
  const response = await handleStaffContractRequest(
    request("GET"),
    contractsRoute(),
    dependencies({ staffAuth: "missing" }),
  );

  await assertErrorResponse(response, 401, "missing_staff_auth_user");
});

Deno.test("staff contract route rejects unauthorized game session", async () => {
  const response = await handleStaffContractRequest(
    request("GET"),
    contractsRoute(),
    dependencies({
      serviceClient: new FakeServiceClient([
        {
          id: GAME_SESSION_ID,
          name: "Period 1",
          status: "active",
          owner_staff_user_id: OTHER_STAFF_ID,
        },
      ]),
    }),
  );

  await assertErrorResponse(response, 404, "game_session_not_found");
});

function dependencies(options: {
  readonly repository?: MockContractRepository;
  readonly serviceClient?: FakeServiceClient;
  readonly staffAuth?: "ok" | "missing";
} = {}) {
  const repository = options.repository ?? new MockContractRepository();
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
    now: () => NOW,
  };
}

function request(
  method: string,
  options: {
    readonly body?: unknown;
    readonly query?: string;
  } = {},
): Request {
  const url =
    `https://example.test/staff/game-sessions/${GAME_SESSION_ID}/contracts${
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

function contractsRoute(): StaffContractRoute {
  return {
    kind: "contracts",
    gameSessionId: GAME_SESSION_ID,
  };
}

function publishRoute(): StaffContractRoute {
  return {
    kind: "publish",
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
  };
}

function createContractBody(): Record<string, unknown> {
  return {
    contractKey: "aurora-export-drive",
    title: "Aurora Export Drive",
    description: "Prepare a basic export plan.",
    instructions: "Submit a memo and complete the required action.",
    category: "trade",
    status: "draft",
    visibility: "public",
    targetingPayload: {
      allPlayers: true,
    },
    requirementsPayload: {
      manualText: "Submit a memo.",
    },
    rewardPayload: {
      cash: {
        amount: 500,
        currencyCode: "ECO",
      },
    },
    completionMode: "manual_review",
    metadata: {
      source: "teacher-test",
    },
  };
}

class MockContractRepository implements ContractRepository {
  readonly createInputs: CreateGameSessionContractInput[] = [];
  readonly listInputs: ListGameSessionContractsInput[] = [];
  readonly updateStatusInputs: UpdateGameSessionContractStatusInput[] = [];

  constructor(private readonly contracts: GameSessionContractRecord[] = []) {}

  createContractTemplate(
    _input: CreateContractTemplateInput,
  ): Promise<never> {
    throw new Error("Not implemented in staff contract handler tests.");
  }

  getContractTemplateByKey(): Promise<null> {
    return Promise.resolve(null);
  }

  createGameSessionContract(
    input: CreateGameSessionContractInput,
  ): Promise<GameSessionContractRecord> {
    this.createInputs.push(input);
    const contract = contractRecord({
      id: "created-contract",
      gameSessionId: input.gameSessionId,
      contractKey: input.contractKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      createdByStaffId: input.createdByStaffId ?? null,
      title: input.title,
      description: input.description,
      instructions: input.instructions,
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
    this.contracts.push(contract);

    return Promise.resolve(contract);
  }

  listGameSessionContracts(
    input: ListGameSessionContractsInput,
  ): Promise<readonly GameSessionContractRecord[]> {
    this.listInputs.push(input);

    return Promise.resolve(
      this.contracts.filter((contract) => {
        if (contract.gameSessionId !== input.gameSessionId) {
          return false;
        }

        if (
          input.statuses?.length &&
          !input.statuses.includes(contract.status as never)
        ) {
          return false;
        }

        if (
          input.sourceTypes?.length &&
          !input.sourceTypes.includes(contract.sourceType as never)
        ) {
          return false;
        }

        return !input.visibility || contract.visibility === input.visibility;
      }),
    );
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
    input: UpdateGameSessionContractStatusInput,
  ): Promise<GameSessionContractRecord | null> {
    this.updateStatusInputs.push(input);
    const index = this.contracts.findIndex((contract) =>
      contract.gameSessionId === input.gameSessionId &&
      contract.id === input.contractId
    );

    if (index < 0) {
      return Promise.resolve(null);
    }

    const updated = {
      ...this.contracts[index],
      status: input.status,
      publishedAt: input.publishedAt ?? this.contracts[index].publishedAt,
      updatedAt: NOW,
    } as GameSessionContractRecord;
    this.contracts[index] = updated;

    return Promise.resolve(updated);
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
  ): Promise<PlayerContractProgressRecord> {
    throw new Error("Not implemented in staff contract handler tests.");
  }

  listPlayerContractProgress(
    _input: ListPlayerContractProgressInput,
  ): Promise<readonly PlayerContractProgressRecord[]> {
    return Promise.resolve([]);
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
