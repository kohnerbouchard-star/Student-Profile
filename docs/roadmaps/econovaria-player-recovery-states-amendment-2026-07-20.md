# Econovaria Player Recovery States Amendment

**Document ID:** ECON-BETA-PLAYER-RECOVERY-2026-07-20  
**Amends:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Roadmap phase:** Phase 3 — Close beta gameplay gaps  
**Primary roadmap item:** Player-facing recovery states  
**Related roadmap item:** `BETA-PLAYER-014`  
**Status:** `IN_PROGRESS`  
**Authority:** branch `agent/player-recovery-states-v1`  
**Started:** 2026-07-20

## Ownership declaration

This branch owns the bounded Player-facing recovery-state tranche. It does not own:

- seed content, calibration, active-market selection, or PR #163 content;
- story cutscene or purpose-built story delivery owned by PR #244;
- Program-control branch cleanup owned by another active agent;
- isolated-staging creation, proxy configuration, or deployment evidence;
- new gameplay capabilities or visual redesign.

## Completion scope

The tranche is complete at the repository-integrated boundary only when all of the following are implemented and verified:

1. Classify offline, network, timeout, rate-limit, conflict/stale, server-unavailable, session-invalid, and ambiguous-write outcomes without exposing raw backend details.
2. Preserve valid Player data while a section is degraded and provide a section-scoped retry action.
3. Show a persistent, accessible offline/read-only recovery notice and restore normal controls when connectivity returns.
4. For retry-safe idempotent writes, distinguish an unconfirmed outcome from a confirmed failure and instruct the Player to retry the same action rather than creating a new logical request.
5. Preserve confirmed success when authoritative refresh fails and state clearly that balances or records may be stale.
6. Keep 401/session-invalid handling delegated to the merged safe exit and host login handoff.
7. Respect 429 `retryAfterMs` guidance and prevent misleading immediate-retry messaging.
8. Add deterministic unit/contract coverage plus Player Terminal verification wiring.
9. Preserve the accepted Player Terminal visual system, keyboard access, focus behavior, public identifiers, and UUID privacy.
10. Reconcile the authoritative roadmap after merge.

## Evidence boundary

Repository-integrated tests can complete the Phase 3 recovery-state implementation tranche. Connected isolated-staging probes for offline, timeout, ambiguous writes, rate limiting, and session expiry remain tracked under `BETA-PLAYER-010`, `BETA-PLAYER-014`, and Phase 5 release evidence; this amendment does not claim those external gates are complete.
