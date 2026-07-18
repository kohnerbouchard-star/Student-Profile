import {
  rateLimitExceededResponse,
  rateLimitUnavailableResponse,
} from "./rateLimitHttp.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("rate-limit 429 response is retryable, private, bounded, and scope-private", async () => {
  const response = rateLimitExceededResponse({
    allowed: false,
    retryAfterSeconds: 12.2,
    limitingDimension: "identity",
    limit: 15,
    remaining: 0,
    resetAt: "2026-07-18T00:01:00.000Z",
  });

  assertEquals(response.status, 429);
  assertEquals(response.headers.get("retry-after"), "13");
  assertEquals(response.headers.get("ratelimit-limit"), "15");
  assertEquals(response.headers.get("ratelimit-remaining"), "0");
  assertEquals(response.headers.get("ratelimit-reset"), "13");
  assertEquals(response.headers.get("cache-control"), "private, no-store");
  assertEquals(await response.json(), {
    ok: false,
    error: {
      code: "rate_limit_exceeded",
      message: "Too many requests. Wait before trying again.",
      retryable: true,
    },
  });
});

Deno.test("rate-limit outage response fails closed without exposing dimensions or keys", async () => {
  const response = rateLimitUnavailableResponse();
  const serialized = JSON.stringify(await response.json());
  assertEquals(response.status, 503);
  assertEquals(response.headers.get("retry-after"), "5");
  assert(!serialized.includes("identity"));
  assert(!serialized.includes("key"));
  assert(!serialized.includes("uuid"));
});

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
