# Business V2 Phase 10A.3 — Atomic Business Seller-Offer Settlement Scope v1

**Roadmap item:** `BUSINESS-V2-10A3`  
**Status:** OPEN — clean Codex implementation handoff; scope only  
**Branch:** `feat/business-store-atomic-settlement-v2`  
**Parent branch:** `feat/business-store-offer-aware-quote-v2`  
**Parent draft PR:** #666  
**Stacked draft PR:** #667  
**Certified parent implementation source:** `ad57d5b9307178229a6b47b3206d258f1bd9b70d`  
**Clean parent handoff:** `38d040748a62c5aa21a7111eeab80cd7e74b9263`  
**Handoff state:** no Phase 10A.3 runtime implementation has been committed or certified on PR #667  
**Temporary tooling:** the source-snapshot workflow was removed and has zero net presence at this handoff  

## Decision

Checkpoint 10A.3 implements one Store-owned, service-role-only PostgreSQL transaction for purchasing from an exact Business seller offer. It reuses the certified Phase 7A seller-offer authority, Phase 8A offer-scoped Store-listing Inventory custody, Phase 9A withdrawal ordering, Phase 10A.1 receipt and lock-order contract, and Phase 10A.2 immutable offer-aware quote authority.

The governing invariant is:

> Buyer debit, Business credit, physical delivery, revenue, COGS, quote consumption, offer-version advancement, and immutable receipt completion are one atomic settlement. They all commit together or none exist.

The retained seeded Store purchase path remains unchanged and retains its compatibility meaning.

## Included authority

Checkpoint 10A.3 may add only:

1. Forward-only Store settlement persistence for immutable public `spr_...` receipts and transaction evidence.
2. One service-owned settlement command accepting trusted game/Buyer scope plus bounded public intent.
3. Typed Store-domain command and receipt contracts plus Supabase repository/application wiring.
4. Fixed seller-offer-first economic row locking.
5. Canonical Buyer Checking debit and first-class Business cash credit.
6. Canonical `Store Listing -> Buyer Inventory` transfer with exact cost-basis preservation.
7. Gross revenue, COGS, and derived gross-margin evidence attached to the completed receipt and canonical Business activity/ledger authority.
8. One-way quote consumption and exactly one seller-offer version advancement.
9. Permanent read-only exact-head verification and database-backed concurrency, rollback, and two-game isolation tests.

This checkpoint does not add an authenticated Player route or browser control.

## Trusted command boundary

Browser-originating intent may contain only:

- public `offerKey`;
- public `quoteKey`;
- positive integer `quantity`;
- exact expected offer version;
- bounded idempotency key;
- optional client timestamp for audit context only.

The service derives and validates:

- game session;
- Buyer Player and active Buyer scope;
- exact quote, quote lifecycle, expiry, and immutable request binding;
- Business, seller economic party, Store catalog item, canonical item, custody account, price, currency, and offer version;
- Buyer Checking;
- Business cash authority;
- Buyer canonical Inventory account/holding;
- source listing cost basis and cost currency;
- ledger, Inventory, Business activity, and receipt provenance.

No browser-submitted owner, Business, seller, account, balance, price, currency, cost, revenue, COGS, margin, Inventory, receipt, or completion value is trusted.

## Durable replay and idempotency

An idempotency-scoped advisory lock may be acquired before economic row locks.

Before interpreting mutable offer, Business, catalog, account, balance, or Inventory state, the command must resolve a previously committed receipt for the trusted Buyer/game scope and idempotency key.

- A matching immutable request hash returns the exact stored receipt without locking or mutating economic rows.
- Conflicting reuse of the idempotency key fails closed.
- Replay never re-debits, re-credits, retransfers, re-recognizes revenue/COGS, re-consumes the quote, or advances the offer version.

## Fixed economic lock order

For a new settlement, economic rows are locked in this exact order:

1. exact `store_seller_offers` row `FOR UPDATE`;
2. exact offer-scoped Store-listing `inventory_holdings` row `FOR UPDATE`;
3. Buyer canonical Checking authority `FOR UPDATE`;
4. Business first-class cash authority `FOR UPDATE`;
5. Buyer canonical Inventory account/holding `FOR UPDATE`;
6. canonical ledger and Inventory posting;
7. Business revenue/COGS activity evidence;
8. immutable purchase-receipt completion;
9. quote consumption;
10. seller-offer version completion.

