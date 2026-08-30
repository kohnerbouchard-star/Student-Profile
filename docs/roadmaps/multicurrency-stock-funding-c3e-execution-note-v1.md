# Multi-Currency Stock Funding — C3E Execution Note v1

Status: **in progress; not certified**

Certified predecessor: C3D implementation `9b502b9ffa5e8aaf2f7c8d93d9cd3ccda3a10f15`.

## Authenticated Player trading gateway

The authenticated Player Stock trading gateway routes the certified C3 transaction sequence:

- `create_buy_quote` → `create_stock_buy_quote_v1`
- `settle_buy_quote` → `settle_stock_buy_quote_v1`
- `settle_sell` → `settle_stock_sell_v1`

For the immediate-buy Player Terminal path, `buy_now` is an API-level orchestration only: it creates the immutable C3B buy quote and immediately settles that exact quote through C3C. It does not introduce a new database settlement authority. Dedicated gateway coverage asserts that the authenticated scope, one-to-three-account allocation, quote key, and request idempotency context flow from the C3B call into the C3C call without exposing internal UUIDs.

The retired one-step Player order body remains rejected after authentication with `410 stock_market_trading_retired`.

The gateway derives game and Player scope from the authenticated session, accepts public ticker and public evidence keys, rejects UUID/private-scope injection, validates one to three unique Checking-account funding allocations, preserves idempotency and certified conflict semantics, and returns private no-store responses.

The retained calendar-gated `executeOrder` adapter remains available for unrelated Stock runtime consumers through its existing repository contract. The C3E Player gateway uses a separate Player trading repository interface.

## Listing-currency and Banking read cutover

Player Stock asset reads now project the immutable `game_session_stock_assets.listing_currency_code` established by C3A. The public Stock DTO carries `listingCurrencyCode`; no session-local currency is substituted for Stock price authority.

The Player Terminal market route now loads the existing canonical Banking FX read model and uses its public `bac_*` Checking accounts for trade funding and proceeds destinations. It does not create a second Stock-owned balance source.

## Player Terminal funding UX

The previous market/limit order ticket has been replaced for the C3E path:

- immediate buys use one to three canonical Checking accounts and target allocations in the Stock listing currency;
- immediate sells choose exactly one canonical Checking destination;
- displayed Stock prices, cost basis, position value, and gains use listing currency rather than the Player session currency;
- foreign-currency Checking selections disclose that conversion is resolved through the authoritative Banking FX boundary;
- the server revalidates price, tick, account ownership, available funds, holdings, market liquidity, and FX before settlement and fails closed on drift.

No margin, short selling, partial fills, queued orders, or limit orders were added.

## Architecture ratchet reconciliation

The C3E source tranche initially increased the repository compatibility-marker inventory from the base ceiling of 209 to 213 through incidental compatibility terminology in three Stock test/input files and one retained Stock repository helper. Those names were removed without changing runtime behavior. Deterministic regeneration on the final source tree returns `compatibilityMarkerFiles: 209`, matching the base ceiling. The temporary inventory finalizer removed itself before generation and committed only the regenerated canonical inventory plus its own deletion.

## Certification candidate

The current candidate is the first human-triggered commit after deterministic inventory reconciliation. It exists only to trigger an exact-head verification matrix over the final source and inventory tree. C3E must remain **not certified** until the required Backend, Player Terminal, Stock funding, Banking FX, Database Replay, browser/privacy, architecture, timezone, security, and retained-stack checks complete successfully and durable handoff/checkpoint evidence is recorded.

## Remaining before C3E certification

- exact-head Backend and Player Terminal verification after this tranche;
- browser-level connected trade-flow proof;
- privacy/public-evidence regression proof across the final Player surface;
- exact-head deterministic architecture quality proof;
- durable C3E/C3F handoff and checkpoint promotion only after certification evidence exists.

No merge or deployment is authorized by this note. C3D remains the certified checkpoint until the authoritative checkpoint manifest is deliberately promoted with exact-head evidence.
