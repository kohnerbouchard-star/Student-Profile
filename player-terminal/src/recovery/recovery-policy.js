const MAX_RETRY_AFTER_MS = 5 * 60 * 1000;

function normalizedCode(value) {
  return String(value || "").trim().toUpperCase();
}

function boundedRetryAfter(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(1000, Math.round(number)));
}

function retryAfterFromMessage(message) {
  const match = String(message || "").match(/try again in\s+(\d+)\s+seconds?/i);
  return match ? boundedRetryAfter(Number(match[1]) * 1000) : 0;
}

function recoveryState(kind, overrides = {}) {
  return Object.freeze({
    kind,
    eyebrow: "RECOVERY",
    title: "Player Terminal needs attention",
    message: "Retry when the game service is available.",
    tone: "amber",
    retryAfterMs: 0,
    canRetry: true,
    canDismiss: true,
    lockMutations: false,
    persistent: true,
    ...overrides,
  });
}

export function classifyPlayerRecoverySignal({
  status = 0,
  code = "",
  message = "",
  retryAfterMs = 0,
  online = true,
} = {}) {
  const safeCode = normalizedCode(code);
  const safeMessage = String(message || "").trim();
  const lowerMessage = safeMessage.toLowerCase();
  const safeStatus = Number(status) || 0;

  if (!online || ["OFFLINE", "NETWORK_ERROR"].includes(safeCode) || lowerMessage.includes("connection lost") || lowerMessage.includes("device appears to be offline")) {
    return recoveryState("offline", {
      eyebrow: "OFFLINE",
      title: "Connection lost",
      message: "Read-only content may remain visible, but new actions are disabled until the connection returns.",
      tone: "red",
      canRetry: false,
      canDismiss: false,
      lockMutations: true,
    });
  }

  if ([
    "GAME_ENDED",
    "GAME_ARCHIVED",
    "GAME_NOT_ACTIVE",
    "GAME_LIFECYCLE_TERMINAL",
    "ENDED",
    "ARCHIVED",
  ].includes(safeCode) || lowerMessage.includes("game has ended") || lowerMessage.includes("ended or been archived") || lowerMessage.includes("game is no longer active")) {
    return recoveryState("game-ended", {
      eyebrow: "GAME ENDED",
      title: "This game is read-only",
      message: "The administrator ended this game. Existing records remain available, but new economic actions are disabled.",
      tone: "red",
      canRetry: false,
      canDismiss: false,
      lockMutations: true,
    });
  }

  if ([
    "GAME_PAUSED",
    "GAME_MUTATIONS_PAUSED",
    "GAME_STATE_LOCKED",
    "GAME_LIFECYCLE_UNKNOWN",
    "PAUSED",
    "DISABLED",
    "DRAFT",
    "MUTATIONS_PAUSED",
  ].includes(safeCode) || lowerMessage.includes("game is paused") || lowerMessage.includes("game mutations are paused") || lowerMessage.includes("economic actions are paused") || lowerMessage.includes("mutations are blocked")) {
    return recoveryState("game-paused", {
      eyebrow: "GAME PAUSED",
      title: "Economic actions are temporarily paused",
      message: "You can continue reviewing information. Retry after the administrator resumes the game.",
      tone: "amber",
      canDismiss: false,
      lockMutations: true,
    });
  }

  if (safeStatus === 429 || safeCode === "RATE_LIMITED" || lowerMessage.includes("too many requests") || lowerMessage.includes("try again in")) {
    const delay = boundedRetryAfter(retryAfterMs) || retryAfterFromMessage(safeMessage) || 1000;
    return recoveryState("rate-limited", {
      eyebrow: "SLOW DOWN",
      title: "Requests are temporarily limited",
      message: "Wait for the retry timer before submitting another action.",
      tone: "amber",
      retryAfterMs: delay,
      canRetry: false,
      canDismiss: false,
      lockMutations: true,
    });
  }

  if (safeCode === "COMMITTED_REFRESH_PENDING" || lowerMessage.includes("action completed. some information will refresh")) {
    return recoveryState("committed-refresh-pending", {
      eyebrow: "ACTION COMPLETED",
      title: "The action was saved",
      message: "The write completed successfully, but the latest display could not be refreshed. Do not submit the action again; refresh the terminal instead.",
      tone: "green",
      canDismiss: false,
      lockMutations: true,
    });
  }

  if (safeCode === "REQUEST_TIMEOUT" || safeStatus === 504 || lowerMessage.includes("took too long to respond")) {
    return recoveryState("timeout", {
      eyebrow: "REQUEST TIMED OUT",
      title: "The service did not respond in time",
      message: "Refresh the terminal before repeating an economic action so a completed write is not submitted twice.",
      tone: "amber",
      canDismiss: false,
      lockMutations: true,
    });
  }

  if (["STALE_DATA", "STALE_PRICE", "RESOURCE_CONFLICT"].includes(safeCode) || safeStatus === 409 || lowerMessage.includes("conflicts with a newer update") || lowerMessage.includes("stale price")) {
    return recoveryState("stale-data", {
      eyebrow: "NEWER DATA AVAILABLE",
      title: "Refresh before continuing",
      message: "The displayed information is older than the authoritative game state. Refresh this terminal before retrying.",
      tone: "amber",
      canDismiss: false,
      lockMutations: true,
    });
  }

  if (safeCode === "ROUTE_DATA_UNAVAILABLE" || lowerMessage.includes("section could not be loaded") || lowerMessage.includes("section encountered a data problem")) {
    return recoveryState("route-unavailable", {
      eyebrow: "SECTION UNAVAILABLE",
      title: "This section needs to be refreshed",
      message: "Other terminal sections remain available. Retry after the service recovers.",
      tone: "amber",
    });
  }

  if ([500, 502, 503].includes(safeStatus) || safeCode === "SERVICE_UNAVAILABLE" || lowerMessage.includes("temporarily unavailable") || lowerMessage.includes("could not reach the game service")) {
    return recoveryState("service-unavailable", {
      eyebrow: "SERVICE UNAVAILABLE",
      title: "The game service is temporarily unavailable",
      message: "Existing content may remain visible. Refresh before repeating any economic action.",
      tone: "amber",
      canDismiss: false,
      lockMutations: true,
    });
  }

  return null;
}

export function restoredPlayerRecoveryState() {
  return recoveryState("restored", {
    eyebrow: "CONNECTION RESTORED",
    title: "The terminal is connected again",
    message: "Refresh the current data before continuing with economic actions.",
    tone: "green",
    canDismiss: true,
    persistent: false,
  });
}

export function retrySeconds(retryAfterMs, elapsedMs = 0) {
  return Math.max(0, Math.ceil((boundedRetryAfter(retryAfterMs) - Math.max(0, Number(elapsedMs) || 0)) / 1000));
}
