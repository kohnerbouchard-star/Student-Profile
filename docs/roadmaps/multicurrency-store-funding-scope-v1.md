# Multi-Currency Store Funding Scope v1

**Roadmap item:** `BUSINESS-V2-10A4C1`  
**Status:** `IMPLEMENTED_NOT_MERGED` — exact-head implementation certified; PR #674 remains draft, open, unmerged, and undeployed
**Branch:** `feat/multicurrency-store-funding-v1`  
**Parent branch:** `feat/multicurrency-funding-core-v1`  
**Parent draft PR:** #673  
**Exact parent C0 implementation and verification source:** `fd1511d716c1efd291cf6f45415a32a8d7550db4`  
**Exact parent C0 clean documentation handoff/base:** `0aec6cd3b97058a918ff60acdef0143cfcd97d06`  
**Production deployment authorized:** No

## Decision

C1 integrates the certified shared C0 purchase-funding authority into the Store only. Both seeded/NPC Store supply and Player Business seller offers must accept exact payment from one to three canonical Player Checking accounts, including purchase-scoped retail FX when a selected account currency differs from the Store bill currency.

The Store remains the commercial and inventory authority. C0 remains the funding and Banking-composition authority.

The resulting player contract is:

- every Store bill is denominated in the authoritative item or seller-offer currency;
- a Player may allocate that exact bill across one, two, or three owned active Checking accounts;
- allocations are expressed in the Store bill currency and must sum exactly to the Store total;
- same-currency funding uses rate `1`, no spread, and no FX facility;
- foreign-currency funding uses the C0 retail checkout policy: accepted B1 fixing, 1.00% customer-adverse spread, no separate fee, and source-minor-unit ceiling;
- the Store purchase and the C0 funding receipt commit atomically with inventory delivery;
- no buyer may be charged without receiving the exact purchased inventory, and no seller/system recipient may be credited twice.

## Ownership boundaries

### Store owns

- catalog item and seller-offer identity;
- seeded/NPC pricing inputs and Business offer price;
- Store quote identity and lifecycle;
- quantity, item/offer version, stock availability, and withdrawal eligibility;
- Store purchase or seller-offer receipt identity;
- Store-listing or seeded-stock custody;
- buyer inventory delivery and acquisition cost basis;
- seller COGS/margin evidence for Business offers;
- Store replay/conflict semantics;
- offer-first and item-first commercial lock order.

### C0 owns

- `pfq_...` funding quote identity and lifecycle;
- eligibility of one to three Player Checking accounts;
- target-currency contribution validation and exact funded-total equality;
- B1 fixing consumption and C0 1.00% retail checkout pricing;
- source debit, minor-unit ceiling, effective-rate disclosure, expiry, and balance snapshots;
- current balance/hold/fixing/facility revalidation at settlement;
- balanced multi-currency Banking composition;
- target-account credit;
- `pfr_...` funding receipt and Banking transaction evidence.

C1 must not recreate any of those C0 responsibilities in Store tables, Store TypeScript, the Player UI, or legacy currency helpers.

## Store bill currency

### Seeded/NPC Store supply

- The Store item currency is the bill and recipient currency.
- Existing country-snapshot inflation, location, scarcity, and difficulty multipliers remain Store-owned pricing inputs.
- The active checkout path must not convert the Store bill into the Player home currency through `convert_currency_amount` or another Store-owned FX calculation.
- The final item-local amount after Store pricing becomes the exact C0 target amount.
- Seeded/NPC proceeds credit one named game-scoped Store system Checking account in the bill currency, resolved through the canonical B2 account identity authority. The intended system party key is `store.seeded-revenue` unless implementation review identifies an already-authoritative equivalent.
- Seeded stock, restocking, scarcity, and catalog behavior remain unchanged except where exact atomic funding integration requires evidence linkage.

### Business seller offers

- The seller-offer currency is the bill and recipient currency.
- The buyer-country same-currency restriction is retired from the active quote path.
- The target recipient is the seller Business's canonical active Checking account in the offer currency.
- C1 does not create Business foreign accounts. A Business offer remains valid only when the Business already has the canonical recipient account required by existing Business currency authority. Business foreign-Checking creation remains C4.
- Seller proceeds equal the exact Store bill once. Seller COGS continues to derive from Store-listing inventory cost basis and remains distinct from buyer acquisition cost.

