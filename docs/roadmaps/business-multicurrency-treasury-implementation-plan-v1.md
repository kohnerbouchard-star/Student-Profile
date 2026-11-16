# Business Multi-Currency Treasury and Procurement Implementation Plan v1

**Roadmap item:** `BUSINESS-V2-10A4C4`  
**Status:** `IMPLEMENTED_NOT_MERGED`
**Branch:** `feat/business-multicurrency-treasury-v1`  
**Parent clean C3F controller:** `18fde31be5e1599c7d9a65d681b248fcb4756dc4`
**Exact implementation and verification source:** `46bfc611834dca4db3084d9dce8197c499d61fcd`

## Goal

Give each Business canonical foreign-currency Checking accounts, the existing B2 standard/instant FX products, and one-to-three-account C0 procurement funding without creating a new money, FX, funding, Store, or Inventory authority.

## C4A — Scope, owner identity, and Business account surface

1. Lock C4 scope, authority audit, schema/runtime inventory, and PR-bound exact-path authority.
2. Add nullable Business ownership to the existing B2 FX quote/order evidence and C0 funding quote/receipt evidence.
3. Backfill and validate every existing row as Player-owned without changing any amount, rate, fee, hash, key, timestamp, or lifecycle state.
4. Enforce exactly one owner family with Business and Player foreign keys plus owner-specific idempotency indexes.
5. Add service-only zero-value Business Checking provisioning for any active currency using `private.ensure_business_bank_account_identity_v1` and `private.ensure_bank_account_projection_v1`.
6. Add an owner-authorized Business treasury read of accounts, posted/held/available balances, rates, orders, and receipts using public keys only.
7. Add contract/database proof that account opening is deterministic, idempotent, zero-value, game-isolated, ownership-stable, and direct-DML denied.

**Exit:** Business foreign Checking accounts and public read/open controls exist; no treasury conversion or procurement payment path has changed.

## C4B — Business treasury FX

1. Generalize B2 private quote/order/settlement ownership checks to exact Player-or-Business owner identity while preserving existing Player function signatures.
2. Add Business-specific service wrappers for quote, standard order, instant order, cancellation, and overview reads.
3. Use the unchanged B2 policies:
   - standard: 0.50% spread, next strictly later game-local 08:00 settlement;
   - instant: 0.50% spread plus separate 2.00% source-currency fee.
4. Auto-provision the target Business Checking account at zero balance when a valid foreign quote is created.
5. Generalize the standard-order worker to resolve source/target ownership through the order owner family; preserve lease, hold, cancellation, replay, and terminal-state behavior.
6. Prove quote and order replay before mutable fixing, balance, hold, account, and capacity interpretation.
7. Prove exact balanced lines, clearing/reserve draw/repayment, instant fee posting, standard holds, cancellation-versus-settlement races, insufficient funds, hold races, capacity races, stale fixing, and two-game isolation.
8. Add Business route contracts and focused repository/handler tests; do not alter the personal Banking route.

**Exit:** an authorized Business owner can open accounts and execute the same certified B2 treasury products through the Business boundary.

## C4C — Business C0 funding

1. Introduce one private owner-aware C0 quote implementation behind the existing Player wrapper and a new Business wrapper.
2. Introduce one private owner-aware C0 composer behind the existing Player wrapper and a new Business wrapper.
3. Preserve the exact C0 target-credit policy, expiry, allocation rules, pricing math, disclosure, canonical lock order, facility behavior, receipt identity, and target-credit semantics.
4. Require one to three unique active Business Checking accounts owned by the exact Business party.
5. Reject Player, Savings, system, legacy, compatibility-offset, cross-game, wrong-Business, restricted, and closed accounts.
6. Prove all existing Player C0 source/database/concurrency/browser contracts remain unchanged.
7. Prove Business one-, two-, and three-account same/mixed/foreign quote and composer behavior with exact per-currency zero sum and no target reusable wallet.

**Exit:** C0 remains one authority and can compose trusted Business purchase funding without exposing a generic Business-created bill endpoint.

## C4D — Funded Business procurement

1. Add nullable C0 funding bindings to `business_store_purchase_quotes` and funded Banking evidence to `business_store_purchases`.
2. Enforce mutually exclusive legacy direct-debit and C4 funded evidence families.
3. Upgrade the Business Store quote command to accept normalized one-to-three-account Business allocations.
4. Preserve the existing Store pricing resolver and Business reporting-currency final bill.
5. Resolve one canonical `store.seeded-revenue` target Checking account in the bill currency.
6. Bind one immutable Business C0 quote to the exact commercial quote, target account, total, currency, quantity, pricing version, and context hash.
7. Upgrade Business purchase settlement to:
   - resolve idempotency replay first;
   - reject unbound pre-C4 quotes with `business_store_procurement_payment_retired`;
   - lock Store item/commercial quote and Warehouse holding before C0/B2 roots;
   - compose exact Business funding through C0/B2;
   - decrement Store stock and post the canonical two-line Inventory transfer;
   - update Warehouse weighted-average cost in Business settlement currency;
   - complete the immutable procurement receipt and Business activity evidence.
