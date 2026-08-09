# Marketplace Moderation Validation Matrix

## Source checks

Focused validation is implemented in `scripts/admin-v2-marketplace.test.mjs`.

Coverage:

- authoritative Marketplace GET path;
- listing moderation paths and idempotency payload/header;
- dispute moderation paths and idempotency payload/header;
- policy mutation path;
- unsupported mutation rejection before transport;
- safe Backend error normalization;
- zero, one, and many listing normalization;
- active, sold, cancelled, and dispute-derived `disputed` presentation;
- search/filter source guard;
- long and Korean item/player text;
- private UUID and unsafe audit-metadata stripping;
- `marketplace.moderate` denial before reads/mutations;
- explicit financial Market / Marketplace route separation;
- Player Marketplace contract presence/regression guard;
- responsive CSS boundaries at 900px, 640px, and 420px.

## Syntax checks performed before publication

The following new/modified source files were checked with `node --check` in the implementation workspace before publishing:

- `MarketplaceApiClient.js`
- `MarketplaceController.js`
- `MarketplaceRoute.js`
- `MarketplaceSkeleton.js`
- `app.js`
- `navigation-registry.js`
- `admin-v2-marketplace.test.mjs`

## Current-main reconciliation

The branch was reconciled with `main` at `4c17b942fcf4b2a6f60b629549f192d066053ba4` using merge commit `4c24c64763463e406ea42bfac3db2c85f94e44ce`. The incoming `main` delta was confined to Player Terminal coordinator/runtime files. Marketplace implementation blobs were preserved during the merge, and the pull-request functional delta remained the same twelve Admin V2 / Marketplace / evidence files.

The PR diff contains no financial `admin/v2/src/routes/market/` file, no `/games/:gameId/market/...` request, and no `MutationObserver`. Marketplace continues to use `marketplace.moderate` and `/games/:gameId/marketplace...` exclusively.

## PR #503 compatibility gate

PR #503 (`feat/economy: canonical economic asset ownership core v2`) remains open and draft. Its current compatibility boundary keeps public HTTP paths, Store keys, and existing RPC signatures stable while canonical inventory ownership moves underneath those compatibility projections. It also still lists Marketplace/redemption canonical compatibility and validation as unfinished work.

Therefore PR #521 must not merge until the final PR #503 contract is reconciled. Before merge, verify that the Admin Marketplace snapshot and existing listing/dispute moderation actions still expose the public listing/item identifiers and lifecycle semantics consumed by this V2 route. If #503 changes those public contracts, update this branch first.

Separate Marketplace bids/offers remain intentionally absent because the authoritative Admin Marketplace snapshot exposes no offers collection and no offer mutation. PR #503's “commercial offers” terminology describes Store/resource provenance, not a new Marketplace bid/offer API.

## Runtime/browser evidence

The route is built on the existing Admin V2 responsive table/card, dialog, permission-boundary, safe-error, and six-state primitives. On the pre-reconciliation implementation head, Admin Browser E2E, Environment Neutral Browser, Backend Typecheck, Runtime Interaction Wiring, Button Action Coverage, Supply Chain Security, Release Integrity, and Staging Readiness Preflight completed successfully.

The pre-reconciliation Admin Shell / Admin Scroll failures were caused by existing legacy Admin viewport-scroll contract assertions in files outside this PR. Repository Quality stopped on the repository-wide Admin architecture ratchet (`mutationObservers` count), while this PR introduces no `MutationObserver`.

Fresh CI was triggered for the reconciled head. At reconciliation time those checks were queued; they must be evaluated on the draft PR before any merge decision.

Vercel's Git-connected preview check for the reconciled head was blocked by the account build-rate limit, and no Marketplace preview deployment was created. No manual deployment was attempted because this task authorizes only the normal draft-PR preview flow.

The branch must remain a draft until checks settle and PR #503 reconciliation is complete. This task does not authorize merge.
