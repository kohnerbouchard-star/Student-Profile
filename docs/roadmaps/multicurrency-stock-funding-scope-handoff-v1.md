# Multi-Currency Stock Market Funding Scope Handoff v1

**Roadmap checkpoint:** `BUSINESS-V2-10A4C3`  
**Status:** `INTAKE_COMPLETE — IMPLEMENTATION_NOT_STARTED`  
**Branch:** `feat/multicurrency-stock-funding-v1`  
**Draft PR:** #676  
**Base branch:** `feat/multicurrency-marketplace-funding-v1`  
**Exact parent C2 implementation source:** `9b95009dd7e73ed70987a0a99716d3ee32f2662d`  
**Exact parent C2 clean handoff:** `ba033ac4a7759d068233513431891fc9de3ae95a`  
**Merge or deployment authorized:** No

## Controlling records

- Scope: `docs/roadmaps/multicurrency-stock-funding-scope-v1.md`
- Authority audit: `docs/roadmaps/multicurrency-stock-funding-authority-audit-v1.md`
- Schema/runtime inventory: `docs/roadmaps/multicurrency-stock-funding-schema-inventory-v1.md`
- Implementation plan: `docs/roadmaps/multicurrency-stock-funding-implementation-plan-v1.md`
- PR-bound authority: `docs/operations/contracts/player-cross-cutting/pr-676.json`

The commit containing this handoff and the PR-bound authority is the immutable C3 scope handoff. It is not a runtime implementation or certification identity.

## Locked outcome

C3 will make each runtime security settle in one authoritative listing currency and will replace the active one-ECO-Checking buy path with explicit funding from one to three canonical Player Checking accounts.

Financial Markets remains the sole authority for securities, exchange calendars, prices, order acceptance, matching, fills, trades, fees, holdings, cost basis, realized P&L, and market-time rules. C0 owns purchase-funding quotes and composition; B1 owns accepted daily fixings; B2 owns accounts, balances, holds, FX clearing, reserve/liquidity, and balanced journals.

C3 does not change the deterministic price engine. It does not create a Stock wallet or a second order book. It does not silently convert sale proceeds.

## Resolved implementation direction

1. Add canonical listing currency to active runtime securities with deterministic ECO backfill only where no prior currency authority exists.
2. Preserve historical order/trade evidence without reinterpretation.
3. Separate Player buy quote/review from final confirmation.
4. Bind the exact Financial Markets commercial exposure to one C0 funding quote.
5. Lock Financial Markets roots before C0/B2 account roots.
6. Compose funding, settlement distribution, order/fill/trade, fees, holdings, cost basis, and evidence atomically.
7. Credit sell proceeds to a canonical Player Checking account in listing currency without automatic FX.
8. Preserve current immediate-market behavior unless the exact parent migration inventory proves a retained resting-order/partial-fill authority, in which case funding reservations must compose with that authority rather than replace it.

## Current blockers

There is no product-decision blocker. Before C3A authors a migration, it must locate and record the exact latest definitions for:

- `execute_stock_market_order_calendar_gated`;
- its wrapped execution function;
- any retained order-book, limit, partial-fill, cancellation, expiry, or reservation functions;
- the current system liquidity/counterparty and fee-recipient accounts;
- every active legacy Stock cash/ledger write and order/trade/holding currency constraint.

Those are bounded repository-discovery tasks.

## Next authorized tranche

**C3A only:** exact execution-function inventory and compatibility-safe schema.

C3A may add listing-currency and immutable funding-binding schema, constraints, guards, assertions, tests, and a permanent C3 workflow. It may not activate buy settlement, UI cutover, merge, deployment, scheduler changes, secrets, staging/production SQL, or live-database operations.

C3B quote, C3C settlement, C3D API/UI, and C3E certification remain closed until C3A evidence is complete.
