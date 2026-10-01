# REF-028 — Contract availability read boundary

Status: IN_PROGRESS. Base main: `207eb2cd4e72e4cee7a95b147a3a0eeb37b00ed9`.
Dependency REF-016 is VERIFIED_COMPLETE (merge `c80b0b515657eb4a0fec8797314f7ece4d53933a`).
Maps to ARCH-208/ARCH-401; does not close those wider programs.

## Scope lock and ownership

Rechecked open PRs #736/#735/#731/#730/#690/#668/#624/#620 and their changed
paths on 2026-10-01. None owns this Contract availability seam. Preserve their
Player binding/context, release, CSS and planning work. REF-023 runs separately;
shared documentation/inventory integration is serialized after its current main.
No backend package, workflow, SQL, UI, auth, Story or reward change is permitted.

Ten meaningful paths maximum:

- `backend/src/domains/contracts/services/playerContractAvailabilityService.ts`
- `backend/src/domains/contracts/infrastructure/supabaseContractAvailabilityReadRepository.ts`
- `backend/src/domains/contracts/api/playerContractHttpHandler.ts`
- `backend/src/domains/contracts/api/playerContractPublicListHttpHandler.ts`
- `backend/src/domains/contracts/api/playerContractPublicSubmitHttpHandler.ts`
- `backend/tests/domains/contracts/ref004Parity.test.ts` (already acceptance-registered)
- this evidence record
- `docs/roadmaps/refactor-execution-v1/tasks/REF-028.md`
- `docs/roadmaps/refactor-execution-v1/backlog.json` (REF-028 only)
- one PR-bound `docs/operations/contracts/player-cross-cutting/pr-NNN.json`

Generated `docs/architecture/inventories/econovaria-architecture-inventory-v2.json`
is separately counted. Only `resolveActivePlayerCountryCode` persistence moves;
its three HTTP callers import the infrastructure function directly. No forwarding
alias, extra policy, broad port or repeated query is introduced.

## Existing input precedence and parity contract

The service already has an explicit readonly player/game/country/roster/now input
and database-free `isContractAvailableNow`. Preserve its implementation: game
match precedes active/scheduled lifecycle, valid publication <= supplied now,
exclusive expiry > now, then public or case-insensitive player/country/roster
OR targeting. `deadlineAt` is not an availability filter; do not silently repair
that policy. List reads active and scheduled collections concurrently exactly
once, filters both, keeps the last duplicate ID, and sorts descending publication
(or creation) time. Repository rejection propagates unchanged.

Country lookup follows authenticated session resolution and existing scope checks.
Its first query selects `country_profile_id,assigned_at`, filters game, player and
active assignment, orders assigned_at descending, limits one, then maybeSingle.
A missing/error/blank assignment stops at one query. Otherwise the second query
selects country_code by profile ID only; trim/uppercase remains unchanged. Missing,
blank, database error and any thrown lookup all return null. No retry or broader
lookup is added. The country profile is existing reference data, not a newly
game-filtered table.

Accepted/completed/progress lock and action gating remain in existing HTTP/service
owners. Paused-game checks and acceptance limits stay in their existing acceptance
repository/RPC; this extraction adds no second authority. Optional Story roleplay
is post-submission decoration with null fallback, not an availability dependency.
The three consumers retain their distinct auth/validation ordering, clock
injection, errors, DTO privacy and progress rules.

## Verification and rollback

Characterize country query trace/error fallbacks and pure policy/list behavior on
the unchanged base before extraction, in the existing Contract acceptance suite.
Run acceptance/lifecycle and Player security, Player contracts-public,
contracts-connected, contracts-submit and story-decisions. Run root npm test,
backend typecheck:all/smoke, architecture/high-priority/legacy audits, secret scan
and diff check on final source; distinguish blocked checks from passes.
PR exact-head checks remain required. No production/staging mutation or runtime
certification is claimed. Roll back the extraction and three imports normally;
preserve unrelated later incident fixes. Stop if parity requires policy changes.