8. Prove rollback after funding, Store decrement, Inventory posting, receipt completion, and activity insertion.
9. Prove Store stock, Business source accounts, facility capacity, Warehouse holding, quote, receipt, and idempotency races.

**Exit:** active Business procurement uses canonical multi-currency funding and balanced target credit; the retired direct-debit path is compatibility-only.

## C4E — Authenticated Player Business UI cutover

1. Add exact Business treasury route parsing, request validation, repository contracts, error mapping, capability/rate-limit parity, and same-origin Edge dispatch.
2. Add Treasury account/open/FX/order/receipt read models and controls to the Business workspace.
3. Add Business procurement account allocation, exact funded/remaining state, rate/spread/fee/rounding/expiry disclosure, confirmation, receipt, and refresh recovery.
4. Keep browser payloads to public keys and intent only.
5. Preserve HttpOnly session, CSRF, private no-store responses, keyboard operation, focus restoration, desktop/mobile layouts, reduced motion, and screen-reader labeling.
6. Add standalone and Chromium coverage for all success, replay, expiry, cancellation, insufficient balance, hold, capacity, privacy, accessibility, and responsive states.

**Exit:** the Player Business workspace is fully cut over to C4 controls without changing the personal Banking page or C1-C3 settlement surfaces.

## C4F — Exact-head certification and durable handoff

Run one exact C4 implementation SHA through:

- C4 scope/authority/schema/source contracts;
- migration validation;
- complete zero-to-head migration replay twice;
- rebuilt-schema lint/advisors;
- Business account, B2 owner-generalization, treasury FX, C0 owner-generalization, and procurement serial database acceptance;
- observed account, hold, liquidity, standard-order, cancellation, procurement, and reverse-account-order concurrency;
- Backend and every Edge TypeScript root;
- authenticated same-origin two-game API acceptance;
- Business workspace desktop/mobile Chromium, keyboard, accessibility, and public-payload UUID denial;
- retained B1, B2, C0, C1, C2, C3, Store, Marketplace, Stock, Business Banking, workforce, manufacturing, Inventory, Database Replay, Repository Quality, Supply Chain Security, timezone, and runtime gates.

Then record separately:

- exact implementation SHA;
- permanent C4 workflow run IDs and job outcomes;
- full inherited exact-head matrix;
- clean implementation handoff SHA;
- PR state;
- explicit non-merge/non-deployment statement;
- next authorized checkpoint `BUSINESS-V2-10A4D`.

The checkpoint manifest must be promoted only after the implementation SHA is completely green. A later documentation/controller head must also pass its exact-head matrix before C4 is described as fully closed.

**Certification result:** `46bfc611834dca4db3084d9dce8197c499d61fcd` passed the permanent C4 source, zero-to-head replay/database/concurrency, and desktop/mobile Chromium lanes in run `33351825999`, plus every one of the 31 PR-triggered inherited workflows. C4 is therefore `IMPLEMENTED_NOT_MERGED`; merge, deployment, scheduler/secret changes, staging/production SQL, live-data mutation, and `VERIFIED_COMPLETE` remain unauthorized.

## Planned permanent files

### Workflow and contracts

- `.github/workflows/business-multicurrency-treasury-v1.yml`
- `scripts/business-multicurrency-treasury-contract.mjs`
- `scripts/business-multicurrency-treasury-database.mjs`
- `scripts/business-multicurrency-treasury-concurrency.mjs`

### Forward migrations

- `backend/supabase/migrations/20260831100000_business_multicurrency_owner_identity_v1.sql`
- `backend/supabase/migrations/20260831101000_business_treasury_fx_commands_v1.sql`
- `backend/supabase/migrations/20260831102000_business_procurement_funding_v1.sql`
- `backend/supabase/migrations/20260831103000_business_multicurrency_assertions_v1.sql`
- a purge-registration migration only if implementation adds a new game-scoped table

### Business domain and UI

- focused Business treasury contracts, repository, handler, tests, routes, request validation, Edge dispatch, capability/rate-limit, Player Terminal Business feature/page, adapter, read-model, and browser-test files as locked by the PR authority record.

## Stop conditions

Stop and reopen scope before continuing if implementation requires:

- another balance, ledger, wallet, FX curve, funding quote family, posting primitive, or Inventory table;
- changing B1 fixing semantics or B2/C0 pricing policies;
- exposing Business accounts through Player Banking or Player C0 browser commands;
- rewriting historical money, FX, funding, procurement, or Warehouse cost evidence;
- converting Warehouse cost basis between currencies;
- changing Store, Marketplace, or Stock settlement;
- a cross-domain import cycle between Business and Banking infrastructure;
- a scheduler, secret, staging/production SQL, or live-data change;
- widening into supplier credit, loans, shipping, taxes, automatic sales, financial reporting, equity, or IPO.

## Merge and deployment boundary

C4 remains on its own stacked draft PR. No merge, staging/production deployment, scheduler installation/change, secret mutation, staging/production SQL, or live-database mutation is authorized by this plan.
