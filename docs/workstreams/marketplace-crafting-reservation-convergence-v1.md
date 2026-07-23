# Marketplace ↔ Crafting reservation convergence

Status: final convergence validation. Crafting PR #300 is merged; Marketplace PR #249 has completed its single authorized synchronization, remains draft and unmerged, and is pending exact-head CI and isolated-staging acceptance.

## Authoritative Crafting contract preserved

Crafting defines `public.inventory_reservations` as the generic reservation source of truth with game, player, holding, item, reason, source, quantity, and `active | consumed | released` state. Its final migration family is `20260721130000–20260721135700` and its current `reason_type` set is `crafting_input | equipment_action`.

Marketplace extends that set additively with `marketplace_listing` in its third final Marketplace migration. Marketplace does not modify Crafting-owned functions, migrations, tables, jobs, equipment, effects, salvage, pack activation, or runtime semantics.

`inventory_holdings.quantity_reserved` is a projection only. The authoritative reserved quantity for a holding is the sum of every active generic reservation row across Marketplace, Crafting, equipment, and future classified sources.

## Permanent Marketplace implementation

Application source:

- `backend/src/domains/marketplace/infrastructure/marketplaceInventoryReservationAdapter.ts`
- `backend/src/domains/marketplace/infrastructure/marketplaceInventoryReservationAdapter.test.ts`
- `backend/src/domains/marketplace/infrastructure/marketplaceInventoryReservationPartialRelease.test.ts`

Final database convergence layer:

- `backend/supabase/migrations/20260721142000_harden_marketplace_resolution_replay_v1.sql`

Focused verification:

- `backend/src/domains/marketplace/tests/playerMarketplaceReservationConvergenceMigrationContract.test.ts`
- `backend/src/domains/marketplace/tests/playerMarketplacePreconvergenceLifecycle.test.ts`
- `backend/src/domains/marketplace/tests/playerMarketplaceAbuseSimulation.test.ts`
- `.github/workflows/marketplace-preconvergence.yml`

## Reservation lifecycle contract

1. Listing creation inserts one active generic reservation row:
   - `reason_type = 'marketplace_listing'`;
   - `source_id = marketplace_listings.id`;
   - quantity equals the seller quantity reserved for the listing.
2. Every reservation-sensitive entrypoint locks and reconciles the holding before trusting its projection:
   - sum every active generic reservation row;
   - fail closed on game, player, or holding mismatch;
   - deny authoritative reservations above owned quantity;
   - detect any difference between the active-row sum and `quantity_reserved`.
3. The projection is changed only in the same transaction as the authoritative generic reservation transition and is immediately reconciled.
4. Listing activation requires an active Marketplace reservation with sufficient remaining quantity.
5. Buyer reservation changes listing availability only. It does not create a second seller Inventory reservation authority.
6. Settlement consumes the Marketplace listing reservation atomically with seller decrement, buyer transfer, financial postings, order completion, and immutable audit evidence:
   - partial settlement reduces the active listing-reservation quantity;
   - final settlement marks it consumed;
   - order uniqueness, postings uniqueness, and action receipts prevent duplicate consumption or seller credit.
7. Buyer-reservation expiry or insufficient funds restores listing availability when the listing remains active. The listing reservation remains unchanged.
8. Buyer-reservation expiry or insufficient funds against a terminal listing releases only that buyer-reserved portion from the remaining Marketplace listing reservation.
9. Listing cancellation, expiration, or moderation rejection releases the complete remaining Marketplace listing reservation exactly once.
10. Refund eligibility uses owned quantity minus every active generic reservation source. Items reserved by Crafting, equipment, Marketplace, or a future source cannot be refunded.
11. Refund transfer does not resurrect a consumed listing reservation. Returned items require a new listing and a new reservation.
12. Marketplace never transitions a `crafting_input`, `equipment_action`, or unknown reservation row.

## Direct projection mutation replacement inventory

The second final Marketplace lifecycle migration contains historical projection-mutating primitives for:

- listing creation;
- purchase-reservation expiry against a terminal listing;
- listing expiration;
- settlement expiry;
- insufficient-funds release against a terminal listing;
- seller settlement consumption;
- listing cancellation;
- Admin listing rejection;
- refund availability checks.

The third final Marketplace migration now:

- renames reservation-sensitive public RPCs to private `*_projection_legacy_*` primitives;
- revokes those primitives from `public`, `anon`, `authenticated`, and `service_role`;
- recreates the original public RPC signatures as authoritative generic-reservation wrappers;
- replaces both expiration functions with authoritative implementations;
- reconciles and transitions generic reservation rows around every retained projection mutation;
- keeps the external Classroom/Admin repository contracts unchanged.

At final convergence, reconstruct the same wrapper semantics from Crafting-merged `main`; do not expose or call the private legacy functions outside their security-definer wrappers.

## Final Marketplace migration identities

The controller-assigned post-Crafting range is final and collision-free:

| Final identity | Purpose |
| --- | --- |
| `20260721140000_add_marketplace_reference_scopes_v1.sql` | Store and Inventory composite reference scopes |
| `20260721141000_add_player_marketplace_lifecycle_v2.sql` | Marketplace schema, lifecycle, financial postings, audit, and public RPCs |
| `20260721142000_harden_marketplace_resolution_replay_v1.sql` | Generic reservation convergence, replay hardening, and authoritative wrappers |

The three-file order and SQL intent are fixed. The Crafting family `20260721130000–20260721135700` remains unchanged and appears exactly once.

