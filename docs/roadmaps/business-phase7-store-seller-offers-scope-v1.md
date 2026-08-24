# Business V2 Phase 7 — Store Seller Offers Scope v1

**Status:** IN PROGRESS — checkpoint 7A scope locked; implementation not certified
**Branch:** `feat/business-store-seller-offers-v2`
**Parent branch:** `feat/business-timed-manufacturing-v2`
**Parent draft PR:** #661
**Certified Phase 6 exact-head source:** `739f5540234b20e16ba34f69f0d741d986030113`
**Clean Phase 6 durable handoff head:** `b4a41fd1f80dbe426e1aa20bd1ff37291dca1fd4`

## Purpose

Phase 7 separates seller offers from catalog identity so one canonical Store product can present multiple sellers without duplicating the product card. The Store domain owns offer identity and aggregation. Business, seeded, and NPC sellers participate through canonical economic-party, Inventory, and catalog references rather than creating Business-local copies of Store, item, stock, or payment authority.

The governing rule is:

> `game_items` defines the product, `store_items` remains the Store presentation and compatibility channel, `store_seller_offers` defines who is offering that product and at what price, and canonical Inventory determines whether stock exists.

Checkpoint 7A is an additive authority/read-model foundation. It does not change buyer quote or purchase settlement.

## Repository audit findings

The live Phase 6 handoff establishes the following existing authorities:

- `public.game_items` is the canonical game-scoped item identity.
- `public.store_items` is the existing Store presentation and compatibility row used by current Player quotes and purchases.
- Each `store_items` row already references one canonical `game_item_id` and one canonical Store `inventory_account_id`.
- `public.economic_parties` is the canonical seller/owner identity for Store, Business, country, and system actors.
- `public.inventory_accounts` and `public.inventory_holdings` are the canonical custody and quantity authorities.
- Existing Store purchase settlement locks and settles the legacy `store_items` compatibility row; it must remain unchanged during 7A.
- Existing Player Store reads currently expose one price and one stock quantity directly from `store_items`, so switching them to all seller offers before offer-aware quoting and settlement would create a displayed-price/settled-price mismatch.

Therefore checkpoint 7A must create the offer authority and service-owned aggregation boundary without cutting the current Player purchase path over prematurely.

## Canonical authority reuse

Checkpoint 7A must reuse, not duplicate:

- Store presentation: `public.store_items`;
- catalog identity: `public.game_items`;
- seller identity: `public.economic_parties`;
- Business identity: `public.business_entities` through the Business economic party;
- stock custody and availability: `public.inventory_accounts` and `public.inventory_holdings`;
- seeded supply policy: `public.game_session_item_supply` where applicable;
- buyer money and payment settlement: existing Banking/ledger and Store purchase authorities, unchanged in 7A.

No new catalog table, inventory holding table, balance table, ledger, quote table, purchase table, or Business-local Store table is authorized.

## Checkpoint 7A — seller-offer identity and aggregation foundation

### Included

1. Add Store-owned `public.store_seller_offers` with public `sof_...` identity.
2. Bind every offer to one game, one Store presentation row, one canonical `game_item`, one canonical seller economic party, and optionally one canonical `store_stock` inventory account.
3. Support bounded seller kinds: `seeded`, `npc`, and `business`.
4. Support bounded lifecycle states: `draft`, `active`, `paused`, and terminal `retired`.
5. Enforce immutable offer identity, optimistic version progression, bounded lifecycle transitions, game-scope consistency, currency consistency, seller-kind/party-kind consistency, and inventory-account ownership.
6. Require an active offer to reference an active canonical `store_stock` account owned by the seller party.
7. Enforce at most one non-retired Business offer per Business seller and canonical item; retired history may remain.
8. Prevent one active custody account from backing multiple active offers.
9. Backfill one seeded compatibility offer per existing `store_items` row using the canonical Store party, canonical item, canonical Store stock account, current price, and current active/paused state.
10. Keep seeded compatibility offers synchronized when existing Store catalog administration changes price, currency, visibility, status, canonical item, or Store stock account.
11. Add a service-only, idempotent Business draft-offer creation command using public Business and Store item keys.
12. Add a service-only optimistic-concurrency offer mutation command for price, state, and future canonical Store-stock account binding.
13. Add a service-only catalog aggregation read that groups active, inventory-backed offers under one canonical item and returns deterministic best price, total available quantity, seller count, and public offer details.
14. Add typed Store-domain contracts/repository support for the aggregation read without exposing a Player route in 7A.
15. Add deterministic authority, concurrency, idempotency, aggregation, and cross-game simulations plus a dedicated workflow.

### Explicitly excluded

- Player-facing Business offer creation or editing routes;
- changing the existing Player Store item, quote, or purchase endpoints;
- selecting a seller offer during quote creation;
- buyer payment or inventory settlement against `store_seller_offers`;
- moving Business Finished Goods into Store custody;
- creating Business Store-listing accounts or transferring listed stock;
- quantity reduction or cancellation withdrawal processing;
- the five-minute withdrawal cooling-off lifecycle;
- automatic consumer/NPC sales convergence;
- Store purchase/revenue settlement changes;
- IPO, shares, equity, or Financial Market integration;
- merge, staging deployment, production deployment, secret mutation, or live database mutation.

