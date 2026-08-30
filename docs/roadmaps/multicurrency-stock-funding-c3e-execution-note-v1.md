# Multi-Currency Stock Funding — C3E Execution Note v1

Status: **in progress; not certified**

Certified predecessor: C3D implementation `9b502b9ffa5e8aaf2f7c8d93d9cd3ccda3a10f15`.

## Backend-first tranche begun

The authenticated Player Stock trading gateway now routes the certified C3 transaction sequence:

- `create_buy_quote` → `create_stock_buy_quote_v1`
- `settle_buy_quote` → `settle_stock_buy_quote_v1`
- `settle_sell` → `settle_stock_sell_v1`

The legacy one-step Player order body is retired after authentication with `410 stock_market_trading_retired`.

This tranche derives game and Player scope from the authenticated session, accepts public ticker and public evidence keys, rejects UUID/private-scope injection, validates one to three unique Checking-account funding allocations, preserves idempotency and certified conflict semantics, and returns private no-store responses.

The retained calendar-gated `executeOrder` adapter remains available for unrelated Stock runtime consumers through its existing repository contract. The new C3E Player gateway uses a separate Player trading repository interface.

## Not included in this tranche

- Player Terminal account-selection or split-funding UI
- listing-currency read DTO cutover
- authoritative Banking account-read integration for the UI
- FX disclosure presentation
- checkpoint-manifest promotion
- merge or deployment

C3D remains the certified checkpoint until a later C3E certification tranche updates the authoritative checkpoint manifest with exact-head evidence.