Identity rows may be read or share-locked before the offer. No other economic row may be held while waiting for the seller offer.

## Validation before economic mutation

While holding the seller-offer lock, settlement must validate:

- trusted game and Buyer scope;
- exact public offer and quote identities;
- quote belongs to the trusted Buyer and game;
- quote status is open/usable, not consumed, cancelled, or otherwise terminal;
- quote has not expired according to server time;
- command quantity exactly equals quoted quantity;
- quote offer version and command expected version exactly match the locked current offer version;
- seller offer is active and not `withdrawal_pending`, paused, retired, or otherwise non-purchasable;
- seller kind is Business and the Business/seller party remain active and same-game;
- Buyer is not the Business owner and is not the seller party;
- Store item, canonical item, listing account, Business, seller, price, and currency exactly match the immutable quote;
- same-currency settlement remains in force with `exchangeRate = 1`;
- the listing account is the exact active offer-scoped custody account owned by the seller party;
- source holding cost currency matches settlement currency;
- unreserved listed quantity is sufficient;
- Buyer Checking has sufficient available funds;
- Business cash authority is available in the exact settlement currency;
- Buyer Inventory resolves to the canonical same-game personal Inventory authority.

Any failure rejects before economic mutation.

## Atomic economic mutation

One transaction must:

1. debit Buyer Checking by the immutable quoted total;
2. credit Business cash by the same amount;
3. transfer the exact quantity from Store Listing to Buyer Inventory through canonical Inventory authority;
4. preserve canonical item identity, source average unit cost, source cost currency, and public settlement provenance;
5. record gross revenue equal to Business cash credit;
6. record COGS equal to source listing unit cost multiplied by settled quantity using the canonical monetary precision rule;
7. derive gross margin as `gross revenue - COGS`;
8. persist canonical Business activity/audit evidence;
9. complete exactly one immutable public `spr_...` receipt;
10. consume the quote exactly once;
11. advance the offer version exactly once;
12. record remaining listed availability after settlement;
13. commit every economic and receipt side together.

Tax, platform fees, withholding, refunds, disputes, reversals, and FX clearing are not inferred.

## Immutable public receipt

The completed receipt must expose public keys and economic results only:

- `receiptKey` using `spr_[0-9a-f]{32}`;
- `quoteKey` and `offerKey`;
- public Business and seller-party keys;
- public Store item and canonical item keys;
- Buyer public Inventory account key and canonical Inventory transaction key;
- exact quantity, unit price, total, and currency;
- Buyer debit and Business credit amounts;
- gross revenue, COGS, and gross margin;
- source unit cost and cost currency;
- offer version before and after;
- remaining Store-listed quantity;
- completion timestamp;
- replay flag in the returned DTO only.

Internal row, ledger-entry, account, party, Player, Business, quote, and transaction UUIDs remain private. The durable completed receipt is immutable.

## Purchase and withdrawal ordering

### Purchase first

If settlement locks the offer first, it completes atomically and advances the offer version once. A later withdrawal observes the new version and may act only on remaining stock.

### Withdrawal first

If withdrawal locks and commits first, the offer becomes `withdrawal_pending` and advances version. Settlement later rejects status/version before locking Buyer money, Business cash, or Buyer Inventory and before any economic mutation.

The due-withdrawal worker retains its certified request-first then offer lock order because it operates only on an existing request; settlement never waits on a withdrawal request row while holding another economic row.

## Required failure behavior

The following fail closed and mutate nothing:

- invalid public identity or malformed command;
- wrong game, Buyer, owner, seller, Business, catalog item, canonical item, custody account, currency, or quote;
- self-purchase;
- missing/inactive Business or seller party;
- inactive, paused, retired, or `withdrawal_pending` offer;
- stale offer version;
- expired, consumed, cancelled, conflicting, or otherwise unusable quote;
- quote quantity, price, currency, seller, Business, item, custody, or version mismatch;
- sold-out or insufficient unreserved Store-listing stock;
- positive reserved Store-listing quantity affecting requested availability;
- insufficient Buyer Checking funds;
- unavailable or wrong-currency Business cash authority;
- cost-currency drift;
- conflicting idempotency reuse;
- ledger debit/credit failure;
- Inventory posting failure;
- Business activity, revenue, COGS, receipt, quote-consumption, or offer-version completion failure.

