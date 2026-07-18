import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import {
  enforcePlayerRateLimit,
  enforcePreAuthRateLimit,
  readPlayerRateLimitConfig,
} from "./playerRateLimitService.ts";
import type {
  RateLimitBucketInput,
  RateLimitDecision,
  RateLimitRepository,
} from "./rateLimitContracts.ts";
import { RateLimitError } from "./rateLimitContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const SECRET = "rate-limit-test-secret-with-at-least-32-characters";
const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const ALLOWED: RateLimitDecision = {
  allowed: true,
  retryAfterSeconds: 0,
  limitingDimension: null,
  limit: 90,
  remaining: 89,
  resetAt: "2026-07-18T00:01:00.000Z",
};

Deno.test("player rate-limit service consumes all server-derived dimensions once", async () => {
  const repository = new RecordingRepository([ALLOWED]);
  const decision = await enforce(repository);

  assertEquals(decision, ALLOWED);
  assertEquals(repository.calls.length, 1);
  assertEquals(repository.calls[0]?.map((bucket) => bucket.dimension), [
    "action",
    "game",
    "identity",
    "ip",
  ]);
  assertNoScopeMaterial(repository.calls[0] ?? []);
});

Deno.test("pre-auth login limiter consumes only IP and action buckets once", async () => {
  const repository = new RecordingRepository([ALLOWED]);
  const decision = await enforcePreAuthRateLimit(
    {
      action: "player.login.attempt",
      profile: "sensitive",
      request: new Request("https://example.test/players/login", {
        method: "POST",
        headers: { "x-real-ip": "203.0.113.42" },
        body: JSON.stringify({
          gameJoinCode: "MUST-NOT-BE-KEYED",
          playerIdentifier: "PLAYER-NOT-KEYED",
          accessCode: "CODE-NOT-KEYED",
        }),
      }),
    },
    {} as EdgeSupabaseClient,
    {
      readConfig: () => ({
        hmacSecret: SECRET,
        trustedIpHeader: "x-real-ip",
      }),
      createRepository: () => repository,
    },
  );

  assertEquals(decision, ALLOWED);
  assertEquals(repository.calls.length, 1);
  assertEquals(repository.calls[0]?.map((bucket) => bucket.dimension), [
    "action",
    "ip",
  ]);
  const serialized = JSON.stringify(repository.calls[0]);
  for (
    const forbidden of [
      "MUST-NOT-BE-KEYED",
      "PLAYER-NOT-KEYED",
      "CODE-NOT-KEYED",
      "identity",
      "game",
    ]
  ) {
    assert(!serialized.includes(forbidden));
  }
});

Deno.test("player rate-limit service counts replays and concurrent attempts without client idempotency bypass", async () => {
  const responses = Array.from({ length: 40 }, (_value, index) => ({
    ...ALLOWED,
    allowed: index < 10,
    retryAfterSeconds: index < 10 ? 0 : 30,
    limitingDimension: index < 10 ? null : "action" as const,
    remaining: Math.max(0, 9 - index),
  }));
  const repository = new RecordingRepository(responses);

  const decisions = await Promise.all(
    Array.from({ length: 40 }, () => enforce(repository)),
  );

  assertEquals(repository.calls.length, 40);
  assertEquals(decisions.filter((decision) => decision.allowed).length, 10);
  assertEquals(decisions.filter((decision) => !decision.allowed).length, 30);
  assert(repository.calls.every((call) => call.length === 4));
});

Deno.test("player rate-limit configuration fails closed without a strong HMAC secret and reviewed proxy header", () => {
  assertThrowsConfig(() => readPlayerRateLimitConfig(() => undefined));
  assertThrowsConfig(
    () =>
      readPlayerRateLimitConfig((name) =>
        name === "ECONOVARIA_RATE_LIMIT_HMAC_SECRET" ? "short" : "x-real-ip"
      ),
  );
  assertThrowsConfig(
    () =>
      readPlayerRateLimitConfig((name) =>
        name === "ECONOVARIA_RATE_LIMIT_HMAC_SECRET" ? SECRET : "x-client-ip"
      ),
  );

  assertEquals(
    readPlayerRateLimitConfig((name) =>
      name === "ECONOVARIA_RATE_LIMIT_HMAC_SECRET" ? SECRET : "CF-Connecting-IP"
    ),
    {
      hmacSecret: SECRET,
      trustedIpHeader: "cf-connecting-ip",
    },
  );
});

function enforce(repository: RateLimitRepository) {
  return enforcePlayerRateLimit(
    {
      action: "player.inventory.read",
      profile: "read",
      request: new Request("https://example.test/players/me/inventory", {
        headers: { "x-real-ip": "203.0.113.42" },
      }),
      scope: {
        playerUuid: PLAYER,
        gameId: GAME,
        activeSessionId: "00000000-0000-4000-8000-000000000011",
        sessionValid: true,
        sessionExpiresAt: "2026-07-19T00:00:00.000Z",
        authorizationContext: {
          actorType: "player",
          source: "player_session",
          gameScope: "session",
          resourceScope: "own_player",
        },
      },
    },
    {} as EdgeSupabaseClient,
    {
      readConfig: () => ({
        hmacSecret: SECRET,
        trustedIpHeader: "x-real-ip",
      }),
      createRepository: () => repository,
    },
  );
}

class RecordingRepository implements RateLimitRepository {
  readonly calls: RateLimitBucketInput[][] = [];
  private index = 0;

  constructor(private readonly responses: readonly RateLimitDecision[]) {}

  consume(
    buckets: readonly RateLimitBucketInput[],
  ): Promise<RateLimitDecision> {
    this.calls.push([...buckets]);
    const response =
      this.responses[Math.min(this.index, this.responses.length - 1)];
    this.index += 1;
    if (!response) throw new Error("Missing response.");
    return Promise.resolve(response);
  }
}

function assertNoScopeMaterial(buckets: readonly RateLimitBucketInput[]): void {
  const serialized = JSON.stringify(buckets);
  for (
    const forbidden of [GAME, PLAYER, "203.0.113.42", "player.inventory.read"]
  ) {
    assert(!serialized.includes(forbidden));
  }
}

function assertThrowsConfig(run: () => unknown): void {
  try {
    run();
  } catch (error) {
    if (
      error instanceof RateLimitError &&
      error.code === "invalid_rate_limit_config"
    ) {
      return;
    }
    throw error;
  }
  throw new Error("Expected invalid_rate_limit_config.");
}

function assert(condition: boolean): void {
  if (!condition) throw new Error("Assertion failed.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
