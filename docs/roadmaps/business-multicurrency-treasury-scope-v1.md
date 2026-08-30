# Business Multi-Currency Treasury and Procurement Scope v1

**Roadmap item:** `BUSINESS-V2-10A4C4`  
**Status:** `SCOPED_NOT_IMPLEMENTED`  
**Branch:** `feat/business-multicurrency-treasury-v1`  
**Parent branch:** `feat/multicurrency-stock-funding-v1`  
**Parent draft PR:** #676  
**Exact parent C3 implementation:** `058162d7b9688809e885d9e6fe77ed42978c7a03`  
**Exact parent C3F controller handoff:** `18fde31be5e1599c7d9a65d681b248fcb4756dc4`  
**Merge or deployment authorized:** No

## Decision

C4 extends the already-certified Banking FX and shared purchase-funding authorities to Business-owned money. It does not create a Business wallet, a parallel balance table, a second FX curve, a second posting primitive, or a Business-only copy of C0.

The Business gameplay contract is:

- a Business may own one canonical Checking account in any active game currency;
- the Business owner may open a zero-balance foreign Checking account through an authenticated Business route;
- the Business may exchange money through the same B1 fixing and B2 standard/instant customer-FX products already used by Player Banking;
- a Business procurement bill may be funded from one to three canonical Business Checking accounts through the same C0 target-credit retail checkout policy;
- procurement settlement remains one Store-owned commercial transaction and one canonical Inventory delivery into the Business Warehouse;
- all monetary movement is one B2-balanced Banking transaction per treasury or procurement settlement;
- browser input is limited to public Business/account/quote keys, quantities, allocation intent, product choice, and idempotency intent.

C4 keeps the existing procurement commercial convention: the Store resolver records the supplier item currency and exact item-local price evidence, while the Business reporting/settlement currency remains the procurement bill and Warehouse cost-basis currency. This avoids rewriting historical inventory basis or mixing cost currencies inside one canonical Warehouse holding. Foreign Business Checking balances may fund that reporting-currency bill through C0 retail FX, or the Business may pre-convert through B2 treasury FX.

## Non-negotiable authority boundaries

### Banking and FX

- B1 remains the only fixing, reference-rate, currency-value, Story-shock, and accepted-rate authority.
- B2 remains the only bank-account identity, posted balance, hold, available balance, grouped journal, clearing, reserve, fee, facility-cap, order, and settlement authority.
- `private.post_bank_transaction_v1(...)` remains the only balanced monetary posting primitive.
- The existing B2 standard product remains 0.50% spread and settles at the next strictly later game-local 08:00 fixing boundary.
- The existing B2 instant product remains 0.50% spread plus the separately posted 2.00% source-currency fee.
- C4 adds no new FX pricing policy and does not reinterpret prior Player FX evidence.

### Shared funding

- C0 remains the only one-to-three-account target-credit purchase-funding authority.
- The existing Player C0 contract remains Player-only at the browser boundary.
- C4 may generalize C0 persistence and private composition to an exact economic owner discriminator, then add Business-specific service wrappers. It may not admit Business accounts through the Player funding endpoint.
- Business procurement uses the existing C0 retail checkout policy: 1.00% customer-adverse spread, no separate fee, exact target credit, source-minor-unit ceiling, no reusable target balance.
- Savings, system accounts, duplicate accounts, cross-game accounts, closed/restricted accounts, and accounts not owned by the Business are invalid funding sources.

### Business and procurement

- Business identity and controller authorization remain in `business_entities`, Business ownership, and the existing authenticated Business scope resolver.
- Store remains the commercial authority for catalog item, stock, country snapshot, pricing multipliers, quote lifecycle, and seeded/NPC revenue target.
- Inventory remains the sole quantity, reservation, custody, weighted-average cost, and Warehouse authority.
- Procurement payment, Store target credit, funding/FX effects, Store stock decrement, Warehouse delivery, cost basis, quote consumption, receipt completion, and Business activity evidence must commit atomically or roll back together.
- Existing pre-C4 procurement quote and receipt evidence remains readable. It is never rewritten into C4 funding evidence.

