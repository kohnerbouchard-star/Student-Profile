import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import type { RateLimitBucketInput } from "./rateLimitContracts.ts";
import { RateLimitError } from "./rateLimitContracts.ts";
import { SupabaseRateLimitRepository } from "./supabaseRateLimitRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const BUCKETS: readonly RateLimitBucketInput[] = [
  "action",
  "game",
  "identity",
  "ip",
].map((dimension, index) => ({
  dimension: dimension as RateLimitBucketInput["dimension"],
  keyHash: String(index + 1).repeat(64),
  limit: 10,
  windowSeconds: 60,
  blockSeconds: 30,
}));

Deno.test("rate-limit repository calls the atomic RPC once and maps its decision", async () => {
  const calls: unknown[] = [];
  const repository = new SupabaseRateLimitRepository({
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      return Promise.resolve({
        data: [{
          allowed: false,
          retry_after_seconds: 30,
          limiting_dimension: "action",
          limit_count: 10,
          remaining_count: 0,
          reset_at: "2026-07-18T00:01:00.000Z",
        }],
        error: null,
      });
    },
  } as unknown as EdgeSupabaseClient);

  const decision = await repository.consume(BUCKETS);
  assertEquals(calls, [{
    name: "consume_request_rate_limits_v1",
    args: { p_buckets: BUCKETS },
  }]);
  assertEquals(decision, {
    allowed: false,
    retryAfterSeconds: 30,
    limitingDimension: "action",
    limit: 10,
    remaining: 0,
    resetAt: "2026-07-18T00:01:00.000Z",
  });
});

Deno.test("rate-limit repository fails closed on RPC errors and malformed results", async () => {
  for (
    const response of [
      { data: null, error: { message: "missing rpc" } },
      { data: [], error: null },
      { data: [{ allowed: true }], error: null },
      {
        data: [{
          allowed: false,
          retry_after_seconds: -1,
          limiting_dimension: "token",
          limit_count: 0,
          remaining_count: -1,
          reset_at: "invalid",
        }],
        error: null,
      },
    ]
  ) {
    const repository = new SupabaseRateLimitRepository({
      rpc: () => Promise.resolve(response),
    } as unknown as EdgeSupabaseClient);
    await assertUnavailable(() => repository.consume(BUCKETS));
  }
});

async function assertUnavailable(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (
      error instanceof RateLimitError &&
      error.code === "rate_limit_service_unavailable"
    ) return;
    throw error;
  }
  throw new Error("Expected rate_limit_service_unavailable.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
