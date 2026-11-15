import { type PlayerContractRoute } from "./playerContractRoutePaths.ts";
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

export const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";

export const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";

export const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";

export const PLAYER_ID = "00000000-0000-4000-8000-000000000021";

export const OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000022";

export const CONTRACT_ID = "00000000-0000-4000-8000-000000000101";

export const TARGETED_CONTRACT_ID = "00000000-0000-4000-8000-000000000102";

export const HIDDEN_CONTRACT_ID = "00000000-0000-4000-8000-000000000103";

export const PROGRESS_ID = "00000000-0000-4000-8000-000000000201";

export const NOW = "2026-06-25T12:30:00.000Z";

export function dependencies(options: {
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

export function listRequest(options: {
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

export function submitRequest(options: {
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

export function request(
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

export function contractsRoute(): PlayerContractRoute {
  return { kind: "contracts" };
}

export function submitRoute(): PlayerContractRoute {
  return {
    kind: "submit",
    contractId: CONTRACT_ID,
  };
}

export class MockContractRepository implements ContractRepository {
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

export function progressRecord(
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