Injected failure after every internal posting stage must roll back all money, Inventory, quote, offer, accounting, activity, and receipt state.

## Deterministic proof obligations

The checkpoint must prove with structural, simulation, and real database tests that:

- paid-without-item is impossible;
- item-without-payment is impossible;
- Business credit without Buyer debit is impossible;
- Buyer debit without Business credit is impossible;
- revenue or COGS without completed settlement is impossible;
- purchase-first and withdrawal-first ordering are deterministic;
- matching replay returns the exact immutable receipt without reapplying mutations;
- conflicting idempotency reuse fails closed;
- insufficient funds and insufficient unreserved stock mutate nothing;
- failures after each internal posting stage roll back every economic side;
- offer version advances exactly once;
- quote consumption occurs exactly once;
- cost basis and currency are preserved correctly;
- concurrent purchases cannot oversell;
- two simultaneous games remain isolated;
- the retained seeded Store quote/purchase path remains unchanged.

## Required artifacts

- this scope;
- forward-only migrations after the Phase 10A.2 migration family;
- typed Store settlement command/result/receipt contracts;
- Store repository and application wiring;
- structural authority and public-contract tests;
- database-backed success, replay, conflict, insufficient-funds, insufficient-stock, rollback-injection, purchase/withdrawal race, concurrent-purchase, and two-game isolation tests;
- retained-path regression proof;
- deterministic architecture inventory update;
- one permanent read-only exact-head workflow.

## Required exact-head gates

One exact implementation SHA must pass:

- Phase 10A.3 structural and typed contracts;
- database-backed atomic-settlement, concurrency, rollback, purchase/withdrawal, and two-game tests;
- complete database replay from zero twice plus rebuilt-database lint;
- Backend Typecheck and every Edge TypeScript check;
- Business Economy and Business Banking;
- workforce hiring, payroll, and production-payroll;
- equipment capacity;
- timed manufacturing and its retained resource/completion/recovery/isolation gates;
- Phase 10A.2 quote authority;
- Phase 10A.1 settlement foundation;
- Phase 9A withdrawal safety;
- Phase 8A Store-listing Inventory;
- Phase 7A seller offers;
- canonical Store and Inventory lifecycle regressions;
- Repository Quality and deterministic architecture inventory;
- Supply Chain Security;
- standalone Player Terminal and Chromium;
- `git diff --check`.

## Explicit exclusions

Checkpoint 10A.3 does **not authorize**:

- authenticated Player Store route or UI cutover;
- Player-facing multi-offer presentation changes;
- automatic consumer/NPC demand or sales convergence;
- retirement or modification of the retained seeded Store purchase channel;
- Marketplace or Contracts integration;
- tax, fee, refund, dispute, reversal, or FX-clearing systems;
- equity, shares, IPO, or Financial Market publication;
- merge;
- staging or production deployment;
- secret mutation;
- staging or production database mutation.

## Completion rule

Checkpoint 10A.3 is complete only when:

1. one exact implementation SHA is identified;
2. all required exact-head gates pass on that SHA;
3. this scope, the Business execution plan, and the Business execution log record the exact source, workflow evidence, decisions, blockers, and next step;
4. temporary repair, certification, controller, source-snapshot, or finalizer machinery has zero net presence unless explicitly justified;
5. the stacked PR remains draft, open, unmerged, and undeployed.

Certification of 10A.3 does not authorize Player cutover. The next expected checkpoint is **10A.4 — authenticated Player Store route/UI cutover and connected browser acceptance**, unless the live roadmap is explicitly changed.

## Codex handoff state

This scope is the complete bounded authority contract for the next implementation owner. At handoff:

- PR #667 contains this scope only relative to the certified Phase 10A.2 parent after temporary snapshot-workflow cleanup;
- no Phase 10A.3 migration, runtime settlement command, repository wiring, test suite, or permanent exact-head workflow is certified;
- no merge, deployment, secret mutation, or live database mutation has occurred;
- the next implementation owner must begin by verifying the live branch/PR/workflow state and must not treat any local or prior-chat draft as authoritative.
