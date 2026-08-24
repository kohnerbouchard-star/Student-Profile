# Business V2 Phase 8 — Physical Store-Listing Inventory Scope v1

**Status:** IN PROGRESS — checkpoint 8A scope locked; implementation not certified
**Branch:** `feat/business-store-listing-inventory-v2`
**Parent branch:** `feat/business-store-seller-offers-v2`
**Parent draft PR:** #662
**Certified Phase 7A exact-head source:** `04db81436e75cea6c52d0c720508c3ea12baab05`
**Clean Phase 7A durable handoff head:** `462e6083c5b2d2b3b5d515c67bc7a8d71a2e43fb`

## Purpose

Checkpoint 8A makes a Business Store offer hold real canonical inventory. Increasing listed stock must move exact unsold units from the Business Finished Goods account into an offer-scoped canonical `store_stock` account. The Store offer does not own a parallel quantity field; canonical Inventory remains the availability authority consumed by the certified Phase 7A aggregation.

The governing rule is:

> A listed unit cannot remain in Finished Goods. One committed canonical Inventory transfer moves it into one immutable offer-scoped Store-listing account, preserving item identity, cost basis, provenance, idempotency, and game isolation.

Checkpoint 8A is an additive custody-and-transfer foundation. It does not withdraw listed units and it does not sell them to a buyer.

## Current authority and required correction

The repository already defines:

- Business economic parties;
- canonical `finished_goods` and `store_stock` Inventory account kinds;
- canonical Inventory holdings and append-only transactions;
- the canonical `economy_private.post_inventory_transaction_v2` poster;
- the retained `business_inventory` stockroom projection used by existing Business reads and settlement compatibility;
- Phase 7A `store_seller_offers` with immutable seller/catalog identity and one-time custody binding;
- Phase 7A aggregation derived from canonical holdings.

The retained Inventory poster currently accepts `store_stock` only when the account belongs to the seeded Store party and is the compatibility account attached directly to `store_items`. That rule is correct for seeded stock but cannot post into the certified Phase 7A Business-owned offer account model. Checkpoint 8A must extend the existing canonical poster so it recognizes an active Business offer-scoped `store_stock` account while preserving all seeded Store validation. It must not create a Business-specific inventory poster, quantity ledger, or shadow holding table.

The existing compatibility direction projects `business_inventory` writes into canonical holdings. A canonical Finished Goods debit that does not also converge the retained stockroom row would leave later Business reads stale and could allow a subsequent compatibility write to re-inflate already-listed inventory. Checkpoint 8A therefore must lock, validate, and synchronize the exact retained Finished Goods projection inside the same transaction as the canonical transfer. Canonical Inventory remains authoritative; the retained row is a compatibility projection, not a second quantity authority.

## Included authority

Checkpoint 8A may implement only the following:

1. Extend canonical Inventory posting validation so `store_stock` supports:
   - the existing Store-owned compatibility account tied to `store_items.inventory_account_id`; and
   - a Business-owned account tied to one same-game, non-retired Business `store_seller_offers` row.
2. Preserve the existing seeded Store stock projection and quote/purchase compatibility behavior unchanged.
3. Create or resolve one deterministic active Business-owned `store_stock` account for one Business offer.
4. Use immutable account identity:
   - seller Business party;
   - account kind `store_stock`;
   - location key derived from the public offer key;
   - metadata carrying public Business and offer identity only.
5. Bind a previously unbound Business offer to that account exactly once.
6. Add a service-only stock command that accepts only:
   - game scope from trusted composition;
   - public Business key;
   - public offer key;
   - positive integer quantity;
   - expected offer version;
   - idempotency key.
7. Validate server-side that:
   - the Business and seller party are active and same game;
   - the offer belongs to that Business seller;
   - the offer is not retired;
   - the offer catalog item matches the exact canonical Finished Goods item;
   - the Finished Goods account is active and owned by the same Business;
   - the retained `business_inventory` row maps to the same Business, account, item, and `finished_good` kind;
   - retained quantity, unit cost, and total cost basis match the canonical Finished Goods holding before a new transfer or replay is accepted;
   - unreserved Finished Goods quantity is sufficient;
   - expected offer version matches for a new committed command;
   - a matching committed idempotent retry replays even after the offer version advances;
   - conflicting idempotency reuse fails closed.
8. Post one canonical `transfer` transaction with:
   - a negative Finished Goods line;
   - a positive offer-scoped Store-listing line;
   - the source holding's carried average cost and currency on the destination line;
   - immutable public-key provenance in transaction/line metadata.
9. Synchronize the retained Finished Goods stockroom projection to the canonical post-state before commit without creating another holding, transaction, or quantity ledger.
10. Increment the offer version exactly once for a newly committed stock command while keeping quantity authority exclusively in Inventory.
11. Return only public keys and bounded commercial/custody state.
12. Add typed Store-domain contracts and repository support for the service command.
13. Add deterministic tests for:
   - first stock placement;
   - additional stock placement;
   - exact idempotent replay;
   - conflicting replay;
   - stale offer version;
   - insufficient/unavailable Finished Goods;
   - reserved Finished Goods exclusion;
   - retained projection mismatch and rollback;
   - wrong Business, seller, item, account, and game;
   - duplicate account convergence;
   - concurrent stock attempts;
   - cost-basis preservation;
   - canonical aggregation reflecting the resulting holding;
   - two simultaneous games remaining isolated.

