import { handleLocalAdminGameMutation } from "./localGameMutations.ts";

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
          gameSessionId: GAME_ID,
          staffUserId: STAFF_ID,
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
    gameSessionId: GAME_ID,
    staffUserId: STAFF_ID,
    suffix: "/contracts/contract-1/progress/progress-1/review",
    gameSession: { id: GAME_ID, name: "Local Handler Test", status: "active" },
  });

  assertEquals(result, { handled: false });
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }.`,
    );
  }
}
