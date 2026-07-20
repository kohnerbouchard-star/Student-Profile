# Player Market Reconciliation — Active Ownership

**Status:** `IN_PROGRESS`  
**Authoritative roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`  
**Owned roadmap subsection:** Stock Market active reconciliation  
**Owned items:** `BETA-MKT-003`, `BETA-MKT-004`, `BETA-MKT-005`, `BETA-MKT-006`, `BETA-MKT-007`  
**Branch:** `agent/player-market-reconciliation-v1`

## Completion target

1. Resolve a public ticker to the game-scoped internal runtime asset only inside the trusted Backend order boundary.
2. Advertise reviewed market-order and Portfolio capabilities through the versioned Player capability manifest.
3. Connect Player Terminal market execution and Portfolio reads to the authoritative routes.
4. Provide a safe, idempotent market-tick trigger suitable for staging and beta orchestration.
5. Verify market-closed, paused-game, stale-price, insufficient-funds, insufficient-shares, duplicate-order, ambiguous-write, and refresh-failure behavior.
6. Reconcile the authoritative roadmap and remove this active-ownership marker after merge.

## Collision boundary

This branch does not own active-instrument selection, issuer enrichment, seed definitions, map work, or campaign content. PR #163 remains the sole seed-content authority. PR #244 remains the Player story-delivery authority.
