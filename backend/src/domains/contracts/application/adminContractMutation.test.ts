import {
  AdminMutationError,
  type AdminMutationRpcClient,
} from "../../../platform/supabase/adminMutation.ts";
import { mutateAdminContract } from "./adminContractMutation.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const STAFF_USER_ID = "00000000-0000-4000-8000-000000000002";
const CONTRACT_ID = "00000000-0000-4000-8000-000000000003";
const NOW = "2026-08-05T12:30:00.000Z";
const IDENTITY = {
  idempotencyKey: "contract-mutation-test-key",
  requestId: "contract-mutation-request",
};

Deno.test("admin Contract create derives game and staff RPC authority", async () => {
  const client = new FakeMutationClient(successRow(contractRow()));
  const result = await mutateAdminContract(client, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    operation: "create",
    body: {
      gameSessionId: "00000000-0000-4000-8000-000000000099",
      contractKey: "trade-drive",
      title: " Trade Drive ",
      description: "Create an export plan.",
      instructions: "Submit the plan.",
      category: "trade",
      status: "scheduled",
      visibility: "targeted",
      targetingPayload: { countryCodes: ["NRC"] },
      requirementsPayload: {},
      rewardPayload: { cash: { amount: 10 } },
      completionMode: "manual_review",
      metadata: { source: "teacher" },
    },
    identity: IDENTITY,
  });

  assertEquals(result.status, 201);
  assertEquals(result.contract.gameSessionId, GAME_SESSION_ID);
  assertEquals(client.calls[0]?.name, "admin_mutate_contract_v1");
  assertEquals(client.calls[0]?.args.p_game_session_id, GAME_SESSION_ID);
  assertEquals(client.calls[0]?.args.p_staff_user_id, STAFF_USER_ID);
  assertEquals(client.calls[0]?.args.p_contract_id, null);
  const payload = client.calls[0]?.args.p_contract_payload as Record<
    string,
    unknown
  >;
  assertEquals(payload.gameSessionId, undefined);
  assertEquals(payload.createdByStaffId, undefined);
  assertEquals(payload.contractKey, "trade-drive");
  assertEquals(payload.sourceType, "teacher");
  assertEquals(payload.status, "scheduled");
  assertEquals(
    client.calls[0]?.args.p_idempotency_key,
    IDENTITY.idempotencyKey,
  );
  assertEquals(client.calls[0]?.args.p_request_id, IDENTITY.requestId);
});

Deno.test("admin Contract publish keeps retry fingerprint stable", async () => {
  const client = new FakeMutationClient(successRow(
    contractRow({
      status: "active",
      published_at: NOW,
    }),
    200,
    true,
  ));

  const result = await mutateAdminContract(client, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    operation: "publish",
    contractId: CONTRACT_ID,
    body: {},
    identity: IDENTITY,
  }, {
    now: () => NOW,
  });

  assertEquals(result.status, 200);
  assertEquals(result.replayed, true);
  assertEquals(result.contract.status, "active");
  assertEquals(client.calls[0]?.args.p_contract_id, CONTRACT_ID);
  assertEquals(client.calls[0]?.args.p_contract_payload, { publishedAt: NOW });
  assertEquals(client.calls[0]?.args.p_request_payload, {
    operation: "publish",
    contractId: CONTRACT_ID,
    contract: { publishedAt: null },
  });
});

Deno.test("admin Contract archive uses the shared transactional RPC", async () => {
  const client = new FakeMutationClient(successRow(
    contractRow({ status: "archived" }),
    200,
    false,
    { alreadyArchived: false },
  ));

  const result = await mutateAdminContract(client, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    operation: "archive",
    contractId: CONTRACT_ID,
    body: { ignoredBrowserField: true },
    identity: IDENTITY,
  });

  assertEquals(result.status, 200);
  assertEquals(result.contract.status, "archived");
  assertEquals(result.alreadyArchived, false);
  assertEquals(client.calls[0]?.args.p_operation, "archive");
  assertEquals(client.calls[0]?.args.p_contract_id, CONTRACT_ID);
  assertEquals(client.calls[0]?.args.p_contract_payload, {});
  assertEquals(client.calls[0]?.args.p_request_payload, {
    operation: "archive",
    contractId: CONTRACT_ID,
    contract: {},
  });
});