## C4 account model

A Business foreign account is the existing B2 identity shape:

- `bank_accounts.party_id` points to the Business economic party;
- `account_kind = 'checking'`;
- `currency_code` is one active canonical currency;
- `account_balances` remains the sole projection;
- `ledger_entries` remains the sole journal;
- public identity remains `bac_...`;
- one active identity exists per game, Business, account kind, and currency.

Account creation is idempotent and zero-value only. Opening an account must never mint funds, move funds, alter the Business reporting currency, or create a second projection.

## C4 treasury FX

C4 exposes Business-owned use of the existing B2 customer FX products without adding another engine.

Authenticated Business treasury intent may include only:

- one owned source `bac_...` Checking account;
- one target currency code;
- one positive source amount conforming to source precision;
- `standard` or `instant` product;
- an idempotency key;
- for cancellation, one owned public `fxo_...` order key and an idempotency key.

The server derives game, Player/controller, Business, source and target account UUIDs, ownership, balances, holds, fixing, rates, spread, fee, target amount, settlement time, clearing/reserve identities, and facility capacity.

Business treasury quotes, orders, events, and receipts use the existing B2 `fxq_...`, `fxo_...`, `fxe_...`, and `fxr_...` evidence families. Existing Player rows remain Player-owned. New schema must enforce exactly one owner family and preserve all existing public readers and worker behavior.

Standard Business orders reserve payer funds and target facility capacity and use the existing leased settlement worker. Instant Business orders settle synchronously. Matching replay resolves before mutable state interpretation; conflicting reuse fails closed.

## C4 procurement funding

The existing Business Store quote remains the commercial root. The C4-funded quote binds exactly one C0 funding quote to:

- the Business procurement `bsq_...` quote;
- the Business reporting/settlement currency;
- the exact final total price;
- one Store seeded-revenue Checking account in the settlement currency;
- one to three Business-owned source Checking accounts;
- one immutable funding-context hash and one funding idempotency key.

The existing `/players/me/business/store/quotes` route is upgraded to require normalized Business account allocations and return the commercial quote plus C0 funding disclosure. The existing `/players/me/business/store/purchases` route settles only a funded C4 quote. An unbound pre-C4 quote remains historical evidence and returns the stable compatibility response `410 business_store_procurement_payment_retired` if submitted to the active purchase route.

The settlement lock order is:

1. Business procurement idempotency evidence;
2. Store item/commercial quote root;
3. Business Warehouse holding;
4. C0 funding quote;
5. B2 shared monetary lock, accounts in canonical UUID order, holds, and facility evidence;
6. canonical Inventory posting and immutable Business procurement receipt completion.

The Warehouse unit cost remains `final_total_price / quantity` in the Business settlement currency at canonical cost precision. Existing Warehouse holdings with the same reporting currency continue weighted-average costing without historical reinterpretation.

## Authenticated API surface

C4 may add or update only these Business routes:

- `GET /players/me/business/treasury`
- `POST /players/me/business/treasury/accounts`
- `POST /players/me/business/treasury/fx/quotes`
- `POST /players/me/business/treasury/fx/orders/standard`
- `POST /players/me/business/treasury/fx/orders/instant`
- `POST /players/me/business/treasury/fx/orders/{fxo_...}/cancel`
- existing `POST /players/me/business/store/quotes`, upgraded to funded procurement intent;
- existing `POST /players/me/business/store/purchases`, upgraded to funded settlement.

The treasury read may return Business accounts, posted/held/available balances, current accepted rates, recent orders, and recent receipts. Every object is public-key only. Internal UUIDs, request hashes, lease tokens, private cap identifiers, source IDs, and trusted calculation inputs remain private.

## Player Terminal boundary

The Business workspace may add:

- Treasury account cards grouped by currency;
- open-account control for active currencies not yet owned;
- standard/instant FX quote review, fee/spread/settlement disclosure, confirmation, cancellation, and immutable receipt states;
- procurement allocation controls for one to three Business Checking accounts;
- funded/remaining totals, exact source debit, rate, spread, rounding, expiry, and target bill disclosure;
- immutable procurement receipt, Warehouse result, replay status, and refresh-recovery state.

