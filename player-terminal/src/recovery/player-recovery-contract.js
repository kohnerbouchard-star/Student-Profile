import { collectSafeApiDiagnostic } from "../api/errors.js";

const SESSION_CODES = new Set([
  "INVALID_PLAYER_SESSION",
  "PLAYER_SESSION_EXPIRED",
  "PLAYER_SESSION_REVOKED",
  "SESSION_EXPIRED",
  "SESSION_INVALID",
  "SESSION_REVOKED"
]);

const OFFLINE_CODES = new Set(["OFFLINE"]);
const NETWORK_CODES = new Set(["NETWORK_ERROR"]);
const TIMEOUT_CODES = new Set(["REQUEST_TIMEOUT"]);
const CONFLICT_CODES = new Set([
  "CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "STALE_PRICE",
  "STALE_STATE",
  "STORE_IDEMPOTENCY_CONFLICT"
]);
const CANCELLED_CODES = new Set(["REQUEST_ABORTED"]);

function normalizedError(error = {}) {
  return Object.freeze({
    status: Number(error?.status || 0),
    code: String(error?.code || "").trim().toUpperCase(),
    retryAfterMs: Math.max(0, Number(error?.retryAfterMs || 0))
  });
}

function loopbackDiagnosticsEnabled(explicit) {
  if (explicit === true) return true;
  if (explicit === false) return false;
  if (globalThis.ECONOVARIA_PLAYER_TERMINAL_CONFIG?.developerDiagnostics === true) return true;
  const hostname = String(globalThis.location?.hostname || "").toLowerCase();
  return new Set(["localhost", "127.0.0.1", "::1"]).has(hostname);
}

function diagnosticText(error, explicit) {
  if (!loopbackDiagnosticsEnabled(explicit)) return "";
  const diagnostic = collectSafeApiDiagnostic(error);
  const segments = [];
  if (diagnostic.code) segments.push(`Code ${diagnostic.code}`);
  if (diagnostic.endpointKey) segments.push(`Endpoint ${diagnostic.endpointKey}`);
  if (diagnostic.status) segments.push(`Status ${diagnostic.status}`);
  if (diagnostic.requestId) segments.push(`Request ${diagnostic.requestId}`);
  const detail = diagnostic.detail || {};
  if (detail.groupName) segments.push(`Group ${detail.groupName}`);
  if (detail.key) segments.push(`Key ${detail.key}`);
  if (detail.endpointKey && detail.endpointKey !== diagnostic.endpointKey) {
    segments.push(`Contract endpoint ${detail.endpointKey}`);
  }
  if (detail.method) segments.push(`Method ${detail.method}`);
  if (detail.pathTemplate) segments.push(`Template ${detail.pathTemplate}`);
  if (detail.receivedSchemaVersion !== undefined) {
    segments.push(`Schema ${detail.receivedSchemaVersion}`);
  }
  if (detail.receivedService) segments.push(`Service ${detail.receivedService}`);
  return segments.length ? ` Diagnostic: ${segments.join(" · ")}.` : "";
}

export function retryAfterSeconds(error = {}) {
  return Math.max(0, Math.ceil(normalizedError(error).retryAfterMs / 1000));
}

export function isSessionInvalidRecovery(error = {}) {
  const normalized = normalizedError(error);
  return normalized.status === 401 || SESSION_CODES.has(normalized.code);
}

export function isTransientTransportFailure(error = {}, { online = true } = {}) {
  const normalized = normalizedError(error);
  return online === false
    || OFFLINE_CODES.has(normalized.code)
    || NETWORK_CODES.has(normalized.code)
    || TIMEOUT_CODES.has(normalized.code)
    || normalized.status === 0
    || normalized.status >= 500;
}

export function isAmbiguousWriteOutcome(error = {}, { idempotentWrite = false, online = true } = {}) {
  if (!idempotentWrite || isSessionInvalidRecovery(error)) return false;
  const normalized = normalizedError(error);
  if (normalized.status === 429 || CONFLICT_CODES.has(normalized.code) || CANCELLED_CODES.has(normalized.code)) return false;
  return isTransientTransportFailure(normalized, { online });
}

export function classifyPlayerRecovery(error = {}, {
  committed = false,
  idempotentWrite = false,
  online = true,
  scope = "read"
} = {}) {
  const normalized = normalizedError(error);
  if (committed) return "confirmed_stale";
  if (isSessionInvalidRecovery(normalized)) return "session_invalid";
  if (isAmbiguousWriteOutcome(normalized, { idempotentWrite, online })) return "ambiguous_write";
  if (online === false || OFFLINE_CODES.has(normalized.code)) return "offline";
  if (normalized.status === 429 || normalized.code === "RATE_LIMITED") return "rate_limited";
  if (CONFLICT_CODES.has(normalized.code) || normalized.status === 409) return "conflict";
  if (TIMEOUT_CODES.has(normalized.code) || normalized.status === 504) return "timeout";
  if (NETWORK_CODES.has(normalized.code) || normalized.status === 502 || normalized.status === 503 || normalized.status >= 500) return "service_unavailable";
  if (CANCELLED_CODES.has(normalized.code)) return "cancelled";
  if (normalized.status === 403) return "forbidden";
  if (normalized.status === 404) return "not_found";
  if (normalized.status === 400 || normalized.status === 422) return "invalid_request";
  return scope === "write" ? "write_failed" : "read_failed";
}

