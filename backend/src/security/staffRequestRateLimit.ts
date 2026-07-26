import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import {
  buildStaffRateLimitBuckets,
  type StaffRateLimitProfile,
} from "./rateLimitKeying.ts";
import type {
  RateLimitDecision,
  RateLimitRpcResult,
} from "./rateLimitContracts.ts";
import { readPlayerRateLimitConfig } from "./playerRateLimitService.ts";

export interface StaffRequestRateLimitInput {
  readonly request: Request;
  readonly action: string;
  readonly profile: StaffRateLimitProfile;
  readonly gameId: string;
  readonly staffUserId: string;
}

export async function enforceStaffRequestRateLimit(
  input: StaffRequestRateLimitInput,
  serviceClient: EdgeSupabaseClient,
): Promise<RateLimitDecision> {
  const config = readPlayerRateLimitConfig();
  const buckets = await buildStaffRateLimitBuckets({
    action: input.action,
    request: input.request,
    gameId: input.gameId,
    staffUserId: input.staffUserId,
    profile: input.profile,
    hmacSecret: config.hmacSecret,
    trustedIpHeader: config.trustedIpHeader,
  });

  const response = await serviceClient.rpc<readonly RateLimitRpcResult[]>(
    "consume_request_rate_limits_v1",
    { p_buckets: buckets },
  );
  if (response.error) {
    throw new Error("Staff request rate limiting is unavailable.");
  }

  const result = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!result || typeof result !== "object") {
    throw new Error("Staff request rate limiting returned an invalid response.");
  }

  return {
    allowed: Boolean(result.allowed),
    retryAfterSeconds: boundedInteger(result.retry_after_seconds),
    limitingDimension: normalizeDimension(result.limiting_dimension),
    limit: boundedInteger(result.limit_count),
    remaining: boundedInteger(result.remaining_count),
    resetAt: typeof result.reset_at === "string"
      ? result.reset_at
      : new Date().toISOString(),
  };
}

export function normalizedStaffAction(method: string, path: string): string {
  const normalizedPath = String(path || "/")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/giu, ":uuid")
    .replace(/\/[0-9]+(?=\/|$)/gu, "/:id")
    .replace(/\/{2,}/gu, "/")
    .slice(0, 420);
  return `staff.${String(method || "GET").toUpperCase()}.${normalizedPath}`;
}

function boundedInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(2_147_483_647, Math.floor(parsed));
}

function normalizeDimension(value: unknown): RateLimitDecision["limitingDimension"] {
  return value === "route" || value === "game" || value === "identity" ||
      value === "ip"
    ? value
    : null;
}
