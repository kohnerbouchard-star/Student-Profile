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

Deno.test("Admin Progression review is owner-scoped, paginated, and UUID-free", async () => {
  const service = new FakeService([{
    data: {
      players: [{
        playerId: PLAYER_ID,
        displayName: "Player",
        rosterLabel: "A-01",
        level: 4,
        experience: 700,
        availableSkillPoints: 2,
        skillCount: 1,
        achievementCount: 3,
        reputation: { country: 12, career: 5 },
        updatedAt: CREATED_AT,
      }],
      pagination: { limit: 25, offset: 5 },
    },
    error: null,
  }]);

  const result = await handleProgressionOperation(
    service as never,
    input("GET", "/progression", undefined, "?limit=25&offset=5"),
    dependencies(),
  );

  assertEquals(result.status, 200);
  assertEquals(service.calls[0], {
    name: "read_admin_progression_players_v1",
    args: {
      p_game_session_id: GAME,
      p_staff_user_id: STAFF,
      p_limit: 25,
      p_offset: 5,
    },
  });
  assertNoUuid(JSON.stringify(result.body));
});

Deno.test("Admin Progression correction returns bounded before and after audit values", async () => {
  const service = correctionService("applied");
  const result = await handleProgressionOperation(
    service as never,
    input("POST", `/progression/players/${PLAYER_ID}/corrections`, {
      correctionType: "experience",
      amount: 250,
      reason: "Correct imported classroom record",
      idempotencyKey: "progression-correction-001",
    }, "", { "x-idempotency-key": "progression-correction-001" }),
    dependencies(),
  );

  assertEquals(result.status, 200);
  assertEquals(service.calls[0], {
    name: "apply_admin_progression_correction_atomic_v1",
    args: {
      p_game_session_id: GAME,
      p_staff_user_id: STAFF,
      p_player_identifier: PLAYER_ID,
      p_correction_type: "experience",
      p_amount: 250,
      p_reputation_type: null,
      p_reputation_scope: null,
      p_reason: "Correct imported classroom record",
      p_idempotency_key: "progression-correction-001",
    },
  });
  assertEquals(result.body, {
    data: {
      outcome: "applied",
      correction: {
        id: CORRECTION_ID,
        playerId: PLAYER_ID,
        correctionType: "experience",
        amount: 250,
        beforeValue: 700,
        afterValue: 950,
        createdAt: CREATED_AT,
      },
    },
  });
  assertNoUuid(JSON.stringify(result.body));
});

Deno.test("Admin Progression correction preserves replay and maps conflict and owner denial safely", async () => {
  const replay = await handleProgressionOperation(
    correctionService("replayed") as never,
    input("POST", `/progression/players/${PLAYER_ID}/corrections`, correctionBody()),
    dependencies(),
  );
  assertEquals(replay.status, 200);
  assertEquals((replay.body as { data: { outcome: string } }).data.outcome, "replayed");

  for (const [message, status, code] of [
    ["PROGRESSION_IDEMPOTENCY_CONFLICT", 409, "progression_idempotency_conflict"],
    ["PROGRESSION_ADMIN_SCOPE_FORBIDDEN", 404, "progression_not_found"],
    ["PROGRESSION_PLAYER_NOT_FOUND", 404, "progression_not_found"],
  ] as const) {
    const service = new FakeService([{ data: null, error: { message } }]);
    const result = await handleProgressionOperation(
      service as never,
      input("POST", `/progression/players/${PLAYER_ID}/corrections`, correctionBody()),
      dependencies(),
    );
    assertEquals(result.status, status);
    assertEquals((result.body as { code: string }).code, code);
  }
});

Deno.test("Admin Progression maps paused, ended, and inactive correction conflicts", async () => {
  for (const [message, code, retryable] of [
    ["GAME_SESSION_DISABLED", "progression_game_paused", true],
    ["GAME_SESSION_ARCHIVED", "progression_game_ended", false],
    ["GAME_SESSION_NOT_ACTIVE", "progression_game_unavailable", false],
    ["GAME_SESSION_NOT_FOUND", "progression_game_unavailable", false],
  ] as const) {
    const service = new FakeService([{ data: null, error: { message } }]);
    const result = await handleProgressionOperation(
      service as never,
      input("POST", `/progression/players/${PLAYER_ID}/corrections`, correctionBody()),
      dependencies(),
    );
    assertEquals(result.status, 409);
    assertEquals((result.body as { code: string }).code, code);
    assertEquals((result.body as { retryable: boolean }).retryable, retryable);
  }
});

