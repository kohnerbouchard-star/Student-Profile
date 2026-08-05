import { readTrustedClientIp } from "../../../src/security/rateLimitKeying.ts";
import { normalizeAdminRateLimitRequest } from "./progressionRateLimit.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Admin rate limiting canonicalizes the gateway-appended forwarding chain", () => {
  const incoming = new Request(
    "https://example.test/admin-api/session/bootstrap",
    {
      headers: {
        "x-real-ip": "198.51.100.10, 203.0.113.8",
        "x-forwarded-for": "198.51.100.10, 203.0.113.8",
        "client-ip": "192.0.2.44",
        "forwarded": "for=192.0.2.45",
      },
    },
  );

  const normalized = normalizeAdminRateLimitRequest(incoming, "x-real-ip");
  assertEquals(
    readTrustedClientIp(normalized.request, normalized.trustedHeader),
    "203.0.113.8",
    "the rightmost validated gateway hop must become the canonical client IP",
  );
  assertEquals(normalized.request.headers.get("x-real-ip"), "203.0.113.8");
  assertEquals(normalized.request.headers.get("x-forwarded-for"), null);
  assertEquals(normalized.request.headers.get("client-ip"), null);
  assertEquals(normalized.request.headers.get("forwarded"), null);
});

Deno.test("Admin rate limiting preserves a valid proxy-overwritten direct IP", () => {
  const incoming = new Request(
    "https://example.test/admin-api/session/bootstrap",
    {
      headers: {
        "x-real-ip": "203.0.113.19",
        "x-forwarded-for": "198.51.100.4, 192.0.2.7",
        "true-client-ip": "192.0.2.55",
      },
    },
  );

  const normalized = normalizeAdminRateLimitRequest(incoming, "x-real-ip");
  assertEquals(
    readTrustedClientIp(normalized.request, normalized.trustedHeader),
    "203.0.113.19",
  );
  assertEquals(normalized.request.headers.get("x-forwarded-for"), null);
  assertEquals(normalized.request.headers.get("true-client-ip"), null);
});

Deno.test("Admin rate limiting does not derive identity from non-gateway forwarding aliases", () => {
  const incoming = new Request(
    "https://example.test/admin-api/session/bootstrap",
    {
      headers: {
        "cf-connecting-ip": "203.0.113.92",
        "client-ip": "203.0.113.93",
        "forwarded": "for=203.0.113.94",
      },
    },
  );

  assertThrows(
    () => normalizeAdminRateLimitRequest(incoming, "x-real-ip"),
    "untrusted forwarding aliases must not become Admin rate-limit identity",
  );
});

Deno.test("Admin IP normalization does not disturb authenticated POST bodies", async () => {
  const body = { source: "admin_share_panel" };
  const incoming = new Request(
    "https://example.test/admin-api/games/game-1/join-code/reset",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": "203.0.113.19",
      },
      body: JSON.stringify(body),
    },
  );

  const normalized = normalizeAdminRateLimitRequest(incoming, "x-real-ip");
  assertEquals(normalized.request.body, null);
  assertEquals(
    JSON.stringify(await incoming.json()),
    JSON.stringify(body),
    "network metadata normalization must leave the application body readable",
  );
});

Deno.test("Admin rate limiting rejects x-forwarded-for as the authoritative header", () => {
  let rejected = false;
  try {
    normalizeAdminRateLimitRequest(
      new Request("https://example.test/admin-api/session/bootstrap"),
      "x-forwarded-for",
    );
  } catch {
    rejected = true;
  }
  assertEquals(rejected, true);
});

function assertEquals(
  actual: unknown,
  expected: unknown,
  message = "values differ",
): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

function assertThrows(run: () => unknown, message: string): void {
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  assertEquals(threw, true, message);
}