export function buildPlayerRecoveryPresentation(error = {}, {
  committed = false,
  diagnostics,
  idempotentWrite = false,
  online = true,
  operationLabel = "this action",
  scope = "read"
} = {}) {
  const normalized = normalizedError(error);
  const kind = classifyPlayerRecovery(normalized, { committed, idempotentWrite, online, scope });
  const waitSeconds = retryAfterSeconds(normalized);
  const label = String(operationLabel || "this action").trim() || "this action";

  const presentations = {
    confirmed_stale: {
      eyebrow: "ACTION COMPLETED",
      title: "Current information could not be refreshed",
      detail: `${label} completed successfully. The values shown may be stale until an authoritative refresh succeeds.`,
      tone: "amber",
      action: "refresh",
      actionLabel: "Refresh current information",
      preserveData: true
    },
    session_invalid: {
      eyebrow: "SESSION ENDED",
      title: "Return to the Econovaria sign-in screen",
      detail: "The Player session is no longer valid. No local retry will bypass the secure sign-in handoff.",
      tone: "amber",
      action: "session_handoff",
      actionLabel: "Return to sign in",
      preserveData: false
    },
    ambiguous_write: {
      eyebrow: "OUTCOME NOT CONFIRMED",
      title: "Do not submit a different request",
      detail: `The service did not confirm whether ${label} completed. Reconnect if necessary, then retry the same action so the existing idempotency key can resolve one authoritative result.`,
      tone: "amber",
      action: "retry_same",
      actionLabel: "Retry the same action",
      preserveData: true
    },
    offline: {
      eyebrow: "OFFLINE · READ ONLY",
      title: "Connection lost",
      detail: "Previously loaded information remains visible. Economic actions are paused until the connection returns.",
      tone: "red",
      action: "wait_online",
      actionLabel: "Waiting for connection",
      preserveData: true
    },
    rate_limited: {
      eyebrow: "REQUEST LIMITED",
      title: "Pause before retrying",
      detail: waitSeconds > 0
        ? `The service requested a pause. Retry the same action after ${waitSeconds} second${waitSeconds === 1 ? "" : "s"}.`
        : "The service requested a short pause before the same action is retried.",
      tone: "amber",
      action: "retry_same",
      actionLabel: "Retry the same action",
      retryAfterMs: normalized.retryAfterMs,
      preserveData: true
    },
    conflict: {
      eyebrow: "INFORMATION CHANGED",
      title: "Refresh before trying again",
      detail: `A newer authoritative update conflicts with ${label}. Refresh this section before submitting another request.`,
      tone: "amber",
      action: "refresh",
      actionLabel: "Refresh this section",
      preserveData: true
    },
    timeout: {
      eyebrow: "SERVICE TIMEOUT",
      title: "The request took too long",
      detail: "Keep the current information visible and retry when the service is responsive.",
      tone: "red",
      action: "retry",
      actionLabel: "Retry",
      preserveData: true
    },
    service_unavailable: {
      eyebrow: "SERVICE UNAVAILABLE",
      title: "The game service could not respond",
      detail: "Keep the current information visible and retry this section when the connection is stable.",
      tone: "red",
      action: "retry",
      actionLabel: "Retry",
      preserveData: true
    },
    cancelled: {
      eyebrow: "REQUEST CANCELLED",
      title: "No result was applied to this view",
      detail: "The request was cancelled because the session or page context changed.",
      tone: "amber",
      action: "dismiss",
      actionLabel: "Dismiss",
      preserveData: true
    },
    forbidden: {
      eyebrow: "ACTION UNAVAILABLE",
      title: "This Player account cannot perform that action",
      detail: "The server rejected the action. Refresh only if the game administrator has changed your access.",
      tone: "amber",
      action: "refresh",
      actionLabel: "Refresh access",
      preserveData: true
    },
    not_found: {
      eyebrow: "RECORD UNAVAILABLE",
      title: "This record is no longer available",
      detail: "Refresh the section to load the current authoritative records.",
      tone: "amber",
      action: "refresh",
      actionLabel: "Refresh this section",
      preserveData: true
    },
    invalid_request: {
      eyebrow: "REQUEST NOT ACCEPTED",
      title: "Review the entered information",
      detail: "The service did not accept the request. Correct the highlighted information before trying again.",
      tone: "red",
      action: "dismiss",
      actionLabel: "Review information",
      preserveData: true
    },
    write_failed: {
      eyebrow: "ACTION NOT COMPLETED",
      title: "The action could not be completed",
      detail: "No success was confirmed. Review the current information before trying again.",
      tone: "red",
      action: "dismiss",
      actionLabel: "Dismiss",
      preserveData: true
    },
    read_failed: {
      eyebrow: "SECTION UNAVAILABLE",
      title: "This section could not be loaded",
      detail: "Other Player Terminal sections remain available. Retry only this section.",
      tone: "red",
      action: "retry",
      actionLabel: "Retry this section",
      preserveData: true
    }
  };

  const presentation = presentations[kind];
  return Object.freeze({
    kind,
    ...presentation,
    detail: `${presentation.detail}${diagnosticText(error, diagnostics)}`
  });
}
