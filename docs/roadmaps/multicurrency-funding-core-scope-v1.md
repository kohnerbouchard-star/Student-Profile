# Multi-Currency Funding Core Scope v1

**Roadmap item:** `BUSINESS-V2-10A4C0`  
**Status:** `IMPLEMENTED_NOT_MERGED` — exact implementation and verification source `fd1511d716c1efd291cf6f45415a32a8d7550db4`; durable handoff `docs/roadmaps/multicurrency-funding-core-implementation-handoff-v1.md`
**Branch:** `feat/multicurrency-funding-core-v1`  
**Parent branch:** `feat/banking-fx-clearing-v1`  
**Parent draft PR:** #672  
**Exact parent B2 implementation:** `ce931f8320861117e64eba4403b84d6e7fe8da25`
**Exact parent B2 documentation handoff:** `029ea568adc722f0b7c1cd57a02c49f88ceaf716`
**Production deployment authorized:** No

## Decision

C0 introduces one shared Player purchase-funding authority for bills denominated in a single target/listing currency. It is the reusable monetary composition layer that later Store, Marketplace, Stocks, and Business-specific checkpoints consume. It does not itself change any of those domain settlement paths.

The core gameplay contract is:

- a Player may fund one bill from **one to three** of their canonical Checking accounts;
- the bill must be funded **exactly and completely** before a purchase may commit;
- Savings accounts, Business accounts, system accounts, duplicate source accounts, cross-game accounts, closed/restricted-for-spend accounts, and accounts not owned by the Player are invalid;
- same-currency contributions use rate `1`, no FX spread, no FX fee, and no reserve capacity;
- foreign-currency contributions use an immediate **retail checkout FX** product derived from the certified B1 fixing and B2 clearing/reserve authority;
- retail checkout FX policy v1 uses the accepted reference fixing with a **1.00% retail spread and no separate fee**;
- B2 standard bank FX remains cheaper at the certified 0.50% spread but settles at the next strictly later game-local 08:00 boundary;
- B2 instant bank FX remains 0.50% spread plus the separately posted 2.00% source-currency fee and deposits converted funds into a Player account immediately;
- retail checkout FX is purchase-scoped only: it does not create or top up a foreign Player bank account, cannot be ordered independently, and cannot be reused as a general transfer mechanism.

This gives the intended three choices without competing exchange-rate authorities: pre-convert through the bank at the better delayed rate, use the bank's more expensive instant product to acquire foreign balance now, or let a purchase consume foreign Checking balances immediately at the retail checkout rate.

## Non-negotiable architecture invariants

- B1 remains the only exchange-rate/fixing authority. C0 may consume the accepted `fxf_...` fixing and reference-rate evidence but may not calculate or persist another macro/trade FX curve.
- B2 remains the only bank-account, posted-balance, hold, journal, clearing, reserve, facility-cap, and bank-FX authority. C0 may extend B2's private clearing/facility composition for the new retail product but may not introduce a wallet, treasury balance cache, parallel ledger, reserve projection, or alternate posting primitive.
- `private.post_bank_transaction_v1` remains the sole balanced monetary posting primitive. C0 composes validated lines for it; it does not bypass per-currency balance, account/hold checks, facility authorization, precision rules, or canonical lock ordering.
- The B2 `banking.compatibility-offset` account is **forbidden** in retail funding. Retail conversion is a real clearing/reserve transaction and consumes real facility capacity.
- A domain-specific settlement must lock its own economic root first, then the funding quote, then the Banking transaction/idempotency header, bank accounts in canonical UUID order, and holds/facility evidence in the B2 canonical order. C0 may never invert an owning domain's lock order.
- Browser input is economic intent only. Internal UUIDs, game/player scope, canonical balances, held/available amounts, rates, spread calculation, source debits, facility capacity, merchant/recipient account identity, transaction IDs, and trusted domain bill identity remain server derived.
- C0 does not make a purchase. It produces immutable quote evidence and a private atomic funding composition that a later owning domain invokes inside its own settlement transaction.

## Funding quote model

### Public identity

- Add immutable funding quote identity using public prefix `pfq_...`.
- Each quote binds one game, one Player, one trusted funding-context identity/hash, one target currency, one exact target bill amount, accepted fixing/policy, creation time, expiry, deterministic request hash, and one to three ordered funding legs.
- Browser-visible funding leg identity is bounded and may use a quote-local ordinal or opaque public line key; internal account UUIDs never appear in the browser contract.
- Quote replay resolves before mutable balance, account, fixing, or facility interpretation. Matching idempotency returns the original quote; conflicting key reuse fails without mutation.
- The quote is immutable price/allocation evidence. Quote creation reserves no account funds and no facility capacity.

### Browser allocation intent

