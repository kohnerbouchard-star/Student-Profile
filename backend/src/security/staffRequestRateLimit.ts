import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import {
  buildStaffRateLimitBuckets,
  readTrustedClientIp,
} from "./rateLimitKeying.ts";
import type {
  PlayerRateLimitProfile,
  RateLimitDecision,
} from "./rateLimitContracts.ts";
import { readPlayerRateLimitConfig } from "./playerRateLimitService.ts";

export interface StaffRequestRateLimitInput {
  readonly request: Request;
  readonly action: string;
  readonly profile: PlayerRateLimitProfile;
  readonly gameId: string;
  readonly staffUserId: string;
}

interface RateLimitRpcRow {
  readonly allowed?: unknown;
  readonly retry_after_seconds?: unknown;
  readonly limiting_dimension?: unknown;
  readonly limit_count?: unknown;
  readonly remaining_count?: unknown;
  readonly reset_at?: unknown;
}

const STAFF_ACTION_RESOURCES = new Set([
  "account",
  "attendance",
  "auth",
  "contracts",
  "economy",
  "games",
  "inventory",
  "market",
  "marketplace",
  "messaging",
  "players",
  "progression",
  "settings",
  "store",
  "world",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function enforceStaffRequestRateLimit(
  input: StaffRequestRateLimitInput,
  serviceClient: EdgeSupabaseClient,
): Promise<RateLimitDecision> {
  const config = readPlayerRateLimitConfig();
  const ipAddress = readTrustedClientIp(
    input.request,
    config.trustedIpHeader,
  );
  const buckets = await buildStaffRateLimitBuckets({
    action: input.action,
    gameUuid: input.gameId,
    ipAddress,
    staffUuid: input.staffUserId,
    profile: input.profile,
  }, config.hmacSecret);

  const response = await serviceClient.rpc<
    readonly RateLimitRpcRow[] | RateLimitRpcRow
  >(
    "consume_request_rate_limits_v1",
    { p_buckets: buckets },
  );
  if (response.error) {
    throw new Error("Staff request rate limiting is unavailable.");
  }

  const result = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!isValidRpcRow(result)) {
    throw new Error("Staff request rate limiting returned an invalid response.");
  }

  return {
    allowed: result.allowed,
    retryAfterSeconds: result.retry_after_seconds,
    limitingDimension: result.limiting_dimension,
    limit: result.limit_count,
    remaining: result.remaining_count,
    resetAt: result.reset_at,
  };
}

export function normalizedStaffAction(method: string, path: string): string {
  const verb = ["GET", "HEAD"].includes(String(method).toUpperCase())
    ? "read"
    : String(method).toUpperCase() === "DELETE"
    ? "delete"
    : "write";
  return `staff.api.${verb}.${staffActionResource(path)}`;
}

function staffActionResource(path: string): string {
  const segments = String(path || "/")
    .split("/", 8)
    .map(decodePathSegment)
    .filter(Boolean);
  let candidate = segments[0] || "unknown";
  if (
    candidate === "games" &&
    segments[1] &&
    UUID_PATTERN.test(segments[1])
  ) {
    candidate = segments[2] || "games";
  } else if (
    candidate === "staff" &&
    segments[1] === "game-sessions" &&
    segments[2] &&
    UUID_PATTERN.test(segments[2])
  ) {
    candidate = segments[3] || "games";
  }
  const normalized = candidate
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 32);
  return STAFF_ACTION_RESOURCES.has(normalized) ? normalized : "unknown";
}

function decodePathSegment(value: string): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function isValidRpcRow(value: unknown): value is {
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
      ["action", "game", "identity", "ip"].includes(
        String(row.limiting_dimension),
      )) &&
    Number.isSafeInteger(row.limit_count) && Number(row.limit_count) > 0 &&
    Number.isSafeInteger(row.remaining_count) && Number(row.remaining_count) >= 0 &&
    typeof row.reset_at === "string" &&
    Number.isFinite(Date.parse(row.reset_at));
}
