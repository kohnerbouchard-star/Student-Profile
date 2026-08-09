# ADR: Canonical Economic Asset and Ownership Core V2

Status: Proposed for staging validation  
Date: 2026-08-06  
Scope: Store, Player inventory, Crafting, Marketplace compatibility, redemption compatibility, equipment compatibility, and Business material accounting

## Context

Econovaria currently represents the same economic object through several domain-local identities. Store offers use `store_items.item_key` and `store_item_id`; Crafting recipes use physical-economy `item_key` values; Player ownership is projected through `inventory_holdings`; Marketplace and redemption carry Store provenance; Business inventory uses free-form `item_key` values.

The split becomes visible when a Player buys a Store offer whose commercial key is country-prefixed while the corresponding Crafting input uses the physical item key. The purchase succeeds and inventory quantity is recorded, but Crafting cannot resolve the acquired object as its required input. This is an identity-authority defect rather than a presentation defect.

Read-only preflight on 2026-08-06 established:

- Staging contained 344 Store offers: 144 exact physical-item key matches and 200 validated country-prefixed mappings, with no unresolved offers.
- Production contained 249 Store offers: 144 exact mappings, 100 validated prefixed mappings, and five legitimate Store-only offers that require explicit Store-created canonical identities.
- Production had four Player holdings, eight legacy inventory events, and four pending redemption requests. No invalid holding reservation balances or duplicate canonical Player holdings were found.
- Marketplace, Crafting jobs, and Business inventory had no live production rows at preflight time.

## Decision

Introduce one game-scoped canonical item authority and one ownership/location model while preserving existing route and public-key contracts.

### Canonical identity

`public.game_items` is the canonical identity for physical inputs, components, equipment, consumables, entitlements, services, Store-created offers, and Business-created outputs. The stable identity is `(game_session_id, canonical_key)`.

A Store row is a commercial offer and acquisition-provenance record. Its existing `item_key` and public key remain unchanged, but `game_item_id` identifies the object being sold. Crafting inputs and outputs resolve through the same canonical item. Store-only rows receive an explicit `store.<legacy item key>` identity rather than being left unresolved.

Runtime resolution may not infer identity by stripping beta or country prefixes. Prefix removal is permitted only in the bounded, validated historical backfill. Future seed imports use the payload’s explicit `sourceItemStableId` to bind a Store offer to its canonical physical item.

### Parties, accounts, and ownership

`public.economic_parties` represents Players, Businesses, the Store, escrow, countries, and system parties. `public.inventory_accounts` represents ownership/location, including personal inventory, Business warehouse, work in progress, finished goods, Store stock, escrow, transit, and system source/sink accounts.

`inventory_holdings` remains the compatibility projection used by existing reads and routes, but canonical ownership is `(inventory_account_id, game_item_id)`. `store_item_id` becomes optional acquisition provenance.

### Journal

`inventory_transactions` and `inventory_transaction_lines` record idempotent canonical movements. Existing `inventory_events` remains a compatibility event stream during the cutover. The private inventory poster validates game scope, party/account relationships, Player ownership, optional Store provenance, whole-unit quantities, reservation bounds, and idempotency before updating projections.

### Store and Crafting

The existing public Store and Crafting RPC names and argument/return contracts remain intact. Their implementations move canonical items through canonical accounts and continue updating compatibility projections.

Crafting outputs do not require a Store offer. They become visible through Player inventory by joining holdings to `game_items`; Store metadata is optional.

### Business accounting

Physical Business products have explicit bills of materials and canonical outputs. Purchased inputs are capitalized into Business warehouse inventory at acquisition. Production consumes those inputs, carries their basis into work in progress and finished goods, and debits only newly incurred labor or overhead. Sale settlement removes finished goods, recognizes cost of goods sold from the carried basis, and records revenue, wages, tax, and profit once.

This corrects the prior double-charge behavior in which material cash was paid at procurement and charged again during production.

### Marketplace and redemption

This release adds canonical compatibility references and backfills to Marketplace and redemption tables but does not replace their public RPCs. Existing Store-facing public keys remain stable. Redemption reservations are mirrored into the shared reservation authority while the legacy workflow continues to own its state transitions and quantity mutation.

## Compatibility and dependencies

- No public HTTP route is renamed.
- Existing Store item keys and Store public IDs remain valid.
- Existing Crafting, Marketplace, redemption, equipment, and Business RPC signatures remain valid.
- Browser payloads do not expose canonical UUIDs.
- The seed release RPC keeps the exact `apply_seed_content_release_v1` name and signature. It delegates to the prior implementation and performs canonical synchronization only after a successful result.
- The change does not redefine wallet or ledger ownership. PR #501 remains authoritative for Player checking/savings convergence; this work uses its existing checking-compatible ledger projection.

## Rollout

1. Replay all migrations from zero twice and lint the rebuilt database.
2. Run focused Store, Player inventory, Crafting, Marketplace, and Business route tests.
3. Apply the migrations to staging only.
4. Run `validate_economic_asset_core_v2` for every staging game.
5. Execute rollback-scoped transaction probes for Store-to-inventory and canonical movement behavior.
6. Review the draft PR and staging evidence before any production migration or merge.

## Failure and rollback policy

The migrations are forward-only and transaction-scoped. A failed migration leaves no partial schema from that file. Runtime cutovers preserve public contracts, so correction is performed through a subsequent forward migration rather than destructive rollback. Production is not modified by this work until the staging evidence is accepted separately.

## Non-goals

- Rewriting the Player or Admin UI.
- Replacing Marketplace or redemption state machines.
- Changing currency conversion policy.
- Replacing PR #501’s checking/savings work.
- Removing legacy compatibility columns in this release.
