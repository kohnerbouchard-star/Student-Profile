import { handlePlayerContractPublicSubmitRequest } from "./playerContractPublicSubmitHttpHandler.ts";
import { readPlayerContractPublicSubmitRoutePath } from "./playerContractPublicSubmitRoutePaths.ts";
import type {
  ContractRepository,
  GameSessionContractRecord,
  PlayerContractProgressRecord,
} from "../contracts/contractRepositoryContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const CONTRACT_ID = "00000000-0000-4000-8000-000000000101";
const PROGRESS_ID = "00000000-0000-4000-8000-000000000201";
const STAFF_ID = "00000000-0000-4000-8000-000000000301";
const CONTRACT_KEY = "arrival-orientation";
const NOW = "2026-07-19T01:00:00.000Z";

Deno.test("public Player Contract submission parser accepts only exact direct and Edge public-key routes", () => {
  assertEquals(
    readPlayerContractPublicSubmitRoutePath(
      `/players/me/contracts/${CONTRACT_KEY}/submit`,
    ),
    { kind: "submit", contractKey: CONTRACT_KEY },
  );
  assertEquals(
    readPlayerContractPublicSubmitRoutePath(
      `/functions/v1/classroom-api/players/me/contracts/${CONTRACT_KEY}/submit`,
    ),
    { kind: "submit", contractKey: CONTRACT_KEY },
  );
  assertEquals(
    readPlayerContractPublicSubmitRoutePath(
      `/spoof/players/me/contracts/${CONTRACT_KEY}/submit`,
    ),
    null,
  );
  assertEquals(
    readPlayerContractPublicSubmitRoutePath(
      "/players/me/contracts/not%2Fa%2Fkey/submit",
    ),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerContractPublicSubmitRoutePath(
      `/players/me/contracts/${CONTRACT_KEY}/extra`,
    ),
    { kind: "malformed" },
  );
});

Deno.test("public Player Contract submission derives scope, requires acceptance, and returns no UUIDs", async () => {
  const captured = {
    available: [] as unknown[],
    progress: [] as unknown[],
    upsert: [] as unknown[],
  };
  const repository = repositoryFor({
    existingProgress: progressRecord({
      status: "in_progress",
      resultPayload: {
        feedback: "Add one comparison.",
        reviewedByStaffId: STAFF_ID,
      },
    }),
    capture: captured,
  });
  const response = await handlePlayerContractPublicSubmitRequest(
    request({
      body: {
        evidencePayload: {
          submissionUrl: "https://example.test/evidence",
          note: "Completed revision.",
        },
      },
    }),
    { kind: "submit", contractKey: CONTRACT_KEY },
    dependencies(repository),
  );
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.contract.contractKey, CONTRACT_KEY);
  assertEquals(body.progress.contractKey, CONTRACT_KEY);
  assertEquals(body.progress.status, "submitted");
  assertEquals(captured.available[0], {
    gameSessionId: GAME_ID,
    playerId: PLAYER_ID,
    countryCode: "ELD",
    rosterLabel: "A-1",
  });
  assertEquals(captured.progress[0], {
    gameSessionId: GAME_ID,
    contractId: CONTRACT_ID,
    playerId: PLAYER_ID,
  });
  assertEquals(captured.upsert[0], {
    gameSessionId: GAME_ID,
    contractId: CONTRACT_ID,
    playerId: PLAYER_ID,
    status: "submitted",
    evidencePayload: {
      submissionUrl: "https://example.test/evidence",
      note: "Completed revision.",
    },
    resultPayload: {
      feedback: "Add one comparison.",
      reviewedByStaffId: STAFF_ID,
    },
    submittedAt: NOW,
  });

  for (const privateValue of [
    GAME_ID,
    SESSION_ID,
    PLAYER_ID,
    CONTRACT_ID,
    PROGRESS_ID,
    STAFF_ID,
    "private-answer",
  ]) {
    assert(
      !serialized.includes(privateValue),
      `Public submission response must not expose ${privateValue}.`,
    );
  }
});

Deno.test("public Player Contract submission rejects browser scope and malformed evidence", async () => {
  const repository = repositoryFor({
    existingProgress: progressRecord({ status: "in_progress" }),
  });
  const cases = [
    request({ query: `gameSessionId=${GAME_ID}` }),
    request({ headers: { "x-game-session-id": GAME_ID } }),
    request({ headers: { "x-player-id": PLAYER_ID } }),
    request({ body: { gameSessionId: GAME_ID, evidencePayload: {} } }),
    request({ body: { contractKey: CONTRACT_KEY, evidencePayload: {} } }),
    request({ body: { evidencePayload: [] } }),
    request({ rawBody: "{not-json" }),
  ];

  for (const scopedRequest of cases) {
    const response = await handlePlayerContractPublicSubmitRequest(
      scopedRequest,
      { kind: "submit", contractKey: CONTRACT_KEY },
      dependencies(repository),
    );
    await assertError(response, 400, "invalid_player_contract_submit_request");
  }

  const missing = await handlePlayerContractPublicSubmitRequest(
    request({ token: "" }),
    { kind: "submit", contractKey: CONTRACT_KEY },
    dependencies(repository),
  );
  await assertError(missing, 401, "invalid_player_session");

  const invalid = await handlePlayerContractPublicSubmitRequest(
    request(),
    { kind: "submit", contractKey: CONTRACT_KEY },
    dependencies(repository, { sessionValid: false }),
  );
  await assertError(invalid, 401, "invalid_player_session");
});

