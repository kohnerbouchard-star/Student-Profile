# Business Phase 10 Store Purchase Settlement Authority v1

**Checkpoint:** `BUSINESS-V2-10A1`
**Status:** Authority audit and implementation contract
**Runtime mutation authorized:** No
**Parent:** certified Phase 9A withdrawal safety

## Executive decision

The Business seller-offer purchase path must be a new Store-owned economic authority layered over existing canonical identities. It must not be implemented by extending the retained seeded compatibility purchase function in place.

The final transaction boundary is:

`offer-bound quote + active locked seller offer + exact listed holding + Buyer Checking + Business cash + Buyer Inventory`
→ `one immutable Store purchase receipt`

All money, Inventory, offer, revenue, COGS, and evidence changes commit together or do not exist.

## Current architecture audit

### Catalog and offer identity

`store_items` is the presentation/catalog compatibility identity. `game_items` is the canonical product identity. `store_seller_offers` is the seller-specific commercial identity.

A Business purchase must bind all three, but the seller offer controls:

- seller party and Business identity;
- offer-scoped Store-listing custody;
- unit price and currency;
- active/non-purchasable lifecycle;
- optimistic version;
- purchase-vs-withdrawal serialization.

The catalog row is not sufficient purchase authority once multiple sellers exist.

### Retained quote authority

The retained Player Store quote records:

- Store item;
- Buyer;
- quantity;
- country/FX/pricing evidence;
- final price;
- expiry and lifecycle.

It does not record a seller offer, seller party, Business, offer version, or listing account. Consequently, it cannot prove which seller accepted the quote or which inventory/cash authorities must settle.

10A.2 must introduce a new offer-aware quote record or a forward-only extension with an unambiguous compatibility discriminator. Existing historical quotes must retain their original meaning.

### Retained settlement authority

The retained `purchase_quoted_store_item` function locks a compatibility Store item, debits the Player transaction account, and transfers from the catalog item's compatibility stock account to Player Inventory.

It does not:

- lock a `store_seller_offers` row;
- reject `withdrawal_pending` through seller-offer authority;
- credit first-class Business cash;
- bind an immutable Business seller receipt;
- recognize Business revenue and COGS;
- settle against an offer-scoped listing account.

It remains valid only for the seeded compatibility channel until a later explicit cutover.

### Withdrawal authority

Phase 9A has already established the race boundary:

- withdrawal request creation locks the offer and immediately changes it to `withdrawal_pending`;
- a due withdrawal request locks request then offer and cannot return reserved inventory;
- offer mutation and stock placement fail closed while pending;
- durable request replay is authoritative.

The purchase command must therefore lock the offer before any money or Inventory row. This is the only ordering that can make withdrawal-first reject before payment and purchase-first settle before withdrawal.

### Player money

Player transaction money is canonical Checking. Historical `cash` callers normalize to Checking. A new settlement must target the canonical Player Checking row and must not introduce another wallet or balance projection.

### Business money

Business cash uses first-class Business account ownership and `record_business_ledger_entry_v2`-style authority. The seller is the Business economic party, not the owner Player. Seller revenue cannot be credited to the owner's personal account or to a synthetic account-type alias.

### Inventory

The exact source is the offer-bound `store_stock` account and holding. The exact destination is the Buyer's canonical personal Inventory account and holding. `store_items.stock_quantity` may remain a retained seeded compatibility projection but cannot become the Business offer quantity authority.

### Revenue and COGS

The purchase receipt must record:

- gross revenue equal to Business cash credit;
- COGS equal to source listing average unit cost times settled quantity;
- gross margin as derived evidence, not a separately authored outcome.

The existing automatic `settle_business_cycle_v1` path can independently consume Finished Goods and create Business sales. It must not be reused for Store settlement. Phase 11 must retire or redirect competing automatic physical-good sales through the Store offer authority so the same units cannot be sold twice.

## Target immutable receipt

A later migration should create Store-owned purchase receipt evidence with:

- internal UUID primary key and public `spr_...` key;
- same-game Buyer, Business, seller-party, offer, Store item, canonical item, listing account, and Buyer Inventory account scope;
- immutable offer-aware quote identity;
- quantity, unit price, total price, currency, source unit cost, COGS, and gross revenue;
- Buyer debit and Business credit ledger references;
- canonical Inventory transaction reference;
- offer version before/after and remaining listed quantity;
- idempotency key and immutable request hash;
- `STARTED` to `COMPLETED` one-way lifecycle or an equivalent transaction-safe insert-on-completion design;
- completed timestamp;
- forced RLS and service-role-only table/function privileges.

The public receipt DTO must expose public keys and economic results only. Internal UUID references stay server-side.

## Target quote authority

10A.2 must bind quote creation to one active Business seller offer under trusted game and Buyer scope.

Required quote snapshot:

- offer public key and exact version;
- seller party and Business identity;
- Store item and canonical item;
- listing account;
- requested quantity;
- seller unit price;
- Buyer settlement currency and FX;
- final Buyer unit and total price;
- creation, expiry, pricing version, and immutable hash.

Quote replay precedes mutable live-state reinterpretation. Settlement still revalidates current offer status/version and physical availability while holding the offer lock.

## Target command boundary

Browser intent may include only:

- offer key;
- quote key;
- quantity;
- expected offer version;
- idempotency key;
- optional client-submitted timestamp.

