# Econovaria Admin Game Lifecycle Amendment

**Date:** 2026-07-19  
**Authoritative roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Branch:** `agent/admin-game-lifecycle-controls-v1`  
**Status:** `IMPLEMENTED_NOT_MERGED`

## Roadmap scope

This tranche implements:

- `BETA-ADMIN-009` — emergency game mutation pause and resume controls;
- `BETA-ADMIN-010` — start, pause, resume, end, archive, Player-session revoke, and join-code lifecycle verification.

The main roadmap remains the authoritative completion ledger. This amendment records the bounded implementation while the branch is under review; the two items must not be marked `VERIFIED_COMPLETE` until the PR is merged and required checks pass.

## Canonical lifecycle model

The database adds an explicit lifecycle state:

- `draft` — not started;
- `active` — Player and Admin game mutations permitted;
- `paused` — game-scoped mutations blocked, reads retained;
- `ended` — terminal play state, active Player sessions and join access revoked;
- `archived` — retained historical record, no game mutations permitted.

The existing `game_sessions.status` field remains as a compatibility projection so current Player-session and economic guards are not rewritten in this tranche:

- `active` → `active`;
- `draft` or `paused` → `disabled`;
- `ended` or `archived` → `archived`.

## Authoritative boundary

- lifecycle reads and writes are staff-owner scoped;
- transitions execute in one locked database transaction;
- optimistic lifecycle versioning rejects stale Admin actions;
- game-scoped idempotency keys preserve exact transition outcomes;
- invalid transitions fail closed;
- ending and archiving revoke active Player sessions and the join code atomically;
- explicit session revocation is available without changing lifecycle state;
- every control action appends a typed audit-log record;
- paused and terminal games fail closed for ordinary Admin game mutations;
- join-code reset remains an explicit security control while active or paused and is blocked after end/archive;
- no production deployment or manual database edit is part of this branch.

## Admin surface

Controls are added inside the existing Games account surface. The accepted Admin navigation and visual system remain unchanged. Destructive actions require explicit confirmation phrases and use the shared modal accessibility controller for focus containment, Escape behavior, blocked backdrop dismissal, and opener restoration.

## Verification required before merge

- Backend typecheck and complete Backend smoke;
- lifecycle migration contract and Admin operation tests;
- Repository Quality;
- Admin Shell Smoke;
- Database Replay and database lint;
- dedicated lifecycle browser verification at desktop, compact, and narrow widths;
- no review threads, no temporary helper workflow, and a branch synchronized with current `main`.

## Remaining release boundary

Connected isolated-staging lifecycle evidence remains part of the separate staging-backed Admin verification item. No beta or production cutover is claimed by this amendment.
