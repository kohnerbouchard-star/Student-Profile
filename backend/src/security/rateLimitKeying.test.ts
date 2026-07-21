import {
  buildPlayerRateLimitBuckets,
  buildPreAuthRateLimitBuckets,
  buildStaffRateLimitBuckets,
  hmacSha256Hex,
  normalizeIpAddress,
  overwriteTrustedClientIpHeaders,
  readTrustedClientIp,
} from "./rateLimitKeying.ts";
import { RateLimitError } from "./rateLimitContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const SECRET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const GAME = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME = "00000000-0000-4000-8000-000000000002";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const STAFF = "00000000-0000-4000-8000-000000000031";

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
  assertNoRawMaterial(buckets, [GAME, PLAYER, "203.0.113.42"]);
  for (const bucket of buckets) {
    assert(/^[0-9a-f]{64}$/u.test(bucket.keyHash));
    assert(bucket.limit > 0);
    assert(bucket.windowSeconds > 0);
    assert(bucket.blockSeconds > 0);
  }
});

Deno.test("rate-limit keys isolate games and actions without changing broad identity or IP buckets", async () => {
  const base = await playerBuckets(GAME, "player.inventory.read");
  const otherGame = await playerBuckets(OTHER_GAME, "player.inventory.read");
  const otherAction = await playerBuckets(GAME, "player.notifications.read");

  assertNotEquals(key(base, "game"), key(otherGame, "game"));
  assertNotEquals(key(base, "action"), key(otherGame, "action"));
  assertEquals(key(base, "identity"), key(otherGame, "identity"));
  assertEquals(key(base, "ip"), key(otherGame, "ip"));

  assertNotEquals(key(base, "action"), key(otherAction, "action"));
  assertEquals(key(base, "game"), key(otherAction, "game"));
  assertEquals(key(base, "identity"), key(otherAction, "identity"));
  assertEquals(key(base, "ip"), key(otherAction, "ip"));
});

Deno.test("reviewed multi-segment Player and staff scanner actions are accepted", async () => {
  const player = await buildPlayerRateLimitBuckets({
    action: "player.inventory.redemptions.read",
    gameUuid: GAME,
    ipAddress: "203.0.113.42",
    playerUuid: PLAYER,
    profile: "read",
  }, SECRET);
  const staff = await buildStaffRateLimitBuckets({
    action: "staff.attendance.scan",
    gameUuid: GAME,
    ipAddress: "203.0.113.42",
    staffUuid: STAFF,
    profile: "scanner",
  }, SECRET);

  assertEquals(player.length, 4);
  assertEquals(staff.map((bucket) => bucket.limit), [300, 900, 300, 900]);
  assertNoRawMaterial(staff, [GAME, STAFF, "203.0.113.42"]);
});

Deno.test("pre-auth login uses classroom-NAT action-per-IP and broad IP buckets", async () => {
  const buckets = await buildPreAuthRateLimitBuckets({
    action: "player.login.attempt",
    ipAddress: "203.0.113.42",
    profile: "login",
  }, SECRET);
  const otherIp = await buildPreAuthRateLimitBuckets({
    action: "player.login.attempt",
    ipAddress: "203.0.113.43",
    profile: "login",
  }, SECRET);

  assertEquals(buckets.map((bucket) => bucket.dimension), ["action", "ip"]);
  assertEquals(buckets.map((bucket) => bucket.limit), [90, 150]);
  assertNotEquals(key(buckets, "action"), key(otherIp, "action"));
  assertNotEquals(key(buckets, "ip"), key(otherIp, "ip"));
  assertNoRawMaterial(buckets, ["203.0.113.42", "player.login.attempt"]);
});

Deno.test("trusted client IP requires one normalized proxy-overwritten value", () => {
  assertEquals(normalizeIpAddress("203.000.113.042"), "203.0.113.42");
  assertEquals(normalizeIpAddress("2001:0DB8:0:0::1"), "2001:db8::1");
  assertEquals(
    readTrustedClientIp(requestWithHeader("203.0.113.42"), "x-forwarded-for"),
    "203.0.113.42",
  );

  for (const value of [
    "",
    "999.1.1.1",
    "not-an-ip",
    "fe80::1%eth0",
    "203.0.113.42, 198.51.100.7",
  ]) {
    assertThrowsCode(
      () => readTrustedClientIp(requestWithHeader(value), "x-forwarded-for"),
      "invalid_rate_limit_context",
    );
  }

  const syntheticCrLfRequest = {
    headers: {
      get: () => "203.0.113.42\r\nx-real-ip: 198.51.100.7",
    },
  } as unknown as Request;
  assertThrowsCode(
    () => readTrustedClientIp(syntheticCrLfRequest, "x-forwarded-for"),
    "invalid_rate_limit_context",
  );
});

Deno.test("trusted proxy overwrite strips browser-supplied forwarding aliases", () => {
  const headers = overwriteTrustedClientIpHeaders({
    "cf-connecting-ip": "198.51.100.1",
    "x-real-ip": "198.51.100.2",
    "x-forwarded-for": "198.51.100.3, 198.51.100.4",
    "true-client-ip": "198.51.100.5",
    forwarded: "for=198.51.100.6",
    "x-client-ip": "198.51.100.7",
    authorization: "Bearer preserved",
  }, "x-real-ip", "203.0.113.42");

  assertEquals(headers.get("x-real-ip"), "203.0.113.42");
  assertEquals(headers.get("authorization"), "Bearer preserved");
  for (const stripped of [
    "cf-connecting-ip",
    "x-forwarded-for",
    "true-client-ip",
    "forwarded",
    "x-client-ip",
  ]) {
    assertEquals(headers.get(stripped), null);
  }
});

Deno.test("keying rejects weak secrets, client-shaped actions, and invalid ownership", async () => {
  for (const weak of ["short", "a".repeat(64), "not+base64/url/secret==="]) {
    await assertRejectsCode(
      () => hmacSha256Hex(weak, "value"),
      "invalid_rate_limit_config",
    );
  }
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

function playerBuckets(gameUuid: string, action: string) {
  return buildPlayerRateLimitBuckets({
    gameUuid,
    action,
    ipAddress: "203.0.113.42",
    playerUuid: PLAYER,
    profile: "read",
  }, SECRET);
}

function requestWithHeader(value: string): Request {
  return new Request("https://example.test", {
    headers: { "x-forwarded-for": value },
  });
}

function key(
  buckets: readonly { readonly dimension: string; readonly keyHash: string }[],
  dimension: string,
): string {
  const bucket = buckets.find((candidate) => candidate.dimension === dimension);
  if (!bucket) throw new Error(`Missing ${dimension} bucket.`);
  return bucket.keyHash;
}

function assertNoRawMaterial(
  buckets: readonly unknown[],
  forbiddenValues: readonly string[],
): void {
  const serialized = JSON.stringify(buckets);
  for (const forbidden of forbiddenValues) assert(!serialized.includes(forbidden));
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
