# Active Work Claim — Player Market Orders and Portfolio

**Status:** `IN_PROGRESS`  
**Started:** 2026-07-20  
**Branch:** `agent/player-market-portfolio-v1`  
**Authoritative roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`

## Owned roadmap scope

- `BETA-MKT-003` Resolve public ticker to the internal runtime asset at the order boundary.
- `BETA-MKT-004` Publish reviewed capability-manifest coverage for market orders and Portfolio.
- `BETA-MKT-005` Connect Player Terminal to authoritative market-order and Portfolio routes.
- `BETA-MKT-006` Add a repository-controlled, fail-closed market-tick trigger suitable for staging/beta scheduling.
- `BETA-MKT-007` Verify closed, paused, stale-price, insufficient-funds, insufficient-shares, duplicate-order, and refresh-failure states.
- Market portions of `BETA-PLAYER-008`, `BETA-PLAYER-009`, and `BETA-PLAYER-013`.

## Collision boundary

This branch does not modify seed-content definitions or the bounded active-instrument selection owned exclusively by PR #163. It does not modify story-notification delivery owned by PR #244. It consumes the existing stock schema, order RPC, Player runtime adapter, and accepted Player Terminal visual system.

## Completion gate

The tranche is complete only when the public-key order boundary, reviewed capability manifest, Player adapter routes, Portfolio integration, safe tick trigger, negative-state matrix, committed-success behavior, repository verification, roadmap reconciliation, and merge are all complete.
