import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import {
  hmacSha256Hex,
  readTrustedClientIp,
} from "./rateLimitKeying.ts";
import { readPlayerRateLimitConfig } from "./playerRateLimitService.ts";

export const ECONOVARIA_DEVICE_ID_HEADER = "x-econovaria-device-id";

export type AuthenticationThrottleDimension = "account" | "device" | "ip";

export interface AuthenticationThrottleBucket {
  readonly dimension: AuthenticationThrottleDimension;
  readonly keyHash: string;
}

export interface AuthenticationThrottleDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
  readonly limitingDimension: AuthenticationThrottleDimension | null;
  readonly failureCount: number;
  readonly lockedUntil: string | null;
}

export interface AuthenticationThrottleInput {
  readonly request: Request;
  readonly realm: "player" | "staff" | "staff-signup";
  readonly accountIdentifier: string;
}

interface AuthenticationThrottleRpcRow {
  readonly allowed: boolean;
  readonly retry_after_seconds: number | string | null;
  readonly limiting_dimension: string | null;
  readonly failure_count: number | string | null;
  readonly locked_until: string | null;
}

const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ACCOUNT_IDENTIFIER_MAX_LENGTH = 384;

export async function buildAuthenticationThrottleBuckets(
  input: AuthenticationThrottleInput,
): Promise<readonly AuthenticationThrottleBucket[]> {
  const config = readPlayerRateLimitConfig();
  const accountIdentifier = normalizeAccountIdentifier(input.accountIdentifier);
  const deviceId = readDeviceId(input.request);
  const ipAddress = readTrustedClientIp(input.request, config.trustedIpHeader);

  return Promise.all([
    bucket(
      "account",
      config.hmacSecret,
      `${input.realm}\u0000${accountIdentifier}`,
    ),
    bucket(
      "device",
      config.hmacSecret,
      `${input.realm}\u0000${deviceId}`,
    ),
    bucket(
      "ip",
      config.hmacSecret,
      `${input.realm}\u0000${ipAddress}`,
    ),
  ]);
}

export async function checkAuthenticationThrottle(
  client: EdgeSupabaseClient,
  buckets: readonly AuthenticationThrottleBucket[],
): Promise<AuthenticationThrottleDecision> {
  return invokeThrottleRpc(client, "check_authentication_throttle_v2", buckets);
}

export async function recordAuthenticationFailure(
  client: EdgeSupabaseClient,
  buckets: readonly AuthenticationThrottleBucket[],
): Promise<AuthenticationThrottleDecision> {
  return invokeThrottleRpc(client, "record_authentication_failure_v2", buckets);
}

export async function recordAuthenticationSuccess(
  client: EdgeSupabaseClient,
  buckets: readonly AuthenticationThrottleBucket[],
): Promise<void> {
  const result = await client.rpc("record_authentication_success_v2", {
    p_buckets: buckets,
  });
  if (result.error) throw new Error("authentication throttle success update failed");
}

export function readDeviceId(request: Request): string {
  const value = String(request.headers.get(ECONOVARIA_DEVICE_ID_HEADER) || "")
    .trim()
    .toLowerCase();
  if (!DEVICE_ID_PATTERN.test(value)) {
    throw new Error("A valid opaque device identifier is required.");
  }
  return value;
}

export function normalizeAccountIdentifier(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    normalized.length > ACCOUNT_IDENTIFIER_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new Error("Authentication account scope is invalid.");
  }
  return normalized;
}

async function bucket(
  dimension: AuthenticationThrottleDimension,
  secret: string,
  rawValue: string,
): Promise<AuthenticationThrottleBucket> {
  return {
    dimension,
    keyHash: await hmacSha256Hex(
      secret,
      `econovaria-auth-throttle-v2\u0000${dimension}\u0000${rawValue}`,
    ),
  };
}

async function invokeThrottleRpc(
  client: EdgeSupabaseClient,
  functionName:
    | "check_authentication_throttle_v2"
    | "record_authentication_failure_v2",
  buckets: readonly AuthenticationThrottleBucket[],
): Promise<AuthenticationThrottleDecision> {
  const result = await client.rpc<readonly AuthenticationThrottleRpcRow[]>(
    functionName,
    { p_buckets: buckets },
  );
  if (result.error) throw new Error("authentication throttle unavailable");

  const value = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!value || typeof value !== "object") {
    throw new Error("authentication throttle returned an invalid decision");
  }

  const dimension = value.limiting_dimension;
  return {
    allowed: Boolean(value.allowed),
    retryAfterSeconds: boundedInteger(value.retry_after_seconds),
    limitingDimension: dimension === "account" || dimension === "device" || dimension === "ip"
      ? dimension
      : null,
    failureCount: boundedInteger(value.failure_count),
    lockedUntil: typeof value.locked_until === "string" ? value.locked_until : null,
  };
}

function boundedInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(2_147_483_647, Math.floor(parsed));
}
