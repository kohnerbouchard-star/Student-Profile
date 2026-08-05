import {
  AdminMutationError,
  type AdminMutationRpcClient,
  executeAdminMutationRpc,
  readAdminMutationIdentity,
} from "./adminMutation.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Admin mutation identity requires one stable matching key", () => {
  const request = new Request("https://example.test/admin", {
    method: "POST",
    headers: {
      "Idempotency-Key": "stable-command-001",
      "X-Idempotency-Key": "stable-command-001",
      "X-Request-Id": "request-command-001",
    },
  });
  assertEquals(
    readAdminMutationIdentity(request, {
      idempotencyKey: "stable-command-001",
    }),
    {
      idempotencyKey: "stable-command-001",
      requestId: "request-command-001",
    },
  );

  assertAdminError(
    () =>
      readAdminMutationIdentity(
        new Request("https://example.test/admin", {
          headers: {
            "Idempotency-Key": "stable-command-001",
            "X-Idempotency-Key": "different-command-002",
          },
        }),
        {},
      ),
    400,
    "idempotency_key_header_mismatch",
  );
});

Deno.test("Admin mutation replay returns the original successful result", async () => {
  const client = fakeClient({
    data: [{
      response_status: 201,
      response_body: { resource: { id: "resource-1" } },
      was_replayed: true,
    }],
    error: null,
  });
  const result = await executeAdminMutationRpc(
    client,
    "admin_example_v1",
    {},
    { code: "example_failed", message: "Example failed." },
  );
  assertEquals(result, {
    status: 201,
    body: { resource: { id: "resource-1" } },
    replayed: true,
  });
});

Deno.test("Admin mutation maps divergent key reuse to HTTP 409", async () => {
  const client = fakeClient({
    data: null,
    error: { message: "ADMIN_MUTATION_IDEMPOTENCY_CONFLICT" },
  });
  await assertAdminErrorAsync(
    () =>
      executeAdminMutationRpc(
        client,
        "admin_example_v1",
        {},
        { code: "example_failed", message: "Example failed." },
      ),
    409,
    "idempotency_key_conflict",
  );
});

Deno.test("Admin mutation maps missing Admin Player to HTTP 404", async () => {
  const client = fakeClient({
    data: null,
    error: { message: "ADMIN_PLAYER_NOT_FOUND" },
  });
  await assertAdminErrorAsync(
    () =>
      executeAdminMutationRpc(
        client,
        "admin_archive_player_v1",
        {},
        { code: "player_archive_failed", message: "Player archive failed." },
      ),
    404,
    "player_not_found",
  );
});

Deno.test("Admin mutation database errors cannot become HTTP success", async () => {
  const client = fakeClient({
    data: null,
    error: { message: "private database failure" },
  });
  await assertAdminErrorAsync(
    () =>
      executeAdminMutationRpc(
        client,
        "admin_example_v1",
        {},
        { code: "example_failed", message: "Example failed." },
      ),
    500,
    "example_failed",
  );
});

function fakeClient(response: {
  readonly data: unknown;
  readonly error: { readonly message?: string; readonly code?: string } | null;
}): AdminMutationRpcClient {
  return {
    rpc<T>() {
      return Promise.resolve(
        response as {
          readonly data: T | null;
          readonly error: typeof response.error;
        },
      );
    },
  };
}

function assertAdminError(
  run: () => unknown,
  status: number,
  code: string,
): void {
  let error: AdminMutationError | null = null;
  try {
    run();
  } catch (caught) {
    error = caught instanceof AdminMutationError ? caught : null;
  }
  assertEquals({ status: error?.status, code: error?.code }, { status, code });
}

async function assertAdminErrorAsync(
  run: () => Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  let error: AdminMutationError | null = null;
  try {
    await run();
  } catch (caught) {
    error = caught instanceof AdminMutationError ? caught : null;
  }
  assertEquals({ status: error?.status, code: error?.code }, { status, code });
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