These exclusions remain assigned to Phases 8–11 and 14 unless the durable execution roadmap is explicitly changed.

## Target data model

```text
game_items                       canonical product identity
    ^
    |
store_items                      Store presentation + legacy quote/purchase compatibility
    ^
    |
store_seller_offers              seller-specific price/state/version
    |                 \
    v                  v
economic_parties      inventory_accounts(store_stock)
                           |
                           v
                    inventory_holdings
```

The offer row must not store an independent stock quantity. Available quantity is derived from the bound canonical holding as:

```text
max(quantity_owned - quantity_reserved, 0)
```

The offer row may store only seller-specific commercial state such as price, lifecycle, version, idempotency evidence, and a bounded replenishment-policy reference.

## Seller and custody rules

- `seeded` offers must use the same-game active Store economic party.
- `npc` offers must use a same-game active country or system economic party.
- `business` offers must use a same-game active Business economic party whose Business remains active.
- All offers under one Store presentation row use that row's currency so best-price aggregation is economically comparable.
- An active offer requires a same-game active `store_stock` inventory account owned by its seller party.
- A draft Business offer may exist without Store custody; it cannot become active until a later phase supplies a compliant Store-listing account and stock.
- A Finished Goods, Warehouse, WIP, personal, transit, escrow, source, or sink account cannot back an active offer.
- Available quantity is never browser-authored and is never persisted on the offer row.

## Lifecycle and concurrency

```text
draft -> active | retired
active -> paused | retired
paused -> active | retired
retired -> terminal
```

Concurrency rules:

- Business draft creation is idempotent by authenticated/service-derived game, seller party, and idempotency key.
- Matching retries return the existing offer; conflicting reuse fails closed.
- Creation serializes on game + Business seller + canonical item so concurrent requests cannot create duplicate current offers.
- Mutations lock the offer and require the expected version.
- Stale mutations fail without changing price, state, or custody binding.
- Active-account uniqueness prevents two active offers from claiming the same custody account.
- Aggregation is game scoped and deterministic.

## Compatibility boundary

During checkpoint 7A:

- existing `store_items` administration remains authoritative for the current seeded compatibility offer;
- the synchronization trigger keeps the seeded `store_seller_offers` projection current;
- existing Player Store reads, quotes, and purchases continue using the reviewed legacy compatibility path;
- Business and NPC offers remain service-visible only;
- no buyer can be shown an offer that the current quote/purchase path cannot settle.

A later checkpoint may cut Player catalog presentation to the aggregation read only when quote and settlement semantics cannot diverge.

## Public/service read boundary

The service-owned aggregation may expose only:

- canonical item public key and canonical key;
- compatibility Store item key;
- name, description, category, and currency;
- best available unit price;
- total canonical available quantity;
- seller and offer counts;
- offer public key;
- seller economic-party public key, seller kind, and bounded display name;
- unit price, canonical available quantity, lifecycle, and version;
- deterministic update timestamp.

It must not expose internal UUIDs, inventory-account IDs, holding IDs, Business IDs, request hashes, idempotency keys, or unrestricted metadata.

## Acceptance requirements

Checkpoint 7A is not complete until one exact implementation SHA passes:

- seller-offer schema/authority contract;
- idempotent Business draft creation and conflicting-retry tests;
- optimistic version and lifecycle transition tests;
- one-current-Business-offer enforcement;
- active Store-stock custody enforcement;
- canonical availability aggregation with no persisted parallel quantity;
- seeded-offer backfill and compatibility synchronization contract;
- deterministic multi-seller one-card aggregation;
- concurrent duplicate-create and stale-update rejection;
- two-game isolation;
- Database replay from zero twice and rebuilt-database lint;
- Backend and all Edge typechecks;
- retained Store purchase, Inventory, Business Economy, Business Banking, workforce/payroll, equipment, manufacturing, Repository Quality, Supply Chain Security, Player Terminal, and Chromium gates;
- durable execution-plan and execution-log evidence.

## Completion rule

Checkpoint 7A may be claimed complete only when:

1. the implementation exists on the stacked Phase 7 branch;
2. one exact source SHA is identified;
3. all required exact-head checks are green on that SHA;
4. PR metadata and durable plan/log/scope records identify the implementation, evidence, decisions, blockers, and next step;
5. no temporary certification machinery remains;
6. no merge, deployment, secret change, or live database mutation occurred.

## Next step after scope lock

Implement the additive Store-owned offer authority, compatibility backfill/synchronization, service-only Business draft/mutation commands, typed aggregation repository, deterministic tests, and dedicated CI on the stacked draft branch. Do not widen checkpoint 7A into physical Store custody or buyer settlement.