## Quote composition

C1 preserves Store-owned quote identity and adds an immutable relationship to one C0 funding quote.

The Store quote command must:

1. derive game and Player scope server-side;
2. resolve replay before mutable interpretation;
3. resolve and validate the Store item or Business offer, quantity, version, stock, currency, and exact total;
4. create or resolve the immutable Store quote;
5. derive a deterministic funding-context kind, key, and hash from the immutable Store quote and exact commercial facts;
6. call `public.create_purchase_funding_quote_v1(...)` with the Store bill currency, exact Store total, one to three browser-supplied `bac_...` account keys, and exact target-currency allocations;
7. bind the Store quote to the resulting C0 funding quote without exposing internal UUIDs;
8. return the Store quote plus bounded C0 rate, debit, allocation, expiry, and rounding evidence.

The funding context must distinguish seeded/NPC and Business offer quotes and bind at minimum:

- game and Player;
- Store quote public identity;
- item or offer public identity;
- item/offer version;
- quantity;
- exact bill currency and total;
- recipient kind and canonical recipient-account identity;
- pricing version;
- Store quote expiry.

Matching Store quote idempotency returns the original Store quote and original funding quote before current price, stock, rate, balance, or facility state is reinterpreted. Reusing an idempotency key with another account allocation, quantity, offer/item version, currency, amount, or Store context fails closed.

Store and funding quote expiries must be coherent. The usable Store checkout expiry is the earlier of the Store commercial quote expiry and the C0 funding quote expiry. Neither quote is refreshed in place.

## Settlement composition and lock order

A successful Store settlement is one PostgreSQL transaction.

### Business offer lock order

After immutable replay resolution, the authoritative mutable order is:

1. seller offer;
2. Store offer quote;
3. Store-listing inventory holding;
4. C0 funding quote;
5. C0/B2 Banking transaction, source accounts, holds, clearing/reserve, and facility evidence in canonical B2 order;
6. buyer inventory account/holding;
7. Store receipt, quote lifecycle, offer version/remaining quantity, Business COGS/margin evidence, and public response.

Withdrawal and purchase continue to serialize on the same seller-offer row. If withdrawal wins first, funding must not occur. If purchase wins first, the exact accepted purchase commits before withdrawal operates on remaining stock.

### Seeded/NPC lock order

After immutable replay resolution, the authoritative mutable order is:

1. Store item/commercial stock root;
2. Store purchase quote;
3. seeded Store inventory holding/projection;
4. C0 funding quote;
5. C0/B2 Banking locks in canonical order;
6. buyer inventory account/holding;
7. Store purchase receipt, quote lifecycle, stock projection, and public response.

C1 must invoke `private.compose_purchase_funding_v1(...)` only after the Store root and Store quote are locked and revalidated. It may not acquire Player bank-account locks before the Store root.

## Atomic success and failure semantics

The Store transaction must:

- validate that the Store quote and C0 funding quote describe the same Player, exact amount, currency, context, and recipient;
- revalidate item/offer status, version, quantity, stock, Store quote expiry, and recipient account;
- compose C0 funding to the exact recipient account;
- move exact inventory to the buyer;
- create the Store-owned purchase/receipt linked to the C0 funding receipt;
- consume both quotes exactly once;
- commit seller/system credit, buyer debits, FX clearing/reserve effects, inventory movement, cost basis, Store receipt, and funding receipt together.

Failure after any logical funding, inventory, receipt, offer, COGS, margin, or quote-lifecycle stage must roll the entire outer transaction back. No partial Banking, funding, Store, inventory, or seller mutation may remain.

A matching settlement replay returns the original Store receipt and nested C0 funding receipt before current stock, balance, hold, rate, account, offer, or lifecycle state is reinterpreted. Conflicting reuse fails without mutation.

## Store evidence model

Existing Store-owned public identities remain canonical:

- seeded/NPC purchases continue to use the Store purchase/receipt identity already exposed by the Player Store contract;
- Business offer purchases continue to use `spr_...` receipt identity;
- C0 `pfq_...`, `pfr_...`, and `btx_...` evidence is nested or linked as funding evidence, not substituted for Store identity.

Store quote and receipt records may gain immutable funding references and hashes. Internal funding, bank-account, transaction, party, offer, item, inventory, and Business UUIDs must not enter browser payloads.

Legacy single-ledger-entry fields must not be populated with fabricated cross-currency evidence. They may remain nullable compatibility fields while the C0 funding receipt and balanced Banking transaction become the authoritative payment evidence.

## Inventory cost basis

- Buyer acquisition cost is the Store bill amount in the Store bill currency, allocated per acquired unit under the existing precision rules.
- For Business offers, seller COGS remains based on the listing inventory's carried cost basis and seller margin remains bill proceeds less seller COGS.
- Buyer acquisition basis must not use the seller's internal production cost and must not be denominated separately in each source-account currency.
- Existing holdings with an incompatible cost currency must continue to fail closed unless a separately reviewed canonical inventory-basis migration resolves them.

## Player API and UI contract

C1 must update both seeded/NPC and Business-offer Store checkout surfaces.

The browser may submit only:

- Store item or offer public key;
- quantity and expected public version where applicable;
- one to three unique `bac_...` source Checking account keys;
- one positive Store-bill-currency target allocation per selected account;
- bounded Store and funding idempotency keys.

The browser must never submit or override game/Player scope, internal UUIDs, recipient account, bill currency, item/offer price, total, rates, spread, source debit, balance, holds, fixing, facility capacity, transaction identity, or funding context hash.

The Store UI must:

- reuse authoritative Player Banking account reads rather than create a Store wallet or duplicate balance cache;
- present up to three selected Checking accounts using dropdowns/buttons rather than free-form account identifiers;
- show account currency and current posted/held/available amount;
- show same-currency versus retail-FX treatment, accepted fixing time, reference/customer/effective rate, source debit, target contribution, and rounding disclosure;
- show total bill, funded total, and remaining amount;
- disable quote/confirm until allocations equal the exact Store bill;
- handle quote expiry, stale rate, insufficient balance, hold race, facility exhaustion, item/offer version conflict, stock loss, withdrawal race, and idempotent replay with specific recovery states;
- preserve responsive, accessible, keyboard-operable, and browser-safe public-key behavior.

## Existing behavior to retire from the active path

C1 must remove or bypass, for active seeded/NPC and Business Store checkout:

- Store-owned buyer-home-currency conversion through legacy `convert_currency_amount`;
- `STORE_OFFER_QUOTE_CROSS_CURRENCY_UNSUPPORTED` for otherwise valid Business offers;
- direct Store calls that debit one Player Checking projection through `record_player_ledger_entry` as the payment authority;
- separate Business credit posting through `record_business_ledger_entry_v2` for the same purchase;
- assumptions that one `ledger_entry_id` can represent a multi-currency purchase;
- checkout payloads that imply the buyer must possess the bill currency before quoting.

Compatibility wrappers may remain only when they forward to the new authority or return an explicit bounded retirement response. They must not preserve a second executable settlement path.

## Explicit exclusions

C1 must not:

- modify Marketplace settlement;
- modify Stock order/trade settlement;
- create Business-owned foreign Checking accounts;
- add Business treasury FX or procurement split funding;
- change B1 fixing calculations or the daily game-local 08:00 schedule;
- change B2 standard or instant bank-FX pricing or timing;
- change the C0 retail spread or funding-limit policy;
- create a cash wallet or allow Savings to fund Store purchases directly;
- make the Store calculate its own FX rate;
- merge any stacked PR;
- deploy to staging or production;
- install or alter schedulers;
- mutate secrets;
- run staging/production SQL or live database mutations.

Marketplace remains C2, Stocks remains C3, Business treasury/procurement remains C4, and final Store/FX convergence remains 10A.4D.

No merge, deployment, scheduler installation, secret mutation, staging/production SQL, or live database mutation is authorized by C1.

## Required proof before C1 certification

### Structural and security

