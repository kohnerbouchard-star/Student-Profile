# Business V2 Phase 10 — Atomic Store Purchase Settlement Scope v1

**Roadmap item:** `BUSINESS-V2-10A1`
**Status:** COMPLETE — checkpoint 10A.1 authority foundation certified; checkpoint 10A.2 quote authority certified; checkpoint 10A.3 settlement implementation is in progress and not certified
**Branch:** `feat/business-store-purchase-settlement-v2`
**Parent branch:** `feat/business-store-withdrawal-safety-v2`
**Parent draft PR:** #664
**Certified Phase 9A exact-head source:** `bf17e2493654620229d1acdeaae0fbaba21caf63`
**Clean Phase 9A durable handoff:** `952e4b198cd895916a12d0d1bed4ac80c23ead4b`
**Current clean Phase 9A branch head:** `8183702d64ff72988cff2ba992a85b1cf85d82dd`
**Certified checkpoint 10A.1 exact-head source:** `1abc8b878df5b08716107adb467bd013e85b6df4`
**Dedicated certification workflow:** `32753253910`
**Certification date:** 2026-08-25

## Purpose

Checkpoint 10A.1 freezes the authority model, immutable public receipt contract, and row-lock order required for a later atomic Business seller-offer purchase command.

The governing rule is:

> A Store purchase is one economic transaction: one locked seller offer, one exact quoted price, one Buyer Checking debit, one Business cash credit, one Store Listing-to-Buyer Inventory transfer, one revenue/COGS result, and one durable idempotent receipt. Any failure rolls the entire transaction back.

This checkpoint is intentionally non-mutating. It adds no settlement table, SQL function, API route, browser control, money movement, Inventory movement, or live-data change. It exists to make the later economic implementation reviewable before schema and runtime authority are introduced.

## Existing authorities that must be reused

The certified stack already provides:

- Store catalog identity in `store_items` and canonical product identity in `game_items`;
- Store seller-offer identity, Business seller party, lifecycle, custody binding, currency, price, and optimistic versioning in `store_seller_offers`;
- exact offer-scoped Store-listing quantity and average cost in canonical `inventory_accounts` and `inventory_holdings`;
- immediate `withdrawal_pending` non-purchasability and five-minute reservation-safe withdrawal ordering;
- canonical Player Checking and first-class Business cash ledger authorities;
- canonical Buyer Inventory accounts, holdings, and append-only Inventory transactions;
- retained Player Store quote and receipt public-key conventions;
- Business activity and audit evidence.

Checkpoint 10A.1 defines how those authorities must converge. It must not duplicate them.

## Audit finding: the retained purchase path is not offer aware

The retained Player Store quote/purchase path is a seeded compatibility channel. Its quote binds a Store catalog item, quantity, price, country/FX evidence, and expiry, but it does not bind:

- a `sof_...` seller-offer key;
- the exact seller-offer version;
- the Business economic party;
- the offer-scoped Store-listing account;
- the exact listed holding and cost basis;
- the seller cash and revenue recipient.

The retained settlement function locks `store_items` and its compatibility stock account. It does not lock `store_seller_offers`, credit first-class Business cash, or recognize Business seller revenue/COGS against an immutable offer-bound receipt.

Therefore, a later 10A checkpoint must introduce an offer-aware quote/settlement authority. The retained path must not be silently repurposed or dual-written.

## Included checkpoint 10A.1 authority

Checkpoint 10A.1 may add only:

1. A documented immutable public purchase-receipt identity using `spr_[0-9a-f]{32}`.
2. A typed trusted command boundary separating:
   - server-derived game and Buyer identity; from
   - browser-submitted offer key, quote key, quantity, expected offer version, idempotency key, and optional client timestamp.
3. A typed public receipt contract containing only public keys and economic results.
4. One fixed offer-first economic row-lock order.
5. Deterministic purchase-first and withdrawal-first race simulations.
6. Deterministic replay, idempotency-conflict, rollback, and two-game isolation simulations.
7. A structural contract that proves the foundation does not add runtime persistence or economic mutation.
8. A dedicated read-only exact-head workflow.
9. An architecture audit that records the retained-path gaps and later implementation sequence.

## Required later offer-aware quote identity

Before any runtime settlement command is authorized, one server-authoritative quote must durably bind:

