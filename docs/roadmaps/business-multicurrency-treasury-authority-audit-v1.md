# Business Multi-Currency Treasury Authority Audit v1

**Roadmap item:** `BUSINESS-V2-10A4C4`  
**Audit source:** `18fde31be5e1599c7d9a65d681b248fcb4756dc4`  
**Audit date:** 2026-08-31  
**Status:** `RESOLVED_FOR_SCOPE`

## Purpose

This audit identifies the live Business, Banking, FX, funding, Store procurement, Inventory, API, and Player Terminal authorities that C4 must extend without creating competing money, exchange-rate, or inventory systems.

## Repository and branch state

- Certified parent branch: `feat/multicurrency-stock-funding-v1`.
- Certified parent PR: #676, draft, open, unmerged, and undeployed at intake.
- Exact immutable C3 implementation: `058162d7b9688809e885d9e6fe77ed42978c7a03`.
- Exact green C3F controller parent: `18fde31be5e1599c7d9a65d681b248fcb4756dc4`.
- No existing `feat/business-multicurrency-treasury-v1` branch or open C4 PR existed at intake.
- Frozen final Store/FX checkpoint remains `BUSINESS-V2-10A4D`; C4 must not absorb it.

## Resolved findings

### 1. Business money already has canonical B2 identity, but only the reporting-currency account is provisioned publicly

B2 already provides:

- `bank_accounts` with opaque `bac_...` identity;
- one unique account per game, party, kind, currency, and legacy discriminator;
- Business economic parties keyed by `business_id`;
- private `ensure_business_bank_account_identity_v1(game, business, currency)`, which supports any active currency;
- guarded one-row `account_balances` projections;
- immutable `ledger_entries` and grouped `bank_transactions`;
- hold-aware posted/held/available balance authority.

The retained public `ensure_business_bank_account_v2(game, business)` wrapper provisions only `business_entities.currency_code`. C4 therefore does not need a new account schema. It needs a narrow Business owner-authorized wrapper/read surface for additional currencies.

### 2. B2 customer FX is complete but Player-owned in schema and commands

The certified B2 authority already owns:

- accepted fixing consumption;
- 0.50% standard/instant spread;
- separate 2.00% instant source-currency fee;
- quote, order, event, and settlement receipt evidence;
- payer and capacity holds;
- standard-order leasing and worker settlement;
- instant balanced settlement;
- clearing/reserve/fee accounts;
- capped liquidity, draw, repayment, replay, rollback, and cancellation.

However `fx_quotes` and `fx_orders` require `player_id`, Player-scoped idempotency, and Player source/target account ownership. C4 must generalize owner identity inside the same B2 evidence families and add Business-specific wrappers. A second Business FX table or rate engine would be an authority fork and is rejected.

### 3. C0 target-credit funding is complete but Player-owned

The certified C0 authority already owns:

- immutable `pfq_...` quote and one-to-three allocation lines;
- exact target bill and contribution equality;
- 1.00% retail checkout spread with source-minor-unit ceiling;
- quote expiry at the earlier of 120 seconds or the next accepted fixing boundary;
- balance, hold, fixing, and facility validation;
- private atomic composition through `private.post_bank_transaction_v1`;
- immutable `pfr_...` receipt and exact target credit;
- per-currency zero sum, reserve draw/repayment, replay, conflict, rollback, and two-game isolation.

The current C0 schema and functions require `player_id` and explicitly require source accounts owned by a Player party. C4 must generalize the shared persistence/private composition to an exact owner discriminator and add a Business-specific service wrapper. It must not admit Business accounts through `create_purchase_funding_quote_v1` or otherwise widen the Player browser contract.

### 4. Canonical Business procurement exists, but its active payment is the retired local direct-debit model

Phase 3B already provides:

- immutable `bsq_...` Business Store commercial quotes;
- immutable `bsr_...` procurement receipts;
- Business country and reporting-currency pricing;
- canonical Store stock and Store pricing resolver;
- atomic Store decrement and Business Warehouse delivery;
- weighted-average Warehouse cost basis;
- idempotency, replay, cross-game isolation, and public-key API contracts.

The current settlement:

- provisions only the reporting-currency Business account;
- directly checks one `account_balances` projection;
- calls the retained Business ledger gateway for one debit;
- does not bind a C0 quote or credit a named Store revenue account through the C0/B2 balanced funding transaction.

C4 must preserve the commercial quote and Inventory transaction authority while replacing only the active payment family. Pre-C4 receipts remain historical compatibility evidence.

### 5. Procurement reporting currency must remain stable

The existing quote records both supplier item currency and Business settlement currency. Warehouse holdings enforce one cost currency for a given canonical holding. Changing active procurement cost basis to supplier currency would conflict with existing reporting-currency holdings or require historical conversion.

C4 therefore keeps:

- supplier/item currency and item-local price as immutable pricing evidence;
- Business reporting currency as final bill, target-credit, and Warehouse cost-basis currency;
- C0 retail FX only on selected foreign Business source accounts.

This preserves cost-basis continuity and avoids historical reinterpretation.

### 6. Store already has a canonical seeded/NPC revenue party/account pattern

C1 establishes the named system party `store.seeded-revenue` and creates one canonical Checking account per required currency. C4 procurement may resolve the same target identity in the Business settlement currency and pass its internal account UUID to the private C0 composer. No procurement wallet or shadow supplier balance is required.

### 7. Inventory remains the only physical authority

Canonical procurement delivery already uses:

- Store stock item and Store inventory account;
- Business Warehouse inventory account;
- `inventory_holdings` for quantity/reservation/cost;
- `economy_private.post_inventory_transaction_v2(...)` for the two-line transfer;
- committed Inventory transaction evidence.

C4 may bind the funding receipt and Banking transaction to the existing procurement receipt, but it must not add another quantity table, stock projection, or delivery path.

### 8. Business API and UI are the correct authenticated surface

The extracted Business route handler already owns:

- Business ownership/controller scope derivation;
- exact-path Business routes;
- private no-store responses;
- service-only repository execution;
- public-key validation and UUID denial;
- procurement quote/purchase dispatch.

C4 belongs under this Business boundary. It does not belong in the generic Player Banking route, because Business account ownership and controller authorization are distinct from personal Player money.

The Player Terminal Business workspace is the correct UI owner. The personal Banking page remains unchanged.

## Required owner generalization

### B2 tables

Generalize existing rows to exactly one owner family:

- existing row: `player_id is not null`, `business_id is null`;
- new Business row: `player_id is null`, `business_id is not null`.

This applies to `fx_quotes` and `fx_orders`. Events and settlement receipts remain linked through order identity and need no duplicate owner column unless required for bounded read indexes. Existing Player keys, request hashes, public projections, and worker semantics remain unchanged.

### C0 tables

Apply the same exact-one-owner rule to:

- `purchase_funding_quotes`;
- `purchase_funding_receipts`.

Funding lines remain linked through quote identity. Existing Player functions become compatibility wrappers around a shared private owner-aware implementation or retain equivalent behavior with exact regression proof.

## Public route decisions

### Treasury

- `GET /players/me/business/treasury`: owner-authorized accounts, balances, rates, orders, receipts.
- `POST /players/me/business/treasury/accounts`: idempotently provision one zero-value Business Checking account.
- `POST /players/me/business/treasury/fx/quotes`: create a Business standard/instant B2 quote.
- `POST /players/me/business/treasury/fx/orders/standard`: submit a standard Business order.
- `POST /players/me/business/treasury/fx/orders/instant`: settle an instant Business order.
- `POST /players/me/business/treasury/fx/orders/{fxo_...}/cancel`: cancel an owned pending standard order.

### Procurement

- Existing `POST /players/me/business/store/quotes` gains one-to-three Business account allocations and binds one C0 quote.
- Existing `POST /players/me/business/store/purchases` settles only the bound funding quote and commercial quote atomically.
- Existing unbound pre-C4 quote submission receives `410 business_store_procurement_payment_retired`.

## Security decisions

- Game, Player, Business UUIDs, party IDs, account UUIDs, fixing IDs, cap IDs, transaction IDs, Inventory IDs, and trusted prices/rates remain server-derived.
- Browser roles receive no direct table or RPC access.
- `service_role` receives only the bounded public Business commands/read projections, not private posting, evidence DML, or direct projection mutation.
- Existing forced RLS, fixed search paths, direct DML denial, and immutable evidence triggers remain in force.
- New public results expose only stable public keys, currency codes, bounded monetary strings/numbers, timestamps, status, and disclosure text.

## Lock-order decisions

- Account opening uses deterministic B2 identity uniqueness and creates no money movement.
- Treasury FX follows the existing B2 monetary lock, canonical account UUID ordering, hold ordering, and facility ordering.
- Procurement preserves Store item/commercial root first, then Warehouse holding, then C0 quote, then the B2 monetary lock and canonical account ordering.
- The C0 composer remains inside the outer procurement transaction so any later Store or Inventory failure rolls all money/facility/funding evidence back.

## Compatibility decisions

- Existing Player Banking FX and Player C0 functions keep exact signatures and behavior.
- Existing Player rows are backfilled as Player-owned without changing amounts or evidence.
- Existing Business local account identity is retained; foreign accounts add peers under the same Business party.
- Existing pre-C4 Business procurement quotes and receipts remain readable.
- Existing direct procurement settlement becomes compatibility-only and is not used by the active authenticated route.

## Collision and ownership audit

- PR #676 owns the C3 parent and remains the immediate base.
- PR #672 owns B2 source history; C4 extends the inherited source on its own stacked branch rather than editing that PR.
- PR #673 owns C0 source history; C4 extends the inherited source on its own stacked branch rather than editing that PR.
- PR #654/Phase 3B owns original Business procurement history; C4 adds forward-only convergence.
- PR #670 remains the frozen 10A.4A Player Store candidate; C4 must not repair or modify its final-convergence concerns.
- Integration PR #648 remains an index/integration record and is not the C4 code base.

## Rejected alternatives

- Business wallet or treasury balance cache: rejected.
- Separate Business FX tables/engine: rejected.
- Separate Business funding quote/composer: rejected where it would duplicate C0; owner-aware extension of C0 is required.
- Allowing Business accounts through Player C0 or Player Banking routes: rejected.
- Converting historical Warehouse basis into supplier currency: rejected.
- Using the B2 compatibility-offset account for procurement or treasury FX: rejected.
- Direct Business balance writes, direct Store revenue credits, or direct Inventory writes: rejected.
- Expanding into supplier credit, loans, payables, wholesale catalogs, shipping, taxes, customs, or IPO: rejected.

## Audit conclusion

C4 can proceed without a new money, FX, funding, Store, or Inventory authority. The correct implementation is a forward-only owner generalization of B2/C0 plus bounded Business routes and an atomic funded-procurement cutover. No merge, deployment, scheduler, secret, staging/production SQL, or live-data operation is authorized by this audit.