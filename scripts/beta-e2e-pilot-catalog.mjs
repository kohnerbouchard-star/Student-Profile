export const REQUIRED_FLOW_SCENARIOS = Object.freeze([
  "admin-sign-in", "admin-create-configure-game", "players-create-credentials", "balanced-country-assignments",
  "player-join-onboarding", "attendance-local-currency-reward", "attendance-repeat-no-duplicate", "contract-accept",
  "contract-submit", "contract-revision", "contract-complete", "contract-cash-reward-once", "contract-item-reward-once",
  "store-quote", "store-purchase", "inventory-update", "redemption-request", "redemption-review", "redemption-resolve",
  "market-deterministic-tick", "watchlist-add", "watchlist-remove", "market-buy", "market-sell",
  "portfolio-banking-reconcile", "story-event-activate", "news-delivery", "notification-delivery", "cutscene-delivery",
  "admin-log-audit-review", "session-expiry-safe-login-return", "offline-ambiguous-retry-no-duplicate",
  "cross-game-access-denied", "pause-blocks-mutations-preserves-reads", "ended-game-rejects-writes",
  "backup-restore-preserves-authoritative-state",
]);

export const REQUIRED_FAILURE_SCENARIOS = Object.freeze([
  "failure-401", "failure-403", "failure-404", "failure-409", "failure-429", "failure-timeout", "failure-offline",
  "failure-stale-data", "failure-expired-quote", "failure-duplicate-idempotency-key",
  "failure-conflicting-idempotency-key", "failure-revoked-session", "failure-wrong-game", "failure-game-paused",
  "failure-game-ended", "failure-refresh-after-committed-success",
]);

export const ALL_SCENARIOS = Object.freeze([...REQUIRED_FLOW_SCENARIOS, ...REQUIRED_FAILURE_SCENARIOS]);
export const FULL_SHA = /^[a-f0-9]{40}$/;
export const PROJECT_REF = /^[a-z0-9]{20}$/;
export const PLACEHOLDER = /(?:REQUIRED_|CHANGE_ME|PLACEHOLDER|TBD)/i;
export const SENSITIVE_KEY = /^(?:authorization|access.?code|api.?key|bearer|cookie|credential|credentials|password|refresh.?token|secret|service.?role(?:key)?|session.?token|token)$/i;
