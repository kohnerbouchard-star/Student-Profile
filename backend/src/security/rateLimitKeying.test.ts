import {
  buildPlayerRateLimitBuckets,
  buildPreAuthRateLimitBuckets,
  hmacSha256Hex,
  normalizeIpAddress,
  readTrustedClientIp,
} from "./rateLimitKeying.ts";
import { RateLimitError } from "./rateLimitContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const SECRET = "rate-limit-test-secret-with-at-least-32-characters";
const GAME = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME = "00000000-0000-4000-8000-000000000002";
const PLAYER = "00000000-0000-4000-8000-000000000021";

Deno.test("rate-limit keying produces four bounded privacy-safe dimension keys", async () => {
  const buckets = await buildPlayerRateLimitBuckets({
    action: "player.inventory.read",
    gameUuid: GAME,
    ipAddress: "203.0.113.42",
    playerUuid: PLAYER,
    profile: "read",
  }, SECRET);

  assertEquals(buckets.map((bucket) => bucket.dimension), [
    "action",
    "game",
    "identity",
    "ip",
  ]);
  assertEquals(new Set(buckets.map((bucket) => bucket.keyHash)).size, 4);
  for (const bucket of buckets) {
    assert(/^[0-9a-f]{64}$/u.test(bucket.keyHash));
    assert(!bucket.keyHash.includes(GAME));
    assert(!bucket.keyHash.includes(PLAYER));
    assert(!bucket.keyHash.includes("203.0.113.42"));
    assert(bucket.limit > 0);
    assert(bucket.windowSeconds > 0);
    assert(bucket.blockSeconds > 0);
  }
});

Deno.test("rate-limit keys isolate games and actions without changing identity or IP buckets", async () => {
  const base = await buckets({
    gameUuid: GAME,
    action: "player.inventory.read",
  });
  const otherGame = await buckets({
    gameUuid: OTHER_GAME,
    action: "player.inventory.read",
  });
  const otherAction = await buckets({
    gameUuid: GAME,
    action: "player.notifications.read",
  });

  assertNotEquals(key(base, "game"), key(otherGame, "game"));
  assertNotEquals(key(base, "action"), key(otherGame, "action"));
  assertEquals(key(base, "identity"), key(otherGame, "identity"));
  assertEquals(key(base, "ip"), key(otherGame, "ip"));

  assertNotEquals(key(base, "action"), key(otherAction, "action"));
  assertEquals(key(base, "game"), key(otherAction, "game"));
  assertEquals(key(base, "identity"), key(otherAction, "identity"));
  assertEquals(key(base, "ip"), key(otherAction, "ip"));
});

Deno.test("pre-auth login keying uses only IP and action-per-IP buckets", async () => {
  const buckets = await buildPreAuthRateLimitBuckets({
    action: "player.login.attempt",
    ipAddress: "203.0.113.42",
    profile: "sensitive",
  }, SECRET);

  assertEquals(buckets.map((bucket) => bucket.dimension), ["action", "ip"]);
  assertEquals(buckets.map((bucket) => bucket.limit), [10, 30]);
  const serialized = JSON.stringify(buckets);
  assert(!serialized.includes("203.0.113.42"));
  assert(!serialized.includes("player.login.attempt"));
  assert(!serialized.includes("identity"));
  assert(!serialized.includes("game"));

  const otherIp = await buildPreAuthRateLimitBuckets({
    action: "player.login.attempt",
    ipAddress: "203.0.113.43",
    profile: "sensitive",
  }, SECRET);
  assertNotEquals(key(buckets, "action"), key(otherIp, "action"));
  assertNotEquals(key(buckets, "ip"), key(otherIp, "ip"));
});

Deno.test("trusted client IP parsing normalizes IPv4 and IPv6 and rejects untrusted shapes", () => {
  assertEquals(normalizeIpAddress("203.000.113.042"), "203.0.113.42");
  assertEquals(normalizeIpAddress("2001:0DB8:0:0::1"), "2001:db8::1");
  assertEquals(
    readTrustedClientIp(
      new Request("https://example.test", {
        headers: { "x-forwarded-for": "203.0.113.42, 198.51.100.7" },
      }),
      "x-forwarded-for",
    ),
    "203.0.113.42",
  );

  for (const value of ["", "999.1.1.1", "not-an-ip", "fe80::1%eth0"]) {
    assertThrowsCode(
      () => normalizeIpAddress(value),
      "invalid_rate_limit_context",
    );
  }
});

Deno.test("rate-limit keying rejects weak secrets, client-shaped actions, and invalid ownership", async () => {
  await assertRejectsCode(
    () => hmacSha256Hex("short", "value"),
    "invalid_rate_limit_config",
  );
  await assertRejectsCode(
    () => hmacSha256Hex("a".repeat(64), "value"),
    "invalid_rate_limit_config",
  );
  await assertRejectsCode(
    () =>
      buildPlayerRateLimitBuckets({
        action: "../../admin",
        gameUuid: GAME,
        ipAddress: "203.0.113.42",
        playerUuid: PLAYER,
        profile: "read",
      }, SECRET),
    "invalid_rate_limit_context",
  );
  await assertRejectsCode(
    () =>
      buildPlayerRateLimitBuckets({
        action: "player.inventory.read",
        gameUuid: "browser-game-id",
        ipAddress: "203.0.113.42",
        playerUuid: PLAYER,
        profile: "read",
      }, SECRET),
    "invalid_rate_limit_context",
  );
});

function buckets(
  overrides: { readonly gameUuid: string; readonly action: string },
) {
  return buildPlayerRateLimitBuckets({
    ...overrides,
    ipAddress: "203.0.113.42",
    playerUuid: PLAYER,
    profile: "read",
  }, SECRET);
}

function key(
  buckets: readonly { readonly dimension: string; readonly keyHash: string }[],
  dimension: string,
): string {
  const bucket = buckets.find((candidate) => candidate.dimension === dimension);
  if (!bucket) throw new Error(`Missing ${dimension} bucket.`);
  return bucket.keyHash;
}

async function assertRejectsCode(
  run: () => Promise<unknown>,
  code: RateLimitError["code"],
): Promise<void> {
  try {
    await run();
  } catch (error) {
    assertRateLimitCode(error, code);
    return;
  }
  throw new Error(`Expected ${code}.`);
}

function assertThrowsCode(
  run: () => unknown,
  code: RateLimitError["code"],
): void {
  try {
    run();
  } catch (error) {
    assertRateLimitCode(error, code);
    return;
  }
  throw new Error(`Expected ${code}.`);
}

function assertRateLimitCode(
  error: unknown,
  code: RateLimitError["code"],
): void {
  if (!(error instanceof RateLimitError)) throw error;
  assertEquals(error.code, code);
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

function assertNotEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    throw new Error(`Expected values to differ: ${JSON.stringify(actual)}`);
  }
}
