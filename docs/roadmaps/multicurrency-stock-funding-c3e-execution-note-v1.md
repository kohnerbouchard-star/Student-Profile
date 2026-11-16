# Multi-Currency Stock Funding — C3E Execution Note v1

Status: **certified as part of C3F at exact implementation `058162d7b9688809e885d9e6fe77ed42978c7a03`; not merged**

Certified predecessor: C3D implementation `9b502b9ffa5e8aaf2f7c8d93d9cd3ccda3a10f15`.

## Authenticated Player trading gateway

The authenticated Player Stock trading gateway routes the certified C3 transaction sequence:

- `create_buy_quote` → `create_stock_buy_quote_v1`
- `settle_buy_quote` → `settle_stock_buy_quote_v1`
- `settle_sell` → `settle_stock_sell_v1`

The Player Terminal now uses the explicit C3B → C3C sequence. A buy form creates an immutable quote first; settlement is a separate confirmation action that submits only the public `sbq_*` quote key. The retained `buy_now` gateway action remains an API-level orchestration for non-Terminal consumers and introduces no new database settlement authority.

The retired one-step Player order body remains rejected after authentication with `410 stock_market_trading_retired`.

The gateway derives game and Player scope from the authenticated session, accepts public ticker and public evidence keys, rejects UUID/private-scope injection, validates one to three unique Checking-account funding allocations, preserves idempotency and certified conflict semantics, and returns private no-store responses.

The retained calendar-gated `executeOrder` adapter remains available for unrelated Stock runtime consumers through its existing repository contract. The C3E Player gateway uses a separate Player trading repository interface.

## Listing-currency and Banking read cutover

Player Stock asset reads project the immutable `game_session_stock_assets.listing_currency_code` established by C3A. The public Stock DTO carries `listingCurrencyCode`; no session-local currency is substituted for Stock price authority.

The Player Terminal market route loads the existing canonical Banking FX read model and uses its public `bac_*` Checking accounts for trade funding and proceeds destinations. It does not create a second Stock-owned balance source.

## Player Terminal funding and settlement UX

The previous market/limit order ticket has been replaced for the C3E path:

- immediate buys use one to three canonical Checking accounts and target allocations in the Stock listing currency;
- the ticket displays estimated gross, funded total, and remaining total before quote creation;
- the immutable quote review shows the public quote key, locked price, gross value, funding evidence, FX disclosure, price tick, and expiry before settlement can be authorized;
- expired quotes are visibly non-executable;
- immediate sells choose exactly one canonical Checking destination and require a proceeds review before settlement;
- sell ownership checks use the authoritative Portfolio holdings resource rather than a legacy Market-owned position value;
- successful buys and sells show immutable public-key receipts, replay status, execution evidence, resulting holdings, and the selected destination or quote key;
- committed settlements remain successful when the post-write resource refresh fails, with a visible refresh-pending warning;
- displayed Stock prices, cost basis, position value, and gains use listing currency rather than the Player session currency;
- foreign-currency Checking selections disclose that conversion is resolved through the authoritative Banking FX boundary;
- the server revalidates price, tick, account ownership, available funds, holdings, market liquidity, and FX before settlement and fails closed on drift.

No margin, short selling, partial fills, queued orders, or limit orders were added.

## Connected request and privacy boundary

The Student-Profile adapter now maps the Player actions to the exact public request bodies expected by `/players/me/stocks/orders`:

- quote creation sends public ticker, quantity, expected price/tick, one-to-three public `bac_*` allocations, and the idempotency key;
- quote settlement sends only `action`, the public `sbq_*` quote key, and the idempotency key;
- sell settlement sends public ticker/evidence, one public destination `bac_*` key, and the idempotency key.

No game, Player, Player-session, Stock-asset, or bank-account UUID is accepted from the browser. The existing HttpOnly cookie session, CSRF header, same-origin request boundary, and private no-store response behavior remain intact.

## Verification bound to the permanent workflow

The permanent `multicurrency-stock-funding-v1` workflow triggers on the C3E Player controller, request adapter, payload normalizer, page, and focused regression tests. Its source job explicitly runs:

- Stock funding payload normalization and allocation rejection;
- immutable quote, expiry, sale review, receipt, and refresh behavior;
- Portfolio-to-Market holdings reconciliation;
- connected Student-Profile quote, buy-settlement, and sell-settlement request bodies;
- retained C3A/C3B/C3C/C3D source, migration, backend typecheck, and architecture contracts.

The temporary source-export workflow was removed because it was outside PR #676's exact path authority.

## Architecture ratchet reconciliation

Deterministic regeneration remains at `compatibilityMarkerFiles: 209`, matching the base ceiling. No new persistence authority, cross-domain infrastructure dependency, direct browser database access, direct balance mutation, or direct inventory mutation was introduced.

## Certification result

C3E is certified as part of `BUSINESS-V2-10A4C3F` at immutable implementation source `058162d7b9688809e885d9e6fe77ed42978c7a03`. That exact source passed the permanent Stock gate and every pull-request-triggered workflow returned for the head: 27 completed runs and 27 successful conclusions, including Backend, Player Terminal, Banking FX, Database Replay, browser/privacy, architecture, timezone, security, and retained-stack coverage.

The durable C3 implementation handoff and authoritative checkpoint manifest pin the permanent workflow and job evidence. Later documentation or controller commits do not replace the tested implementation identity. C3D remains the certified predecessor; C3F is the current development checkpoint.

No merge or deployment is authorized by this note.