- game session;
- Buyer Player;
- Store catalog item and canonical item;
- exact Business seller offer;
- exact seller economic party and Business;
- exact Store-listing Inventory account;
- exact requested quantity;
- seller-offer version at quote creation;
- quoted unit price and final Buyer settlement total;
- currency and FX/pricing evidence;
- creation and expiry timestamps;
- immutable quote request hash.

A quote replay must return its recorded offer, price, version, and expiry. It must not reinterpret mutable live offer state as the historical quote receipt.

## Immutable settlement receipt

A later runtime settlement must create exactly one durable receipt per accepted idempotency key. The public receipt must bind:

- `spr_...` receipt key;
- `quote_...` quote key;
- `sof_...` seller-offer key;
- `biz_...` Business key and `pty_...` seller-party key;
- public canonical item key;
- exact quantity;
- unit price and final total price;
- settlement currency;
- Buyer debit, seller credit, gross revenue, and cost of goods sold;
- public Buyer Inventory account and canonical Inventory transaction keys;
- offer version before and after settlement;
- remaining Store-listed quantity;
- completion timestamp;
- replay state.

Internal ledger-entry and table UUIDs may be retained as database foreign keys but must not cross the browser boundary.

The receipt is immutable after completion. A matching retry returns the recorded receipt even if the offer, Business, catalog, or balances later change. Conflicting reuse of the same idempotency key fails closed.

## Fixed lock order

An idempotency-scoped PostgreSQL advisory lock may be acquired first because it is not an economic row lock. Economic rows must then be locked in this exact order:

1. resolve Buyer and Business seller identity under trusted game scope;
2. `store_seller_offers` row `FOR UPDATE`;
3. offer-scoped Store-listing holding `FOR UPDATE`;
4. Buyer Checking balance `FOR UPDATE`;
5. Business cash balance `FOR UPDATE`;
6. Buyer Inventory account/holding `FOR UPDATE`;
7. canonical ledger and Inventory posting;
8. immutable purchase-receipt completion;
9. seller-offer version/remaining-availability completion.

The purchase command must never lock Buyer money or Inventory before the seller offer.

This is compatible with Phase 9A:

- a new withdrawal request locks the offer first and changes it to `withdrawal_pending`;
- the due-withdrawal worker locks request then offer because it operates only after a request already exists;
- purchase replay may resolve durable receipt identity before current offer validation, but it must not hold another economic row while waiting for the offer.

## Purchase-first race

When the purchase obtains the seller-offer lock first:

1. it validates the offer is active, version matched, quote matched, and quantity is available;
2. it completes the full atomic settlement;
3. it increments the offer version exactly once;
4. it releases the offer lock;
5. a later withdrawal request observes the new version and may enter `withdrawal_pending` only for remaining stock.

The purchase cannot be partially visible.

## Withdrawal-first race

When withdrawal obtains the seller-offer lock first:

1. it changes the offer to `withdrawal_pending` and increments the version;
2. a later purchase obtains the offer lock;
3. the purchase fails before Buyer Checking, Business cash, Buyer Inventory, Store Listing, revenue, COGS, or receipt state changes.

A stale quote or expected version cannot bypass `withdrawal_pending`.

## Atomic accounting and Inventory invariants

A later settlement transaction must satisfy:

- Buyer Checking debit equals the quote's final total price;
- Business cash credit equals the same final total price;
- gross revenue equals that seller credit;
- COGS equals the exact Store-listing average unit cost multiplied by settled quantity;
- listing quantity decreases by exact settled quantity;
- Buyer Inventory increases by exact settled quantity;
- the canonical Inventory transaction carries the source cost basis and public purchase provenance;
- one offer version increment represents one newly committed purchase;
- replay performs no second debit, credit, transfer, revenue, COGS, or version increment;
- any failure rolls all money, Inventory, offer, receipt, and evidence changes back.

Tax remittance, withholding, platform fees, refunds, disputes, and reversals are not silently inferred in checkpoint 10A.1. They require separately defined authority.

## Required failure behavior

The later runtime command must fail closed for:

- inactive, paused, retired, or `withdrawal_pending` offer;
- stale expected offer version;
- quote/offer/version/seller/item/account mismatch;
- expired, used, cancelled, or conflicting quote;
- wrong Buyer, Business, seller, item, account, currency, or game;
- insufficient Store-listing quantity or positive unresolved reservation;
- insufficient Buyer Checking balance;
- unavailable Business cash authority;
- cost-currency mismatch;
- invalid public identity or idempotency key;
- conflicting idempotency reuse;
- any canonical ledger, Inventory, receipt, or evidence-posting failure.

Every rejected or rolled-back attempt must leave economic state unchanged.

## Explicit exclusions

Checkpoint 10A.1 does **not** authorize:

- a database migration or new persistence table;
- a purchase RPC or mutation repository;
- Buyer Checking debit or Business cash credit;
- Store Listing-to-Buyer Inventory movement;
- revenue, COGS, tax, fee, refund, dispute, or reversal posting;
- Player Store routes, Player Store read cutover, or UI changes;
- automatic consumer/NPC demand or sales;
- retirement of the existing compatibility purchase path;
- Phase 11 automatic-sales convergence;
- Marketplace or Contracts integration;
- equity, shares, IPO, or Financial Market publication;
- merge, staging deployment, production deployment, secret mutation, or live database mutation.

## Required artifacts

- this scope;
- `docs/architecture/business-phase10-store-purchase-settlement-authority-v1.md`;
- `scripts/business-phase10-store-purchase-settlement-contracts.ts`;
- deterministic structural, type, and race/rollback simulations;
- one permanent read-only exact-head workflow.

## Acceptance gates

One exact checkpoint 10A.1 implementation SHA must pass:

- Phase 10A.1 structural contract;
- typed command/receipt contract verification;
- purchase-first and withdrawal-first simulations;
- replay, conflict, rollback, and two-game isolation simulations;
- retained Phase 9A, Phase 8A, and Phase 7A Store contracts and simulations;
- canonical Store and Inventory lifecycle tests;
- Database Replay and rebuilt-database lint, even though no migration is added;
- Backend Typecheck and all Edge TypeScript checks;
- retained Business Banking, Economy, workforce/payroll, equipment, and timed-manufacturing gates;
- Repository Quality and deterministic architecture inventory;
- Supply Chain Security;
- standalone Player Terminal and Chromium;
- `git diff --check`.

## Completion rule

Checkpoint 10A.1 is certified only when:

1. all included artifacts exist on the existing Phase 10 owner branch;
2. one exact implementation SHA passes the required matrix;
3. the scope, execution plan, execution log, and draft PR record exact evidence;
4. no temporary writer/controller workflow remains;
5. the PR remains draft, open, unmerged, and undeployed.

Certification of 10A.1 does not certify runtime Store settlement or complete Phase 10.

## Certification evidence

**Exact certified implementation and verification source:** `1abc8b878df5b08716107adb467bd013e85b6df4`
**Dedicated workflow:** Business Store Purchase Settlement Foundation V2 `32753253910`

- Phase 10A.1 structural, typed command/receipt, offer-first lock-order, purchase-first, withdrawal-first, replay, conflict, rollback, and two-game simulations: **PASS**.
- Complete database replay from zero twice and rebuilt-database lint: **PASS** in `32753253910`.
- Retained Business Economy, Banking, workforce/payroll, equipment, timed manufacturing, Store, Inventory, all Backend/Edge TypeScript, Player Edge bundleability, Admin API, required game timezone, exchange calendar, Player Terminal, and Chromium: **PASS** in `32753253910`.
- Retained Phase 9A withdrawal authority: **PASS** (`32753253771`).
- Repository Quality and deterministic architecture inventory: **PASS** (`32753253904`).
- Supply Chain Security: **PASS** (`32753253694`).
- PR #665 remained open, draft, mergeable, unmerged, and undeployed. No database migration, runtime persistence, settlement RPC, money movement, Inventory movement, Player route/UI, secret mutation, or live database mutation was introduced by checkpoint 10A.1.
- The exact certified source remains `1abc8b878df5b08716107adb467bd013e85b6df4`. Later certification-only documentation commits do not replace that tested implementation source.

Checkpoint 10A.1 is complete. Runtime Store purchase settlement is not complete. The next authorized checkpoint is 10A.2, limited to immutable offer-aware quote authority.

## Next implementation sequence

After 10A.1 certification:

