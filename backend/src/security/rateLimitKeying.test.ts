import {
  buildPlayerRateLimitBuckets,
  buildPreAuthRateLimitBuckets,
  normalizeIpAddress,
  overwriteTrustedClientIpHeaders,
  readTrustedClientIp,
  validateRateLimitHmacSecret,
} from "./rateLimitKeying.ts";

const SECRET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
const GAME = "00000000-0000-4000-8000-000000000001";
const PLAYER = "00000000-0000-4000-8000-000000000021";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const assert = (condition: unknown, message = "assertion failed") => { if (!condition) throw new Error(message); };
const equal = (actual: unknown, expected: unknown) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);

Deno.test("authenticated keys are four privacy-safe HMAC buckets", async () => {
  const buckets = await buildPlayerRateLimitBuckets({
    action: "player.inventory.redemptions.read",
    gameUuid: GAME,
    ipAddress: "203.0.113.42",
    playerUuid: PLAYER,
    profile: "read",
  }, SECRET);
  equal(buckets.map((bucket) => bucket.dimension), ["action", "game", "identity", "ip"]);
  assert(new Set(buckets.map((bucket) => bucket.keyHash)).size === 4);
  for (const bucket of buckets) {
    assert(/^[0-9a-f]{64}$/.test(bucket.keyHash));
    assert(!bucket.keyHash.includes(GAME) && !bucket.keyHash.includes(PLAYER));
  }
});

Deno.test("pre-auth login keys are credential-blind IP and action buckets", async () => {
  const buckets = await buildPreAuthRateLimitBuckets({
    action: "player.login.attempt",
    ipAddress: "203.0.113.42",
    profile: "login",
  }, SECRET);
  equal(buckets.map((bucket) => bucket.dimension), ["action", "ip"]);
});

Deno.test("trusted proxy input accepts one address and rejects chains", () => {
  equal(readTrustedClientIp(new Request("https://example.invalid", { headers: { "x-forwarded-for": "203.0.113.42" } }), "x-forwarded-for"), "203.0.113.42");
  let rejected = false;
  try { readTrustedClientIp(new Request("https://example.invalid", { headers: { "x-forwarded-for": "198.51.100.7, 203.0.113.42" } }), "x-forwarded-for"); } catch { rejected = true; }
  assert(rejected);
});

Deno.test("proxy overwrite strips browser forwarding aliases", () => {
  const headers = overwriteTrustedClientIpHeaders({ "x-forwarded-for": "198.51.100.7", "client-ip": "198.51.100.8", authorization: "preserved" }, "cf-connecting-ip", "203.0.113.42");
  equal(headers.get("cf-connecting-ip"), "203.0.113.42");
  equal(headers.get("x-forwarded-for"), null);
  equal(headers.get("client-ip"), null);
  equal(headers.get("authorization"), "preserved");
});

Deno.test("HMAC configuration rejects weak or malformed values", () => {
  validateRateLimitHmacSecret(SECRET);
  for (const value of ["a".repeat(43), "not base64 material !", "short"]) {
    let rejected = false;
    try { validateRateLimitHmacSecret(value); } catch { rejected = true; }
    assert(rejected, `expected rejection for ${value.length}`);
  }
});

Deno.test("IP normalization validates IPv4 and IPv6", () => {
  equal(normalizeIpAddress("203.0.113.042"), "203.0.113.42");
  equal(normalizeIpAddress("[2001:db8::1]"), "2001:db8::1");
});
