# Multi-Currency Marketplace Funding Scope v1

**Roadmap item:** `BUSINESS-V2-10A4C2`  
**Status:** `IMPLEMENTED_NOT_MERGED`
**Branch:** `feat/multicurrency-marketplace-funding-v1`  
**Parent branch:** `feat/multicurrency-store-funding-v1`  
**Parent draft PR:** #674  
**Exact parent C1 implementation and verification source:** `1cf6f413f10a761265cdec6076ceb9b2b3afcbf5`  
**Exact parent C1 clean documentation handoff/base:** `065d1a76135589625e4d60f7e109e6cce8d4084f`  
**Production deployment authorized:** No

## Decision

C2 integrates the certified C0 purchase-funding authority into the Player Marketplace while preserving Marketplace ownership of listings, listing currency, purchase reservations, orders, disputes, moderation, and Marketplace-specific Inventory transitions.

The Marketplace remains secondary Player-to-Player resale of items already owned by Players. It does not become a second Store, a securities market, a Business seller-offer system, a wallet, or an exchange-rate authority.

The resulting player contract is:

- a listing remains denominated in one authoritative listing currency;
- a buyer may fund the exact Marketplace bill from one, two, or three owned active Checking accounts;
- allocations are expressed in the listing currency and must equal the exact buyer total;
- same-currency funding uses rate `1`, no spread, no fee, and no FX facility;
- foreign-currency funding uses C0 retail checkout policy v1: accepted B1 fixing, 1.00% customer-adverse spread, no separate checkout fee, and source-minor-unit ceiling;
- Marketplace fee and tax remain Marketplace-owned commercial amounts, distinct from C0 FX pricing;
- buyer funding, seller proceeds, Marketplace fee/tax distribution, item transfer, reservation consumption, order completion, and immutable evidence commit in one PostgreSQL transaction;
- matching replay returns the original order and funding evidence without charging, paying, or transferring twice;
- buyer refunds reverse the original funding and commercial distribution from immutable evidence rather than applying a new current FX rate.

## Verified pre-C2 audit findings

The existing Marketplace lifecycle is authoritative for listing, reservation, order, dispute, moderation, expiry, and Inventory reservation semantics, but its active purchase path is not compatible with C0:

1. `POST /players/me/marketplace/listings/:listingKey/purchase` accepts only quantity, expected listing version, and idempotency intent. It provides no account selection, funding allocations, quote identity, rate disclosure, or confirmation boundary.
2. The repository reserves the listing and immediately invokes `settle_marketplace_purchase_public_v1` in the same HTTP operation.
3. Reservation rejects a buyer whose home-country currency differs from the listing currency, even when the buyer owns eligible Checking accounts.
4. Settlement checks one legacy `account_balances` row using `account_type = 'cash'` and calls `record_player_ledger_entry` separately for buyer and seller.
5. A completed order requires one buyer ledger-entry ID and one seller ledger-entry ID. That shape cannot truthfully represent C0 multi-account funding, one balanced Banking transaction, FX clearing/facility evidence, and a separate Marketplace distribution transaction.
6. Marketplace fee and tax are written to `marketplace_treasury_balances`, a mutable parallel monetary projection outside canonical B2 bank-account authority.
7. Buyer-refund resolution separately debits the seller, credits the buyer in listing currency, mutates the Marketplace treasury projection, and reverses Inventory. It does not reverse the original source-account debits or original FX evidence.
8. Existing replay-first behavior, authoritative `inventory_reservations`, listing quantity/version transitions, dispute lifecycle, moderation, expiry, public-key privacy, and two-game isolation are retained requirements rather than defects to replace.

## Authority boundaries

### Marketplace owns

- `lst_...` listing identity and seller scope;
- seller-owned canonical item and Inventory reservation/custody validation;
- listing unit price, currency, condition, quantity, status, version, moderation, and expiry;
- purchase-reservation identity, quantity, commercial amount snapshots, listing-version snapshot, and expiry;
- fee and tax policy, buyer-country override selection, and deterministic commercial rounding;
- order identity and lifecycle;
- dispute identity, moderation decision, and refund eligibility;
- exact seller proceeds, fee amount, tax amount, and buyer total;
- Marketplace financial-posting evidence as a domain read/audit projection, not money authority;
- item transfer and return semantics through canonical Inventory authority;
- listing-first settlement and cancellation ordering;
- public Marketplace DTOs, API routes, UI, and browser behavior.

### C0 owns

