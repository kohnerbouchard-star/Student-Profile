# Messaging and Communication Workstream

**Roadmap section:** 26 — Messaging and communication  
**Roadmap items:** `EXP-MSG-001` through `EXP-MSG-007`  
**Authority branch:** `agent/messaging-communication-v1`  
**Pull request:** #248  
**Status:** `IMPLEMENTED_NOT_MERGED — PRODUCT_OWNER_PAUSED`  
**Started:** 2026-07-20  
**Controller gate recorded:** 2026-07-20

## Scope

This branch owns the complete repository-integrated messaging tranche:

- teacher announcements;
- system messages;
- player-to-player threads;
- Contract-linked messages;
- private, game-scoped inbox and thread reads;
- safe send and idempotent replay;
- unread state and metadata-only notification integration;
- Admin moderation, thread disable/enable/close, message hide/unhide, and immutable audit;
- retention, privacy, abuse, role, cross-game, replay, and UUID-leak tests;
- Player Terminal and Admin integration without redesigning the accepted visual systems;
- capability-manifest and central rate-limit registration prepared for synchronization.

## Implemented evidence

The branch contains the bounded messaging schema, authenticated Player handlers, Admin operations, Player and Admin surfaces, migration contracts, source-boundary contracts, and the corrected central rate-limit dispatch ratchet.

The exact-branch verification runs established the following before the controller pause was enforced:

- Admin messaging source, privacy, accessibility, and architecture contract passed;
- Player route parsing passed;
- authenticated Player inbox, send, replay, and read-receipt handler tests passed;
- migration structure, forced RLS, public identifiers, idempotency, moderation, retention, and reply-policy contracts passed;
- Backend `typecheck:all` passed;
- root repository test suite passed;
- the remaining Backend smoke failure was isolated to the stale exhaustive rate-limit source-count assertion, which is corrected on this branch.

No migration was applied, no environment was changed, and no production deployment occurred.

## Controller disposition

The production-beta controller merged in `7bbd08e19641146282b58023a0a911c90f6a148b` reserves authoritative-roadmap edits to Chat 1 and classifies PR #248, PR #249, and PR #261 as product-owner-paused expansion work outside the beta merge queue until explicit controller reactivation. Default-branch enforcement removed the attempted synchronization unblocker in `92563c58304517e911816627a9cac0c74db92aef`.

Accordingly:

- PR #248 remains the sole preserved messaging authority;
- the implementation is not merged and cannot be marked `VERIFIED_COMPLETE`;
- this branch must not edit the authoritative roadmap;
- synchronization, final-head CI, roadmap reconciliation, and merge resume only after the controller records reactivation.

## Collision boundary

This branch does not own PR #163 seed content, PR #244 story delivery, generic notification delivery, Contracts lifecycle, Inventory redemption, market orders, staging operations, production deployment, or authoritative-roadmap control.

## Completion rule

The workstream becomes complete only after controller reactivation, synchronization with current `main`, a permanent human-authored implementation head, all required final-head workflows passing, PR #248 merging, and Chat 1 reconciling the authoritative roadmap with immutable evidence.