Deno.test("public Player Contract submission enforces accepted, available, and unlocked progress", async () => {
  const notAccepted = await handlePlayerContractPublicSubmitRequest(
    request(),
    { kind: "submit", contractKey: CONTRACT_KEY },
    dependencies(repositoryFor({ existingProgress: null })),
  );
  await assertError(notAccepted, 409, "contract_not_accepted");

  const unavailable = await handlePlayerContractPublicSubmitRequest(
    request(),
    { kind: "submit", contractKey: "unavailable-contract" },
    dependencies(repositoryFor({
      existingProgress: progressRecord({ status: "in_progress" }),
    })),
  );
  await assertError(unavailable, 404, "contract_not_available");

  for (const status of ["completed", "expired", "failed", "dismissed"]) {
    const response = await handlePlayerContractPublicSubmitRequest(
      request(),
      { kind: "submit", contractKey: CONTRACT_KEY },
      dependencies(repositoryFor({
        existingProgress: progressRecord({ status }),
      })),
    );
    await assertError(response, 409, "contract_progress_locked");
  }

  for (const status of ["in_progress", "submitted"]) {
    const response = await handlePlayerContractPublicSubmitRequest(
      request({ body: { evidencePayload: { note: `retry:${status}` } } }),
      { kind: "submit", contractKey: CONTRACT_KEY },
      dependencies(repositoryFor({
        existingProgress: progressRecord({ status }),
      })),
    );
    assertEquals(response.status, 200);
    assertEquals((await response.json()).progress.status, "submitted");
  }
});

// REF-030b characterizes parsing before extraction, including existing error precedence.
Deno.test("REF030 bounded JSON thresholds preserve empty/null bodies and verbatim evidence", async () => {
  const nested = (depth: number): unknown => depth ? { n: nested(depth - 1) } : {};
  const fields = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`f${i}`, null]));
  const cases: Array<[string, number, string?]> = [
    ["", 200], [" ".repeat(20_001), 200], ["{}", 200], ['{"evidencePayload":null}', 200],
    [JSON.stringify({ evidencePayload: { text: "x".repeat(4_000), list: Array(200).fill(null) } }), 200],
    [JSON.stringify({ evidencePayload: fields(80) }), 200],
    [JSON.stringify({ evidencePayload: nested(8) }), 200],
    [JSON.stringify({ evidencePayload: { text: "x".repeat(4_001) } }), 400, "Contract evidence text is too long."],
    [JSON.stringify({ evidencePayload: { list: Array(201).fill(null) } }), 400, "Contract evidence contains too many entries."],
    [JSON.stringify({ evidencePayload: fields(81) }), 400, "Contract evidence contains too many fields."],
    [JSON.stringify({ evidencePayload: nested(9) }), 400, "Contract evidence is too deeply nested."],
    ['{"evidencePayload":{"number":1e400}}', 400, "Contract evidence contains an invalid number."],
    ['{"evidencePayload":{"constructor":null}}', 400, "Contract evidence contains an invalid field."],
    ['{"evidencePayload":{"__proto__":null}}', 400, "Contract evidence contains an invalid field."],
    ['{"evidencePayload":{"prototype":null}}', 400, "Contract evidence contains an invalid field."],
    [JSON.stringify({ evidencePayload: { text: "x".repeat(20_001) } }), 400, "Contract evidence is too large."],
  ];
  for (const [rawBody, status, message] of cases) {
    const capture = { available: [], progress: [], upsert: [] } as { available: unknown[]; progress: unknown[]; upsert: Array<{ evidencePayload: unknown }> };
    const response = await handlePlayerContractPublicSubmitRequest(request({ rawBody }),
      { kind: "submit", contractKey: CONTRACT_KEY }, dependencies(repositoryFor({ existingProgress: progressRecord(), capture })));
    assertEquals(response.status, status);
    if (message) { assertEquals((await response.json()).error.message, message); assertEquals(capture.upsert.length, 0); }
    else { assertEquals(capture.upsert.length, 1); assertEquals(capture.upsert[0].evidencePayload, rawBody.trim() ? JSON.parse(rawBody).evidencePayload ?? {} : {}); }
  }
});

