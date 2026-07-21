import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import {
  buildAuthenticatedRateLimitBuckets,
  readTrustedClientIp,
  TRUSTED_IP_HEADERS,
  type TrustedIpHeader,
  validateRateLimitHmacSecret,
} from "./rateLimitKeying.ts";
import type { PlayerRateLimitProfile, RateLimitDecision } from "./rateLimitContracts.ts";
import { SupabaseRateLimitRepository } from "./supabaseRateLimitRepository.ts";

declare const Deno: {
  readonly env: { get(name: string): string | undefined };
};

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
    client: EdgeSupabaseClient,
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
    const edgeClient = client as EdgeSupabaseClient;
    const decision = dependencies.enforce
      ? await dependencies.enforce({
        ...operation,
        request: input.request,
        staffUuid: input.staffUserId,
        gameUuid: input.gameId,
      }, edgeClient)
      : await enforceStaffMessagingRateLimit({
        ...operation,
        request: input.request,
        staffUuid: input.staffUserId,
        gameUuid: input.gameId,
      }, edgeClient, dependencies.readConfig);
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
  client: EdgeSupabaseClient,
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
  return new SupabaseRateLimitRepository(client).consume(buckets);
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
