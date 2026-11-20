import { handlePlayerBusinessRequest } from "./playerBusinessHttpHandler.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000002";
const BUSINESS_KEY = `biz_${"a".repeat(32)}`;
const PRODUCT_KEY = `bpr_${"b".repeat(32)}`;

Deno.test("retired Business input purchase authenticates then returns stable 410 without persistence", async () => {
  let scopeCalls = 0;
  let executeCalls = 0;
  const response = await handlePlayerBusinessRequest(
    request("POST", {
      businessKey: BUSINESS_KEY,
      productKey: PRODUCT_KEY,
      quantity: 2,
      idempotencyKey: "business-input-retired-001",
    }),
    { kind: "businessInputPurchase" },
    dependencies({
      resolveScope: () => {
        scopeCalls += 1;
        return Promise.resolve({ gameId: GAME_ID, playerUuid: PLAYER_ID });
      },
      execute: () => {
        executeCalls += 1;
        return Promise.reject(new Error("Retired RPC must not execute."));
      },
    }),
  );
  const body = await response.json();

  assertEquals(response.status, 410);
  assertEquals(body.error.code, "business_input_purchase_retired");
  assertEquals(body.error.retryable, false);
  assertContains(
    body.error.message,
    "abstract Business input purchasing has been retired.",
  );
  assertContains(body.error.message, "Business Store procurement.");
  assertEquals(scopeCalls, 1);
  assertEquals(executeCalls, 0);
  assertNoUuid(JSON.stringify(body));
});

Deno.test("retired Business input purchase still rejects method and scope injection before retirement", async () => {
  let scopeCalls = 0;
  const deps = dependencies({
    resolveScope: () => {
      scopeCalls += 1;
      return Promise.resolve({ gameId: GAME_ID, playerUuid: PLAYER_ID });
    },
  });

  const wrongMethod = await handlePlayerBusinessRequest(
    request("GET"),
    { kind: "businessInputPurchase" },
    deps,
  );
  const injectedScope = await handlePlayerBusinessRequest(
    request("POST", {
      businessKey: BUSINESS_KEY,
      productKey: PRODUCT_KEY,
      quantity: 1,
      idempotencyKey: "business-input-retired-002",
      gameSessionId: GAME_ID,
    }),
    { kind: "businessInputPurchase" },
    deps,
  );

  assertEquals(wrongMethod.status, 405);
  assertEquals((await wrongMethod.json()).error.code, "method_not_allowed");
  assertEquals(injectedScope.status, 400);
  assertEquals(
    (await injectedScope.json()).error.code,
    "invalid_business_request",
  );
  assertEquals(scopeCalls, 0);
});

function dependencies(overrides: {
  readonly resolveScope?: () => Promise<{
    readonly gameId: string;
    readonly playerUuid: string;
  }>;
  readonly execute?: () => Promise<Record<string, unknown>>;
} = {}) {
  return {
    createServiceClient: () => ({} as never),
    readEnvironment: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.test",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    resolveScope: overrides.resolveScope ?? (() =>
      Promise.resolve({ gameId: GAME_ID, playerUuid: PLAYER_ID })),
    createRepository: () => ({
      readBusiness: () => Promise.reject(new Error("Unexpected read.")),
      execute: overrides.execute ?? (() =>
        Promise.reject(new Error("Unexpected mutation."))),
    }),
  };
}

function request(method: string, body?: unknown): Request {
  const headers = new Headers({
    "x-player-session-token": "session-token",
  });
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body);
  }
  return new Request(
    "https://example.test/players/me/business/inputs/purchases",
    init,
  );
}

function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu.test(value)) {
    throw new Error(`UUID leaked: ${value}`);
  }
}

function assertContains(actual: unknown, expected: string): void {
  if (typeof actual !== "string" || !actual.includes(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} did not contain ${JSON.stringify(expected)}`,
    );
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
