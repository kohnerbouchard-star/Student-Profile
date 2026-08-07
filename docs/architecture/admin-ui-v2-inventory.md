# Admin UI V2 Inventory Architecture

Status: draft PR implementation

Branch: `refactor/admin-ui-v2-inventory-v1`

Base `origin/main`: `b7827211f0ff15b8a963219a63738180b33a1b3d`

## Scope

Inventory becomes a source-owned Admin UI V2 route under the existing `inventory.redeem` permission. The route is an administrative supervision surface for the canonical inventory redemption workflow. It does not introduce an Admin-owned inventory ledger, duplicate ownership table, Store projection, Crafting projection, or Business inventory representation.

The implementation deliberately leaves Store, Crafting, Business, and Player inventory semantics unchanged.

## Authoritative contract audit

Current `main` exposes the following Admin inventory contract:

- `GET /api/admin/games/:gameId/inventory/redemptions`
  - filters: `status`, `limit`, `offset`
  - statuses: `pending`, `approved`, `rejected`, `fulfilled`, and `all`/history
  - response rows: public redemption request id, item id, requested quantity, redemption status, request/resolution notes, lifecycle timestamps, player display/reference context, item name/category
- `POST /api/admin/games/:gameId/inventory/redemptions/:requestId/approve`
- `POST /api/admin/games/:gameId/inventory/redemptions/:requestId/reject`
- `POST /api/admin/games/:gameId/inventory/redemptions/:requestId/fulfill`

Those routes are backed by the existing Admin RPCs `read_admin_inventory_redemptions_v1` and `review_inventory_redemption_atomic_v1`.

The canonical Player inventory read model exists separately in the Inventory domain and remains the Player source of truth. A repository-wide endpoint sweep did **not** find an authoritative Admin API that lists arbitrary owned inventory balances for every player/business. Therefore this V2 route does not fabricate one.

## Data boundary

The V2 route renders only fields already supplied by the Admin redemption projection:

- player display name, public/reference label, and roster label;
- item name and category;
- requested redemption quantity;
- redemption state;
- request/resolution note where present;
- requested/reviewed/fulfilled/updated timestamps where present.

Item provenance/type are normalized only if an authoritative response supplies them. Current Admin DTOs do not expose seeded/custom provenance, so the UI explicitly does not infer it from Store artwork, item names, item keys, Crafting recipes, or any other parallel heuristic.

The current Admin DTO does not expose a Business ownership relationship. The UI states that limitation instead of inventing a player/business ownership join.

Requested redemption quantity is not labeled or treated as an owned-item balance.

## Lifecycle and mutations

Only existing state transitions are exposed:

- `pending -> approved`
- `pending -> rejected`
- `approved -> fulfilled`

Rejected and fulfilled requests have no further action. Rejection requires a reason; approve and fulfill accept an optional audit note. Review requests use the existing idempotent contract.

The route reuses `admin/inventory-redemption-queue-client.js` as the authoritative Admin client and injects the existing Admin V2 BFF transport. This preserves the same-origin HttpOnly session boundary, CSRF handling, device/game scope, and idempotency normalization without creating a second API adapter.

## Permission and security boundary

The navigation registry retains `inventory.redeem` as the only route permission. The existing `AdminPermissionBoundary` handles permission denial before the controller loads data.

Private UUID-shaped values in display text are redacted by the Inventory V2 model. Item/private resource identifiers are not rendered. The public redemption request id is retained internally as the row key/action token but is not displayed to administrators.

Backend failures are converted to the existing Admin V2 safe error envelope before presentation. Raw backend messages are not surfaced by the V2 route.

## V2 state model

Inventory uses the standard Admin V2 data-state machine:

- initial loading;
- ready;
- refreshing;
- stale with last-resolved data;
- empty;
- failed with retry where appropriate;
- permission denied at the shared route boundary.

Pagination remains server-authoritative. Search is explicitly scoped to the currently loaded page so it does not pretend to be a global ownership query.

## Responsive behavior

Desktop uses the shared semantic `AdminDataTable`. At narrow widths the same table rows become stacked cards, retaining table semantics while preventing horizontal compression. Controls, summary cards, pagination, dialog fields, Korean/non-ASCII text, and long item/player names wrap without introducing a second mobile data model.

Responsive breakpoints are defined at 900 px and 620 px.

## Store -> Inventory -> Crafting preservation

This change does not alter Store purchases, canonical inventory ownership, Crafting consumption/output, Business inventory, or Player inventory reads. Inventory V2 is a review/supervision layer over the existing canonical redemption contract only.

No Backend, database, migration, Supabase schema, Store contract, Crafting contract, Business contract, or Player inventory contract is modified by this branch.