- immutable `pfq_...` funding quote identity and lifecycle;
- eligibility of one to three Player-owned active Checking accounts;
- exact positive target-currency allocations and funded-total equality;
- accepted B1 fixing, C0 1.00% retail spread, source debit, effective rate, minor-unit ceiling, expiry, and quote balance snapshots;
- settlement-time source-account, hold, available-balance, fixing, policy, facility, target-account, and context revalidation;
- private atomic funding composition;
- immutable `pfr_...` funding receipt and its balanced B2 Banking transaction;
- exact original funding evidence required for a refund reversal.

### B1 and B2 own

- currency registry and decimal precision;
- daily game-local 08:00 accepted fixing and history;
- canonical Player/system bank-account identity;
- posted, held, and available balances;
- balanced Banking transaction/journal authority;
- FX source/target clearing, reserve, fee, facility-cap, draw, repayment, and reversal evidence;
- direct monetary-DML denial.

C2 must not recreate C0 pricing, B1 cross-rates, B2 balances, holds, clearing, facility capacity, or account identity in Marketplace tables, TypeScript, or browser code.

## Listing-currency authority

- The listing currency remains the commercial, settlement, receipt, dispute, and refund currency.
- Buyer home-country currency is not a settlement authority and must not block an otherwise valid funded quote.
- New listings must use an active canonical currency and a unit price representable in that currency's minor unit.
- Seller proceeds settle to the seller Player's canonical active Checking account in the listing currency.
- Listing creation must fail closed when the seller has no canonical active recipient Checking account for the selected listing currency.
- C2 does not implicitly create seller foreign Checking accounts. Players obtain reusable foreign balances only through B2 standard/instant bank FX or another separately authorized Banking path.
- Existing pre-C2 listings with non-representable monetary precision may remain readable, cancellable, and expirable, but cannot enter the C2 funded quote path until a separately reviewed deterministic normalization or relisting occurs.

## Commercial amount calculation

For a C2 quote:

1. validate the exact active listing, expected version, available quantity, seller ownership/custody, buyer eligibility, policy, and country rules;
2. validate the unit price against the listing currency's canonical decimal precision;
3. calculate `subtotal = unitPrice × quantity` in listing currency;
4. derive fee and tax rates from the authoritative Marketplace policy and buyer-country override;
5. round fee and tax deterministically to the listing currency's minor unit;
6. calculate `buyerTotal = subtotal + feeAmount + taxAmount`;
7. require `sellerProceeds = subtotal` and exact minor-unit representability for every commercial amount;
8. use `buyerTotal` as the exact C0 target amount.

The browser may display these values but may not submit or override unit price, currency, fee/tax rates, fee/tax amounts, seller proceeds, buyer total, recipient accounts, FX rates, spread, source debits, fixing, or facility evidence.

## Canonical Marketplace settlement accounts

C0 funds one exact target account. Because one Marketplace bill is distributed to three commercial recipients, C2 uses named game-scoped B2 system accounts in the listing currency:

- `marketplace.settlement-clearing` — receives the exact C0 buyer total temporarily inside the outer Marketplace transaction;
- `marketplace.fee-revenue` — receives the exact Marketplace fee;
- `marketplace.tax-payable` — receives the exact Marketplace tax amount.

After C0 credits settlement clearing, one Marketplace-owned balanced B2 distribution transaction must:

- debit settlement clearing by the exact buyer total;
- credit the seller Player Checking account by exact seller proceeds;
- credit Marketplace fee revenue by exact fee amount when non-zero;
- credit Marketplace tax payable by exact tax amount when non-zero;
- balance to zero in the listing currency;
- link immutably to the Marketplace order and funding receipt.

No intermediate Marketplace balance may survive a committed transaction. Settlement clearing must return to its pre-transaction balance. New C2 orders must not write `marketplace_treasury_balances` as monetary authority.

## Legacy treasury transition

- Pre-C2 `marketplace_treasury_balances` rows and legacy order ledger-entry IDs remain historical evidence and must not be rewritten or deleted.
- C2 must establish one reviewed transition into canonical B2 fee-revenue and tax-payable accounts without fabricating economic activity or double counting existing balances.
- After transition, `marketplace_treasury_balances` is compatibility evidence only and direct/new active-path writes are denied.
- Pre-C2 order refunds must remain possible through a bounded legacy-order compatibility path or a one-time canonical evidence migration. The selected implementation must be explicit, exact, replay-safe, and covered by database acceptance; it may not silently mix legacy treasury and C2 canonical account balances.

## Quote and reservation composition

C2 separates quote/reservation from settlement confirmation. The existing single-call purchase operation must not silently select a bank account.

The Marketplace quote command must:

1. derive game and buyer scope from the authenticated session;
2. resolve matching replay before mutable state interpretation;
3. lock and validate the listing first;
4. validate seller custody and the exact available unreserved quantity;
5. derive all commercial values and the exact listing-currency buyer total;
6. create or resolve one immutable Marketplace purchase reservation;
7. derive a deterministic C0 funding context from the reservation and exact commercial facts;
8. call C0 quote authority with one to three browser-selected `bac_...` account keys and exact listing-currency allocations;
9. bind the reservation immutably to one C0 funding quote and the canonical settlement-clearing target account;
10. set the usable confirmation expiry to the earlier of the Marketplace reservation expiry and the C0 funding-quote expiry;
11. return bounded reservation, commercial, funding, rate, source-debit, expiry, and rounding evidence.

The funding context binds at minimum:

- game and buyer;
- listing and reservation public identities;
- seller public identity;
- item public identity;
- listing version and quantity;
- listing currency;
- subtotal, fee, tax, seller proceeds, and buyer total;
- settlement-clearing target account;
- Marketplace policy version/digest;
- reservation expiry.

A matching quote idempotency replay returns the original reservation and original funding quote before current listing, price, account, balance, hold, fixing, or facility state is reinterpreted. Conflicting reuse fails without mutation.

## Player API contract

The intended funded API surface is:

- `POST /players/me/marketplace/listings/:listingKey/quotes`
  - quantity;
  - expected listing version;
  - one to three unique source `bac_...` keys;
  - one positive listing-currency target allocation per source;
  - bounded quote idempotency key.
- `POST /players/me/marketplace/reservations/:reservationKey/settlements`
  - bounded settlement idempotency key;
  - no trusted monetary fields.

The exact route names may be adjusted during implementation only if the same separation, public-key boundary, and authority rules remain intact.

The existing `/purchase` route may remain only as an explicit compatibility tombstone or as a wrapper that requires the complete new funding intent. It must not choose a default account, infer an allocation, reuse buyer home currency, or preserve the legacy cash settlement path.

## Settlement and lock order

After immutable replay resolution, the authoritative mutable order is:

1. Marketplace listing;
2. Marketplace purchase reservation;
3. seller Inventory reservation/holding;
4. C0 funding quote;
5. C0/B2 source accounts, holds, FX clearing/reserve, and facility evidence in canonical B2 order;
6. Marketplace settlement-clearing, seller Checking, fee-revenue, and tax-payable accounts in canonical account order;
7. buyer Inventory account/holding;
8. Marketplace order, financial-posting evidence, reservation/listing lifecycle, Inventory evidence, funding receipt, and public response.

C2 must call `private.compose_purchase_funding_v1(...)` only after the listing, reservation, and seller Inventory root are locked and revalidated. It must not lock buyer bank accounts before the Marketplace roots.

A successful settlement must:

- prove the Marketplace reservation and C0 funding quote describe the same buyer, listing context, currency, exact buyer total, and settlement-clearing recipient;
- revalidate listing/reservation status and expiry, item custody, quantity, account ownership/status, balances, holds, fixing, policy, and facility capacity;
- compose C0 funding to Marketplace settlement clearing;
- distribute exact seller proceeds, fee, and tax through one balanced B2 transaction;
- transfer the exact reserved item quantity from seller to buyer through canonical Inventory authority;
- complete one immutable Marketplace order linked to the funding receipt and Banking transaction evidence;
- consume the reservation and funding quote exactly once;
- commit every effect together or roll every effect back.

## Order and receipt evidence

Marketplace order identity remains canonical `ord_...`. C0 `pfq_...`, `pfr_...`, and B2 `btx_...` identities are linked/nested funding evidence and do not replace the Marketplace order.

C2 may add immutable nullable compatibility columns to reservations/orders, including:

- funding quote;
- funding context hash;
- funding receipt;
- funding Banking transaction;
- Marketplace distribution Banking transaction;
- settlement-clearing target account;
- seller recipient account;
- fee/tax recipient accounts;
- settlement/refund request hashes and idempotency evidence.

For new funded orders, legacy buyer/seller ledger-entry columns must not be populated with fabricated representative entries. Schema constraints must distinguish legacy orders from C2 funded orders and require one complete evidence family or the other.

Browser payloads must expose only public keys and bounded commercial/funding evidence. Internal UUIDs, private request hashes, bank-account IDs, transaction IDs, clearing/reserve identities, facility internals, and staff identifiers remain private.

## Refund and dispute reversal

