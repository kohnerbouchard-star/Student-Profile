# Multi-Currency Stock Market Funding Implementation Plan v1

**Roadmap item:** `BUSINESS-V2-10A4C3`  
**Status:** `PLANNED_NOT_IMPLEMENTED`  
**Branch:** `feat/multicurrency-stock-funding-v1`  
**Parent clean handoff:** `ba033ac4a7759d068233513431891fc9de3ae95a`

## Goal

Move immediate Stock Market buys and sells onto authoritative listing-currency, C0 purchase funding, and B2 balanced settlement without changing the stock price engine, exchange calendar, scheduler, Story shocks, immediate-fill model, or public ticker boundary.

## C3A — Listing currency and evidence foundation

1. Add canonical `listing_currency_code` to stock templates and runtime assets.
2. Backfill runtime assets from issuer country currency and enforce same-game canonical currency validity.
3. Freeze runtime listing currency after materialization.
4. Add listing/basis currency metadata and a legacy-versus-C3 evidence-family discriminator to holdings, orders, and trades.
5. Add nullable immutable references for Stock buy quote, C0 funding quote/receipt/transaction, market-liquidity account, sell destination account, and sell-proceeds transaction.
6. Add named `stocks.market-liquidity` B2 account resolution and trusted idempotent initialization evidence.
7. Add schema constraints that preserve legacy rows while requiring complete evidence for new C3 rows.
8. Add source-contract and migration assertions, complete replay, and lint before changing execution.

**Exit:** listing currency and evidence authority exist; the old trading path still executes unchanged; no browser payload changes.

## C3B — Immediate buy quote

1. Add Stock-owned immutable buy-quote records with public keys, request hashes, exact asset/tick/price/quantity/gross snapshots, listing currency, liquidity target, expiry, and lifecycle.
2. Add replay-first quote command using public ticker, expected price/tick, quantity, one to three `bac_...` Checking accounts, and exact listing-currency allocations.
3. Require open exchange, active asset, exact listing-currency precision, and a valid market-liquidity target account.
4. Call `public.create_purchase_funding_quote_v1(...)` only after Stock quote facts are fixed.
5. Bind one Stock quote to one C0 quote and return bounded public FX/funding disclosure.
6. Prove matching replay, conflicting reuse, stale price/tick, closed market, account ownership/status, balance, hold, fixing, and FX-facility failures.

**Exit:** a Player can review one immutable immediate-buy price and exact one-to-three-account funding plan without moving money or shares.

## C3C — Atomic immediate buy settlement

1. Add replay-first Stock buy-settlement command.
2. Lock asset/price root and Stock quote before C0/B2 monetary roots.
3. Revalidate exchange state, price, tick, quote expiry, Player/account scope, C0 quote context, and market-liquidity target.
4. Compose C0 funding to `stocks.market-liquidity`.
5. Increase holdings and update listing-currency average cost.
6. Create one Stock order, one trade, and immutable funding links.
7. Consume Stock and C0 quotes exactly once.
8. Add failure injection after funding, holding, order, trade, and evidence stages and prove full rollback.
9. Prove same-account, same-asset, same-liquidity-cap, opposite-account-order, replay, and two-game concurrency behavior.

**Exit:** an immediate buy conserves money and creates shares/holding evidence exactly once in one transaction.

## C3D — Atomic immediate sell settlement

1. Add a Player-selected public destination Checking account in the asset listing currency.
2. Resolve replay before price, liquidity, account, or holdings reinterpretation.
3. Lock asset/price root, Player holding, market-liquidity account, and destination account in canonical order.
4. Revalidate open market, exact price/tick, sufficient unreserved shares, destination ownership/status/currency, and market-liquidity balance.
5. Debit market liquidity and credit the selected Player Checking account through one balanced B2 transaction.
6. Decrease holdings, update realized P&L in listing currency, and create one order/trade linked to the Banking transaction.
7. Prove replay, conflict, stale price, closed market, insufficient shares, wrong destination currency, insufficient market liquidity, rollback, and concurrent sells.

**Exit:** sell proceeds are balanced, listing-currency correct, and never minted through a direct Player ledger credit.

## C3E — Player API and UI cutover

1. Publish listing currency through board, asset-detail, portfolio, holdings, orders, and trades DTOs.
2. Replace the active buy endpoint with quote and settlement routes while retaining an explicit bounded compatibility response for the old single-step command.
3. Extend the sell endpoint with one public listing-currency destination account.
4. Reuse authoritative Banking account reads; do not create a Stock wallet or balance cache.
5. Add one-to-three-account allocation controls, exact funded/remaining display, FX-rate disclosure, quote expiry, confirmation, and immutable receipt UI.
6. Show sell destination account and exact proceeds.
7. Hide or disable limit-order execution and remove the unsupported 0.25% fee estimate.
8. Update portfolio display to per-currency subtotals or clearly evidenced read-only B1 conversion.
9. Preserve same-origin BFF, CSRF, HttpOnly session, public ticker/key, keyboard, focus, mobile, reduced-motion, and screen-reader behavior.

**Exit:** the Player can execute listing-currency immediate buys and sells through constrained controls without authoring monetary outcomes.

## C3F — Certification and durable handoff

Run one exact implementation SHA through:

- C3 source/scope/authority contracts;
- complete migration replay from zero twice;
- rebuilt-schema lint/advisors;
- serial buy/sell database acceptance;
- observed concurrency and deadlock checks;
- price-tick race and market-close boundary tests;
- C0/B1/B2 funding, clearing, hold, liquidity, and replay regressions;
- C1 Store and C2 Marketplace regressions;
- Stock runner, seed/copy, board/detail, Portfolio, watchlist, exchange-calendar, required-timezone, Story-shock, and scheduler contracts;
- Backend and all-Edge TypeScript;
- authenticated same-origin two-game API acceptance;
- desktop/mobile Chromium, keyboard, accessibility, and public-payload UUID denial;
- Repository Quality and Supply Chain Security.

Then record:

- exact implementation SHA;
- permanent workflow run IDs and job outcomes;
- clean documentation handoff SHA;
- PR state;
- explicit non-deployment/non-merge statement;
- next checkpoint `BUSINESS-V2-10A4C4`.

## Stop conditions

Stop and reopen scope before continuing if implementation discovers:

- a live order book, partial-fill, or queued-order authority not present in the audited parent;
- a second current Stock execution path not covered by the scope;
- a requirement to change the price engine or exchange calendar;
- a requirement to weaken B2 balance, hold, clearing, reserve, or liquidity invariants;
- a requirement to create negative system balances or unbounded market liquidity;
- a requirement to rewrite historical ledger entries, orders, or trades;
- an unavoidable cross-domain cycle between Stocks and Banking/C0.

## Merge and deployment boundary

C3 work remains on its stacked draft PR. No merge, staging/production deployment, scheduler installation/change, secret mutation, staging/production SQL, or live-database mutation is authorized by this plan.
