# Business V2 Phase 10A.3 — Atomic Business Seller-Offer Settlement Scope v1

**Roadmap item:** `BUSINESS-V2-10A3`  
**Status:** `IMPLEMENTED_NOT_MERGED` — exact-head implementation and required matrix passed; PR #667 remains draft, open, unmerged, and without any Business staging or production release
**Branch:** `feat/business-store-atomic-settlement-v2`  
**Parent branch:** `feat/business-store-offer-aware-quote-v2`  
**Parent draft PR:** #666  
**Stacked draft PR:** #667  
**Certified parent implementation source:** `ad57d5b9307178229a6b47b3206d258f1bd9b70d`  
**Clean parent handoff:** `38d040748a62c5aa21a7111eeab80cd7e74b9263`  
**Exact certified implementation and verification source:** `5a8ffeb59c857b99f5fbd88726cc9b985f7682a2`
**Dedicated exact-head workflow:** Business Store Atomic Settlement V2 `32817713404`
**Certification date:** 2026-08-25
**Temporary tooling:** the source-snapshot workflow was removed and has zero net presence at this handoff  

## Decision

Checkpoint 10A.3 implements one Store-owned, service-role-only PostgreSQL transaction for purchasing from an exact Business seller offer. It reuses the certified Phase 7A seller-offer authority, Phase 8A offer-scoped Store-listing Inventory custody, Phase 9A withdrawal ordering, Phase 10A.1 receipt and lock-order contract, and Phase 10A.2 immutable offer-aware quote authority.

The governing invariant is:

> Buyer debit, Business credit, physical delivery, revenue, COGS, quote consumption, offer-version advancement, and immutable receipt completion are one atomic settlement. They all commit together or none exist.

The retained seeded Store purchase path remains unchanged and retains its compatibility meaning.

## 2026-08-25 certified implementation record

The bounded implementation currently adds the following forward migration family after the certified Phase 10A.2 quote authority:

- `20260825110000_business_store_offer_purchase_receipt_v2.sql` — immutable completed `public.store_offer_purchase_receipts`, same-game evidence foreign keys, insert-evidence validation, update/delete immutability guard, forced RLS, and explicit table ACLs;
- `20260825110010_business_store_offer_purchase_receipt_result_v2.sql` — private public-key-only receipt projection helper `economy_private.read_store_offer_purchase_receipt_result_v2(uuid, boolean)`;
- `20260825110020_business_store_offer_atomic_settlement_v2.sql` — service-owned `public.settle_business_store_offer_v2(uuid, uuid, text, text, integer, bigint, text)` transaction;
- `20260825110030_business_store_offer_settlement_assertions_v2.sql` — fail-closed schema, privilege, trigger, helper, RPC, and authority assertions.

The Store source surface is limited to:

- `backend/src/domains/store/contracts/storeOfferSettlementContracts.ts`;
- `backend/src/domains/store/infrastructure/supabaseStoreOfferSettlementRepository.ts`;
- `backend/src/domains/store/application/settleBusinessStoreOffer.ts`;
- the bounded exports in `backend/src/domains/store/index.ts`.

Permanent verification artifacts are:

- `scripts/business-phase10-atomic-settlement-contract.mjs`;
- `scripts/business-phase10-atomic-settlement-types.mjs`;
- `scripts/business-phase10-atomic-settlement-simulation.mjs`;
- `scripts/business-phase10-atomic-settlement-database-support.mjs`;
- `scripts/business-phase10-atomic-settlement-database.mjs`;
- `scripts/business-phase10-atomic-settlement-concurrency.mjs`;
- `.github/workflows/business-store-atomic-settlement-v2.yml`.

The permanent serial harness commits only into a disposable localhost database, compares complete deterministically ordered rows across the full game-scoped Store, money, Inventory, Business, identity, legacy purchase, and idempotency surface, and exercises the real RPC. Fixture creation is one transaction. The workflow rebuilds the disposable database before the serial harness and rebuilds it again before the independent concurrency harness, so immutable receipt protection is never bypassed for cleanup.

### Monetary and Inventory precision

- Buyer Checking, Business cash, ledger debits/credits, and gross revenue settle only totals that are exactly representable to two decimal places and fit the canonical ledger balance range.
- Canonical Inventory source average unit cost retains four-decimal precision. COGS is `sourceUnitCost * quantity` at four-decimal Inventory/accounting precision, and gross margin is `grossRevenue - COGS` at four decimals.
- Settlement rejects excess precision or inconsistent totals; it does not silently round an economically material input to make a command pass.

### Service, RLS, and ACL boundary

- `public.store_offer_purchase_receipts` has RLS enabled and forced. `anon` and `authenticated` have no table privilege. `service_role` has read-only table access and no direct insert, update, delete, truncate, reference, trigger, or maintain authority.
- Only `service_role` may execute `public.settle_business_store_offer_v2(...)`. The `SECURITY DEFINER` transaction owns the validated receipt write.
- The private receipt projection and receipt validation/immutability trigger helpers are not directly executable by `service_role`, `anon`, or `authenticated`.
- A before-insert validator binds each completed receipt to its exact same-game Buyer debit, Business credit, and canonical Inventory transaction evidence; a separate trigger rejects later receipt update or deletion.