Controls must preserve keyboard operation, focus restoration, mobile layout, reduced motion, screen-reader labels, same-origin BFF routing, CSRF, HttpOnly session, and private `no-store` responses.

## Compatibility and migration rules

- Existing Player B2 and C0 routes, DTOs, rows, idempotency behavior, and public evidence remain unchanged.
- Existing pre-C4 Business local account and procurement rows remain readable and immutable.
- Owner-generalization migrations must backfill every existing B2/C0 row deterministically as Player-owned before validating exact-one-owner constraints.
- No historical amount, rate, fee, target amount, inventory quantity, or cost basis may be rewritten.
- New C4 procurement evidence uses a mutually exclusive legacy-versus-funded family enforced by schema constraints.
- No service role or browser role receives direct monetary, FX-evidence, funding-evidence, or Inventory DML authority.

## Concurrency and failure semantics

C4 must prove at minimum:

- duplicate Business account opening converges to one account and one projection with zero balance effect;
- concurrent treasury quotes and orders cannot overspend source available balance or oversell target capacity;
- standard order cancellation versus worker settlement is serial and exact-once;
- instant treasury replay returns the immutable original receipt before current balances/fixing are interpreted;
- opposite account selection order in procurement cannot deadlock because B2 locks canonical account UUID order;
- a hold racing treasury or procurement cannot produce posted balance below active holds;
- two concurrent procurement purchases cannot oversell Store stock or overdraw any Business source account;
- failure after every monetary, funding, Store, Inventory, receipt, and activity stage rolls back the entire transaction;
- two games never share Business account, quote, order, funding, facility, procurement, Inventory, or idempotency state.

## Required proof before certification

- exact-path PR authority with production deployment, production mutation, and secret values denied;
- forward migration validation, zero-to-head replay twice, rebuilt-schema lint/advisors, and purge-contract retention;
- B2/C0 owner-generalization proof with all existing Player workflows unchanged;
- one Business account per currency, zero-value opening, ownership transfer stability, closure/restriction behavior, and public-key privacy;
- standard and instant Business FX quote/order/settlement/cancellation, replay/conflict, fee/spread, fixing, hold, facility, worker, and two-game behavior;
- one-, two-, and three-account procurement funding across all-same, mixed, and all-foreign Business account cases;
- exact Store target credit, exact Business source debits, per-currency zero sum, exact Store stock decrement, exact Warehouse delivery, and weighted-average cost;
- malformed keys, UUID injection, wrong Business/game/controller, Savings/system/Player account use, duplicate accounts, over/underfunding, precision, expiry, stale fixing, insufficient balance, hold, and liquidity failures;
- Backend and all Edge TypeScript, Business and Banking contracts, Player Terminal, desktop/mobile Chromium, keyboard/accessibility, public-payload UUID denial, Repository Quality, Supply Chain Security, and all retained C0-C3/Store/Marketplace/Stock/Business gates;
- one exact implementation SHA and one later clean durable C4 handoff.

## Explicit exclusions

C4 must not:

- change B1 fixing calculation, publication timing, Story-shock handling, or registry authority;
- change B2 standard/instant FX pricing or settlement timing;
- change C0 retail spread, target-credit pricing, or Player funding semantics;
- reopen Store, Marketplace, or Stock settlement;
- begin final `BUSINESS-V2-10A4D` Player Store/FX convergence;
- add a Business wallet, Savings procurement, credit line, overdraft, loan, supplier-credit, wholesale catalog, purchase order, payable aging, tax, customs, shipping, or In-Transit workflow;
- add automatic demand/sales convergence, equity, IPO, securities publication, or financial reporting;
- merge, deploy, install/change schedulers, mutate secrets, run staging/production SQL, or mutate live data.

## Completion boundary

C4 may become `IMPLEMENTED_NOT_MERGED` only after one exact implementation SHA passes the permanent C4 gate and the full inherited exact-head matrix, and a durable implementation handoff records that source. Later documentation-only commits must not replace the tested implementation identity.

`BUSINESS-V2-10A4D` remains closed until that C4 handoff exists.