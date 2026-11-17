import {
  contractErrorToResponse,
  handleStaffContractRequest,
  listStaffContractProgress,
  reviewStaffContractProgress,
  type StaffContractHttpHandlerDependencies,
} from "./staffContractHttpHandler.ts";
import type { StaffContractRoute } from "./contractRoutePaths.ts";
import type {
  ContractRepository,
  GameSessionContractRecord,
  PlayerContractProgressRecord,
} from "../contracts/contractRepositoryContracts.ts";
import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";

declare const Deno: { test(name: string, run: () => Promise<void>): void };
const gameSessionId = "00000000-0000-4000-8000-000000000001";
const contractId = "00000000-0000-4000-8000-000000000002";
const progressId = "00000000-0000-4000-8000-000000000003";
const now = "2026-06-25T12:30:00.000Z";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}

function fixture(options: {
  missingContract?: boolean;
  missingProgress?: boolean;
  status?: PlayerContractProgressRecord["status"];
  issued?: boolean;
  authDenied?: boolean;
  ownerDenied?: boolean;
  markMissing?: boolean;
} = {}) {
  const trace: unknown[] = [];
  const contract = {
    id: contractId,
    gameSessionId,
    contractKey: "characterization",
    title: "Characterization",
    status: "active",
    visibility: "public",
    sourceType: "teacher",
    rewardPayload: { cash: { amount: 5, currencyCode: "ECO" } },
    contractTemplateId: null,
    sourceId: null,
    createdByStaffId: "server-staff",
    description: "Description",
    instructions: "Instructions",
    category: "trade",
    targetingPayload: {},
    requirementsPayload: {},
    completionMode: "manual_review",
    publishedAt: now,
    deadlineAt: null,
    expiresAt: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
  } satisfies GameSessionContractRecord;
  const progress = {
    id: progressId,
    gameSessionId,
    contractId,
    playerId: "server-player",
    status: options.status ?? "completed",
    rewardIssuedAt: options.issued ? now : null,
    evidencePayload: {},
    resultPayload: {},
  } as PlayerContractProgressRecord;
  const repository = {
    getGameSessionContractById: async (input: unknown) => {
      trace.push(["contract", input]);
      return options.missingContract ? null : contract;
    },
    getContractProgressById: async (input: unknown) => {
      trace.push(["progress", input]);
      return options.missingProgress ? null : progress;
    },
    listGameSessionContracts: async (input: unknown) => {
      trace.push(["list", input]);
      return [];
    },
    markContractRewardIssued: async (input: unknown) => {
      trace.push(["mark", input]);
      return options.markMissing ? null : { ...progress, rewardIssuedAt: now };
    },
  } as unknown as ContractRepository;
  const query = {
    select: () => query,
    eq: (key: string, value: string) => {
      trace.push([key, value]);
      return query;
    },
    maybeSingle: async () => ({
      data: options.ownerDenied ? null : { id: gameSessionId },
      error: null,
    }),
  };
  const dependencies: StaffContractHttpHandlerDependencies = {
    readSupabaseEnv: () => {
      trace.push("env");
      return {
        ok: true,
        value: {
          supabaseUrl: "https://example.test",
          supabaseAnonKey: "anon",
          supabaseServiceRoleKey: "test",
        },
      };
    },
    resolveStaffForRequest: async () => {
      trace.push("auth");
      if (options.authDenied) {
        return {
          ok: false,
          status: 401,
          error: { code: "auth_denied", message: "Denied", retryable: false },
        };
      }
      return {
        ok: true,
        staff: { id: "server-staff" },
        serviceClient: {
          from: () => {
            trace.push("owner");
            return query;
          },
        } as never,
      };
    },
    createRepository: () => {
      trace.push("repository");
      return repository;
    },
    createRewardLedgerWriter: () => ({
      recordCashReward: async (input) => {
        trace.push(["ledger", input]);
        return { id: "ledger-result" };
      },
    }),
    now: () => now,
  };
  return { trace, repository, dependencies };
}

const prefix = ["env", "auth", "owner", ["id", gameSessionId], [
  "owner_staff_user_id",
  "server-staff",
], "repository"];
function request(body?: string, query = "", method = "POST") {
  return new Request(`https://example.test/contracts${query}`, {
    method,
    ...(body === undefined ? {} : { body }),
  });
}
function route(kind: StaffContractRoute["kind"]): StaffContractRoute {
  return { kind, gameSessionId, contractId, progressId } as StaffContractRoute;
}
async function error(response: Response, status: number, code: string) {
  equal(response.status, status);
  equal((await response.json()).error.code, code);
}

Deno.test("staff extraction: method validation precedes configuration and authentication", async () => {
  for (
    const kind of [
      "contracts",
      "publish",
      "progress",
      "review",
      "issueRewards",
    ] as const
  ) {
    const f = fixture();
    await error(
      await handleStaffContractRequest(
        request(undefined, "", "DELETE"),
        route(kind),
        f.dependencies,
      ),
      405,
      "method_not_allowed",
    );
    equal(f.trace, []);
  }
});

