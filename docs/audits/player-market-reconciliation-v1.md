# Player Market Reconciliation Audit

**Roadmap authority:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Pull request:** #245  
**Branch:** `agent/player-market-reconciliation-v1`  
**Completed subsection:** `BETA-MKT-003` through `BETA-MKT-007`  
**Capability manifest:** schema `1`, manifest `2026-07-20.2`

## Verified implementation boundary

- The public Player order route accepts only a public ticker, reviewed expected price, side, positive integer quantity, and idempotency key.
- Game, Player, Player-session, and internal stock-asset scope are derived server-side from the authenticated Player session and the active game-scoped ticker resolution.
- Browser requests and responses do not expose ownership UUIDs, internal stock-asset UUIDs, or internal order UUIDs.
- Portfolio reads derive ownership scope from the authenticated Player session and return player-safe holdings, cash, and summary models.
- Market orders and Portfolio reads pass through the shared rate-limit dispatch; market orders use the sensitive-write profile.
- Capability preflight advertises Portfolio and market orders only when exact Backend-to-adapter coverage exists and fails closed on mismatches.
- Player market-order review, confirmation, receipt, refresh, stale-price recovery, and committed-success behavior remain accessible and deterministic.
- The repository-controlled stock-tick trigger is secret-protected, game-scoped, HTTPS-only outside localhost, timeout-bounded, and deterministic when an explicit tick index or seed is supplied.

## Negative-state coverage

The tranche covers market closed, game paused, stale reviewed price, insufficient cash, insufficient shares, duplicate or replayed order, duplicate tick, private-scope injection, stock-UUID injection, session failure, and post-commit refresh failure.

## Scope exclusions preserved

- `BETA-MKT-008` active-instrument selection and calibration remains open under PR #163.
- Seed definitions, issuer enrichment, map calibration, and campaign content remain owned by PR #163.
- Connected isolated-staging scheduler activation and network evidence remain Phase 5 environment gates.
- Limit-order lifecycle remains unavailable until separately approved and implemented.

## Completion rule

This audit records repository-integrated completion. PR #245 may be marked ready and merged only after the final authenticated head passes the required Backend, Player, repository, database, security, staging-preflight, market-calendar, timezone, Admin lifecycle, and incident-readiness workflows with no unresolved review threads.