1. **10A.2 — offer-aware quote authority:** certified at exact implementation source `ad57d5b9307178229a6b47b3206d258f1bd9b70d`; immutable quote binding to offer/version/seller/custody and deterministic pricing evidence.
2. **10A.3 — atomic economic settlement:** implementation in progress on `feat/business-store-atomic-settlement-v2` / draft PR #667; Buyer Checking debit, Business cash credit, Store Listing-to-Buyer Inventory transfer, revenue/COGS evidence, immutable receipt, and exact race tests are not yet certified.
3. **10A.4 — authenticated Player route cutover and browser acceptance:** only after displayed offer, quote, payment, seller receipt, and delivered Inventory cannot diverge.

Do not skip directly from this foundation to Player UI or automatic sales convergence.

## 2026-08-25 Phase 10A.3 progression record — implementation in progress

The Phase 10A.1 foundation and Phase 10A.2 quote authority remain immutable historical certification records. Current Phase 10A.3 work is separately stacked on `feat/business-store-atomic-settlement-v2` / draft PR #667 and is not certified, merged, or deployed.

Current implementation artifacts are:

- four forward migrations: `20260825110000_business_store_offer_purchase_receipt_v2.sql`, `20260825110010_business_store_offer_purchase_receipt_result_v2.sql`, `20260825110020_business_store_offer_atomic_settlement_v2.sql`, and `20260825110030_business_store_offer_settlement_assertions_v2.sql`;
- immutable completed table `public.store_offer_purchase_receipts`;
- service-role-only RPC `public.settle_business_store_offer_v2(uuid, uuid, text, text, integer, bigint, text)`;
- private projection helper `economy_private.read_store_offer_purchase_receipt_result_v2(uuid, boolean)` plus private insert-validation and immutability-guard trigger functions;
- Store contracts, Supabase repository, application service, and bounded barrel exports at `storeOfferSettlementContracts.ts`, `supabaseStoreOfferSettlementRepository.ts`, `settleBusinessStoreOffer.ts`, and `backend/src/domains/store/index.ts`;
- permanent structural, typed, and simulation scripts named `business-phase10-atomic-settlement-{contract,types,simulation}.mjs`;
- permanent disposable-PostgreSQL support, full-row serial, and real-lock concurrency harnesses named `business-phase10-atomic-settlement-{database-support,database,concurrency}.mjs`;
- permanent workflow `.github/workflows/business-store-atomic-settlement-v2.yml`.

The precision boundary is explicit: Buyer Checking, Business cash, and ledger settlement accept only exact two-decimal totals, while canonical Inventory source unit cost, COGS, and derived gross margin retain four-decimal precision. No silent cost-basis rounding is authorized.

The receipt table has enabled and forced RLS. Browser roles have no table or RPC access; `service_role` may select receipts and execute only the public settlement RPC, but it cannot directly insert, update, delete, truncate, reference, trigger, or maintain the table and cannot execute the private projection/trigger helpers. The `SECURITY DEFINER` settlement transaction performs the validated receipt insert, and immutable update/delete guards preserve completed evidence.

Local implementation evidence currently includes repeated clean PostgreSQL 17.6 database resets, migration validation 356/356, rebuilt lint with no new Phase 10A.3 finding, an independent real-database success/replay state vector with exact debit/credit/Inventory/evidence counts and rollback cleanup, the permanent full-row serial failure/success/replay/retained-path harness, the permanent observed-lock concurrency/purchase-withdrawal/two-game harness after an independent rebuild, Phase 10A.3 structural/type/simulation checks, retained Phase 7A–10A.2 checks, backend typecheck, Store 14/14, Inventory 50/50, retained Business suites, and migration/diff/YAML/interaction/security checks. The deterministic architecture inventory was regenerated to 1,083 source files and 38 Store files.

This is local in-progress evidence only. The immutable implementation commit, exact-head workflow run/jobs, and clean handoff remain pending; the permanent serial and concurrency database harnesses now exist and pass locally.

- **Exact implementation SHA:** `PENDING`.
- **Exact-head workflow run/jobs:** `PENDING`.
- **Clean handoff SHA:** `PENDING`.

No authenticated Player Store route/UI, automatic consumer sales convergence, equity/IPO, merge, deployment, secret mutation, or live database mutation is included or authorized. After a separately evidenced 10A.3 clean handoff, the next exact checkpoint is **10A.4**.
