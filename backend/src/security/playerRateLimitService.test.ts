import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import {
  enforcePreAuthRateLimit,
  enforceScopedRateLimit,
  readPlayerRateLimitConfig,
} from "./playerRateLimitService.ts";
import type { RateLimitBucketInput, RateLimitDecision, RateLimitRepository } from "./rateLimitContracts.ts";

const SECRET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";
const GAME = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-000000000021";
const ALLOWED: RateLimitDecision = { allowed: true, retryAfterSeconds: 0, limitingDimension: null, limit: 90, remaining: 89, resetAt: "2026-07-20T00:01:00.000Z" };

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };
const assert = (condition: unknown, message = "assertion failed") => { if (!condition) throw new Error(message); };
const equal = (actual: unknown, expected: unknown) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);

class RecordingRepository implements RateLimitRepository {
  readonly calls: RateLimitBucketInput[][] = [];
  constructor(readonly result: RateLimitDecision = ALLOWED) {}
  consume(buckets: readonly RateLimitBucketInput[]): Promise<RateLimitDecision> {
    this.calls.push([...buckets]);
    return Promise.resolve(this.result);
  }
}

const client = {} as EdgeSupabaseClient;
const request = new Request("https://example.invalid", { headers: { "x-forwarded-for": "203.0.113.42" } });
const dependencies = (repository: RateLimitRepository) => ({
  readConfig: () => ({ hmacSecret: SECRET, trustedIpHeader: "x-forwarded-for" as const }),
  createRepository: () => repository,
});

Deno.test("scoped service consumes four server-derived dimensions", async () => {
  const repository = new RecordingRepository();
  const result = await enforceScopedRateLimit({ action: "player.attendance.clock-in", profile: "attendance", request, identityUuid: ACTOR, gameUuid: GAME }, client, dependencies(repository));
  equal(result, ALLOWED);
  equal(repository.calls[0]?.map((bucket) => bucket.dimension), ["action", "game", "identity", "ip"]);
  assert(!JSON.stringify(repository.calls).includes(ACTOR));
  assert(!JSON.stringify(repository.calls).includes(GAME));
  assert(!JSON.stringify(repository.calls).includes("203.0.113.42"));
});

Deno.test("pre-auth login consumes only action and IP", async () => {
  const repository = new RecordingRepository();
  await enforcePreAuthRateLimit({ action: "player.login.attempt", profile: "login", request }, client, dependencies(repository));
  equal(repository.calls[0]?.map((bucket) => bucket.dimension), ["action", "ip"]);
});

Deno.test("configuration fails closed for weak key or unknown header", () => {
  const valid = readPlayerRateLimitConfig((name) => name === "ECONOVARIA_RATE_LIMIT_HMAC_SECRET" ? SECRET : "x-forwarded-for");
  equal(valid.trustedIpHeader, "x-forwarded-for");
  for (const env of [
    (name: string) => name === "ECONOVARIA_RATE_LIMIT_HMAC_SECRET" ? "weak" : "x-forwarded-for",
    (name: string) => name === "ECONOVARIA_RATE_LIMIT_HMAC_SECRET" ? SECRET : "browser-ip",
  ]) {
    let rejected = false;
    try { readPlayerRateLimitConfig(env); } catch { rejected = true; }
    assert(rejected);
  }
});