A C2 buyer refund must not apply a new current FX quote and must not create an unintended reusable listing-currency windfall for a buyer who funded from other currencies.

For a funded order, refund resolution must:

1. resolve matching replay first;
2. lock the dispute and order, then the returned buyer item and original commercial recipient accounts;
3. require the buyer still owns the exact unreserved item quantity;
4. reverse Marketplace distribution exactly: debit seller proceeds, fee revenue, and tax payable; credit Marketplace settlement clearing by the exact original buyer total;
5. reverse the original C0 funding from immutable receipt and Banking evidence, crediting each original source Checking account by its exact original source debit and reversing original FX clearing/reserve/facility effects without using a current fixing;
6. transfer the exact item quantity back to the seller through canonical Inventory;
7. mark the order/dispute refunded and record immutable reversal evidence;
8. commit all money, liquidity, Inventory, order, dispute, and audit effects together or roll them all back.

No partial refund is introduced in C2. Insufficient seller/fee/tax funds or unavailable buyer item fails closed without mutation. Any generic funding-reversal helper required by this behavior must remain private, evidence-bound, exact-opposite, and unavailable to browser roles or direct `service_role` invocation outside the owning Marketplace command.

Legacy-order refund compatibility remains separately identifiable and must never be mistaken for a C2 funding reversal.

## Inventory and reservation authority

- `inventory_reservations` remains authoritative; any retained holding reserved quantity is a reconciled projection.
- Listing creation/activation/cancellation/expiry semantics remain Marketplace-owned.
- A quote reserves exact listing quantity under the existing reservation lifecycle.
- A failed C0 quote must roll back the Marketplace reservation and listing decrement.
- A settlement failure must preserve or release the reservation only according to one explicit server-owned state transition; it may not charge the buyer or strand seller stock.
- Settlement transfers the exact canonical item and carried provenance/cost evidence required by the current Inventory authority.
- Refund returns the exact item to the seller.
- Listing, cancellation, expiry, settlement, refund, Crafting, Store, Contracts, and other Inventory uses must serialize so the same unit cannot be sold, returned, consumed, or transferred twice.

## Player Marketplace UI

The Player Marketplace must use authoritative Player Banking account reads; it must not create a Marketplace wallet or duplicate balance cache.

The funded checkout UI must:

- open from one exact active listing and show listing currency, unit price, quantity, subtotal, fee, tax, and buyer total;
- present up to three eligible Checking accounts through dropdowns/buttons, never free-form account identifiers;
- show each selected account's currency and posted/held/available amount;
- accept explicit positive target-currency allocation per account;
- show funded total and remaining amount;
- disable quote until allocations equal the exact buyer total;
- show same-currency versus retail-FX treatment, accepted fixing time, reference/customer/effective rate, source debit, and rounding disclosure;
- separate quote from final confirmation;
- show reservation and quote expiry;
- prevent duplicate submission while settling;
- render the immutable order and funding receipt after success;
- handle stale listing version, sold quantity, cancellation/moderation/expiry, insufficient balance, hold race, stale fixing, FX liquidity exhaustion, account closure, quote expiry, settlement replay, and service retry with specific safe recovery states;
- remain keyboard-operable, accessible, responsive, and internal-UUID private.

Existing listing creation, activation, cancellation, order history, and dispute controls remain unless exact C2 authority requires a bounded contract update.

## Existing active behavior to retire

For new C2 funded purchases and refunds, retire or bypass:

- buyer-country-currency equality as a purchase requirement;
- one-call reserve-and-settle without authoritative funding disclosure;
- direct buyer balance checks against Marketplace-owned assumptions;
- separate buyer/seller `record_player_ledger_entry` calls as settlement authority;
- writes to `marketplace_treasury_balances` as current money authority;
- assumptions that two ledger-entry IDs represent a multi-account/FX purchase;
- listing-currency refunds that ignore original source-account funding evidence;
- any Player UI copy implying the buyer must already possess the listing currency.

Compatibility behavior may remain only for clearly identified pre-C2 evidence and must be excluded from new funded orders.

## Explicit exclusions

C2 must not:

- alter Store funded settlement;
- alter Stock order/trade settlement;
- add Business-owned foreign Checking accounts or Business treasury FX;
- change B1 fixing calculations or the game-local 08:00 schedule;
- change B2 standard/instant bank-FX pricing or timing;
- change C0 retail spread or maximum-three-account policy;
- create a cash wallet, Marketplace wallet, Savings purchase path, or parallel balance table;
- introduce partial refunds, shipping, escrow, bidding, offers, auctions, or new dispute policy;
- merge any stacked PR;
- deploy to staging or production;
- install or alter schedulers;
- mutate secrets;
- run staging/production SQL or live database mutations.

