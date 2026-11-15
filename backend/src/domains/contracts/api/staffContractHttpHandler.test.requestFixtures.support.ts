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
import type { StaffContractRoute } from "./contractRoutePaths.ts";
import {
  contractRecord,
  FakeServiceClient,
} from "./staffContractHttpHandler.test.persistenceFixtures.support.ts";

export const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";

export const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";

export const CONTRACT_ID = "00000000-0000-4000-8000-000000000101";

export const STAFF_ID = "00000000-0000-4000-8000-000000000201";

export const OTHER_STAFF_ID = "00000000-0000-4000-8000-000000000202";

export const NOW = "2026-06-25T12:30:00.000Z";

export function dependencies(options: {
  readonly repository?: MockContractRepository;
  readonly serviceClient?: FakeServiceClient;
  readonly staffAuth?: "ok" | "missing";
} = {}) {
  const repository = options.repository ?? new MockContractRepository();
  const serviceClient = options.serviceClient ?? new FakeServiceClient(
    [
      {
        id: GAME_SESSION_ID,
        name: "Period 1",
        status: "active",
        owner_staff_user_id: STAFF_ID,
      },
    ],
    repository,
  );

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

export function request(
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
      "idempotency-key": "contract-handler-test-key",
    },
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  return new Request(url, init);
}

export function contractsRoute(): StaffContractRoute {
  return {
    kind: "contracts",
    gameSessionId: GAME_SESSION_ID,
  };
}

export function publishRoute(): StaffContractRoute {
  return {
    kind: "publish",
    gameSessionId: GAME_SESSION_ID,
    contractId: CONTRACT_ID,
  };
}

export function createContractBody(): Record<string, unknown> {
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

export class MockContractRepository implements ContractRepository {
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