The server derives:

- game session;
- Buyer Player;
- Business and seller party;
- catalog/canonical item;
- listing account and holding;
- Buyer Checking row;
- Business cash row;
- Buyer Inventory account;
- cost basis;
- ledger and Inventory provenance;
- economic result.

No browser-submitted seller, Business, account, cost, revenue, COGS, balance, Inventory, or completion value is trusted.

## Lock order specification

The optional idempotency advisory lock is acquired before economic row locks.

Economic row order:

1. seller offer;
2. listing holding;
3. Buyer Checking;
4. Business cash;
5. Buyer Inventory holding;
6. ledger and Inventory posting;
7. receipt completion;
8. offer completion.

Identity rows may be read or share-locked before the offer, but no other economic row may be held while waiting for the offer.

The receipt replay lookup may occur before current offer-state validation. It must not acquire a request/receipt row lock after another economic row in a way that inverts the committed settlement order.

## Purchase-first trace

1. Command resolves a matching durable receipt; none exists.
2. Command locks the seller offer.
3. Offer is active, version matches, quote matches, and withdrawal is absent.
4. Command locks listing holding and verifies owned minus reserved quantity.
5. Command locks Buyer Checking and Business cash.
6. Command locks/creates Buyer Inventory holding.
7. One ledger/Inventory posting group records Buyer debit, Business credit, and physical transfer.
8. Receipt records gross revenue, COGS, versions, and public provenance.
9. Offer version advances exactly once.
10. Transaction commits.
11. A later withdrawal must use the new version and can act only on remaining stock.

## Withdrawal-first trace

1. Withdrawal locks the seller offer.
2. Withdrawal commits `withdrawal_pending` and a new offer version.
3. Purchase later locks the seller offer.
4. Purchase rejects status/version before locking money or Inventory.
5. No Buyer debit, Business credit, transfer, revenue, COGS, or receipt exists.

## Replay trace

1. The same trusted scope and idempotency key locate a completed receipt.
2. The immutable request hash matches.
3. The command returns the recorded receipt.
4. Current Business, offer, catalog, money, and Inventory changes do not alter the receipt.
5. No economic row is mutated and the offer version does not advance.

A mismatched request hash raises an idempotency conflict.

## Rollback boundary

The database transaction must roll back when any of these fail:

- ledger debit;
- ledger credit;
- Inventory posting;
- receipt completion;
- Business activity/audit evidence;
- offer version completion.

A `STARTED` receipt may not be externally visible as a completed purchase. Recovery must either replay the same transaction safely or prove no economic mutation committed.

## Currency decision

The Business seller offer and Business cash authority must use the same Business currency. The offer-aware quote may convert the Buyer price into Buyer settlement currency only through canonical FX evidence.

Before runtime implementation, 10A.2 must decide whether:

- Buyer Checking is debited in Buyer currency while Business cash is credited in Business currency with one immutable FX bridge; or
- offer purchase is permitted only when both settle in one currency.

The runtime settlement must not perform an undocumented currency conversion. Checkpoint 10A.1 deliberately freezes this as an explicit decision gate rather than guessing.

## Tax and fees

10A.1 does not authorize tax withholding, remittance, platform fees, or arbitrary deductions. The first runtime settlement should credit the Business the exact seller amount represented by the quote and record gross revenue. Any tax/fee authority requires named ledger recipients, exact equations, and separate acceptance coverage.

## Collision and migration boundary

The later migration must:

- use a new forward timestamp after the Phase 9A `202608241200*.sql` family;
- not edit applied Phase 7A, 8A, 9A, Player Store, or Business procurement migrations;
- preserve historical seeded Store receipts;
- avoid route or RPC signature collisions with the retained public Store path;
- remain service-role-only behind authenticated Player scope derivation;
- preserve game isolation and public-key-only browser contracts.

## Ordered implementation

### 10A.1 — authority foundation

Documentation, typed contracts, structural tests, deterministic race/rollback simulation, and dedicated CI only. No runtime mutation.

### 10A.2 — offer-aware quote authority

Forward schema and service-only quote command. Quote creation locks or consistently snapshots the seller offer and returns an immutable offer-bound quote. No money or Inventory movement.

### 10A.3 — atomic settlement authority

Forward receipt schema and one service-only transaction that performs Buyer debit, Business credit, listing-to-Buyer transfer, revenue/COGS evidence, receipt completion, and offer version completion. Includes purchase-first/withdrawal-first real database concurrency tests.

### 10A.4 — Player cutover

Authenticated Player route, browser-safe read/receipt contract, Player Store presentation cutover, and connected two-browser acceptance. Only after 10A.3 is certified.

### Phase 11 — automatic-sales convergence

Remove or redirect competing automatic physical-good sales so simulated demand consumes the same Store offers and settlement authority.

## Non-negotiable acceptance

No later checkpoint may be certified unless tests prove:

- paid-without-item is impossible;
- item-without-payment is impossible;
- Business-credit-without-Buyer-debit is impossible;
- COGS/revenue-without-settlement is impossible;
- purchase/withdrawal ordering is deterministic;
- replay is exact and conflict-safe;
- wrong-game and wrong-owner attempts mutate nothing;
- failed posting rolls back every economic side;
- the retained seeded path remains stable until explicit cutover;
- one canonical quantity authority and one canonical money authority remain.