Stocks remain C3, Business treasury/procurement remains C4, final Store/FX convergence remains 10A.4D, and Phase 11 remains closed.

## Required proof before C2 certification

### Structural and security

- Own PR-bound exact-path authority with production deployment/mutation/secrets disabled.
- Complete zero-to-head migration replay twice and rebuilt-schema lint/advisors.
- Fixed search paths, least-privilege grants, RLS/forced RLS for new public evidence, and direct-DML denial.
- No public payload contains internal UUIDs, private hashes, trusted rates, or browser-authored monetary outcomes.
- No parallel FX, Banking, balance, hold, Inventory, Marketplace listing, or Marketplace order authority.
- Legacy/current monetary evidence families are mutually exclusive and schema-enforced.

### Listing and quote

- New listing currency/account eligibility and minor-unit precision.
- One-, two-, and three-account quote funding with all-same, mixed same/foreign, and all-foreign source currencies.
- Exact commercial rounding and funded-total equality.
- Matching quote replay and conflicting reuse.
- Listing/version/quantity/country/moderation/cancellation/expiry races.
- Account ownership/status, balance, hold, fixing, and facility failures.
- No reservation residue after a failed funding quote.

### Settlement

- Exact buyer source debits and exact settlement-clearing credit.
- Exact seller, fee, and tax distribution with settlement clearing restored to its pre-state.
- Exact seller-to-buyer Inventory transfer once.
- One immutable `ord_...` linked to one `pfr_...` and required Banking evidence.
- Matching settlement replay and conflicting reuse.
- Complete rollback after funding, distribution, Inventory, order, reservation, and audit stages.
- Listing-first cancellation/expiry/purchase ordering.
- Opposite source-account selection order proving canonical B2 account locking and no deadlock.
- Same-listing no-oversell, same-account no-overspend, same-facility cap, and two-game isolation.

### Refund/dispute

- Exact reversal to each original source account with no current-rate repricing.
- Exact seller/fee/tax reversal and settlement-clearing zero residue.
- Exact item return once.
- Matching refund replay, conflicting reuse, insufficient recipient funds, unavailable buyer item, and full rollback at every logical stage.
- Explicit legacy-order compatibility evidence and no cross-family mutation.

### API, UI, and retained gates

- Authenticated same-origin quote/settlement/history/dispute tests in at least two games.
- Connected browser coverage for up-to-three-account selection, exact allocation, quote disclosure, confirmation, receipt, expiry, insufficient funds, holds, FX liquidity failure, listing race, replay, refund outcome visibility, responsive layouts, keyboard behavior, and accessibility.
- Retained C0, C1, B2, B1, Marketplace Preconvergence, Player Marketplace lifecycle, Database Replay, Backend Typecheck, Player Terminal, all Edge roots, Repository Quality, Supply Chain Security, public-payload UUID denial, Inventory/Crafting/Store regressions, and two-game isolation.

## Completion boundary

C2 may become `IMPLEMENTED_NOT_MERGED` only after one exact implementation SHA passes its permanent C2 gate and the full required inherited matrix, and a durable implementation handoff records that source. A later documentation-only handoff must not replace the tested implementation SHA.

C3 must not begin until the C2 handoff exists. C2 certification authorizes development continuation only; it does not authorize merge, deployment, scheduler installation, secret mutation, staging/production SQL, or live database mutation.

## Exact implementation certification

- Exact implementation and verification source: `9b95009dd7e73ed70987a0a99716d3ee32f2662d`.
- Permanent C2 source/database/connected-browser workflow: run `33142563231` — PASS.
- Database Replay: run `33142563190` — PASS.
- Player Terminal Verify, including Chromium: run `33142563193` — PASS.
- Banking FX clearing: run `33142563236` — PASS.
- Retained C1 Store funding: run `33142563169` — PASS.
- Retained C0 execution and observed concurrency: run `33143124382` — PASS.
- Independent exact-source Marketplace Chromium and database certification: run `33143316570` — PASS.
- Business Store Listing Inventory V2 attempt 2: run `33142563234` — PASS on the unchanged implementation source.
- PR #675 remains draft, open, unmerged, and undeployed.

The first Business Store Listing Inventory Chromium attempt was not accepted as evidence. Its failed job was rerun without changing the implementation, and attempt 2 completed all three workflow jobs successfully. The later documentation handoff does not replace `9b95009dd7e73ed70987a0a99716d3ee32f2662d` as the tested implementation identity.
