# Multi-Currency Stock Funding — C3E Execution Note v1

Status: **in progress; not certified**

Certified predecessor: C3D implementation `9b502b9ffa5e8aaf2f7c8d93d9cd3ccda3a10f15`.

## Authenticated Player trading gateway

The authenticated Player Stock trading gateway routes the certified C3 transaction sequence:

- `create_buy_quote` → `create_stock_buy_quote_v1`
- `settle_buy_quote` → `settle_stock_buy_quote_v1`
- `settle_sell` → `settle_stock_sell_v1`

For the immediate-buy Player Terminal path, `buy_now` is an API-level orchestration only: it creates the immutable C3B buy quote and immediately settles that exact quote through C3C. It does not introduce a new database settlement authority.

The legacy one-step Player order body remains retired after authentication with `410 stock_market_trading_retired`.

The gateway derives game and Player scope from the authenticated session, accepts public ticker and public evidence keys, rejects UUID/private-scope injection, validates one to three unique Checking-account funding allocations, preserves idempotency and certified conflict semantics, and returns private no-store responses.

The retained calendar-gated `executeOrder` adapter remains available for unrelated Stock runtime consumers through its existing repository contract. The C3E Player gateway uses a separate Player trading repository interface.

## Listing-currency and Banking read cutover

Player Stock asset reads now project the immutable `game_session_stock_assets.listing_currency_code` established by C3A. The public Stock DTO carries `listingCurrencyCode`; no session-local currency is substituted for Stock price authority.

The Player Terminal market route now loads the existing canonical Banking FX read model and uses its public `bac_*` Checking accounts for trade funding and proceeds destinations. It does not create a second Stock-owned balance source.

## Player Terminal funding UX

The legacy market/limit order ticket has been replaced for the C3E path:

- immediate buys use one to three canonical Checking accounts and target allocations in the Stock listing currency;
- immediate sells choose exactly one canonical Checking destination;
- displayed Stock prices, cost basis, position value, and gains use listing currency rather than the Player session currency;
- foreign-currency Checking selections disclose that conversion is resolved through the authoritative Banking FX boundary;
- the server revalidates price, tick, account ownership, available funds, holdings, market liquidity, and FX before settlement and fails closed on drift.

No margin, short selling, partial fills, queued orders, or limit orders were added.

## Remaining before C3E certification

- exact-head Backend and Player Terminal verification after this tranche;
- browser-level connected trade-flow proof;
- privacy/public-evidence regression proof across the final Player surface;
- deterministic architecture inventory refresh if required by the exact-head quality gate;
- durable C3E/C3F handoff and checkpoint promotion only after certification evidence exists.

No merge or deployment is authorized by this note. C3D remains the certified checkpoint until the authoritative checkpoint manifest is deliberately promoted with exact-head evidence.
