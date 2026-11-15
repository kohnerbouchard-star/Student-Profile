import { handlePlayerContractRequest } from "./playerContractHttpHandler.ts";
import {
  type PlayerContractRoute,
  readPlayerContractRoutePath,
} from "./playerContractRoutePaths.ts";
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

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000022";
const CONTRACT_ID = "00000000-0000-4000-8000-000000000101";
const TARGETED_CONTRACT_ID = "00000000-0000-4000-8000-000000000102";
const HIDDEN_CONTRACT_ID = "00000000-0000-4000-8000-000000000103";
const PROGRESS_ID = "00000000-0000-4000-8000-000000000201";
const NOW = "2026-06-25T12:30:00.000Z";

Deno.test("player contract route paths parse list and submit routes", () => {
  assertEquals(
    readPlayerContractRoutePath(
      `/functions/v1/classroom-api/players/me/contracts`,
    ),
    { kind: "contracts" },
  );
  assertEquals(
    readPlayerContractRoutePath(
      `/functions/v1/classroom-api/players/me/contracts/${CONTRACT_ID}/submit`,
    ),
    { kind: "submit", contractId: CONTRACT_ID },
  );
  assertEquals(
    readPlayerContractRoutePath(
      `/functions/v1/classroom-api/players/me/contracts/not-a-uuid/submit`,
    ),
    null,
  );
});

Deno.test("player contract list returns visible contracts and authenticated player progress", async () => {
  const repository = new MockContractRepository({
    contracts: [
      contractRecord({ id: CONTRACT_ID, title: "Public Active" }),
      contractRecord({
        id: TARGETED_CONTRACT_ID,
        title: "Targeted Active",
        visibility: "targeted",
        targetingPayload: {
          playerIds: [PLAYER_ID],
        },
      }),
      contractRecord({
        id: "00000000-0000-4000-8000-000000000104",
        gameSessionId: OTHER_GAME_SESSION_ID,
        contractKey: "other-session",
      }),
      contractRecord({
        id: HIDDEN_CONTRACT_ID,
        contractKey: "hidden",
        visibility: "hidden",
      }),
      contractRecord({
        id: "00000000-0000-4000-8000-000000000105",
        contractKey: "draft",
        status: "draft",
      }),
      contractRecord({
        id: "00000000-0000-4000-8000-000000000106",
        contractKey: "paused",
        status: "paused",
      }),
      contractRecord({
        id: "00000000-0000-4000-8000-000000000107",
        contractKey: "archived",
        status: "archived",
      }),
      contractRecord({
        id: "00000000-0000-4000-8000-000000000108",
        contractKey: "expired-by-time",
        expiresAt: "2026-06-25T12:00:00.000Z",
      }),
      contractRecord({
        id: "00000000-0000-4000-8000-000000000109",
        contractKey: "unpublished",
        publishedAt: null,
      }),
      contractRecord({
        id: "00000000-0000-4000-8000-000000000110",
        contractKey: "future",
        publishedAt: "2026-06-26T12:00:00.000Z",
      }),
    ],
    progress: [
      progressRecord({ id: PROGRESS_ID, contractId: CONTRACT_ID }),
      progressRecord({
        id: "00000000-0000-4000-8000-000000000202",
        contractId: TARGETED_CONTRACT_ID,
        playerId: OTHER_PLAYER_ID,
      }),
      progressRecord({
        id: "00000000-0000-4000-8000-000000000203",
        gameSessionId: OTHER_GAME_SESSION_ID,
      }),
    ],
  });

  const response = await handlePlayerContractRequest(
    listRequest(),
    contractsRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(
    body.contracts.map((contract: { readonly contractId: string }) =>
      contract.contractId
    ),
    [CONTRACT_ID, TARGETED_CONTRACT_ID],
  );
  assertEquals(body.contracts[0].createdByStaffId, undefined);
  assertEquals(
    body.progress.map((progress: { readonly progressId: string }) =>
      progress.progressId
    ),
    [PROGRESS_ID],
  );
  assertEquals(repository.listAvailableInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    rosterLabel: "A-1",
  });
  assertEquals(repository.listProgressInputs[0], {
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
  });
});

