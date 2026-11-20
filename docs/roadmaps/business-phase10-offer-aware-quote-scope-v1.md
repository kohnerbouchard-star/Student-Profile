# Business V2 Phase 10A.2 — Offer-Aware Quote Authority Scope v1

**Roadmap item:** `BUSINESS-V2-10A2`
**Status:** COMPLETE — checkpoint 10A.2 durably certified
**Branch:** `feat/business-store-offer-aware-quote-v2`
**Parent branch:** `feat/business-store-purchase-settlement-v2`
**Parent draft PR:** #665
**Stacked draft PR:** #666
**Certified parent implementation source:** `1abc8b878df5b08716107adb467bd013e85b6df4`
**Clean parent handoff:** `34776a124e6595b67ffb7e52357fd5a1d9194435`
**Exact certified implementation and verification source:** `ad57d5b9307178229a6b47b3206d258f1bd9b70d`
**Dedicated exact-head workflow:** Business Store Offer-Aware Quotes V2 `32790518745`
**Certification date:** 2026-08-25

## Decision

Checkpoint 10A.2 introduces a new Store-owned quote authority for Business seller offers. It does not extend or reinterpret the retained seeded Store quote table.

The quote is:

- bound to one active `sof_...` Business seller offer and exact offer version;
- bound to the seller Business, economic party, Store catalog row, canonical item, and offer-scoped Store-listing account;
- bound to one trusted Buyer Player and the Buyer's active country/currency context;
- immutable after creation except for a controlled one-way lifecycle transition in a later authority;
- non-reserving, so settlement must still revalidate the locked offer and exact available quantity;
- replayable by Buyer-scoped idempotency key before mutable live-state reinterpretation.

No money or Inventory moves during quote creation.

## Currency boundary

The first Business seller-offer purchase authority is deliberately **same-currency**:

- the Business seller offer, Business cash authority, Store catalog row, and Buyer country currency must match;
- `exchangeRate` is exactly `1`;
- the seller unit price is the Buyer final unit price;
- the seller total and Buyer final total equal `unit price × quantity`, rounded to four decimal places.

Cross-currency Business purchases are rejected. They require a named FX clearing authority, two-sided ledger evidence, and an immutable conversion equation. Checkpoint 10A.2 does not infer that mechanism.

## Persistence authority

The new `store_offer_purchase_quotes` table records:

- public `quote_...` identity;
- trusted game and Buyer identity;
- Buyer country profile/code;
- exact seller offer, Business, seller party, Store item, canonical item, and listing account;
- quantity, exact offer version, and available quantity snapshot;
- seller and final unit/total prices;
- seller and Buyer currencies, exchange rate, and pricing policy version;
- Buyer-scoped idempotency key and immutable request hash;
- creation, expiry, lifecycle, and version evidence.

The table is force-RLS, browser-inaccessible, and service-role-only. Referenced economic identities are protected with same-game foreign keys and immutable trigger checks.

## Quote command

`create_business_store_offer_quote_v2` accepts only trusted server scope plus bounded browser intent:

- trusted `gameSessionId`;
- trusted `buyerPlayerId`;
- `offerKey`;
- positive quantity;
- expected offer version;
- idempotency key.

The server derives every Business, seller, catalog, canonical item, custody, country, currency, price, availability, and expiry value.

## Locking and race behavior

The command acquires an idempotency advisory lock first. Durable replay is then resolved before current Buyer, Business, seller-offer, catalog, country, or Inventory validation.

For a new quote:

1. trusted Buyer and country identity are share-locked;
2. the Business seller offer is share-locked before its listing holding;
3. active status, exact version, seller/business scope, catalog identity, custody, and same-currency rules are checked;
4. the exact listing holding is share-locked;
5. any positive reservation or insufficient quantity rejects the quote;
6. one immutable, non-reserving quote snapshot is inserted.

The offer share lock serializes the snapshot against withdrawal, repricing, retirement, and custody mutation:

- quote-first records the exact pre-mutation offer version; a later withdrawal may proceed and settlement will revalidate;
- withdrawal-first changes the offer to `withdrawal_pending`, so a later quote rejects;
- two simultaneous exact retries create one quote and return one replay.

## Durable replay

