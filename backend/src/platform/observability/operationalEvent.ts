export type OutcomeClass = "success" | "client_error" | "auth_denied" | "cross_scope_denied" | "rate_limited" | "dependency_failure" | "server_error";
export type FailureClassification = "none" | "authentication" | "cross_scope" | "rate_limit" | "database" | "dependency" | "application";

export interface OperationalEventInput {
  occurredAt: string;
  service: string;
  releaseSha: string;
  requestId: string;
  routeTemplate: string;
  actorKey?: string | null;
  gameKey?: string | null;
  outcomeClass: OutcomeClass;
  httpStatus: number;
  durationMs: number;
  database?: { queryCount: number; durationMs: number } | null;
  retryOutcome?: string;
  idempotencyOutcome?: string;
  rateLimitOutcome?: string;
  coldStart?: boolean;
  failureClassification?: FailureClassification;
}

const forbiddenPattern = /(authorization|password|access.?code|session.?token|service.?role|request.?body|bearer\s+|eyJ[a-zA-Z0-9_-]{12,})/i;
const actorPattern = /^actor_[a-z0-9_-]{16,32}$/;
const gamePattern = /^game_[a-z0-9_-]{16,32}$/;

export function normalizeRouteTemplate(value: string): string {
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":uuid")
    .replace(/\b\d+\b/g, ":number")
    .replace(/\/[a-z0-9_-]{25,}(?=\/|$)/gi, "/:key")
    .slice(0, 160);
}

export function classifyOutcome(status: number, failure: FailureClassification = "none"): OutcomeClass {
  if (status === 429 || failure === "rate_limit") return "rate_limited";
  if (status === 401 || failure === "authentication") return "auth_denied";
  if (status === 403 && failure === "cross_scope") return "cross_scope_denied";
  if (status >= 500 && ["database", "dependency"].includes(failure)) return "dependency_failure";
  if (status >= 500) return "server_error";
  if (status >= 400) return "client_error";
  return "success";
}

export function createOperationalEvent(input: OperationalEventInput) {
  if (input.actorKey && !actorPattern.test(input.actorKey)) throw new Error("Actor identifier must be precomputed and pseudonymous.");
  if (input.gameKey && !gamePattern.test(input.gameKey)) throw new Error("Game identifier must be precomputed and pseudonymous.");
  const event = {
    schemaVersion: 1,
    eventType: "http_request",
    occurredAt: input.occurredAt,
    service: input.service.slice(0, 48),
    releaseSha: input.releaseSha,
    requestId: input.requestId.slice(0, 96),
    routeTemplate: normalizeRouteTemplate(input.routeTemplate),
    actorKey: input.actorKey ?? null,
    gameKey: input.gameKey ?? null,
    outcomeClass: input.outcomeClass,
    httpStatus: input.httpStatus,
    durationMs: Math.round(input.durationMs * 100) / 100,
    database: input.database ? { queryCount: input.database.queryCount, durationMs: Math.round(input.database.durationMs * 100) / 100 } : null,
    retryOutcome: input.retryOutcome ?? "not_retried",
    idempotencyOutcome: input.idempotencyOutcome ?? "not_applicable",
    rateLimitOutcome: input.rateLimitOutcome ?? "not_checked",
    coldStart: Boolean(input.coldStart),
    failureClassification: input.failureClassification ?? "none",
  };
  const serialized = JSON.stringify(event);
  if (serialized.length >= 2048 || forbiddenPattern.test(serialized)) throw new Error("Operational event is unsafe or oversized.");
  return event;
}

export function serializeOperationalEvent(event: ReturnType<typeof createOperationalEvent>): string {
  return JSON.stringify(event);
}