Deno.test("player contract list rejects missing invalid revoked expired inactive sessions and mismatched scope", async () => {
  const missing = await handlePlayerContractRequest(
    listRequest({ authToken: null }),
    contractsRoute(),
    dependencies(),
  );
  await assertErrorResponse(missing, 401, "invalid_player_session");

  for (const sessionMode of ["invalid", "revoked", "expired", "inactive"]) {
    const response = await handlePlayerContractRequest(
      listRequest(),
      contractsRoute(),
      dependencies({ sessionMode }),
    );

    await assertErrorResponse(response, 401, "invalid_player_session");
  }

  const mismatched = await handlePlayerContractRequest(
    listRequest({ gameSessionId: OTHER_GAME_SESSION_ID }),
    contractsRoute(),
    dependencies(),
  );

  await assertErrorResponse(mismatched, 401, "invalid_player_session_scope");
});

Deno.test("player contract list rejects client supplied identity", async () => {
  const withPlayerId = await handlePlayerContractRequest(
    listRequest({ extraQuery: `playerId=${OTHER_PLAYER_ID}` }),
    contractsRoute(),
    dependencies(),
  );
  const withPlayerSessionId = await handlePlayerContractRequest(
    listRequest({ extraQuery: `playerSessionId=${PLAYER_SESSION_ID}` }),
    contractsRoute(),
    dependencies(),
  );
  const withPlayerSessionHeader = await handlePlayerContractRequest(
    listRequest({ playerSessionIdHeader: PLAYER_SESSION_ID }),
    contractsRoute(),
    dependencies(),
  );

  await assertErrorResponse(
    withPlayerId,
    400,
    "invalid_player_contract_request",
  );
  await assertErrorResponse(
    withPlayerSessionId,
    400,
    "invalid_player_contract_request",
  );
  await assertErrorResponse(
    withPlayerSessionHeader,
    400,
    "invalid_player_contract_request",
  );
});

Deno.test("player contract submit derives player identity and writes submitted progress only", async () => {
  const repository = new MockContractRepository({
    contracts: [contractRecord({ id: CONTRACT_ID })],
  });
  const response = await handlePlayerContractRequest(
    submitRequest({
      body: {
        gameSessionId: GAME_SESSION_ID,
        evidencePayload: {
          memo: "Export plan attached.",
        },
      },
    }),
    submitRoute(),
    dependencies({ repository }),
  );
  const body = await response.json();
  const upsertInput = repository.upsertInputs[0];

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.contract.contractId, CONTRACT_ID);
  assertEquals(body.contract.createdByStaffId, undefined);
  assertEquals(body.progress.playerId, PLAYER_ID);
  assertEquals(body.progress.status, "submitted");
  assertEquals(body.progress.submittedAt, NOW);
  assertEquals(body.progress.completedAt, null);
  assertEquals(body.progress.rewardIssuedAt, null);
  assertEquals(upsertInput.playerId, PLAYER_ID);
  assertEquals(upsertInput.status, "submitted");
  assertEquals(upsertInput.evidencePayload, { memo: "Export plan attached." });
  assertEquals(upsertInput.resultPayload, {});
  assertEquals(upsertInput.submittedAt, NOW);
  assertEquals("completedAt" in upsertInput, false);
  assertEquals("rewardIssuedAt" in upsertInput, false);
});

