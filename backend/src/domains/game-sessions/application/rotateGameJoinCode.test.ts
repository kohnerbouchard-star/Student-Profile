import {
  AdminMutationError,
  type AdminMutationRpcClient,
} from "../../../platform/supabase/adminMutation.ts";
import { rotateGameJoinCode } from "./rotateGameJoinCode.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";
const UPDATED_AT = "2026-08-05T03:00:00.000Z";

Deno.test("join-code rotation invokes the atomic mutation RPC with server scope", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const result = await rotateGameJoinCode(
    fakeClient(calls, {
      data: [{
        response_status: 200,
        response_body: {
          joinCode: {
            game_join_code: "ECO-ROTATED-043",
            game_join_code_status: "active",
            updated_at: UPDATED_AT,
          },
        },
        was_replayed: true,
      }],
      error: null,
    }),
    {
      gameSessionId: GAME_ID,
      staffUserId: STAFF_ID,
      requestBody: { source: "admin_share_panel" },
      mutation: {
        idempotencyKey: "join-code-command-001",
        requestId: "request-join-code-001",
      },
    },
  );

  assertEquals(calls, [{
    name: "admin_rotate_game_join_code_v1",
    args: {
      p_game_session_id: GAME_ID,
      p_staff_user_id: STAFF_ID,
      p_request_payload: { source: "admin_share_panel" },
      p_idempotency_key: "join-code-command-001",
      p_request_id: "request-join-code-001",
    },
  }]);
  assertEquals(result, {
    status: 200,
    replayed: true,
    joinCode: {
      gameJoinCode: "ECO-ROTATED-043",
      status: "active",
      updatedAt: UPDATED_AT,
    },
  });
});

Deno.test("join-code rotation maps same-key different-payload conflict to 409", async () => {
  let failure: AdminMutationError | null = null;
  try {
    await rotateGameJoinCode(
      fakeClient([], {
        data: null,
        error: { message: "ADMIN_MUTATION_IDEMPOTENCY_CONFLICT" },
      }),
      {
        gameSessionId: GAME_ID,
        staffUserId: STAFF_ID,
        requestBody: {},
        mutation: {
          idempotencyKey: "join-code-command-001",
          requestId: "request-join-code-002",
        },
      },
    );
  } catch (error) {
    failure = error instanceof AdminMutationError ? error : null;
  }
  assertEquals(failure?.status, 409);
  assertEquals(failure?.code, "idempotency_key_conflict");
});

Deno.test("join-code rotation maps database failure to a non-200 error", async () => {
  let failure: AdminMutationError | null = null;
  try {
    await rotateGameJoinCode(
      fakeClient([], {
        data: null,
        error: { message: "private database connection failure" },
      }),
      {
        gameSessionId: GAME_ID,
        staffUserId: STAFF_ID,
        requestBody: {},
        mutation: {
          idempotencyKey: "join-code-command-005",
          requestId: "request-join-code-005",
        },
      },
    );
  } catch (error) {
    failure = error instanceof AdminMutationError ? error : null;
  }
  assertEquals(failure?.status, 500);
  assertEquals(failure?.code, "join_code_reset_failed");
  assertEquals(failure?.message.includes("private database"), false);
});

Deno.test("join-code rotation maps database owner-scope rejection to 404", async () => {
  let failure: AdminMutationError | null = null;
  try {
    await rotateGameJoinCode(
      fakeClient([], {
        data: null,
        error: { message: "ADMIN_MUTATION_GAME_NOT_OWNED" },
      }),
      {
        gameSessionId: GAME_ID,
        staffUserId: STAFF_ID,
        requestBody: {},
        mutation: {
          idempotencyKey: "join-code-command-006",
          requestId: "request-join-code-006",
        },
      },
    );
  } catch (error) {
    failure = error instanceof AdminMutationError ? error : null;
  }
  assertEquals(failure?.status, 404);
  assertEquals(failure?.code, "game_not_found");
});

Deno.test("join-code rotation rejects browser mutation fields before RPC", async () => {
  let calls = 0;
  const client: AdminMutationRpcClient = {
    rpc<T>() {
      calls += 1;
      return Promise.resolve({ data: null as T | null, error: null });
    },
  };
  let status = 0;
  try {
    await rotateGameJoinCode(client, {
      gameSessionId: GAME_ID,
      staffUserId: STAFF_ID,
      requestBody: { staffUserId: "browser-chosen" },
      mutation: {
        idempotencyKey: "join-code-command-003",
        requestId: "join-code-command-003",
      },
    });
  } catch (error) {
    status = error instanceof AdminMutationError ? error.status : 0;
  }
  assertEquals(status, 400);
  assertEquals(calls, 0);
});

Deno.test("join-code rotation rejects unrecognized request metadata before RPC", async () => {
  let calls = 0;
  const client: AdminMutationRpcClient = {
    rpc<T>() {
      calls += 1;
      return Promise.resolve({ data: null as T | null, error: null });
    },
  };
  let status = 0;
  try {
    await rotateGameJoinCode(client, {
      gameSessionId: GAME_ID,
      staffUserId: STAFF_ID,
      requestBody: {
        meta: { idempotencyKey: "join-code-command-004", note: "different" },
      },
      mutation: {
        idempotencyKey: "join-code-command-004",
        requestId: "join-code-command-004",
      },
    });
  } catch (error) {
    status = error instanceof AdminMutationError ? error.status : 0;
  }
  assertEquals(status, 400);
  assertEquals(calls, 0);
});

function fakeClient(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
  response: {
    readonly data: unknown;
    readonly error:
      | { readonly message?: string; readonly code?: string }
      | null;
  },
): AdminMutationRpcClient {
  return {
    rpc<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve(
        response as {
          readonly data: T | null;
          readonly error: typeof response.error;
        },
      );
    },
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)}\nExpected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
