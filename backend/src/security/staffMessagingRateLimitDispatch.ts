import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import {
  enforceStaffRateLimit,
  type EnforceStaffRateLimitInput,
} from "./playerRateLimitService.ts";
import type { PlayerRateLimitProfile, RateLimitDecision } from "./rateLimitContracts.ts";

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
    input: EnforceStaffRateLimitInput,
    client: EdgeSupabaseClient,
  ) => Promise<RateLimitDecision>;
}

interface Operation {
  readonly action: string;
  readonly profile: PlayerRateLimitProfile;
}

export async function guardStaffMessagingRateLimit(
  client: EdgeSupabaseClient,
  input: StaffMessagingRateLimitInput,
  dependencies: StaffMessagingRateLimitDependencies = {},
): Promise<StaffMessagingRateLimitResult | null> {
  const operation = readStaffMessagingRateLimitOperation(input);
  if (!operation) return null;

  try {
    const decision = await (dependencies.enforce ?? enforceStaffRateLimit)({
      action: operation.action,
      profile: operation.profile,
      request: input.request,
      staffUuid: input.staffUserId,
      gameUuid: input.gameId,
    }, client);
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

function operation(
  action: string,
  profile: PlayerRateLimitProfile,
): Operation {
  return Object.freeze({ action, profile });
}
