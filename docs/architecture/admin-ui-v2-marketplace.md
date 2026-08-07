# Admin UI V2 — Marketplace Moderation

## Scope

This change migrates **Marketplace Moderation** into the source-owned Admin UI V2 shell. It is based on `origin/main` at `b7827211f0ff15b8a963219a63738180b33a1b3d` on branch `refactor/admin-ui-v2-marketplace-v1`.

Marketplace remains a separate domain from the financial Market:

- **Market**: securities, financial instruments, quotes/prices, trading sessions, market events, and player stock orders.
- **Marketplace**: player-to-player item listings, purchase reservations, settlement orders, disputes, moderation, lifecycle audit, and Marketplace policy.

No financial Market route, controller, stylesheet, or contract is modified by this migration.

## Authoritative contract inventory

The existing Admin Marketplace contract under `backend/supabase/functions/admin-api/marketplaceOperations.ts` and the existing legacy Admin lifecycle client expose the following supported operations:

- `GET /games/:gameId/marketplace`
  - policy
  - listings
  - reservations
  - orders
  - disputes
  - lifecycle audit events
  - settlement postings
- `POST /games/:gameId/marketplace/listings/:listingId/hold`
- `POST /games/:gameId/marketplace/listings/:listingId/approve`
- `POST /games/:gameId/marketplace/listings/:listingId/reject`
- `POST /games/:gameId/marketplace/disputes/:disputeId/refund`
- `POST /games/:gameId/marketplace/disputes/:disputeId/resolve-seller`
- `POST /games/:gameId/marketplace/disputes/:disputeId/reject`
- `PATCH /games/:gameId/marketplace/policy`

The source-owned V2 route implements only those operations.

### Offers

No authoritative Admin Marketplace snapshot collection, Player Marketplace route, or Admin mutation for offers was found in the current contracts. V2 therefore does **not** fabricate offer data or controls. The UI states this explicitly.

## Player Marketplace boundary

The existing Player Marketplace routes remain authoritative and unchanged:

- read listings
- create listings
- activate listings
- purchase listings
- cancel listings
- open order disputes

The Admin route supervises/moderates Marketplace lifecycle records; it does not duplicate Player ownership or purchase behavior.

## V2 composition

Route-owned files:

- `admin/v2/src/routes/marketplace/MarketplaceApiClient.js`
- `admin/v2/src/routes/marketplace/MarketplaceController.js`
- `admin/v2/src/routes/marketplace/MarketplaceRoute.js`
- `admin/v2/src/routes/marketplace/MarketplaceSkeleton.js`
- `admin/v2/styles/routes/marketplace.css`

Minimal shared composition changes:

- `admin/v2/src/app.js`: register the Marketplace API/controller using the existing same-origin Admin BFF transport.
- `admin/v2/src/core/navigation-registry.js`: change only Marketplace disposition from `planned` to `v2`.
- `admin/v2.html`: load the Marketplace route stylesheet.

The financial `admin/v2/src/routes/market/` source is outside this ownership boundary.

## Data and privacy model

The Backend snapshot already translates internal database UUIDs to public Marketplace references such as `lst_*`, `mpr_*`, `ord_*`, `dsp_*`, `mae_*`, and `mfp_*`.

V2 adds a second presentation boundary:

- player objects are reduced to `displayName` only;
- private UUID-shaped text is discarded from display fields and audit metadata;
- public Marketplace lifecycle references are retained only for authoritative joins and audit display;
- audit metadata is restricted to safe primitive values;
- raw Backend diagnostics are normalized through the existing Admin V2 safe error envelope.

This prevents the Backend's last-resort player reference from becoming a visible ownership identifier.

## State model

Marketplace uses the shared Admin V2 six-state lifecycle:

1. `initial-loading`
2. `ready`
3. `refreshing`
4. `stale`
5. `empty`
6. `failed`

Permission denial remains outside the data model and is handled by the shell-level `AdminPermissionBoundary` using `marketplace.moderate`.

An empty Marketplace lifecycle still retains the authoritative policy panel; it does not fabricate records.

## Listing moderation

The V2 action matrix mirrors the existing lifecycle surface:

| Listing status | Hold | Approve | Reject |
|---|---:|---:|---:|
| draft | yes | yes | yes |
| active | yes | no | yes |
| moderation_hold | no | yes | yes |
| sold/cancelled/expired/rejected | no | no | no |

Each action sends:

- public listing reference;
- authoritative `expectedVersion`;
- required administrator reason;
- BFF `Idempotency-Key` header;
- existing body `idempotencyKey` required by Marketplace operations.

## Dispute moderation

Only open disputes expose mutations:

- refund buyer;
- resolve for seller;
- reject dispute.

Resolved/rejected disputes remain read-only historical records.

## Settlement presentation

Settlement is read-only in this V2 route because no separate Admin settlement mutation is exposed by the audited contract. The route presents:

- order state;
- buyer and seller display names;
- item;
- buyer total and seller proceeds;
- authoritative reservation and settlement-posting counts.

Disputes remain in their own moderation panel rather than being merged into financial Market settlement UI.

## Responsive behavior

Desktop uses the shared data table. At `900px` and below, listing, dispute, and settlement rows become stacked cards with per-cell labels. At `640px` and below, summary, policy, audit, filter, and dialog grids collapse to one column. A `420px` pass tightens panel padding and card labels. Long and Korean text uses `overflow-wrap: anywhere` rather than truncating identity or item content.

## Non-goals

This migration does not:

- alter financial Market;
- add stock or security instruments;
- add player stock order tickets;
- invent offers;
- invent settlement mutations;
- change Marketplace database schema;
- change ownership/inventory semantics;
- change Player Marketplace routes;
- add browser-readable Staff tokens;
- change authentication, MFA, or authorization semantics.
