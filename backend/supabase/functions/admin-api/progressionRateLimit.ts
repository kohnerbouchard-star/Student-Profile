import {
  buildStaffRateLimitBuckets,
  readTrustedClientIp,
  TRUSTED_IP_HEADERS,
  type TrustedIpHeader,
} from "../../../src/security/rateLimitKeying.ts";
import type {
  PlayerRateLimitProfile,
  RateLimitBucketInput,
  RateLimitDecision,
} from "../../../src/security/rateLimitContracts.ts";

interface RpcError {
  readonly message: string;
}
interface RateLimitService {
  rpc<T>(
    name: string,
    args: unknown,
  ): PromiseLike<{ readonly data: T | null; readonly error: RpcError | null }>;
}
interface RateLimitRpcRow {
  readonly allowed?: unknown;
  readonly retry_after_seconds?: unknown;
  readonly limiting_dimension?: unknown;
  readonly limit_count?: unknown;
  readonly remaining_count?: unknown;
  readonly reset_at?: unknown;
}

export async function consumeAdminProgressionRateLimit(
  service: RateLimitService,
  input: {
    readonly request: Request;
    readonly gameId: string;
    readonly staffUserId: string;
    readonly action: string;
    readonly profile: PlayerRateLimitProfile;
  },
): Promise<RateLimitDecision> {
  const hmacSecret = Deno.env.get("ECONOVARIA_RATE_LIMIT_HMAC_SECRET") ?? "";
  const configuredHeader = (Deno.env.get("ECONOVARIA_TRUSTED_CLIENT_IP_HEADER") ?? "")
    .trim()
    .toLowerCase();
  if (!TRUSTED_IP_HEADERS.includes(configuredHeader as TrustedIpHeader)) {
    throw new Error("rate limit configuration unavailable");
  }
  const ipAddress = readTrustedClientIp(
    input.request,
    configuredHeader as TrustedIpHeader,
  );
  const buckets = await buildStaffRateLimitBuckets({
    action: input.action,
    gameUuid: input.gameId,
    ipAddress,
    staffUuid: input.staffUserId,
    profile: input.profile,
  }, hmacSecret);
  return consume(service, buckets);
}

async function consume(
  service: RateLimitService,
  buckets: readonly RateLimitBucketInput[],
): Promise<RateLimitDecision> {
  const response = await service.rpc<RateLimitRpcRow[] | RateLimitRpcRow>(
    "consume_request_rate_limits_v1",
    { p_buckets: buckets },
  );
  if (response.error) throw new Error("rate limit service unavailable");
  const row = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!isValidRow(row)) throw new Error("rate limit response invalid");
  return {
    allowed: row.allowed,
    retryAfterSeconds: row.retry_after_seconds,
    limitingDimension: row.limiting_dimension,
    limit: row.limit_count,
    remaining: row.remaining_count,
    resetAt: row.reset_at,
  };
}

function isValidRow(value: unknown): value is {
  readonly allowed: boolean;
  readonly retry_after_seconds: number;
  readonly limiting_dimension: RateLimitDecision["limitingDimension"];
  readonly limit_count: number;
  readonly remaining_count: number;
  readonly reset_at: string;
} {
  if (!value || typeof value !== "object") return false;
  const row = value as RateLimitRpcRow;
  return typeof row.allowed === "boolean" &&
    Number.isSafeInteger(row.retry_after_seconds) &&
    Number(row.retry_after_seconds) >= 0 &&
    (row.limiting_dimension === null ||
      ["action", "game", "identity", "ip"].includes(String(row.limiting_dimension))) &&
    Number.isSafeInteger(row.limit_count) && Number(row.limit_count) > 0 &&
    Number.isSafeInteger(row.remaining_count) && Number(row.remaining_count) >= 0 &&
    typeof row.reset_at === "string" &&
    Number.isFinite(Date.parse(row.reset_at));
}
