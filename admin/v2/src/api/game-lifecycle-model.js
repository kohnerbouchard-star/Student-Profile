import { createAdminErrorEnvelope } from "../core/error-envelope.js";

export const GAME_LIFECYCLE_ACTIONS = Object.freeze({
  start: { label: "Start game", message: "Start this game and allow Player activity?" },
  pause: { label: "Pause mutations", message: "Pause all game-scoped mutations? Players will be unable to perform game actions until you resume." },
  resume: { label: "Resume game", message: "Resume game mutations and Player activity?" },
  end: { label: "End game", message: "End this game, revoke active Player sessions, and revoke the current join code?", phrase: "END" },
  archive: { label: "Archive game", message: "Archive this ended game? Archived games cannot return to active play.", phrase: "ARCHIVE" },
  revoke_sessions: { label: "Revoke Player sessions", message: "Revoke every active Player session for this game? Players must sign in again.", phrase: "REVOKE" },
});
export const GAME_LIFECYCLE_LABELS = Object.freeze({
  draft: "Not started", active: "Active", paused: "Paused", ended: "Ended", archived: "Archived",
});

export function normalizeGameLifecycle(value) {
  const invalid = () => { throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE" }); };
  if (!value || !Object.hasOwn(GAME_LIFECYCLE_LABELS, value.state)
    || !["active", "disabled", "archived"].includes(value.operationalStatus)
    || !Number.isSafeInteger(value.version) || value.version < 1
    || !["pending", "active", "revoked"].includes(value.joinCodeStatus)
    || !Array.isArray(value.allowedActions)
    || value.allowedActions.some((action) => !Object.hasOwn(GAME_LIFECYCLE_ACTIONS, action))) invalid();
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
  return Object.freeze({
    state: value.state,
    operationalStatus: value.operationalStatus,
    version: value.version,
    joinCodeStatus: value.joinCodeStatus,
    allowedActions: Object.freeze([...new Set(value.allowedActions)]),
    activePlayerSessions: count(value.activePlayerSessions),
    sessionsRevoked: count(value.sessionsRevoked),
  });
}

export function normalizeGameLifecycleResult(payload, action = null) {
  const data = payload?.data;
  const lifecycle = normalizeGameLifecycle(data?.lifecycle);
  if (action && (data.action !== action || !["applied", "already_current", "replayed"].includes(data.outcome))) {
    throw createAdminErrorEnvelope({ code: "INVALID_RESPONSE" });
  }
  return action ? Object.freeze({ action, outcome: data.outcome, lifecycle }) : lifecycle;
}