Deno.test("player contract submit rejects client supplied identity and invalid evidence", async () => {
  const withQueryPlayerId = await handlePlayerContractRequest(
    submitRequest({
      extraQuery: `playerId=${OTHER_PLAYER_ID}`,
      body: { gameSessionId: GAME_SESSION_ID },
    }),
    submitRoute(),
    dependencies(),
  );
  const withBodyPlayerId = await handlePlayerContractRequest(
    submitRequest({
      body: {
        gameSessionId: GAME_SESSION_ID,
        playerId: OTHER_PLAYER_ID,
      },
    }),
    submitRoute(),
    dependencies(),
  );
  const withArrayEvidence = await handlePlayerContractRequest(
    submitRequest({
      body: {
        gameSessionId: GAME_SESSION_ID,
        evidencePayload: [],
      },
    }),
    submitRoute(),
    dependencies(),
  );
  const withInvalidJson = await handlePlayerContractRequest(
    submitRequest({ rawBody: "{not-json" }),
    submitRoute(),
    dependencies(),
  );

  await assertErrorResponse(
    withQueryPlayerId,
    400,
    "invalid_player_contract_request",
  );
  await assertErrorResponse(
    withBodyPlayerId,
    400,
    "invalid_player_contract_request",
  );
  await assertErrorResponse(
    withArrayEvidence,
    400,
    "invalid_player_contract_request",
  );
  await assertErrorResponse(
    withInvalidJson,
    400,
    "invalid_player_contract_request",
  );
});

Deno.test("player contract submit rejects mismatched game session unavailable and hidden lifecycle contracts", async () => {
  const mismatched = await handlePlayerContractRequest(
    submitRequest({ body: { gameSessionId: OTHER_GAME_SESSION_ID } }),
    submitRoute(),
    dependencies(),
  );

  await assertErrorResponse(mismatched, 401, "invalid_player_session_scope");

  for (
    const contract of [
      null,
      contractRecord({ id: CONTRACT_ID, gameSessionId: OTHER_GAME_SESSION_ID }),
      contractRecord({ id: CONTRACT_ID, visibility: "hidden" }),
      contractRecord({ id: CONTRACT_ID, status: "draft" }),
      contractRecord({ id: CONTRACT_ID, status: "paused" }),
      contractRecord({ id: CONTRACT_ID, status: "archived" }),
      contractRecord({
        id: CONTRACT_ID,
        expiresAt: "2026-06-25T12:00:00.000Z",
      }),
      contractRecord({ id: CONTRACT_ID, publishedAt: null }),
      contractRecord({
        id: CONTRACT_ID,
        publishedAt: "2026-06-26T12:00:00.000Z",
      }),
    ]
  ) {
    const repository = new MockContractRepository({
      contracts: contract ? [contract] : [],
    });
    const response = await handlePlayerContractRequest(
      submitRequest({ body: { gameSessionId: GAME_SESSION_ID } }),
      submitRoute(),
      dependencies({ repository }),
    );

    await assertErrorResponse(response, 404, "contract_not_available");
    assertEquals(repository.upsertInputs.length, 0);
  }
});

Deno.test("player contract submit updates in-progress and submitted rows preserving results", async () => {
  for (const existingStatus of ["in_progress", "submitted"]) {
    const repository = new MockContractRepository({
      contracts: [contractRecord({ id: CONTRACT_ID })],
      progress: [
        progressRecord({
          contractId: CONTRACT_ID,
          status: existingStatus,
          resultPayload: {
            review: "pending",
          },
        }),
      ],
    });
    const response = await handlePlayerContractRequest(
      submitRequest({
        body: {
          gameSessionId: GAME_SESSION_ID,
          evidencePayload: {
            revision: existingStatus,
          },
        },
      }),
      submitRoute(),
      dependencies({ repository }),
    );
    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body.progress.status, "submitted");
    assertEquals(repository.upsertInputs[0].resultPayload, {
      review: "pending",
    });
    assertEquals(repository.upsertInputs[0].submittedAt, NOW);
    assertEquals("completedAt" in repository.upsertInputs[0], false);
    assertEquals("rewardIssuedAt" in repository.upsertInputs[0], false);
  }
});

Deno.test("player contract submit rejects locked existing progress", async () => {
  for (const status of ["completed", "expired", "failed", "dismissed"]) {
    const repository = new MockContractRepository({
      contracts: [contractRecord({ id: CONTRACT_ID })],
      progress: [progressRecord({ contractId: CONTRACT_ID, status })],
    });
    const response = await handlePlayerContractRequest(
      submitRequest({ body: { gameSessionId: GAME_SESSION_ID } }),
      submitRoute(),
      dependencies({ repository }),
    );

    await assertErrorResponse(response, 409, "contract_progress_locked");
    assertEquals(repository.upsertInputs.length, 0);
  }
});

