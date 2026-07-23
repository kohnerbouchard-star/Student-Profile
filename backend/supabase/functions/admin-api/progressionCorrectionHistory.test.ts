import {
  handleProgressionOperation,
  type ProgressionOperationDependencies,
} from "./progressionOperations.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const STAFF = "00000000-0000-4000-8000-000000000002";
const PLAYER_ID = "PLAYER-101";
const CORRECTION_ID = `pcr_${"a".repeat(32)}`;
const CREATED_AT = "2026-07-21T07:30:00.000Z";

Deno.test("Admin Progression correction history is owner-scoped, bounded, filtered, and UUID-free", async () => {
  const service = new FakeService([{
    data: {
      corrections: [{
        id: CORRECTION_ID,
        playerId: PLAYER_ID,
        displayName: "Player",
        correctionType: "experience",
        amount: 250,
        reputationType: null,
        reputationScope: null,
        reason: "Correct imported classroom record",
        beforeValue: 700,
        afterValue: 950,
        createdAt: CREATED_AT,
      }],
      pagination: { limit: 25, offset: 5, playerId: PLAYER_ID },
    },
    error: null,
  }]);

  const result = await handleProgressionOperation(
    service as never,
    input("GET", "/progression/corrections", `?limit=25&offset=5&playerId=${PLAYER_ID}`),
    dependencies(),
  );

  assertEquals(result.status, 200);
  assertEquals(service.calls[0], {
    name: "read_admin_progression_corrections_v1",
    args: {
      p_game_session_id: GAME,
      p_staff_user_id: STAFF,
      p_player_identifier: PLAYER_ID,
      p_limit: 25,
      p_offset: 5,
    },
  });
  const serialized = JSON.stringify(result.body);
  assertNoUuid(serialized);
  assertNotIncludes(serialized, "idempotency");
  assertNotIncludes(serialized, STAFF);
});

Deno.test("Admin Progression correction history rejects malformed filters and wrong methods before RPC", async () => {
  for (const scenario of [
    input("POST", "/progression/corrections"),
    input("GET", "/progression/corrections", "?limit=0"),
    input("GET", "/progression/corrections", "?offset=-1"),
    input("GET", "/progression/corrections", "?playerId=unsafe%20player"),
    input("GET", "/progression/corrections", "?limit=10&limit=20"),
    input("GET", "/progression/corrections", "?gameId=browser"),
  ]) {
    const service = new FakeService([]);
    const result = await handleProgressionOperation(
      service as never,
      scenario,
      dependencies(),
    );
    assertEquals(result.status, scenario.request.method === "POST" ? 405 : 400);
    assertEquals(service.calls.length, 0);
  }
});

Deno.test("Admin Progression correction history maps owner denial without leaking existence", async () => {
  const service = new FakeService([{
    data: null,
    error: { message: "PROGRESSION_ADMIN_SCOPE_FORBIDDEN" },
  }]);
  const result = await handleProgressionOperation(
    service as never,
    input("GET", "/progression/corrections"),
    dependencies(),
  );
  assertEquals(result.status, 404);
  assertEquals((result.body as { code: string }).code, "progression_not_found");
});

Deno.test("Admin Progression correction history uses the bounded read rate limit", async () => {
  const service = new FakeService([]);
  const calls: unknown[] = [];
  const result = await handleProgressionOperation(
    service as never,
    input("GET", "/progression/corrections"),
    dependencies(async (_service, rateInput) => {
      calls.push(rateInput);
      return {
        allowed: false,
        retryAfterSeconds: 9,
        limitingDimension: "identity",
        limit: 10,
        remaining: 0,
        resetAt: CREATED_AT,
      };
    }),
  );
  assertEquals(result.status, 429);
  assertEquals((calls[0] as { action: string }).action, "staff.progression.read");
  assertEquals((calls[0] as { profile: string }).profile, "read");
  assertEquals(service.calls.length, 0);
});

class FakeService {
  readonly calls: Array<{ name: string; args: unknown }> = [];
  constructor(
    private readonly responses: Array<{
      readonly data: unknown;
      readonly error: { readonly message: string } | null;
    }>,
  ) {}
  rpc<T>(name: string, args: unknown) {
    this.calls.push({ name, args });
    const response = this.responses.shift() ?? {
      data: null,
      error: { message: "unexpected RPC" },
    };
    return Promise.resolve(response as {
      data: T | null;
      error: { message: string } | null;
    });
  }
}

function dependencies(
  consumeRateLimit: NonNullable<ProgressionOperationDependencies["consumeRateLimit"]> = async () => ({
    allowed: true,
    retryAfterSeconds: 0,
    limitingDimension: null,
    limit: 10,
    remaining: 9,
    resetAt: CREATED_AT,
  }),
): ProgressionOperationDependencies {
  return { consumeRateLimit };
}

function input(method: string, suffix: string, search = "") {
  return {
    request: new Request(
      `https://example.test/functions/v1/admin-api${suffix}${search}`,
      { method },
    ),
    gameId: GAME,
    staffUserId: STAFF,
    suffix,
  };
}
function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)) {
    throw new Error(`UUID leaked: ${value}`);
  }
}
function assertNotIncludes(value: string, forbidden: string): void {
  if (value.toLowerCase().includes(forbidden.toLowerCase())) {
    throw new Error(`Unexpected value ${forbidden}`);
  }
}
function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