Deno.test("admin Contract duplicate returns the persisted source identity", async () => {
  const duplicateId = "00000000-0000-4000-8000-000000000004";
  const client = new FakeMutationClient(successRow(
    contractRow({ id: duplicateId, contract_key: "trade-drive-copy" }),
    201,
    true,
    { sourceContractId: CONTRACT_ID },
  ));

  const result = await mutateAdminContract(client, {
    gameSessionId: GAME_SESSION_ID,
    staffUserId: STAFF_USER_ID,
    operation: "duplicate",
    contractId: CONTRACT_ID,
    body: {},
    identity: IDENTITY,
  });

  assertEquals(result.status, 201);
  assertEquals(result.replayed, true);
  assertEquals(result.contract.contractId, duplicateId);
  assertEquals(result.sourceContractId, CONTRACT_ID);
  assertEquals(client.calls[0]?.args.p_operation, "duplicate");
  assertEquals(client.calls[0]?.args.p_contract_payload, {});
});

Deno.test("admin Contract rejects browser-supplied staff authority", async () => {
  const client = new FakeMutationClient(successRow(contractRow()));

  await assertMutationError(
    () =>
      mutateAdminContract(client, {
        gameSessionId: GAME_SESSION_ID,
        staffUserId: STAFF_USER_ID,
        operation: "create",
        body: {
          ...createBody(),
          createdByStaffId: "00000000-0000-4000-8000-000000000099",
        },
        identity: IDENTITY,
      }),
    400,
    "created_by_staff_id_not_allowed",
  );
  assertEquals(client.calls.length, 0);
});

Deno.test("admin Contract maps key reuse with another payload to 409", async () => {
  const client = new FakeMutationClient({
    data: null,
    error: { message: "ADMIN_MUTATION_IDEMPOTENCY_CONFLICT" },
  });

  await assertMutationError(
    () =>
      mutateAdminContract(client, {
        gameSessionId: GAME_SESSION_ID,
        staffUserId: STAFF_USER_ID,
        operation: "create",
        body: createBody(),
        identity: IDENTITY,
      }),
    409,
    "idempotency_key_conflict",
  );
});

Deno.test("admin Contract database failure never returns a success result", async () => {
  const client = new FakeMutationClient({
    data: null,
    error: { message: "database connection failed" },
  });

  await assertMutationError(
    () =>
      mutateAdminContract(client, {
        gameSessionId: GAME_SESSION_ID,
        staffUserId: STAFF_USER_ID,
        operation: "publish",
        contractId: CONTRACT_ID,
        body: { publishedAt: NOW },
        identity: IDENTITY,
      }),
    500,
    "contract_mutation_failed",
  );
});

class FakeMutationClient implements AdminMutationRpcClient {
  readonly calls: Array<{
    readonly name: string;
    readonly args: Record<string, unknown>;
  }> = [];

  constructor(
    private readonly response: {
      readonly data: unknown;
      readonly error: { readonly message: string } | null;
    },
  ) {}

  rpc<T>(name: string, args: Record<string, unknown>): Promise<{
    readonly data: T | null;
    readonly error: { readonly message: string } | null;
  }> {
    this.calls.push({ name, args });
    return Promise.resolve({
      data: this.response.data as T | null,
      error: this.response.error,
    });
  }
}

function createBody(): Record<string, unknown> {
  return {
    contractKey: "trade-drive",
    title: "Trade Drive",
    description: "Create an export plan.",
    instructions: "Submit the plan.",
  };
}

function successRow(
  contract: Record<string, unknown>,
  status = 201,
  replayed = false,
  response: Record<string, unknown> = {},
) {
  return {
    data: [{
      response_status: status,
      response_body: { contract, ...response },
      was_replayed: replayed,
    }],
    error: null,
  };
}

function contractRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: CONTRACT_ID,
    game_session_id: GAME_SESSION_ID,
    contract_template_id: null,
    contract_key: "trade-drive",
    source_type: "teacher",
    source_id: null,
    created_by_staff_id: STAFF_USER_ID,
    title: "Trade Drive",
    description: "Create an export plan.",
    instructions: "Submit the plan.",
    category: "trade",
    status: "draft",
    visibility: "public",
    targeting_payload: {},
    requirements_payload: {},
    reward_payload: {},
    completion_mode: "manual_review",
    published_at: null,
    deadline_at: null,
    expires_at: null,
    metadata: {},
    created_at: "2026-08-05T00:00:00.000Z",
    updated_at: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

async function assertMutationError(
  run: () => Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof AdminMutationError)) {
      throw error;
    }
    assertEquals(error.status, status);
    assertEquals(error.code, code);
    return;
  }

  throw new Error("Expected AdminMutationError.");
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