### Local and exact-head evidence

The immutable implementation source has the following local evidence:

- complete disposable PostgreSQL 17.6 migration replay from zero passed twice;
- migration validation passed all 356 migrations, and rebuilt-database lint produced no new Phase 10A.3 finding beyond inherited baseline findings;
- an independent real-database quote, settlement, and replay probe passed: Buyer Checking `100 -> 85`, Business cash `20 -> 35`, listing quantity `10 -> 8`, Buyer Inventory `0 -> 2`, exactly one receipt, two ledger entries, two ledger lines, one `PURCHASED` Inventory event, one Business activity, quote version 2 consumed, offer version `2 -> 3`, matching completion timestamps, and zero durable fixture residue after outer-transaction rollback;
- the permanent real-PostgreSQL serial harness passed malformed/wrong-scope, inactive Business/seller, terminal quote, paused offer, custody, cash-currency, Buyer-Inventory-currency, insufficient-funds, reserved/insufficient-stock, source-cost-currency, cash-overflow, self-purchase, expiry, mismatch, two distinct cross-game, exact success, immutable receipt, replay/conflict, money-precision, retained seeded-purchase/replay, and all seven injected rollback cases using the full-row mutation oracle;
- after an independent full database rebuild, the permanent concurrency harness passed actual observed-lock races for matching idempotency, same-offer no-oversell, Buyer Checking, listing holding, Business cash overflow, purchase-first/withdrawal-first ordering, and two-game isolation;
- Phase 10A.3 structural, typed, and deterministic simulation checks passed locally;
- retained Phase 7A through Phase 10A.2 checks passed after a stale temporal fixture was corrected without weakening its authority assertions;
- backend `typecheck:all`, Store 14/14, Inventory 50/50, retained Business economy/workforce/payroll/equipment/manufacturing scripts, migration/diff/YAML/interaction/security checks, and deterministic architecture regeneration passed locally; the regenerated inventory records 1,083 source files and 38 Store files.

The same immutable source `5a8ffeb59c857b99f5fbd88726cc9b985f7682a2` then passed the permanent **Business Store Atomic Settlement V2** workflow run `32817713404`. Every required job reached terminal `success`:

- `Verify atomic settlement authority and retained Store phases` (`97709253437`) — Phase 10A.3 contracts/types/simulation, retained Store phases, deterministic architecture inventory, Repository Quality, and Supply Chain Security;
- `Verify database settlement, rollback, races, and isolation` (`97709253468`) — independent rebuilt-database serial and observed-lock concurrency suites, rollback injection, purchase/withdrawal ordering, replay/conflict, and two-game isolation;
- `Replay complete database twice and lint` (`97709253285`) — full migration replay from zero twice and rebuilt-database lint;
- `Verify retained Business, Store, Inventory, Backend, and Edge runtime` (`97709253519`) — retained Business Economy/Banking/workforce/payroll/equipment/manufacturing, Store 14/14, Inventory 50/50, Backend TypeScript, and all Edge/Deno entrypoints;
- `Verify retained Player Terminal and Chromium` (`97709253398`) — standalone Player verification, adapter/capability/runtime integration, and Chromium browser acceptance.

Conditional failure-diagnostic steps did not execute because their jobs succeeded; no required job was skipped, cancelled, neutral, timed out, queued, or left in progress. No failure log exists.

The documentation-only certification commit that records this evidence is the clean durable handoff. Its immutable SHA is recorded in draft PR #667 and in the Phase 10A.4 parent record; it does not replace `5a8ffeb59c857b99f5fbd88726cc9b985f7682a2` as the exact tested implementation source.

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

### Completion result

All Phase 10A.3 implementation gates passed on `5a8ffeb59c857b99f5fbd88726cc9b985f7682a2`. The checkpoint is `IMPLEMENTED_NOT_MERGED`; it is not `VERIFIED_COMPLETE` because it is not merged into `main`.

## Codex handoff state

This scope remains the bounded authority contract for the certified development checkpoint:

- PR #667 remains the existing stacked draft authority over the certified Phase 10A.2 parent; no replacement branch or PR was created;
- exact implementation source `5a8ffeb59c857b99f5fbd88726cc9b985f7682a2` passed all five jobs in exact-head workflow run `32817713404`;
- the four forward migrations, Store contracts/repository/application wiring, six permanent structural/simulation/database scripts, and permanent exact-head workflow are committed in that tested lineage;
- temporary repair, writer, controller, certifier, finalizer, and source-snapshot machinery has zero net presence in the parent-relative diff;
- this development checkpoint is durably certified, but it is not marked `VERIFIED_COMPLETE` in the global beta ledger because PR #667 remains draft and unmerged;
- no authenticated Player route/UI, automatic demand/sales convergence, equity/IPO, merge, staging or production deployment, secret mutation, or live database mutation has occurred or is authorized;
- the next exact checkpoint is **10A.4 — authenticated Player Store route/UI cutover and connected browser acceptance**, on a new branch and draft PR stacked from this documentation-only clean handoff.
