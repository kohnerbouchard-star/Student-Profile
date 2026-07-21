import {
  buildAuthenticatedRateLimitBuckets,
  readTrustedClientIp,
  TRUSTED_IP_HEADERS,
  type TrustedIpHeader,
  validateRateLimitHmacSecret,
} from "./rateLimitKeying.ts";
import {
  RATE_LIMIT_DIMENSIONS,
  type PlayerRateLimitProfile,
  type RateLimitBucketInput,
  type RateLimitDecision,
} from "./rateLimitContracts.ts";

declare const Deno: {
  readonly env: { get(name: string): string | undefined };
};

interface RateLimitRpcRow {
  readonly allowed: boolean;
  readonly retry_after_seconds: number;
  readonly limiting_dimension: string | null;
  readonly limit_count: number;
  readonly remaining_count: number;
  readonly reset_at: string;
}
interface RateLimitClient {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{
    readonly data: T | null;
    readonly error: { readonly message: string } | null;
  }>;
}

export interface StaffMessagingRateLimitInput {
  readonly request: Request;
  readonly gameId: string;
  readonly staffUserId: string;
  readonly suffix: string;
}
export interface StaffMessagingRateLimitResult {
  readonly handled: true;
  readonly status: number;
  readonly body: unknown;
}
export interface StaffMessagingRateLimitDependencies {
  readonly enforce?: (
    input: Readonly<{
      action: string;
      profile: PlayerRateLimitProfile;
      request: Request;
      staffUuid: string;
      gameUuid: string;
    }>,
    client: RateLimitClient,
  ) => Promise<RateLimitDecision>;
  readonly readConfig?: () => Readonly<{
    hmacSecret: string;
    trustedIpHeader: TrustedIpHeader;
  }>;
}
interface Operation { readonly action: string; readonly profile: PlayerRateLimitProfile }

export async function guardStaffMessagingRateLimit(
  client: unknown,
  input: StaffMessagingRateLimitInput,
  dependencies: StaffMessagingRateLimitDependencies = {},
): Promise<StaffMessagingRateLimitResult | null> {
  const operation = readStaffMessagingRateLimitOperation(input);
  if (!operation) return null;

  try {
    const rateLimitClient = client as RateLimitClient;
    const decision = dependencies.enforce
      ? await dependencies.enforce({
        ...operation,
        request: input.request,
        staffUuid: input.staffUserId,
        gameUuid: input.gameId,
      }, rateLimitClient)
      : await enforceStaffMessagingRateLimit({
        ...operation,
        request: input.request,
        staffUuid: input.staffUserId,
        gameUuid: input.gameId,
      }, rateLimitClient, dependencies.readConfig);
    if (decision.allowed) return null;
    return {
      handled: true,
      status: 429,
      body: {
        code: "rate_limit_exceeded",
        message: "Too many Messaging requests. Try again after the retry window.",
        retryable: true,
        retryAfterSeconds: decision.retryAfterSeconds,
      },
    };
  } catch {
    return {
      handled: true,
      status: 503,
      body: {
        code: "rate_limit_service_unavailable",
        message: "Messaging rate limiting is temporarily unavailable.",
        retryable: true,
      },
    };
  }
}

export function readStaffMessagingRateLimitOperation(
  input: Pick<StaffMessagingRateLimitInput, "request" | "suffix">,
): Operation | null {
  const method = input.request.method.toUpperCase();
  if (input.suffix === "/messages" && method === "GET") {
    return new URL(input.request.url).searchParams.has("q")
      ? operation("staff.messages.search", "read")
      : operation("staff.messages.read", "read");
  }
  if (input.suffix === "/messages/policy" && method === "GET") {
    return operation("staff.messages.policy.read", "read");
  }
  if (input.suffix === "/messages/policy" && method === "POST") {
    return operation("staff.messages.policy.write", "sensitive");
  }
  if (input.suffix === "/messages/threads" && method === "POST") {
    return operation("staff.messages.create", "sensitive");
  }
  const threadMatch = input.suffix.match(/^\/messages\/threads\/thr_([0-9a-f]{32})(?:\/|$)/);
  if (threadMatch?.[1] && method === "POST") {
    return operation(`staff.messages.thr_${threadMatch[1].slice(0, 24)}`, "sensitive");
  }
  return null;
}

async function enforceStaffMessagingRateLimit(
  input: Readonly<{
    action: string;
    profile: PlayerRateLimitProfile;
    request: Request;
    staffUuid: string;
    gameUuid: string;
  }>,
  client: RateLimitClient,
  readConfig?: StaffMessagingRateLimitDependencies["readConfig"],
): Promise<RateLimitDecision> {
  const config = (readConfig ?? readRuntimeConfig)();
  const ipAddress = readTrustedClientIp(input.request, config.trustedIpHeader);
  const buckets = await buildAuthenticatedRateLimitBuckets({
    action: input.action,
    gameUuid: input.gameUuid,
    identityUuid: input.staffUuid,
    ipAddress,
    profile: input.profile,
  }, config.hmacSecret);
  return consumeRateLimitBuckets(client, buckets);
}

async function consumeRateLimitBuckets(
  client: RateLimitClient,
  buckets: readonly RateLimitBucketInput[],
): Promise<RateLimitDecision> {
  const response = await client.rpc<RateLimitRpcRow[] | RateLimitRpcRow>(
    "consume_request_rate_limits_v1",
    { p_buckets: buckets },
  );
  if (response.error) throw new Error("rate limit unavailable");
  const row = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!validRow(row)) throw new Error("rate limit unavailable");
  return {
    allowed: row.allowed,
    retryAfterSeconds: row.retry_after_seconds,
    limitingDimension: row.limiting_dimension,
    limit: row.limit_count,
    remaining: row.remaining_count,
    resetAt: row.reset_at,
  };
}

function validRow(value: unknown): value is RateLimitRpcRow & {
  readonly limiting_dimension: RateLimitDecision["limitingDimension"];
} {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<RateLimitRpcRow>;
  return typeof row.allowed === "boolean" &&
    Number.isInteger(row.retry_after_seconds) && Number(row.retry_after_seconds) >= 0 &&
    (row.limiting_dimension === null || RATE_LIMIT_DIMENSIONS.includes(row.limiting_dimension as never)) &&
    Number.isInteger(row.limit_count) && Number(row.limit_count) > 0 &&
    Number.isInteger(row.remaining_count) && Number(row.remaining_count) >= 0 &&
    typeof row.reset_at === "string" && Number.isFinite(Date.parse(row.reset_at));
}

function readRuntimeConfig() {
  const hmacSecret = Deno.env.get("ECONOVARIA_RATE_LIMIT_HMAC_SECRET") ?? "";
  const header = (Deno.env.get("ECONOVARIA_TRUSTED_CLIENT_IP_HEADER") ?? "")
    .trim().toLowerCase();
  validateRateLimitHmacSecret(hmacSecret);
  if (!TRUSTED_IP_HEADERS.includes(header as TrustedIpHeader)) {
    throw new Error("invalid rate limit configuration");
  }
  return Object.freeze({
    hmacSecret,
    trustedIpHeader: header as TrustedIpHeader,
  });
}
function operation(action: string, profile: PlayerRateLimitProfile): Operation {
  return Object.freeze({ action, profile });
}