## Account and holding invariants

- One Business offer resolves to one immutable `store_stock` account.
- The account party must equal the offer seller party.
- The offer and account must remain in the same game.
- The account location must deterministically identify the public offer.
- One account cannot back another active offer.
- A Business offer holding is not the seeded Store compatibility holding and must not mutate `store_items.stock_quantity`.
- A Business offer holding must not carry `store_item_id` compatibility identity unless a later reviewed settlement requirement explicitly authorizes it.
- Availability is `quantity_owned - quantity_reserved` from canonical Inventory.
- Listed quantity is never persisted on the offer row or in a Business-local table.
- The retained Finished Goods `business_inventory` row must equal the canonical Finished Goods post-state but remains a compatibility projection rather than listed-quantity authority.
- Account, holding, transaction, line, and internal offer UUIDs remain private.

## Cost and provenance invariants

- Moving units between Business-owned accounts is not a purchase, sale, revenue event, wage event, or expense settlement.
- The source Finished Goods average unit cost and cost currency carry into Store-listing inventory.
- The retained Finished Goods row is synchronized to the canonical source holding's post-transfer quantity, unit cost, and total cost basis.
- No cash, ledger, tax, revenue, or COGS posting occurs in checkpoint 8A.
- The canonical append-only inventory transaction is the movement evidence.
- Matching retries cannot move units twice, change the retained quantity twice, or advance the offer twice.

## Concurrency and lock ordering

The implementation must use one deterministic transaction boundary and fixed lock order:

1. Business and seller identity;
2. offer row;
3. deterministic Store-listing account;
4. Finished Goods account;
5. retained Finished Goods `business_inventory` projection;
6. canonical Finished Goods item holding;
7. canonical Inventory transaction/posting;
8. retained projection post-state synchronization;
9. offer version/public receipt state.

A matching committed idempotent transaction is checked before rejecting a retry for the now-advanced offer version. Competing new commands still require the current offer version, a converged retained projection, and sufficient unreserved Finished Goods.

## Explicit exclusions

Checkpoint 8A does **not** authorize:

- reducing listed quantity;
- cancelling or retiring an offer as part of stock placement;
- `withdrawal_pending`, cooling-off timestamps, or the five-minute withdrawal processor;
- returning listed units to Finished Goods;
- Player Business offer or stock mutation routes;
- Player Store catalog cutover;
- offer-aware buyer quotes;
- buyer payment, seller cash credit, COGS, tax, or inventory settlement;
- automatic activation after stocking;
- automatic demand or simulated consumer sales;
- seeded Store stock or replenishment redesign;
- Marketplace integration;
- Contracts consumption of listed stock;
- equity, shares, IPO, or Financial Market publication;
- merge, staging deployment, production deployment, secret mutation, or live database mutation.

## Required implementation artifacts

- forward-only migration(s) for canonical poster compatibility, account invariants, stock command, retained projection convergence, and schema assertions;
- Store-domain typed command/result contracts and repository publication;
- deterministic structural contract;
- deterministic concurrency/economic simulation;
- two-game isolation coverage;
- dedicated exact-head workflow;
- deterministic architecture inventory update when required;
- durable execution-plan/log update only after one exact implementation SHA passes the complete required matrix.

## Required acceptance gates

One frozen implementation SHA must pass:

- Phase 8A structural contract and simulations;
- Phase 7A seller-offer contract/simulation/type regressions;
- canonical Store quote/purchase lifecycle tests;
- canonical Inventory lifecycle and negative-state tests;
- canonical Business Stockroom and timed-manufacturing regressions;
- Database Replay from zero twice and rebuilt-database lint;
- Backend Typecheck and backend smoke;
- all Backend and Edge TypeScript checks;
- Business Economy, Banking, workforce/payroll, equipment, and manufacturing gates;
- Repository Quality and deterministic architecture inventory;
- Supply Chain Security;
- standalone Player Terminal and Chromium regression verification;
- two-game isolation and deterministic concurrency checks;
- `git diff --check`.

## Completion rule

Checkpoint 8A is complete only when:

1. implementation exists on the stacked branch;
2. one exact implementation SHA is frozen;
3. every required exact-head gate passes on that SHA;
4. this scope, the Business execution plan, and the Business execution log record the certified source and evidence;
5. temporary repair/finalizer artifacts have zero net presence;
6. the PR remains draft, unmerged, and undeployed.

## Next step after scope lock

Implement the bounded canonical-poster extension, deterministic offer-scoped account authority, exact Finished Goods-to-Store transfer command, retained stockroom projection convergence, typed Store contracts, tests, and dedicated CI. Do not widen checkpoint 8A into withdrawal or buyer settlement.
