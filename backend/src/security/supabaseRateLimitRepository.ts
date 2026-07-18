import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import {
  RATE_LIMIT_DIMENSIONS,
  type RateLimitBucketInput,
  type RateLimitDecision,
  RateLimitError,
  type RateLimitRepository,
} from "./rateLimitContracts.ts";

interface RateLimitRpcRow {
  readonly allowed: boolean;
  readonly retry_after_seconds: number;
  readonly limiting_dimension: string | null;
  readonly limit_count: number;
  readonly remaining_count: number;
  readonly reset_at: string;
}

export class SupabaseRateLimitRepository implements RateLimitRepository {
  constructor(
    private readonly client: EdgeSupabaseClient,
    private readonly rpcName:
      | "consume_request_rate_limits_v1"
      | "consume_pre_auth_request_rate_limits_v1" =
        "consume_request_rate_limits_v1",
  ) {}

  async consume(
    buckets: readonly RateLimitBucketInput[],
  ): Promise<RateLimitDecision> {
    const response = await this.client.rpc<RateLimitRpcRow[] | RateLimitRpcRow>(
      this.rpcName,
      { p_buckets: buckets },
    );

    if (response.error) {
      throw unavailable();
    }

    const row = Array.isArray(response.data) ? response.data[0] : response.data;
    if (!isValidRow(row)) {
      throw unavailable();
    }

    return {
      allowed: row.allowed,
      retryAfterSeconds: row.retry_after_seconds,
      limitingDimension: row.limiting_dimension,
      limit: row.limit_count,
      remaining: row.remaining_count,
      resetAt: row.reset_at,
    };
  }
}

function isValidRow(value: unknown): value is RateLimitRpcRow & {
  readonly limiting_dimension: RateLimitDecision["limitingDimension"];
} {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<RateLimitRpcRow>;
  return typeof row.allowed === "boolean" &&
    Number.isInteger(row.retry_after_seconds) &&
    (row.retry_after_seconds as number) >= 0 &&
    (row.limiting_dimension === null ||
      RATE_LIMIT_DIMENSIONS.includes(row.limiting_dimension as never)) &&
    Number.isInteger(row.limit_count) && (row.limit_count as number) > 0 &&
    Number.isInteger(row.remaining_count) &&
    (row.remaining_count as number) >= 0 &&
    typeof row.reset_at === "string" &&
    Number.isFinite(Date.parse(row.reset_at));
}

function unavailable(): RateLimitError {
  return new RateLimitError(
    "rate_limit_service_unavailable",
    "Request rate limiting is temporarily unavailable.",
  );
}
