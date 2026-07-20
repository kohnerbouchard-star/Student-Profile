# Econovaria Player Recovery States Amendment

**Document ID:** ECON-BETA-PLAYER-RECOVERY-2026-07-20  
**Amends:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Roadmap phase:** Phase 3 — Close beta gameplay gaps  
**Primary roadmap item:** Player-facing recovery states  
**Related roadmap item:** `BETA-PLAYER-014`  
**Status:** `IMPLEMENTED_NOT_MERGED`  
**Authority:** PR #247, branch `agent/player-recovery-states-v1`  
**Verified head:** `edc630a38b8df37ae92caf19797930d3f147e40f`  
**Started:** 2026-07-20

## Ownership declaration

This branch owns the bounded Player-facing recovery-state tranche. It does not own:

- seed content, calibration, active-market selection, or PR #163 content;
- story cutscene or purpose-built story delivery owned by PR #244;
- market orders and Portfolio work owned by PR #245;
- Program-control consolidation completed by PR #251;
- isolated-staging creation, proxy configuration, or deployment evidence;
- new gameplay capabilities or visual redesign.

## Completed repository-integrated scope

1. Offline, network, timeout, rate-limit, conflict/stale, server-unavailable, session-invalid, and ambiguous-write outcomes are classified without raw backend details.
2. Valid Player data remains visible during degraded section states and section-scoped retries remain available.
3. A persistent accessible offline/read-only notice pauses economic controls and restores them after reconnection.
4. Retry-safe idempotent writes distinguish an unconfirmed result from a confirmed failure and direct the Player to retry the same logical action.
5. Confirmed success remains a success when authoritative refresh fails, with stale-information disclosure.
6. Session-invalid behavior remains delegated to the merged secure host/login handoff.
7. Rate-limit recovery respects `retryAfterMs`, disables premature retry, and restores the same-action retry after the wait expires.
8. The accepted Player visual system, keyboard behavior, responsive layout, public identifiers, and UUID privacy are preserved.
9. Recovery installation is isolated from `player-terminal/src/main.js` to avoid collision with parallel Player feature branches.
10. Deterministic Node and desktop/mobile Chromium verification is wired into Player Terminal Verify.

## Verification evidence

Final verified implementation head `edc630a38b8df37ae92caf19797930d3f147e40f` passed:

- Repository Quality #1115;
- Player Runtime Cutover Verify #26, including authenticated host handoff;
- Player Terminal Verify #352;
- the full standalone Node verification chain, including `tests/player-recovery-states.mjs`;
- desktop and mobile Chromium, including offline gating, ambiguous same-action retry, rate-limit timing, confirmed-success refresh failure, responsive layout, and existing Player regression coverage.

An earlier Chromium attempt correctly exposed a mutable disabled-state locator and a stale rate-limit countdown label. Both defects were corrected before the final green head.

## Evidence boundary

This completes the repository-integrated Phase 3 Player recovery-state tranche after merge. Connected isolated-staging probes for offline, timeout, ambiguous writes, rate limiting, and session expiry remain tracked under `BETA-PLAYER-010`, `BETA-PLAYER-014`, and Phase 5 release evidence; this amendment does not claim those external gates are complete.