Deno.test("staff extraction: authentication and ownership precede invalid query parsing", async () => {
  for (const ownerDenied of [false, true]) {
    const f = fixture({ authDenied: !ownerDenied, ownerDenied });
    await error(
      await handleStaffContractRequest(
        request(undefined, "?status=invalid", "GET"),
        route("contracts"),
        f.dependencies,
      ),
      ownerDenied ? 404 : 401,
      ownerDenied ? "game_session_not_found" : "auth_denied",
    );
    equal(f.trace, ownerDenied ? prefix.slice(0, -1) : ["env", "auth"]);
  }
});

Deno.test("staff extraction: repeated and comma-separated list filters retain ordering and duplicates", async () => {
  const f = fixture();
  const response = await handleStaffContractRequest(
    request(
      undefined,
      "?status=active,draft&status=active&sourceType=teacher&visibility=public",
      "GET",
    ),
    route("contracts"),
    f.dependencies,
  );
  equal(response.status, 200);
  equal(f.trace, [...prefix, ["list", {
    gameSessionId,
    statuses: ["active", "draft", "active"],
    sourceTypes: ["teacher"],
    visibility: "public",
  }]]);
});

Deno.test("staff extraction: review validation precedence prevents repository reads", async () => {
  const cases = [
    ["", "invalid_contract_request_body"],
    ["[]", "invalid_contract_request_body"],
    ["{", "invalid_contract_request_body"],
    [
      JSON.stringify({ staffId: null, issueRewardNow: true }),
      "staff_id_not_allowed",
    ],
    [
      JSON.stringify({ issueRewardNow: true, action: "invalid" }),
      "issue_reward_now_not_supported",
    ],
    [
      JSON.stringify({ action: "invalid", resultPayload: [] }),
      "invalid_contract_review_action",
    ],
    [
      JSON.stringify({ action: "approve", resultPayload: [] }),
      "invalid_contract_request",
    ],
  ];
  for (const [body, code] of cases) {
    const f = fixture();
    await error(
      await handleStaffContractRequest(
        request(body),
        route("review"),
        f.dependencies,
      ),
      400,
      code,
    );
    equal(f.trace, prefix);
  }
});

Deno.test("staff extraction: direct progress export reads contract before filters", async () => {
  const f = fixture({ missingContract: true });
  try {
    await listStaffContractProgress(
      request(undefined, "?playerId=invalid", "GET"),
      gameSessionId,
      contractId,
      f.repository,
    );
    throw new Error("Expected rejection");
  } catch (caught) {
    await error(contractErrorToResponse(caught), 404, "contract_not_found");
  }
  equal(f.trace, [["contract", { gameSessionId, contractId }]]);
});

Deno.test("staff extraction: direct review export preserves thrown validation errors", async () => {
  const f = fixture();
  try {
    await reviewStaffContractProgress(
      request("null"),
      gameSessionId,
      contractId,
      progressId,
      f.repository,
      now,
    );
    throw new Error("Expected rejection");
  } catch (caught) {
    equal(caught instanceof EdgeActivationError, true);
    await error(
      contractErrorToResponse(caught),
      400,
      "invalid_contract_request_body",
    );
  }
  equal(f.trace, []);
});

Deno.test("staff extraction: reward gates preserve read order and suppress writes", async () => {
  for (
    const options of [{ missingProgress: true }, {
      status: "submitted" as const,
    }, { issued: true }]
  ) {
    const f = fixture(options);
    const response = await handleStaffContractRequest(
      request("invalid JSON is intentionally unread"),
      route("issueRewards"),
      f.dependencies,
    );
    if ("issued" in options) {
      equal(response.status, 200);
      const body = await response.json();
      equal([body.rewardIssued, body.alreadyIssued], [false, true]);
    } else {
      await error(
        response,
        "missingProgress" in options ? 404 : 409,
        "missingProgress" in options
          ? "contract_progress_not_found"
          : "contract_progress_not_completed",
      );
    }
    equal(f.trace, [...prefix, ["contract", { gameSessionId, contractId }], [
      "progress",
      { gameSessionId, contractId, progressId },
    ]]);
  }
});

Deno.test("staff extraction: rewards use server scope and deterministic key before marking", async () => {
  for (const markMissing of [false, true]) {
    const f = fixture({ markMissing });
    const response = await handleStaffContractRequest(
      request(
        JSON.stringify({
          playerId: "forged",
          staffId: "forged",
          requestId: "forged",
        }),
      ),
      route("issueRewards"),
      f.dependencies,
    );
    if (markMissing) await error(response, 409, "contract_reward_mark_failed");
    else equal(response.status, 200);
    equal(f.trace.slice(6, 10), [
      ["contract", { gameSessionId, contractId }],
      ["progress", { gameSessionId, contractId, progressId }],
      ["ledger", {
        gameSessionId,
        contractId,
        progressId,
        playerId: "server-player",
        amount: 5,
        accountType: "checking",
        currencyCode: "ECO",
        staffId: "server-staff",
        requestId:
          `contract_reward:${gameSessionId}:${contractId}:${progressId}`,
        issuedAt: now,
      }],
      ["mark", { gameSessionId, contractId, progressId, rewardIssuedAt: now }],
    ]);
    equal(f.trace.length, markMissing ? 11 : 10);
  }
});
