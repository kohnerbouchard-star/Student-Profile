import { jsonError } from "../platform/supabase/edgeResponse.ts";
import type { RateLimitDecision } from "./rateLimitContracts.ts";

export function rateLimitExceededResponse(
  decision: RateLimitDecision,
): Response {
  const retryAfter = Math.max(1, Math.ceil(decision.retryAfterSeconds));
  const response = jsonError(429, {
    code: "rate_limit_exceeded",
    message: "Too many requests. Wait before trying again.",
    retryable: true,
  });
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("retry-after", String(retryAfter));
  response.headers.set("ratelimit-limit", String(decision.limit));
  response.headers.set("ratelimit-remaining", "0");
  response.headers.set("ratelimit-reset", String(retryAfter));
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}

export function rateLimitUnavailableResponse(): Response {
  const response = jsonError(503, {
    code: "rate_limit_service_unavailable",
    message: "Request protection is temporarily unavailable.",
    retryable: true,
  });
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("retry-after", "5");
  response.headers.set("vary", "authorization, x-player-session-token");
  return response;
}
