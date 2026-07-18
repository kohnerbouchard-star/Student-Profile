import { handlePlayerContractPublicListRequest } from "./playerContractPublicListHttpHandler.ts";
import { readPlayerContractPublicListRoutePath } from "./playerContractPublicListRoutePaths.ts";
import type {
  ContractRepository,
  GameSessionContractRecord,
  PlayerContractProgressRecord,
} from "../contracts/contractRepositoryContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const SESSION_ID = "00000000-0000-4000-8000-000000000011";
const CONTRACT_ID = "00000000-0000-4000-8000-000000000101";
const PROGRESS_ID = "00000000-0000-4000-8000-000000000201";
const NOW = "2026-07-19T00:00:00.000Z";

Deno.test("Player Contract public list route parser accepts only direct and Edge list paths", () => {
  assertEquals(readPlayerContractPublicListRoutePath("/players/me/contracts"), {
    kind: "contracts",
  });
  assertEquals(
    readPlayerContractPublicListRoutePath(
      "/functions/v1/classroom-api/players/me/contracts",
    ),
    { kind: "contracts" },
  );
  assertEquals(
    readPlayerContractPublicListRoutePath("/spoof/players/me/contracts"),
    null,
  );
  assertEquals(
    readPlayerContractPublicListRoutePath("/players/me/contracts/extra"),
    null,
  );
});

Deno.test("Player Contract public list derives scope from the authenticated session and returns no UUIDs", async () => {
  const listAvailableInputs: unknown[] = [];
  const listProgressInputs: unknown[] = [];
  const contract = contractRecord();
  const progress = progressRecord();
  const repository = {
    listPlayerAvailableContracts: async (input: unknown) => {
      listAvailableInputs.push(input);
      return [contract];
    },
    listGameSessionContracts: async () => [],
    listPlayerContractProgress: async (input: unknown) => {
      listProgressInputs.push(input);
      return [progress];
    },
  } as unknown as ContractRepository;

  const response = await handlePlayerContractPublicListRequest(
    request(),
    dependencies(repository),
  );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.contracts[0].contractKey, "arrival-orientation");
  assertEquals(body.progress[0].contractKey, "arrival-orientation");
  assertEquals(listAvailableInputs[0], {
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    countryCode: "ELD",
    rosterLabel: "A-1",
  });
  assertEquals(listProgressInputs[0], {
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
  });

  for (const privateValue of [
    GAME_ID,
    PLAYER_ID,
    SESSION_ID,
    CONTRACT_ID,
    PROGRESS_ID,
    "private-answer",
  ]) {
    assert(
      !serialized.includes(privateValue),
      `Player Contract public list must not expose ${privateValue}.`,
    );
  }
});

Deno.test("Player Contract public list rejects browser-owned scope and invalid sessions", async () => {
  const repository = {
    listPlayerAvailableContracts: async () => [contractRecord()],
    listGameSessionContracts: async () => [],
    listPlayerContractProgress: async () => [progressRecord()],
  } as unknown as ContractRepository;

  for (const scopedRequest of [
    request({ query: `gameSessionId=${GAME_ID}` }),
    request({ extraHeaders: { "x-game-session-id": GAME_ID } }),
    request({ extraHeaders: { "x-player-id": PLAYER_ID } }),
    request({ extraHeaders: { "x-player-session-id": SESSION_ID } }),
  ]) {
    const response = await handlePlayerContractPublicListRequest(
      scopedRequest,
      dependencies(repository),
    );
    await assertError(response, 400, "invalid_player_contract_list_request");
  }

  const missing = await handlePlayerContractPublicListRequest(
    request({ token: "" }),
    dependencies(repository),
  );
  await assertError(missing, 401, "invalid_player_session");

  const invalid = await handlePlayerContractPublicListRequest(
    request(),
    dependencies(repository, { sessionValid: false }),
  );
  await assertError(invalid, 401, "invalid_player_session");

  const wrongMethod = await handlePlayerContractPublicListRequest(
    request({ method: "POST" }),
    dependencies(repository),
  );
  await assertError(wrongMethod, 405, "method_not_allowed");
});

function request(options: {
  readonly method?: string;
  readonly query?: string;
  readonly token?: string;
  readonly extraHeaders?: Readonly<Record<string, string>>;
} = {}): Request {
  const query = options.query ? `?${options.query}` : "";
  return new Request(`https://example.test/players/me/contracts${query}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.token === "" ? {} : {
        "x-player-session-token": options.token ?? "session-token",
      }),
      ...(options.extraHeaders ?? {}),
    },
  });
}

function dependencies(
  repository: ContractRepository,
  options: { readonly sessionValid?: boolean } = {},
) {
  return {
    readSupabaseEnv: () => ({ ok: true as const, value: {} as never }),
    createServiceClient: () => ({} as never),
    hashSessionToken: async () => "hash",
    resolvePlayerSession: async () => options.sessionValid === false
      ? {
        ok: false as const,
        status: 401,
        error: {
          code: "invalid_player_session",
          message: "Player session is invalid or expired.",
          retryable: false,
        },
      }
      : {
        ok: true as const,
        session: {
          id: SESSION_ID,
          game_session_id: GAME_ID,
          player_id: PLAYER_ID,
          status: "active",
          expires_at: "2026-07-20T00:00:00.000Z",
          revoked_at: null,
        },
        gameSession: {
          id: GAME_ID,
          name: "Econovaria",
          status: "active",
        },
        player: {
          id: PLAYER_ID,
          display_name: "Alex Rivera",
          roster_label: "A-1",
          status: "active",
        },
      },
    resolvePlayerCountryCode: async () => "ELD",
    createRepository: () => repository,
    now: () => NOW,
  };
}

function contractRecord(): GameSessionContractRecord {
  return {
    id: CONTRACT_ID,
    gameSessionId: GAME_ID,
    contractTemplateId: null,
    contractKey: "arrival-orientation",
    sourceType: "staff",
    sourceId: null,
    createdByStaffId: null,
    title: "Arrival orientation",
    description: "Review the national economy.",
    instructions: "Submit a short response.",
    category: "Orientation",
    status: "active",
    visibility: "public",
    targetingPayload: { countryCodes: ["ELD"] },
    requirementsPayload: {
      items: [{ label: "Read the briefing", requirementId: CONTRACT_ID }],
      answerKey: "private-answer",
    },
    rewardPayload: { cashAmount: 25, currencyCode: "ECO" },
    completionMode: "manual_review",
    publishedAt: "2026-07-18T00:00:00.000Z",
    deadlineAt: "2026-07-21T00:00:00.000Z",
    expiresAt: "2026-07-22T00:00:00.000Z",
    metadata: { issuer: "Immigration Office" },
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: NOW,
  };
}

function progressRecord(): PlayerContractProgressRecord {
  return {
    id: PROGRESS_ID,
    gameSessionId: GAME_ID,
    contractId: CONTRACT_ID,
    playerId: PLAYER_ID,
    status: "submitted",
    evidencePayload: { note: "Completed response", playerId: PLAYER_ID },
    resultPayload: { feedback: "Add one comparison.", correctAnswer: "private-answer" },
    submittedAt: NOW,
    completedAt: null,
    rewardIssuedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

async function assertError(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  const body = await response.json();
  assertEquals(response.status, status);
  assertEquals(body.error?.code, code);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}.`);
  }
}
