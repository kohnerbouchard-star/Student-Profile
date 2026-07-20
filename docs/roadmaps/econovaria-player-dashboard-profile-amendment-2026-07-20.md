# Econovaria Player Dashboard and Profile Runtime Amendment

**Date:** 2026-07-20  
**Authority:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Branch:** `agent/player-dashboard-profile-v1`  
**Status:** `IN_PROGRESS`

## Owned section

This branch exclusively owns the bounded Player Dashboard and Profile authoritative-runtime subsection:

- the Dashboard and Profile portions of `BETA-PLAYER-008`;
- reviewed capability publication for the existing authenticated Player session bootstrap and game Dashboard reads;
- shared reviewed rate-limit dispatch for both reads;
- exact frontend capability-to-route coverage;
- repository-level negative-state, UUID-privacy, malformed-contract, and bootstrap integration verification;
- authoritative-roadmap reconciliation after validation.

## Collision boundary

This branch does not own:

- Portfolio, market orders, market ticks, or the market portions of `BETA-PLAYER-008`, `BETA-PLAYER-009`, or `BETA-PLAYER-013`, currently claimed by PRs #245 and #246;
- story cutscene or purpose-built story delivery work owned by PR #244;
- seed definitions, calibration, import, activation, or rollback owned exclusively by PR #163;
- isolated-staging evidence tracked under `BETA-PLAYER-010`, `BETA-AUTH-005`, `BETA-AUTH-006`, and Phase 5.

## Acceptance criteria

1. `GET /players/me` is published as the reviewed Profile/bootstrap endpoint and remains private, no-store, session-derived, game-scoped, browser-safe, and rate-limited.
2. `GET /players/me/game/dashboard` is published as the reviewed Dashboard endpoint and remains private, no-store, session-derived, game-scoped, UUID-private, and rate-limited.
3. The capability manifest advertises Dashboard and Profile only when exact Backend and Player Terminal route mappings exist.
4. The Player Terminal capability validator accepts the exact `/players/me` bootstrap path, rejects unsupported endpoint publication, and maps Profile to bootstrap and Dashboard to dashboard.
5. Existing invalid, expired, revoked, inactive, wrong-game, and client-identity-injection behavior remains fail closed.
6. Backend Typecheck, Player Terminal Verify, Repository Quality, and relevant focused tests pass on the final branch head.
7. The authoritative roadmap is reconciled with immutable evidence before merge.