A matching retry returns the stored offer, version, seller, custody, item, quantity, prices, currency, creation time, and expiry even when mutable live state later changes.

Conflicting reuse of the same Buyer-scoped idempotency key fails closed. Replay does not reactivate, reprice, extend, reserve, or mutate the quote.

## Failure behavior

Creation fails without mutation for:

- invalid command/public identity;
- inactive or missing Buyer/country;
- missing, inactive, paused, retired, or `withdrawal_pending` offer;
- stale expected offer version;
- missing or inconsistent Business/seller/catalog/canonical identity;
- self-purchase by the Business owner;
- missing or inconsistent offer-scoped custody;
- fractional or reserved listed quantity;
- insufficient listed quantity;
- unsupported cross-currency settlement;
- conflicting idempotency reuse.

## Explicit exclusions

Checkpoint 10A.2 **does not authorize**:

- Buyer Checking debit;
- Business cash credit;
- Store Listing-to-Buyer Inventory transfer or reservation;
- revenue, COGS, tax, fee, refund, dispute, or reversal posting;
- purchase receipt persistence;
- seller-offer quantity/version mutation;
- authenticated Player Store route or UI cutover;
- automatic consumer/NPC sales;
- retirement or modification of the retained seeded Store quote/purchase path;
- Marketplace, Contracts, equity, IPO, or Financial Market work;
- merge, staging deployment, production deployment, secret mutation, or live database mutation.

## Required acceptance

One exact implementation SHA must pass:

- structural authority contract;
- typed command/result contract;
- creation, exact replay, concurrent replay, conflict, expiry, and mutable-state replay simulations;
- quote-first and withdrawal-first ordering simulations;
- stale version, reservation, sold-out, self-purchase, cross-currency, and two-game isolation simulations;
- complete migration replay from zero twice and rebuilt-database lint;
- retained Phase 10A.1, Phase 9A, Phase 8A, and Phase 7A contracts and simulations;
- retained Store, Inventory, Business Economy, Banking, workforce/payroll, equipment, and timed-manufacturing verification;
- all Backend and Edge TypeScript checks;
- Repository Quality, deterministic architecture inventory, and Supply Chain Security;
- standalone Player Terminal and Chromium checks;
- `git diff --check`.

## Certification evidence

The exact implementation source `ad57d5b9307178229a6b47b3206d258f1bd9b70d` passed the complete dedicated workflow `Business Store Offer-Aware Quotes V2` run `32790518745`:

- `contract-and-quality`: Phase 10A.2 structural authority, typed contract, replay/race simulation, retained 10A.1/9A/8A/7A contracts, migration validation, deterministic architecture inventory, Repository Quality, and Supply Chain Security — **PASS**;
- `retained-runtime`: Business formation/economy/domain/stockroom/procurement/Banking, workforce/payroll, equipment, timed manufacturing, Store and Inventory lifecycle tests, all Backend/Edge TypeScript, and Player Edge entrypoints — **PASS**;
- `database-replay`: complete database replay from zero twice plus rebuilt-database lint — **PASS**;
- `player-and-browser`: standalone Player Terminal verification, adapter/capability/runtime integration, and Chromium browser verification — **PASS**.

PR #666 remained open, draft, mergeable, unmerged, and undeployed. Temporary Phase 10A.2 durable-finalizer workflows are removed in the certification commit. No Buyer debit, Business credit, Inventory movement or reservation, revenue/COGS posting, purchase receipt, Player route/UI, merge, deployment, secret mutation, or live database mutation occurred.

## Completion rule

Checkpoint 10A.2 is complete only when the exact implementation SHA passes the required matrix and the scope, execution plan, execution log, and draft PR contain matching evidence. The PR must remain stacked, draft, open, unmerged, and undeployed.

Checkpoint 10A.2 is complete. Purchase settlement remains uncertified. The next authorized checkpoint is **Phase 10A.3 — atomic economic settlement**, limited to one service-owned transaction that revalidates the locked quote and offer, debits Buyer Checking, credits Business cash, transfers exact Store-listing stock to Buyer Inventory, records revenue and COGS evidence, consumes the quote, advances the offer version, and completes one immutable `spr_...` receipt. Player route/UI cutover, automatic sales convergence, equity/IPO, merge, deployment, secrets, and live database mutation remain closed.
