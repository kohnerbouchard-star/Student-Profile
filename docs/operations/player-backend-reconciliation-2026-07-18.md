# Player Backend Reconciliation Baseline — 2026-07-18

## Current mainline

The following validated pull requests have been merged into `main` in dependency order:

1. PR #138 — Contracts, attendance rewards, Settings architecture, and v606 administrator stabilization.
2. PR #140 — production hardening, repository quality gates, database replay, pinned tooling, and administrator session refresh controls.
3. PR #139 — isolated player-terminal v7.5 readiness baseline.
4. PR #142 — player-terminal v7.5.1 correctness and UUID ownership boundary.
5. PR #144 — Student-Profile player adapter contract.
6. PR #145 — authoritative Store quote and purchase workflow.

Baseline commit for this reconciliation branch: `1d5d1b0a0a8799938cf58247d46d026058977a0d`.

## Why PRs #141 and #143 are not being merged directly

Their branches were created from the pre-consolidation `main` and overlap production-critical files now owned by the merged Contracts and hardening stacks. Direct merges would combine competing implementations of:

- player contract listing, acceptance, submission, repository contracts, and DTOs;
- `classroom-api` and `admin-api` route composition;
- administrator session/bootstrap files;
- root CI and dependency configuration;
- Supabase migration names and historical migration ownership;
- the older player-terminal snapshot superseded by PRs #139, #142, #144, and #145.

PR #143 also has unresolved CI failures in Backend Typecheck, Admin API Check, Admin Shell Smoke, and Repository Quality. Its Database Replay run did not complete successfully.

## Reconciliation rules

1. Preserve the current `player-terminal/**` tree from `main`.
2. Preserve the merged PR #138 Contracts lifecycle unless a later change is manually reconciled and regression-tested.
3. Preserve the PR #140 forward-only migration policy. Do not rename or delete established migration history to match an older branch.
4. Import additive player-safe backend domains from PR #141 before importing PR #143 extensions.
5. Keep immutable player UUIDs authoritative for durable ownership and transactions. Player ID remains mutable login/display/lookup data.
6. Require server-derived player ownership for every write.
7. Keep unsupported product domains explicit and fail-closed.

## Import tranche A — PR #141 player backend foundation

Port and validate these bounded domains:

- player request scope and logout;
- World, countries, and news reads;
- stock asset detail/history and watchlists;
- inventory reads;
- notification reads and state updates;
- ledger history;
- `classroom-api` route registration;
- forward-only migrations for atomic contract acceptance and stock watchlists.

The contract acceptance implementation must be added to the current merged Contracts handler and repository contracts rather than replacing them.

## Import tranche B — PR #143 platform scope

After tranche A is green, port and repair:

- player capability registry and session bootstrap exposure;
- administrator capability-readiness route and interface;
- inventory redemption request, review, approval, rejection, and fulfillment;
- the forward-only inventory redemption migration.

Before merge, repair the known TypeScript and administrator source-contract failures and complete Database Replay.

## Required combined gate

- Repository Quality
- Database Replay
- Backend Typecheck and backend smoke tests
- Admin API Check
- Admin Bundle Contract Audit
- Admin Shell Smoke
- Player Terminal Verify
- Contracts lifecycle regression
- Store quote and settlement regression
- Inventory redemption lifecycle regression

No production migration or Edge Function deployment is authorized by this reconciliation branch until the live migration ledger is independently reconciled and the combined gate is green.