Deno.test("Admin Progression rejects malformed corrections before mutation RPC", async () => {
  const scenarios = [
    input("POST", `/progression/players/${PLAYER_ID}/corrections`, {
      ...correctionBody(),
      amount: 0,
    }),
    input("POST", `/progression/players/${PLAYER_ID}/corrections`, {
      ...correctionBody(),
      reason: "x",
    }),
    input("POST", `/progression/players/${PLAYER_ID}/corrections`, {
      correctionType: "reputation",
      amount: 5,
      reputationType: "unknown",
      reputationScope: "general",
      reason: "Correct reputation",
      idempotencyKey: "progression-correction-002",
    }),
    input("POST", `/progression/players/${PLAYER_ID}/corrections`, correctionBody(), "?gameId=browser"),
    input("POST", `/progression/players/${PLAYER_ID}/corrections`, correctionBody(), "", {
      "x-idempotency-key": "different-key",
    }),
  ];

  for (const scenario of scenarios) {
    const service = new FakeService([]);
    const result = await handleProgressionOperation(service as never, scenario, dependencies());
    assertEquals(result.status, 400);
    assertEquals(service.calls.length, 0);
  }
});

Deno.test("Admin Progression rate limiting fails closed without domain RPC", async () => {
  const deniedService = new FakeService([]);
  const denied = await handleProgressionOperation(
    deniedService as never,
    input("GET", "/progression"),
    dependencies(async () => ({
      allowed: false,
      retryAfterSeconds: 17,
      limitingDimension: "identity",
      limit: 10,
      remaining: 0,
      resetAt: CREATED_AT,
    })),
  );
  assertEquals(denied.status, 429);
  assertEquals((denied.body as { retryAfterSeconds: number }).retryAfterSeconds, 17);
  assertEquals(deniedService.calls.length, 0);

  const unavailableService = new FakeService([]);
  const unavailable = await handleProgressionOperation(
    unavailableService as never,
    input("GET", "/progression"),
    dependencies(async () => {
      throw new Error("rate limit unavailable");
    }),
  );
  assertEquals(unavailable.status, 503);
  assertEquals((unavailable.body as { code: string }).code, "rate_limit_service_unavailable");
  assertEquals(unavailableService.calls.length, 0);
});

Deno.test("Admin Progression distinguishes malformed, wrong-method, and unrelated routes", async () => {
  const service = new FakeService([]);
  const wrongMethod = await handleProgressionOperation(
    service as never,
    input("POST", "/progression", {}),
    dependencies(),
  );
  assertEquals(wrongMethod.status, 405);

  const malformed = await handleProgressionOperation(
    service as never,
    input("GET", "/progression/unknown"),
    dependencies(),
  );
  assertEquals(malformed.status, 400);

  const unrelated = await handleProgressionOperation(
    service as never,
    input("GET", "/contracts"),
    dependencies(),
  );
  assertEquals(unrelated, { handled: false });
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
    return Promise.resolve(response as { data: T | null; error: { message: string } | null });
  }
}

function correctionService(outcome: "applied" | "replayed"): FakeService {
  return new FakeService([{
    data: [{
      correction_outcome: outcome,
      correction_id: CORRECTION_ID,
      player_id: PLAYER_ID,
      correction_type: "experience",
      before_value: 700,
      after_value: 950,
      created_at: CREATED_AT,
    }],
    error: null,
  }]);
}

function correctionBody() {
  return {
    correctionType: "experience",
    amount: 250,
    reason: "Correct imported classroom record",
    idempotencyKey: "progression-correction-001",
  };
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

function input(
  method: string,
  suffix: string,
  body?: unknown,
  search = "",
  extraHeaders: Record<string, string> = {},
) {
  const headers = new Headers(extraHeaders);
  if (body !== undefined) headers.set("content-type", "application/json");
  return {
    request: new Request(`https://example.test/functions/v1/admin-api${suffix}${search}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
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

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