- Own PR-bound exact-path authority with production deployment/mutation/secrets disabled.
- Complete migration replay from zero twice and rebuilt-schema lint/advisors.
- Fixed search paths, least-privilege grants, RLS/forced RLS for any new public evidence, and direct-DML denial.
- Store public payloads contain no internal UUIDs or trusted monetary fields authored by the browser.
- C1 creates no parallel FX, Banking, balance, hold, inventory, or Store authority.

### Seeded/NPC Store

- One-, two-, and three-account payment with all-same, mixed same/foreign, and three-foreign source currencies.
- Exact Store-bill target credit to the named Store system account.
- Exact stock decrement and buyer inventory increment once.
- Correct buyer acquisition basis in bill currency.
- Matching quote/settlement replay and conflicting reuse.
- Stock race, balance race, hold race, facility race, expiry, stale fixing, and complete rollback after funding and after inventory posting.

### Business offers

- One-, two-, and three-account payment across same/mixed/foreign currencies.
- Exact seller Business Checking credit once.
- Existing self-purchase and ownership-position prohibition preserved.
- Offer-first purchase/withdrawal serialization preserved.
- Exact Store-listing decrement, buyer inventory increment, offer remaining quantity/version, seller COGS, and margin evidence.
- Buyer basis uses purchase price, not seller internal cost.
- Matching quote/settlement replay, conflicting reuse, stock race, withdrawal race, balance/hold/facility races, expiry, stale fixing, and rollback at every logical stage.

### Connected API, UI, and retained gates

- Authenticated same-origin Player API tests for seeded/NPC and Business offers in at least two games.
- Player Store browser coverage for account selection, exact allocation, quote detail, confirmation, replay, expiry, insufficient funds, FX liquidity failure, version/stock conflict, and responsive/accessibility behavior.
- Retained C0, B2, B1, Store seller-offer, listing inventory, withdrawal safety, atomic settlement, Player Terminal, Database Replay, Backend Typecheck, all Edge roots, security, repository quality, public-payload UUID denial, and two-game isolation gates.
- Observed concurrency must include opposite account selection order and prove canonical Banking lock order avoids deadlock while Store offer/item roots remain first.

## Certified implementation and evidence

- **Exact C1 implementation and verification source:** `1cf6f413f10a761265cdec6076ceb9b2b3afcbf5`.
- **Permanent C1 certification workflow:** `multicurrency-store-funding-v1`, run `33114174603` — source/scope job `98664460581` and disposable-database job `98664460167`, both successful.
- **Retained connected Store certification:** `Business Player Store Cutover V2`, run `33114174711`. Exact-SHA connected two-browser rerun job `98676659699` completed successfully without changing implementation or weakening the browser assertion.
- All 20 pull-request-triggered workflows returned for the implementation source completed successfully, including C1, C0/B2, Database Replay, Store seller-offer/listing/withdrawal/quote/atomic/cutover, Player Chromium, Backend Typecheck, Repository Quality, Supply Chain Security, runtime wiring, Business economy/workforce/manufacturing, timezone/calendar, Admin API, and staging preflight.
- The first connected attempt recorded two transient local-runtime `503` responses for independent Contracts and Messages reads; both recovered to `200` on built-in retry and all Store settlement/isolation evidence was already true. The unchanged exact SHA passed the strict zero-console-error journey on rerun. No production source, monetary invariant, or test expectation was relaxed.
- Durable details are recorded in `docs/roadmaps/multicurrency-store-funding-implementation-handoff-v1.md`. This and later documentation-only commits must never replace the exact implementation SHA as the C1 certification identity.
- No merge, deployment, scheduler installation, secret mutation, staging/production SQL, or live database mutation is authorized or claimed.

## Completion boundary

C1 may become `IMPLEMENTED_NOT_MERGED` only after one exact implementation SHA passes the full required matrix and a durable implementation handoff records that source. A later documentation-only handoff must not replace the tested implementation SHA.

C2 must not begin until the C1 handoff exists. C1 certification authorizes development continuation only; it does not authorize merge, deployment, scheduler installation, secret mutation, staging/production SQL, or live database mutation.