function dependencies(options: {
  readonly repository?: MockContractRepository;
  readonly sessionMode?: string;
} = {}) {
  const repository = options.repository ?? new MockContractRepository();

  return {
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service-role",
      },
    }),
    createServiceClient: () => ({} as never),
    hashSessionToken: (sessionToken: string) =>
      Promise.resolve(`hash:${sessionToken}`),
    resolvePlayerSession: () => {
      if (options.sessionMode && options.sessionMode !== "ok") {
        return Promise.resolve({
          ok: false as const,
          status: 401,
          error: {
            code: "invalid_player_session",
            message: "Player session is invalid or expired.",
            retryable: false,
          },
        });
      }

      return Promise.resolve({
        ok: true as const,
        session: {
          id: PLAYER_SESSION_ID,
          game_session_id: GAME_SESSION_ID,
          player_id: PLAYER_ID,
          status: "active",
          expires_at: "2026-06-26T00:00:00.000Z",
          revoked_at: null,
        },
        gameSession: {
          id: GAME_SESSION_ID,
          name: "Period 1",
          status: "active",
        },
        player: {
          id: PLAYER_ID,
          display_name: "Avery",
          roster_label: "A-1",
          status: "active",
        },
      });
    },
    createRepository: () => repository,
    now: () => NOW,
  };
}

function listRequest(options: {
  readonly authToken?: string | null;
  readonly gameSessionId?: string;
  readonly extraQuery?: string;
  readonly playerSessionIdHeader?: string;
} = {}): Request {
  const gameSessionId = options.gameSessionId ?? GAME_SESSION_ID;
  const query = [`gameSessionId=${gameSessionId}`];

  if (options.extraQuery) {
    query.push(options.extraQuery);
  }

  return request(
    "GET",
    `/players/me/contracts?${query.join("&")}`,
    options,
  );
}

function submitRequest(options: {
  readonly authToken?: string | null;
  readonly body?: unknown;
  readonly rawBody?: string;
  readonly extraQuery?: string;
  readonly playerSessionIdHeader?: string;
} = {}): Request {
  const query = options.extraQuery ? `?${options.extraQuery}` : "";
  return request(
    "POST",
    `/players/me/contracts/${CONTRACT_ID}/submit${query}`,
    {
      ...options,
      body: options.rawBody === undefined
        ? (options.body ?? { gameSessionId: GAME_SESSION_ID })
        : undefined,
      rawBody: options.rawBody,
    },
  );
}

function request(
  method: string,
  path: string,
  options: {
    readonly authToken?: string | null;
    readonly body?: unknown;
    readonly rawBody?: string;
    readonly playerSessionIdHeader?: string;
  } = {},
): Request {
  const headers = new Headers({
    "content-type": "application/json",
  });

  if (options.authToken !== null) {
    headers.set("x-player-session-token", options.authToken ?? "player-token");
  }

  if (options.playerSessionIdHeader) {
    headers.set("x-player-session-id", options.playerSessionIdHeader);
  }

  const init: RequestInit = {
    method,
    headers,
  };

  if (options.rawBody !== undefined) {
    init.body = options.rawBody;
  } else if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  return new Request(`https://example.test${path}`, init);
}

function contractsRoute(): PlayerContractRoute {
  return { kind: "contracts" };
}

function submitRoute(): PlayerContractRoute {
  return {
    kind: "submit",
    contractId: CONTRACT_ID,
  };
}