The owning domain may accept from the Player only:

- one to three `bac_...` source Checking account public keys;
- one positive **target-currency contribution amount** per selected source account;
- one bounded funding idempotency key.

The owning domain derives and supplies to C0 the trusted game/Player scope, exact bill/listing currency, exact bill total, and an immutable funding-context hash identifying the domain quote/order/offer/listing being paid.

Rules:

- source account keys must be unique;
- every target contribution must conform to the target currency minor unit and be strictly positive;
- target contributions must sum **exactly** to the trusted bill amount;
- overfunding, underfunding, zero-value legs, implicit remainder, negative allocation, percentage-only ambiguity, and more than three accounts fail before quote creation;
- C0 never changes the target bill amount to make a split work.

## Retail target-credit pricing

B2 bank FX is source-debit driven. Purchase funding is target-credit driven because the merchant/listing amount must be exact.

For each foreign-currency leg C0 must:

1. load the same accepted B1 fixing and registry precision used by B2;
2. derive reference rate from the canonical fixing;
3. apply the versioned 1.00% retail spread in the customer-adverse direction;
4. keep the requested target contribution exact;
5. derive the **minimum source-currency debit**, rounded upward to the source currency minor unit, that funds that exact target contribution at the retail customer rate;
6. record the reference rate, retail customer rate, effective rate after minor-unit ceiling, source debit, exact target contribution, fixing key, policy version, and a deterministic rounding disclosure;
7. reject any source/target pair for which exact bounded calculation cannot be represented under registry precision.

The minor-unit ceiling is part of the quote and may make the effective rate fractionally worse than the nominal retail rate. The server never silently reduce the merchant credit or create a fractional unpaid remainder.

Same-currency legs are exact `sourceDebit = targetContribution`, rate `1`, spread `0`, no fee, and no clearing/reserve use.

Quote expiry is the earlier of 120 seconds or the next accepted fixing boundary. If the fixing boundary has already passed or the accepted fixing is stale/overdue under B1/B2 rules, quote creation fails closed.

## Account and balance validation

Quote creation validates and snapshots, for each source account:

- same game;
- Player ownership;
- account kind `checking`;
- active spendable status;
- currency and registry precision;
- posted, held, and available amount;
- calculated source debit;
- whether the leg requires retail FX.

The quote may be shown only if every source account has enough available balance for its quoted debit at quote time. This is not a reservation or guarantee; settlement revalidates current posted/held/available authority under lock.

Savings never funds a purchase. A Player who wants Savings funds must first use the existing Banking transfer authority.

## Private atomic funding composer

Add one private C0 composition boundary, not executable by browser roles and not a general public money API. It is invoked only from a trusted owning-domain settlement transaction.

Inputs are trusted scope plus:

- immutable `pfq_...` funding quote;
- exact funding-context identity/hash expected by the owning domain;
- the owning domain's already-resolved canonical target recipient bank account in the quote target currency;
- owning-domain source identity and idempotency evidence.

The composer must:

- resolve replay before mutable interpretation;
- lock and validate the quote and domain context;
- revalidate exact target amount/currency and recipient account currency/game/status;
- revalidate every Player source account, current available balance, holds, precision, and quoted source debit;
- revalidate accepted fixing/policy/expiry for each foreign leg;
- acquire/validate target-currency clearing and reserve facility capacity under the B2 shared game monetary lock;
- compose one balanced Banking transaction across all source currencies and the target currency;
- use no compatibility-offset line;
- make the merchant/recipient target-currency credit equal the bill **exactly once**;
- create immutable funding receipt/evidence, public prefix `pfr_...`, linked to the Banking transaction and quote;
- return only public funding/transaction evidence required by the owning domain;
- participate in the caller's PostgreSQL transaction so a later domain failure rolls back every debit, clearing/reserve movement, facility effect, receipt, and recipient credit.

### Journal shape

For a same-currency leg:

- Player Checking debit in target currency;
- contributes directly toward the one target-currency recipient credit.

For each foreign-currency leg:

- Player source Checking debit;
- matching source-currency clearing credit;
- target-currency clearing/reserve debit for the exact target contribution under B2 facility rules;
- contributes to the one exact target-currency recipient credit.

The full transaction must sum to zero independently in every currency. Multiple logical lines may share the target-currency clearing account; deterministic line order and aggregate projection updates follow B2 rules.

The retail spread is represented by the immutable quoted source debit versus target contribution and accepted fixing; no fake same-currency fee or compatibility-contra line is created.

## Idempotency and lifecycle