## Full migration-reference inventory

The final identities are referenced consistently in:

- `backend/package.json` — `test:player-marketplace` `--allow-read` migration paths;
- `backend/src/domains/marketplace/tests/playerMarketplaceMigrationContract.test.ts` — `REFERENCES`, `LIFECYCLE`, and `REPLAY` constants;
- `backend/src/domains/marketplace/tests/playerMarketplaceReservationConvergenceMigrationContract.test.ts` — `LIFECYCLE` and `CONVERGENCE` constants;
- `.github/workflows/player-terminal-verify.yml` — Marketplace migration path allowlist;
- `.github/workflows/marketplace-preconvergence.yml` — trigger paths for all three migrations;
- `docs/operations/evidence/pr-249-player-marketplace-lifecycle.md` — migration identity and evidence references;
- `docs/roadmaps/active/player-marketplace-lifecycle-v1.md` — final identity references;
- this document — rekey map and migration paths;
- PR #249 body — migration identity list and final-range statement.

The final audit must require these identities to resolve to the three authoritative files and must reject duplicate migration versions or placeholder identities.

## Crafting compatibility matrix

| Crafting contract | Marketplace consumption | Required preservation |
| --- | --- | --- |
| `inventory_reservations` is authoritative | Add `marketplace_listing` rows keyed by listing UUID | Preserve Crafting rows and uniqueness; no table fork |
| `quantity_reserved` is a projection | Reconcile sum of all active rows before/after Marketplace mutation | Never compute Marketplace availability from its rows alone |
| `crafting_input` reservations | Included in availability and refund calculations | Marketplace cannot consume or release them |
| `equipment_action` reservations | Included in availability and refund calculations | Marketplace cannot consume or release them |
| active/consumed/released terminal model | Marketplace partial consumption stays active; final consumption/release becomes terminal | No resurrection of terminal rows |
| game/player/holding/store-item composite scope | Every Marketplace helper filters the same composite scope | Wrong-game and wrong-owner operations fail closed |
| Crafting final range `20260721130000–20260721135700` | Marketplace final range must be later | Preserve the entire Crafting family exactly once |
| stable item keys and public identities | Marketplace stores stable item keys and exposes public listing/order IDs | Do not expose backend UUIDs or copy Seed catalogs |
| pause/ended/session lifecycle gates | Marketplace wrappers retain existing lifecycle gates | No relaxation of Crafting or shared lifecycle behavior |
| committed-success and idempotency | Marketplace wrappers preserve existing receipts and uniqueness | Duplicate requests must replay without duplicate transfer or settlement |

## Shared-file additive reconstruction record

Each shared file was reconstructed from Crafting-merged `main` with narrow Marketplace additions:

| Shared file | Marketplace addition to reapply | Predecessor behavior to preserve |
| --- | --- | --- |
| `.github/workflows/player-terminal-verify.yml` | Marketplace-owned paths and read-only evidence workflow allowlist | Crafting browser paths, isolation rules, and all earlier feature allowlists |
| `backend/package.json` | Marketplace test command and final migration references | Crafting scripts plus all prior smoke/typecheck scripts |
| `backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts` | Marketplace route/action capabilities | Crafting and predecessor capabilities |
| `backend/src/domains/players/contracts/playerCapabilityManifestContracts.test.ts` | Marketplace capability assertions | Crafting and predecessor assertions |
| `backend/src/security/playerRateLimitDispatch.ts` | Marketplace action classifications | Crafting and central security dispatch |
| `backend/src/security/classroomApiRateLimitDispatch.test.ts` | Marketplace dispatch coverage | Crafting, login, Story, and predecessor security cases |
| `backend/supabase/functions/admin-api/index.ts` | Marketplace Admin dispatch/import | Crafting oversight and every prior Admin route |
| `backend/supabase/functions/classroom-api/index.ts` | Marketplace Player dispatch/import | Crafting, World, Business, Store, Inventory, Story, and session routes |
| `admin/index.html` | Marketplace loader registration | Crafting loader and deterministic accepted shell ordering |
| `player-terminal/src/api/endpoints.js` | Marketplace endpoints | Crafting and predecessor endpoints |
| `player-terminal/src/api/resource-plan.js` | Marketplace read resource | Crafting and predecessor resource plan |
| `player-terminal/src/integrations/student-profile-api-call.js` | Marketplace mutation adapters | Crafting and committed-success handling |
| `player-terminal/src/integrations/student-profile-capability-manifest.js` | Marketplace action mapping | Crafting and predecessor mappings |

## Final convergence checklist

- [x] exact Crafting merge SHA recorded;
- [x] final Marketplace migration range recorded;
- [x] Crafting migration family `20260721130000–20260721135700` preserved exactly once;
- [x] three Marketplace migrations use their final identities;
- [x] existing branch synchronized exactly once;
- [x] shared files reconstructed additively from Crafting-merged `main`;
- [x] generic reservation reason extended additively;
- [x] local Player, Admin source, adapter, and TypeScript validation passed;
- [ ] complete exact-head GitHub CI and desktop/mobile Player/Admin verification pass;
- [ ] zero-state replay succeeds twice and database lint passes;
- [ ] isolated-staging Marketplace acceptance passes;
- [ ] synthetic cleanup verifies zero residue;
- [ ] production non-modification is independently verified;
- [ ] immutable head is returned to Chat 1;
- [ ] final merge authorization is issued.
