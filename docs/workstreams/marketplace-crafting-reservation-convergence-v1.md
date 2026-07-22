# Marketplace ↔ Crafting reservation convergence

Status: parallel preparation only. Crafting PR #300 remains the predecessor and Marketplace PR #249 remains draft.

## Authoritative contract observed read-only

Crafting defines `public.inventory_reservations` as the generic reservation source of truth with game, player, holding, item, reason, source, quantity, and `active | consumed | released` state. Its current `reason_type` set is `crafting_input | equipment_action`.

Marketplace must extend that set additively with `marketplace_listing` in its final post-Crafting migration. Marketplace must not modify Crafting-owned functions, migrations, or runtime behavior.

`inventory_holdings.quantity_reserved` is a projection only. The authoritative reserved quantity for a holding is the sum of every active generic reservation row across Marketplace, Crafting, equipment, and future classified sources.

## Marketplace adapter contract

Permanent preparatory source:

- `backend/src/domains/marketplace/infrastructure/marketplaceInventoryReservationAdapter.ts`
- `backend/src/domains/marketplace/infrastructure/marketplaceInventoryReservationAdapter.test.ts`

Required database implementation after Crafting merges:

1. Reserve a listing with one active generic row:
   - `reason_type = 'marketplace_listing'`
   - `source_id = marketplace_listings.id`
   - quantity equals the listing's currently reserved seller quantity.
2. Reconcile before every Inventory mutation:
   - lock the holding and relevant generic reservation rows;
   - sum all active reservation sources;
   - fail closed on game/player/holding mismatch;
   - fail closed if active reservations exceed owned quantity;
   - detect any difference between the active-row sum and `quantity_reserved`.
3. Rebuild the projection after every reservation transition from the complete active-row sum. Marketplace must never increment or decrement the projection independently.
4. Buyer reservation creation changes listing availability only. It does not create a second seller Inventory authority.
5. Settlement consumes the Marketplace listing reservation atomically with seller decrement, buyer transfer, financial postings, order completion, and audit evidence.
   - partial settlement reduces the active listing-reservation quantity;
   - final settlement marks it consumed;
   - order/reservation uniqueness and action receipts prevent duplicate consumption.
6. Buyer-reservation expiry or insufficient funds restores listing availability while the listing remains active. The listing reservation remains authoritative and unchanged.
7. Listing cancellation, expiration, or rejection releases the complete remaining listing reservation exactly once.
   - active buyer reservations must first be expired/released and restored to listing availability;
   - terminal listing release then transitions the full remaining generic reservation to released.
8. Refund checks use owned quantity minus every active generic reservation source. A refund cannot transfer an item currently reserved by Crafting, equipment, Marketplace, or another future source.
9. Refund transfer does not resurrect the consumed listing reservation. Returned items become ordinarily available Inventory and require a new listing to be reserved again.

## Direct projection writes to replace after merge

The provisional Marketplace lifecycle migration currently writes `inventory_holdings.quantity_reserved` directly in these paths:

- listing creation;
- purchase-reservation expiry when the listing is terminal;
- listing expiration;
- settlement expiry;
- insufficient-funds release when the listing is terminal;
- seller settlement consumption;
- listing cancellation;
- Admin listing rejection;
- refund availability checks.

The final synchronized migration must route these paths through the Marketplace adapter and full projection reconciliation.

## Provisional rekey map

These identities remain non-authoritative until Chat 1 assigns the final post-Crafting range:

| Current provisional identity | Final identity |
| --- | --- |
| `20260721140000_add_marketplace_reference_scopes_v1.sql` | `CHAT_1_MARKETPLACE_RANGE_01` |
| `20260721141000_add_player_marketplace_lifecycle_v2.sql` | `CHAT_1_MARKETPLACE_RANGE_02` |
| `20260721142000_harden_marketplace_resolution_replay_v1.sql` | `CHAT_1_MARKETPLACE_RANGE_03` |

The rekey is performed once, after the exact Crafting merge SHA and range are supplied.

## Shared-file collision inventory

Reconstruct from final Crafting-merged `main`; do not choose either branch wholesale:

- `.github/workflows/player-terminal-verify.yml`
- `backend/package.json`
- `backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts`
- `backend/src/domains/players/contracts/playerCapabilityManifestContracts.test.ts`
- `backend/src/security/playerRateLimitDispatch.ts`
- `backend/supabase/functions/admin-api/index.ts`
- `backend/supabase/functions/classroom-api/index.ts`
- `player-terminal/src/api/endpoints.js`
- `player-terminal/src/api/resource-plan.js`

Marketplace additions must remain narrow and additive while preserving Crafting, World, Business, Store, Inventory, Story, security, and lifecycle registrations.

## Final validation checklist

- exact Crafting merge SHA recorded;
- Chat 1 migration range and collision rules recorded;
- three provisional migrations rekeyed once and every reference updated;
- existing branch synchronized once;
- shared files reconstructed from Crafting-merged `main`;
- generic reservation reason extended additively;
- projection reconciliation and drift detection active;
- concurrent buyer, stale version, duplicate request, committed-success replay, cancellation, expiry, settlement, dispute, and refund invariants pass;
- seller settlement and Inventory transfer/release are exactly once;
- wrong-game, pause, ended-game, and expired-session behavior fail closed;
- zero-state replay succeeds twice;
- database lint passes;
- exact-head CI, desktop/mobile Player, Admin browser, and isolated-staging Marketplace acceptance pass;
- review threads are clear;
- immutable head returned to Chat 1;
- production unchanged.
