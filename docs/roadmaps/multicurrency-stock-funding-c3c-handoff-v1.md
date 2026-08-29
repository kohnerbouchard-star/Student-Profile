# Multi-Currency Stock Market Funding C3C Handoff v1

**Roadmap checkpoint:** `BUSINESS-V2-10A4C3C`  
**Status:** `IMPLEMENTED_NOT_MERGED`  
**Branch:** `feat/multicurrency-stock-funding-v1`  
**Draft PR:** #676  
**Exact C3C implementation SHA:** `2426edf7a9d57eddd24f401c885d6abbb705f582`  
**Parent C3B implementation:** `8a397b4c8c0d7fd887e6d657aa0741e01ec911fb`  
**Merge or deployment authorized:** No

## Certified result

C3C establishes replay-first atomic immediate-buy Stock settlement on top of the immutable C3B quote and bound C0 funding quote.

- Settlement consumes the exact immutable C3B Stock buy quote once and preserves the bound C0 funding identity.
- The exact current Stock price/latest tick, exchange-open state, quote expiry, Player/session scope, C0 context, and canonical market-liquidity target are revalidated before settlement.
- C0/B2 funding composition credits the canonical `stocks.market-liquidity` account in listing currency while preserving one-to-three-account and FX evidence.
- The Player holding update, filled Stock order, Stock trade, and immutable settlement evidence commit in the same transaction as funding.
- `stock_orders.stock_buy_quote_id` is the unique quote-consumption receipt; the existing C0 funding receipt/transaction/liquidity evidence remains the monetary consumption authority rather than introducing a shadow settlement ledger.
- Matching idempotent replay returns the committed result; conflicting reuse fails closed.
- Failure injection proves rollback across funding, holding, order, trade, and evidence stages.
- True concurrent consumption is exercised with two independent database sessions racing the same quote; exactly one settlement may win and economic mutation occurs once.
- `stock_buy_quotes` is registered with canonical game purge handling through a forward migration; certified C3B migration history was not rewritten.
- Deterministic acceptance uses private clock/session seams only; production market-time and session validation remain authoritative.
- C3C does not activate sell settlement and does not alter Player API/UI, Stock price engine, exchange calendar, scheduler, Store, Marketplace, or Business treasury.

## Exact-head certification evidence

Exact implementation `2426edf7a9d57eddd24f401c885d6abbb705f582` passed the complete pull-request workflow matrix associated with that exact head:

- `multicurrency-stock-funding-v1` — run `33281565681` — success.
- Database Replay — run `33281565608` — success.
- Backend Typecheck — run `33281565659` — success.
- Repository Quality — run `33281565667` — success.
- Supply Chain Security — run `33281565679` — success.
- Admin API Check — run `33281565615` — success.
- Staging Readiness Preflight — run `33281565623` — success.
- Exchange Calendar Runtime — run `33281565628` — success.
- Required Game Market Timezone — run `33281565731` — success.
- `banking-fx-clearing-v1` — run `33281565622` — success.
- Business Player Store Cutover V2 — run `33281565576` — success.

The retained Store workflow completed the standalone Player Terminal/full Chromium suite, connected two-browser Store journey, two database replays, serial/concurrent settlement checks, authority verification, and backend verification successfully on the exact C3C SHA.

## Source-of-truth rule

`2426edf7a9d57eddd24f401c885d6abbb705f582` is the immutable C3C implementation and verification identity. This documentation commit and later C3D work must not replace it as the tested C3C source.

## Next boundary

C3D is now authorized: atomic immediate-sell Stock settlement.

C3D may consume a server-authoritative immediate-sell quote/price-tick context, serialize against the Player holding and canonical Stock market-liquidity account, debit shares exactly once, debit market liquidity in listing currency, credit the Player's selected canonical Checking destination through B2, create one filled sell order/trade with immutable settlement evidence, and provide exact replay/conflict behavior and rollback/concurrency proof.

C3D must fail closed for insufficient holdings, insufficient market liquidity, stale price/tick, closed exchange, invalid Player/session/game scope, wrong currency/account ownership, and duplicate/conflicting settlement. It must not permit short selling, margin, partial fills, queued/limit orders, Player API/UI cutover, price-engine/calendar/scheduler changes, merge, deployment, secret mutation, staging/production SQL, or live database mutation.