class MockContractRepository implements ContractRepository {
  readonly listAvailableInputs: ListPlayerAvailableContractsInput[] = [];
  readonly listProgressInputs: ListPlayerContractProgressInput[] = [];
  readonly getProgressInputs: GetPlayerContractProgressInput[] = [];
  readonly upsertInputs: UpsertPlayerContractProgressInput[] = [];

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
    throw new Error("Not implemented in player contract handler tests.");
  }

  getContractTemplateByKey(): Promise<null> {
    return Promise.resolve(null);
  }

  createGameSessionContract(
    _input: CreateGameSessionContractInput,
  ): Promise<never> {
    throw new Error("Not implemented in player contract handler tests.");
  }

  listGameSessionContracts(
    _input: ListGameSessionContractsInput,
  ): Promise<readonly GameSessionContractRecord[]> {
    return Promise.resolve([]);
  }

  getGameSessionContractById(
    _input: GetGameSessionContractByIdInput,
  ): Promise<GameSessionContractRecord | null> {
    return Promise.resolve(null);
  }

  updateGameSessionContractStatus(
    _input: UpdateGameSessionContractStatusInput,
  ): Promise<GameSessionContractRecord | null> {
    return Promise.resolve(null);
  }

  listPlayerAvailableContracts(
    input: ListPlayerAvailableContractsInput,
  ): Promise<readonly GameSessionContractRecord[]> {
    this.listAvailableInputs.push(input);
    return Promise.resolve([...this.contracts]);
  }

  getPlayerContractProgress(
    input: GetPlayerContractProgressInput,
  ): Promise<PlayerContractProgressRecord | null> {
    this.getProgressInputs.push(input);
    return Promise.resolve(
      this.progress.find((row) =>
        row.gameSessionId === input.gameSessionId &&
        row.contractId === input.contractId &&
        row.playerId === input.playerId
      ) ?? null,
    );
  }

  upsertPlayerContractProgress(
    input: UpsertPlayerContractProgressInput,
  ): Promise<PlayerContractProgressRecord> {
    this.upsertInputs.push(input);
    const existingIndex = this.progress.findIndex((row) =>
      row.gameSessionId === input.gameSessionId &&
      row.contractId === input.contractId &&
      row.playerId === input.playerId
    );
    const existing = existingIndex >= 0 ? this.progress[existingIndex] : null;
    const updated = progressRecord({
      id: existing?.id ?? PROGRESS_ID,
      gameSessionId: input.gameSessionId,
      contractId: input.contractId,
      playerId: input.playerId,
      status: input.status ?? existing?.status ?? "available",
      evidencePayload: input.evidencePayload ?? existing?.evidencePayload ?? {},
      resultPayload: input.resultPayload ?? existing?.resultPayload ?? {},
      submittedAt: input.submittedAt ?? existing?.submittedAt ?? null,
      completedAt: input.completedAt ?? existing?.completedAt ?? null,
      rewardIssuedAt: input.rewardIssuedAt ?? existing?.rewardIssuedAt ?? null,
      createdAt: existing?.createdAt ?? "2026-06-25T12:00:00.000Z",
      updatedAt: NOW,
    });

    if (existingIndex >= 0) {
      this.progress[existingIndex] = updated;
    } else {
      this.progress.push(updated);
    }

    return Promise.resolve(updated);
  }

  listPlayerContractProgress(
    input: ListPlayerContractProgressInput,
  ): Promise<readonly PlayerContractProgressRecord[]> {
    this.listProgressInputs.push(input);
    return Promise.resolve([...this.progress]);
  }

  listContractProgressForStaff(
    _input: ListContractProgressForStaffInput,
  ): Promise<readonly PlayerContractProgressRecord[]> {
    return Promise.resolve([]);
  }

  getContractProgressById(
    _input: GetContractProgressByIdInput,
  ): Promise<PlayerContractProgressRecord | null> {
    return Promise.resolve(null);
  }

  reviewPlayerContractProgress(
    _input: ReviewPlayerContractProgressInput,
  ): Promise<PlayerContractProgressRecord | null> {
    return Promise.resolve(null);
  }

  markContractRewardIssued(
    _input: MarkContractRewardIssuedInput,
  ): Promise<PlayerContractProgressRecord | null> {
    return Promise.resolve(null);
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
    createdByStaffId: "00000000-0000-4000-8000-000000000301",
    title: "Aurora Export Drive",
    description: "Prepare a basic export plan.",
    instructions: "Submit a memo and complete the required action.",
    category: "trade",
    status: "active",
    visibility: "public",
    targetingPayload: {},
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
    status: "available",
    evidencePayload: {},
    resultPayload: {},
    submittedAt: null,
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
