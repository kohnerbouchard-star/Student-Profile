import { handleLocalAdminGameMutation } from "./localGameMutations.ts";
import { createAdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000101";
const STAFF_ID = "00000000-0000-4000-8000-000000000201";

Deno.test("every affected ordinary route family terminates in the local dispatcher", async () => {
  const cases = [
    ["POST", "/players", {}],
    ["POST", "/attendance/scans", {}],
    ["POST", "/attendance/corrections", {}],
    ["POST", "/store/items", {}],
    ["POST", "/contracts", {}],
    ["PATCH", "/settings", {}],
    ["POST", "/join-code/reset", { browserSelectedCode: "FORGED" }],
  ] as const;
  let rpcCalls = 0;
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.resolve(new Response(null, { status: 500 }));
  };

  try {
    for (const [method, suffix, body] of cases) {
      const result = await handleLocalAdminGameMutation(
        {
          rpc<T>() {
            rpcCalls += 1;
            return Promise.resolve({ data: null as T | null, error: null });
          },
        } as never,
        {
          request: new Request(
            `https://example.test/games/${GAME_ID}${suffix}`,
            {
              method,
              headers: {
                "content-type": "application/json",
                "idempotency-key": `local-dispatch-${method.toLowerCase()}-${
                  suffix.replace(/[^a-z]+/gi, "-")
                }`,
              },
              body: JSON.stringify(body),
            },
          ),
          applicationContext: adminContext(),
          suffix,
          gameSession: {
            id: GAME_ID,
            name: "Local Handler Test",
            status: "active",
          },
        },
      );

      assertEquals(result.handled, true);
      if (result.handled) assertEquals(result.status, 400);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  assertEquals(rpcCalls, 0);
  assertEquals(fetchCalls, 0);
});

Deno.test("Admin Game Sessions mutation identity stays separate from request context", async () => {
  const applicationContext = adminContext();
  const calls: Array<{
    readonly name: string;
    readonly args: Record<string, unknown>;
  }> = [];
  const service = {
    rpc<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({
        data: [{
          response_status: 200,
          response_body: {
            joinCode: {
              game_join_code: "ECO-ROTATED-043",
              game_join_code_status: "active",
              updated_at: "2026-08-18T03:00:00.000Z",
            },
          },
          was_replayed: false,
        }] as T,
        error: null,
      });
    },
  };
  const result = await handleLocalAdminGameMutation(service as never, {
    request: new Request(
      `https://example.test/games/${GAME_ID}/join-code/reset`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "admin-join-reset-001",
          "x-request-id": "mutation-request-001",
        },
        body: JSON.stringify({}),
      },
    ),
    applicationContext,
    suffix: "/join-code/reset",
    gameSession: {
      id: GAME_ID,
      name: "Local Handler Test",
      status: "active",
    },
  });

  assertEquals(result.handled, true);
  assertEquals(calls[0]?.name, "admin_rotate_game_join_code_v1");
  assertEquals(calls[0]?.args.p_game_session_id, GAME_ID);
  assertEquals(calls[0]?.args.p_staff_user_id, STAFF_ID);
  assertEquals(calls[0]?.args.p_idempotency_key, "admin-join-reset-001");
  assertEquals(calls[0]?.args.p_request_id, "mutation-request-001");
  assertEquals(
    calls[0]?.args.p_request_id === applicationContext.requestId,
    false,
  );
  assertEquals(JSON.stringify(result).includes(STAFF_ID), false);
  assertEquals(
    JSON.stringify(result).includes(applicationContext.requestId),
    false,
  );
});

Deno.test("a genuinely distinct write remains available to later routers", async () => {
  const result = await handleLocalAdminGameMutation({} as never, {
    request: new Request(
      `https://example.test/games/${GAME_ID}/contracts/contract-1/progress/progress-1/review`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      },
    ),
    applicationContext: adminContext(),
    suffix: "/contracts/contract-1/progress/progress-1/review",
    gameSession: { id: GAME_ID, name: "Local Handler Test", status: "active" },
  });

  assertEquals(result, { handled: false });
});

function adminContext() {
  return createAdminRequestApplicationContext({
    ownedGame: { id: GAME_ID },
    staffUserId: STAFF_ID,
    requestId: "server-admin-local-mutation-001",
    security: {
      ok: true,
      assuranceLevel: "aal2",
      permissions: [
        "attendance.manage",
        "contracts.manage",
        "game.update",
        "players.manage",
        "settings.manage",
        "store.manage",
      ],
      requiredPermission: "game.update",
    },
  });
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }.`,
    );
  }
}
