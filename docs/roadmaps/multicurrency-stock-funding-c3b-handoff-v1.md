# Multi-Currency Stock Market Funding C3B Handoff v1

**Roadmap checkpoint:** `BUSINESS-V2-10A4C3B`  
**Status:** `IMPLEMENTED_NOT_MERGED`  
**Branch:** `feat/multicurrency-stock-funding-v1`  
**Draft PR:** #676  
**Exact C3B implementation SHA:** `8a397b4c8c0d7fd887e6d657aa0741e01ec911fb`  
**Parent C3A implementation:** `f5fb9716ee4a8ab209cbc535d3583925c6d261c7`  
**Merge or deployment authorized:** No

## Certified result

C3B establishes the immutable immediate-buy Stock quote without moving money or shares.

- `public.stock_buy_quotes` freezes one Player, runtime Stock asset, ticker, listing currency, quantity, quoted price, exact latest tick index, gross value, expiry, request hash, and idempotency identity.
- One Stock quote is bound transactionally to exactly one C0 `purchase_funding_quotes` row with context `stocks.immediate-buy`.
- Quote creation requires the exchange to be open, the runtime asset to be active, the submitted expected price to equal the current asset and latest tick price, and the submitted tick index to equal the latest tick.
- Funding allocations remain constrained by C0 to one through three canonical Player Checking accounts and exact listing-currency funding.
- Matching idempotent replay returns the original immutable Stock/C0 quote; conflicting reuse fails closed.
- The Stock quote is non-reserving and cannot move money, alter B2 balances, alter holdings, create orders/trades, or mutate the Player API/UI.
- Canonical B2 Player account identity in the disposable acceptance fixture resolves through `bank_accounts.party_id -> economic_parties.player_id`; no legacy direct-owner compatibility column was introduced.
- PostgreSQL numeric text representation is normalized only in the acceptance comparison; production quote precision/storage is unchanged.

## Canonical implementation files

- `backend/supabase/migrations/20260827111500_multicurrency_stock_buy_quote_v1.sql`
- `backend/supabase/migrations/20260827111600_multicurrency_stock_buy_quote_clock_v1.sql`
- `backend/supabase/migrations/20260827111700_multicurrency_stock_buy_quote_assertions_v1.sql`
- `scripts/multicurrency-stock-buy-quote-contract.mjs`
- `scripts/multicurrency-stock-buy-quote-database.mjs`
- `.github/workflows/multicurrency-stock-funding-v1.yml`

## Exact-head certification evidence

The exact implementation SHA `8a397b4c8c0d7fd887e6d657aa0741e01ec911fb` passed the permanent C3B workflow and every workflow run associated with that exact head.

- `multicurrency-stock-funding-v1` — run `33251405215` — success.
  - source-contract job — success.
  - disposable-database job — success.
  - the disposable lane completed two independent zero-to-head `supabase db reset` replays and two C3B database acceptance executions.
- Exact-head workflow query returned 12 completed runs; none had a failure or pending conclusion.
- Exact-head check-run query returned 25 completed checks; none had a failure conclusion.

The dedicated C3B database lane checked out `8a397b4c8c0d7fd887e6d657aa0741e01ec911fb` exactly and emitted `Multi-currency Stock funding C3B database acceptance: PASS` in both reset/replay cycles.

## Source-of-truth rule

`8a397b4c8c0d7fd887e6d657aa0741e01ec911fb` is the immutable C3B implementation identity. Later documentation or C3C commits must not replace it as the tested C3B source.

## Next boundary

C3C is now authorized. C3C may add replay-first atomic immediate-buy settlement that consumes the exact immutable C3B Stock quote and its bound C0 funding quote, credits the canonical `stocks.market-liquidity` B2 account, creates exactly one filled Stock order/trade, updates the Player holding once, and records immutable settlement evidence in one transaction.

C3C must revalidate the open exchange, exact asset price/latest tick, quote expiry, Player/session scope, C0 context, and liquidity target before composition. It must prove rollback after injected failures at funding, holding, order, trade, and evidence stages, and prove replay/concurrency safety. C3C must not activate sell settlement, alter the Player API/UI, change the Stock price engine/calendar/scheduler, merge, deploy, mutate secrets, run staging/production SQL, or mutate a live database.