Deno.test("REF030 malformed transport wins before missing session or configuration", async () => {
  let calls = 0;
  const deps = { ...dependencies(repositoryFor({ existingProgress: null })),
    readSupabaseEnv: () => { calls++; throw new Error("must not resolve config"); } };
  for (const rawBody of ['{', '[]', '{"extra":1}', '{"evidencePayload":false}']) {
    await assertError(await handlePlayerContractPublicSubmitRequest(request({ rawBody, token: "" }),
      { kind: "submit", contractKey: CONTRACT_KEY }, deps), 400, "invalid_player_contract_submit_request");
  }
  await assertError(await handlePlayerContractPublicSubmitRequest(request({ rawBody: '{}', token: "" }),
    { kind: "submit", contractKey: CONTRACT_KEY }, deps), 401, "invalid_player_session");
  assertEquals(calls, 0);
});

function request(options: {
  readonly token?: string;
  readonly query?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly rawBody?: string;
} = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.token !== "") {
    headers.set("x-player-session-token", options.token ?? "player-token");
  }
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    headers.set(key, value);
  }
  const init: RequestInit = { method: "POST", headers };
  if (options.rawBody !== undefined) init.body = options.rawBody;
  else init.body = JSON.stringify(options.body ?? { evidencePayload: {} });
  const query = options.query ? `?${options.query}` : "";
  return new Request(
    `https://example.test/players/me/contracts/${CONTRACT_KEY}/submit${query}`,
    init,
  );
}

function dependencies(
  repository: ContractRepository,
  options: { readonly sessionValid?: boolean } = {},
) {
  return {
    readSupabaseEnv: () => ({ ok: true as const, value: {} as never }),
    createServiceClient: () => ({} as never),
    hashSessionToken: async () => "hash",
    resolvePlayerCountryCode: async () => "ELD",
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
        gameSession: { id: GAME_ID, name: "Game", status: "active" },
        player: {
          id: PLAYER_ID,
          display_name: "Player",
          roster_label: "A-1",
          status: "active",
        },
      },
    createRepository: () => repository,
    now: () => NOW,
  };
}

function repositoryFor(options: {
  readonly existingProgress: PlayerContractProgressRecord | null;
  readonly capture?: {
    readonly available: unknown[];
    readonly progress: unknown[];
    readonly upsert: unknown[];
  };
}): ContractRepository {
  const contract = contractRecord();
  return {
    listPlayerAvailableContracts: async (input: unknown) => {
      options.capture?.available.push(input);
      return [contract];
    },
    listGameSessionContracts: async () => [],
    getPlayerContractProgress: async (input: unknown) => {
      options.capture?.progress.push(input);
      return options.existingProgress;
    },
    upsertPlayerContractProgress: async (input: any) => {
      options.capture?.upsert.push(input);
      return progressRecord({
        status: input.status,
        evidencePayload: input.evidencePayload,
        resultPayload: input.resultPayload,
        submittedAt: input.submittedAt,
      });
    },
  } as unknown as ContractRepository;
}

function contractRecord(): GameSessionContractRecord {
  return {
    id: CONTRACT_ID,
    gameSessionId: GAME_ID,
    contractTemplateId: null,
    contractKey: CONTRACT_KEY,
    sourceType: "teacher",
    sourceId: STAFF_ID,
    createdByStaffId: STAFF_ID,
    title: "Arrival orientation",
    description: "Review the national economy.",
    instructions: "Submit a short response.",
    category: "orientation",
    status: "active",
    visibility: "public",
    targetingPayload: {},
    requirementsPayload: {
      items: [{ label: "Read the briefing", answerKey: "private-answer" }],
    },
    rewardPayload: { cashAmount: 25, currencyCode: "ECO" },
    completionMode: "manual_review",
    publishedAt: "2026-07-18T00:00:00.000Z",
    deadlineAt: "2026-07-21T00:00:00.000Z",
    expiresAt: "2026-07-22T00:00:00.000Z",
    metadata: { issuer: "Immigration Office", createdByStaffId: STAFF_ID },
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: NOW,
  };
}

function progressRecord(
  overrides: Partial<PlayerContractProgressRecord> = {},
): PlayerContractProgressRecord {
  return {
    id: PROGRESS_ID,
    gameSessionId: GAME_ID,
    contractId: CONTRACT_ID,
    playerId: PLAYER_ID,
    status: "in_progress",
    evidencePayload: {},
    resultPayload: {},
    submittedAt: null,
    completedAt: null,
    rewardIssuedAt: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: NOW,
    ...overrides,
  };
}

async function assertError(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  assertEquals(response.status, status);
  assertEquals((await response.json()).error.code, code);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
