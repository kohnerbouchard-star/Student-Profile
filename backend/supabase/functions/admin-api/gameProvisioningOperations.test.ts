import { handleGameProvisioningOperation } from "./gameProvisioningOperations.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const STAFF_ID = "00000000-0000-4000-8000-000000000001";
const GAME_ID = "00000000-0000-4000-8000-000000000002";
const ENTITLEMENT_ID = "00000000-0000-4000-8000-000000000003";
const PURCHASE_CODE_ID = "00000000-0000-4000-8000-000000000004";
const IDEMPOTENCY_KEY = "game.create.test.001";

Deno.test("authenticated game creation redeems the supplied license and completes onboarding", async () => {
  let activationBody: unknown = null;
  let activationContext: unknown = null;
  let completion: Record<string, string> | null = null;

  const result = await handleGameProvisioningOperation({}, {
    request: gameRequest(),
    path: "/games",
    staffUserId: STAFF_ID,
  }, {
    activate: async (_service, body, context) => {
      activationBody = body;
      activationContext = context;
      return successActivation(201);
    },
    completeOnboarding: async (_service, staffUserId, gameSessionId) => {
      completion = { staffUserId, gameSessionId };
      return true;
    },
    readGame: async () => ({
      id: GAME_ID,
      name: "Period 4 Economy",
      status: "active",
      game_join_code: "ECO-ABCD2345",
      game_join_code_status: "active",
      created_at: "2026-07-31T00:00:00.000Z",
      updated_at: "2026-07-31T00:00:00.000Z",
    }),
  });

  assertEquals(result.handled, true);
  assertEquals(result.status, 201);
  assertEquals(activationBody, {
    purchaseCode: "LICENSE-ABCD-1234",
    gameName: "Period 4 Economy",
    difficultyPreset: "hard",
    stockMarketWindow: { timezone: "Asia/Seoul" },
  });
  assertEquals(activationContext, {
    staffUserId: STAFF_ID,
    requestId: IDEMPOTENCY_KEY,
    source: "admin_api_authenticated_game_selector_v1",
  });
  assertEquals(completion, {
    staffUserId: STAFF_ID,
    gameSessionId: GAME_ID,
  });

  const body = result.body as Record<string, any>;
  assertEquals(body.ok, true);
  assertEquals("activation" in body, false);
  assertEquals(body.data.game.id, GAME_ID);
  assertEquals(body.data.game.provisioningStatus, "ready");
  assertEquals(body.data.game.gameCode, "ECO-ABCD2345");
  assertEquals(body.data.joinCode, "ECO-ABCD2345");
  const serialized = JSON.stringify(body);
  assertEquals(serialized.includes("LICENSE-ABCD-1234"), false);
  assertEquals(serialized.includes(ENTITLEMENT_ID), false);
  assertEquals(serialized.includes(PURCHASE_CODE_ID), false);
});

Deno.test("activation failure is returned safely and never completes onboarding", async () => {
  let completionCalls = 0;
  let readCalls = 0;
  const result = await handleGameProvisioningOperation({}, {
    request: gameRequest(),
    path: "/games",
    staffUserId: STAFF_ID,
  }, {
    activate: async () => ({
      httpStatus: 409,
      body: {
        ok: false,
        error: {
          code: "purchase_code_unavailable",
          message: "The purchase code is unavailable.",
          retryable: false,
        },
      },
    }),
    completeOnboarding: async () => {
      completionCalls += 1;
      return true;
    },
    readGame: async () => {
      readCalls += 1;
      return null;
    },
  });

  assertEquals(result.status, 409);
  assertEquals(completionCalls, 0);
  assertEquals(readCalls, 0);
  assertEquals(result.body, {
    ok: false,
    error: {
      code: "purchase_code_unavailable",
      message: "The purchase code is unavailable.",
      retryable: false,
    },
  });
});

Deno.test("missing idempotency key fails before license activation", async () => {
  let activationCalls = 0;
  const request = new Request("https://example.test/admin-api/games", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validBody()),
  });
  const result = await handleGameProvisioningOperation({}, {
    request,
    path: "/games",
    staffUserId: STAFF_ID,
  }, {
    activate: async () => {
      activationCalls += 1;
      return successActivation(201);
    },
  });

  assertEquals(result.status, 400);
  assertEquals(activationCalls, 0);
  assertEquals((result.body as Record<string, unknown>).code, "invalid_idempotency_key");
});

Deno.test("onboarding completion failure remains retryable with the same request", async () => {
  let readCalls = 0;
  const result = await handleGameProvisioningOperation({}, {
    request: gameRequest(),
    path: "/games",
    staffUserId: STAFF_ID,
  }, {
    activate: async () => successActivation(200),
    completeOnboarding: async () => false,
    readGame: async () => {
      readCalls += 1;
      return null;
    },
  });

  assertEquals(result.status, 503);
  assertEquals(readCalls, 0);
  assertEquals(result.body, {
    code: "staff_onboarding_completion_failed",
    message: "The game was created, but administrator activation did not finish. Retry with the same request.",
    retryable: true,
  });
});

Deno.test("unrelated routes and methods remain unhandled", async () => {
  const wrongPath = await handleGameProvisioningOperation({}, {
    request: gameRequest(),
    path: "/games/example",
    staffUserId: STAFF_ID,
  });
  const wrongMethod = await handleGameProvisioningOperation({}, {
    request: new Request("https://example.test/admin-api/games", { method: "GET" }),
    path: "/games",
    staffUserId: STAFF_ID,
  });

  assertEquals(wrongPath, { handled: false });
  assertEquals(wrongMethod, { handled: false });
});

function gameRequest(): Request {
  return new Request("https://example.test/admin-api/games", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": IDEMPOTENCY_KEY,
    },
    body: JSON.stringify(validBody()),
  });
}

function validBody() {
  return {
    purchaseCode: "LICENSE-ABCD-1234",
    gameName: "Period 4 Economy",
    difficultyPreset: "hard",
    stockMarketWindow: { timezone: "Asia/Seoul" },
  };
}

function successActivation(httpStatus: number) {
  return {
    httpStatus,
    body: {
      ok: true as const,
      activation: {
        gameSessionId: GAME_ID,
        entitlementId: ENTITLEMENT_ID,
        purchaseCodeId: PURCHASE_CODE_ID,
        purchaseCodeStatus: "redeemed",
        redeemedCount: 1,
        maxRedemptions: 1,
        activatedAt: "2026-07-31T00:00:00.000Z",
      },
    },
  };
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected) && JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}
