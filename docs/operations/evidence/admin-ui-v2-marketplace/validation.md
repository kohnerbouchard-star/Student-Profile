# Marketplace Moderation Validation Matrix

Branch: `refactor/admin-ui-v2-marketplace-v1`
Accumulated base: `ba69f5fcda551148b31b7a85e0c3dbb47a027238`
Reconciled implementation: `035ee1f47b74ae61cd9f7c43ce8b044980191386`
Status: `MARKETPLACE_RECONCILED_FINAL_CI`.

## Final convergence result

Marketplace Moderation is reconstructed additively on the accumulated Admin V2 shell after Inventory #508, Crafting #510, and Business #520. The navigation registry now has no `planned` Admin product destination: all 18 canonical routes resolve as native V2 modules.

PR #503 canonical economic asset ownership is merged. Its compatibility boundary preserves the public Marketplace listing/item identifiers and lifecycle semantics used by this route; no raw canonical inventory table, internal ownership UUID, or duplicate ownership model is exposed to the browser.

## Domain boundary

Marketplace remains distinct from financial Market.

- Financial Market: securities, instruments, quotes, trading sessions, market events, and trades.
- Marketplace: player-to-player listings, reservations/orders, settlement, disputes, moderation, lifecycle audit, and policy.
- Player Marketplace routes remain player-scoped and are not reused as Admin authority.

The Admin route continues to use only `/games/:gameId/marketplace...` paths and `marketplace.moderate`.

## Supported authoritative operations

Read:

- `GET /games/:gameId/marketplace`.

Mutations:

- listing hold / approve / reject;
- dispute refund / resolve-seller / reject;
- Marketplace policy update.

No Marketplace offer/bid endpoint is fabricated. PR #503's commercial-offer terminology remains Store/resource provenance and does not create an Admin Marketplace offers API.

## Current-contract test corrections

Two pre-convergence source-shape assertions were stale after accumulated repository changes and were corrected without altering runtime semantics:

1. `updatedAt` is Marketplace policy read metadata, not one of the writable policy fields accepted by `MarketplaceApiClient.cleanPolicy()`.
2. The financial Market asset URL is now composed through `marketBasePath(gameId)` plus `/assets?include=quotes`; the test verifies that composition rather than requiring one contiguous source literal.

The separate Market/Marketplace boundary remains asserted.

## Verification

The reconciliation runner passed:

- `git diff --cached --check`;
- syntax checks for the accumulated `app.js` and all Marketplace V2 route modules;
- `node --test scripts/admin-v2-marketplace.test.mjs`: **7/7 pass**;
- `node --test scripts/admin-v2-unit.test.mjs`: **all pass**.

The accumulated V2 unit registry verifies Marketplace as migrated with module key `marketplace`, an empty planned-route list, and no legacy handoff. The standard `test:admin-v2` command now includes the Marketplace focused contract suite.

This owner-authored evidence commit triggers normal exact-head pull-request CI. Exact-head repository checks are the final merge gate.