- One funding quote may produce at most one completed funding receipt for one exact funding context.
- Matching composer replay returns the immutable original receipt before current balances/lifecycle are reinterpreted.
- Same idempotency with another quote, account split, target account, amount, currency, domain context, or request hash fails closed.
- Expired unused quotes remain immutable evidence and cannot be refreshed in place; a new quote is required.
- A consumed quote cannot fund another purchase or another domain.
- C0 does not create a standalone cancellation flow because the quote reserves nothing. Domain-specific cancellation remains with the owning domain.

## Concurrency and failure semantics

Prove at minimum:

- two simultaneous funding attempts against the same source account cannot overspend available balance;
- a new account hold racing funding cannot produce `posted < active holds`;
- two different foreign legs cannot oversell the same target-currency facility capacity;
- simultaneous funding from the same three accounts in opposite browser order does not deadlock because Banking locks canonical account UUID order;
- two games never share quote, account, clearing, reserve, facility, idempotency, or receipt state;
- domain rollback after successful funding composition leaves zero durable C0/Banking mutation;
- failure after every logical source debit, source clearing line, target facility movement, recipient credit, funding receipt insert, and owning-domain post-funding stage rolls the entire outer transaction back;
- `FX_LIQUIDITY_UNAVAILABLE`, insufficient available balance, stale quote, expired quote, wrong target account, wrong domain context, wrong game/player, direct service-role mutation, and idempotency conflict all leave no partial monetary or domain mutation.

## Public contracts and UI boundary

C0 does not add a standalone Funding page and does not publish a generic browser endpoint that lets a Player invent a bill.

It may add shared typed contracts/utilities that later domain endpoints use. Domain-specific UI in C1-C4 will present:

- up to three eligible Checking accounts;
- account currency and authoritative posted/held/available amount;
- target-currency allocation per selected account;
- same-currency versus retail-FX leg;
- accepted fixing time;
- reference and retail customer rate;
- quoted source debit;
- exact target contribution;
- total bill, funded total, and remaining-to-allocate amount;
- quote expiry and rounding disclosure.

The confirm action remains disabled until allocations equal the trusted bill exactly.

## Explicit exclusions

C0 must not:

- modify seeded Store purchase settlement;
- modify Business seller-offer settlement;
- modify Marketplace purchase/sale/refund settlement;
- modify Stock buy/sell settlement;
- create Business foreign Checking accounts or Business treasury FX actions;
- change procurement funding;
- add an alternate exchange-rate model;
- change the B2 standard/instant bank products;
- use the compatibility-offset account to simulate retail FX;
- create a cash wallet or Savings purchase path;
- merge, deploy, install schedulers, mutate secrets, or run staging/production SQL.

Those integrations remain `BUSINESS-V2-10A4C1` through `C4`, followed by final `BUSINESS-V2-10A4D` Store/FX convergence.

## Required proof before implementation certification

- Replay every forward migration from zero twice and run rebuilt-schema lint/advisors.
- Prove exact schema/ACL/RLS/search-path/Data API boundaries and direct-DML denial for funding quote/line/receipt evidence.
- Prove 1-account, 2-account, and 3-account exact funding for all-same-currency, mixed same/foreign, and three-distinct-foreign-currency cases.
- Prove target contributions sum exactly to the bill and recipient credit occurs exactly once.
- Prove target-credit retail pricing, 1.00% spread direction, source-minor-unit ceiling, effective-rate disclosure, and exact target credit across every registry precision represented in the beta pack.
- Prove Savings, duplicate account, non-owned account, Business/system account, cross-game account, restricted/closed account, >3 accounts, zero/negative leg, overfunded, underfunded, invalid precision, and malformed public-key rejection.
- Prove quote replay/conflict, expiry, fixing-boundary rejection, stale/overdue fixing rejection, balance-change revalidation, hold races, debit races, facility races, rollback at every stage, two-game isolation, and reverse account-order concurrency.
- Prove retail funding never uses `banking.compatibility-offset`, never creates a Player target wallet, and never mutates B2 bank-FX orders.
- Prove per-currency bank-transaction zero sum and exact projection reconciliation after each successful funding composition.
- Add structural/types/deterministic simulation plus real disposable-database acceptance and observed-concurrency harnesses.
- Run B1 FX, B2 Banking/FX, Economy ledger, Business Banking, Store/Inventory/Marketplace/Stocks retained gates, Backend TypeScript, every Edge root, security, repository quality, Player Terminal, Chromium, public-payload UUID denial, and `git diff --check`.

## Completion boundary

C0 may become `IMPLEMENTED_NOT_MERGED` only after one exact implementation SHA passes the complete required matrix and a durable handoff records that source. A later documentation-only handoff does not replace the tested source.

C1 must not begin until that C0 handoff exists. C0 certification authorizes development continuation only; it does not authorize merge, staging/production deployment, scheduler installation, secret mutation, or live database mutation.
