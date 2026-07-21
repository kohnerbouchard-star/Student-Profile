import type { EdgeSupabaseClient } from "../platform/supabase/edgeStaffSession.ts";
import type { PlayerRequestScope } from "../domains/players/api/playerRequestScope.ts";
import {
  enforcePlayerRateLimit,
  type EnforcePlayerRateLimitInput,
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
    input: EnforcePlayerRateLimitInput,
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
    const decision = await (dependencies.enforce ?? enforcePlayerRateLimit)({
      action: operation.action,
      profile: operation.profile,
      request: input.request,
      scope: staffScope(input),
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
  if (input.suffix === "/messages/threads" && method === "POST") {
    return operation("staff.messages.create", "sensitive");
  }
  if (
    method === "POST" &&
    /^\/messages\/threads\/thr_[0-9a-f]{32}\/(disable|enable|close)$/.test(input.suffix)
  ) {
    return operation("staff.messages.moderate", "sensitive");
  }
  if (
    method === "POST" &&
    /^\/messages\/threads\/thr_[0-9a-f]{32}\/messages\/msg_[0-9a-f]{32}\/(hide|unhide)$/.test(input.suffix)
  ) {
    return operation("staff.messages.moderate", "sensitive");
  }
  if (
    method === "POST" &&
    /^\/messages\/threads\/thr_[0-9a-f]{32}\/delete$/.test(input.suffix)
  ) {
    return operation("staff.messages.retention.delete", "sensitive");
  }
  return null;
}

function staffScope(input: StaffMessagingRateLimitInput): PlayerRequestScope {
  return {
    playerUuid: input.staffUserId,
    gameId: input.gameId,
    activeSessionId: input.staffUserId,
    sessionValid: true,
    sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    authorizationContext: {
      actorType: "player",
      source: "player_session",
      gameScope: "session",
      resourceScope: "own_player",
    },
  };
}

function operation(
  action: string,
  profile: PlayerRateLimitProfile,
): Operation {
  return Object.freeze({ action, profile });
}
