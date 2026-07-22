# Player Marketplace Lifecycle — Active Ownership

**Status:** `FINAL_CONVERGENCE_VALIDATION`
**Authoritative roadmap:** `docs/roadmaps/econovaria-beta-completion-roadmap-v1.md`
**Owned roadmap section:** Section 24 — Player Marketplace
**Owned items:** `EXP-MP-001` through `EXP-MP-009`
**Branch:** `agent/player-marketplace-lifecycle-v1`

## Completion target

1. Complete draft, active, purchase-reservation, settlement, cancellation, expiration, moderation, rejection, dispute, refund, and resolution states.
2. Keep every economic write game-scoped, row-locked, idempotent, auditable, and server-authoritative.
3. Publish public Marketplace identifiers only and derive Player ownership from the authenticated session.
4. Connect the accepted Player and Admin surfaces without redesign.
5. Retain immutable audit and balanced fee/tax settlement evidence.

## Collision boundary

This workstream does not modify seed definitions, Business internals, Crafting internals, Messaging internals, Progression internals, campaign implementation, or the authoritative roadmap/controller matrix.

## Convergence checkpoint

Crafting-merged `main` was synchronized exactly once. Final migrations are `20260721140000`, `20260721141000`, and `20260721142000`. The PR remains draft until exact-head CI, database replay/lint, isolated-staging acceptance, cleanup, and production non-modification gates pass.
