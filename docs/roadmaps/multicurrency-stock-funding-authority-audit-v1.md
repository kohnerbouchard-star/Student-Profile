# Multi-Currency Stock Market Funding Authority Audit v1

**Roadmap item:** `BUSINESS-V2-10A4C3`  
**Audit source:** `ba033ac4a7759d068233513431891fc9de3ae95a`  
**Audit date:** 2026-08-29  
**Status:** `RESOLVED_FOR_SCOPE`

## Purpose

This audit identifies the actual Financial Markets, Banking, funding, API, and Player UI authorities that C3 must preserve or replace. It is intentionally based on the clean C2 handoff rather than assumptions from older Stock plans.

## Resolved findings

### 1. The live execution model is immediate-fill only

The authoritative Stock schema defines:

- `stock_holdings`;
- `stock_orders`;
- `stock_trades`;
- one terminal fill or rejection per immediate market order;
- no live open-order state;
- no partial-fill state;
- no limit-order execution path;
- no order book;
- no queued time-in-force lifecycle.

The exchange-calendar wrapper rejects a new order while the market is closed and preserves replay of an already terminal order. C3 must retain that behavior and may not widen into an unbuilt order-book system.

### 2. Stock assets have issuer country but no listing currency

`stock_templates` and `game_session_stock_assets` carry `country_code` and authoritative prices, but neither table carries an authoritative listing-currency field. The Player UI consequently formats stock prices using the Player session currency rather than an asset-owned currency.

C3 must add one immutable listing currency per template/runtime asset and use it consistently in prices, orders, fills, holdings basis, proceeds, and display.

### 3. The current cash path is not compatible with C0/B2

The historical trading functions select a Player cash/checking projection, compare a single balance to gross value, and call `record_player_ledger_entry` directly. The currency has varied by migration generation between ECO and the Player’s assigned country currency.

This produces three defects for C3:

- no immutable stock listing currency;
- no one-to-three-account purchase funding;
- no named balanced monetary counterparty for buys or sells.

C3 must use C0 for buy funding and B2 balanced settlement for sell proceeds.

### 4. The public Player boundary is already mostly correct

The active Player trading handler:

- derives game and Player-session scope from the authenticated session token;
- accepts a public ticker rather than an internal stock UUID;
- resolves the stock asset server-side;
- rejects internal scope/UUID injection;
- requires an expected reviewed price;
- delegates execution to the Stock repository;
- returns a UUID-private public response.

C3 should preserve these boundaries while replacing the single-step buy command with quote/confirm funding and adding a public destination-account key for sells.

### 5. Price authority remains Financial Markets

`game_session_stock_assets.current_price` and append-only `stock_price_ticks` are the price authority. C0 may price currency conversion but must not price the security. A C3 buy quote must therefore bind both the exact current price and latest tick index. Settlement must reject a changed tick/price rather than apply hidden slippage.

### 6. The current synthetic market has no monetary counterparty

A buy directly debits the Player and creates/increases a holding. A sell directly credits the Player and reduces a holding. No canonical system account receives buy proceeds or funds sell proceeds.

C3 requires one named game/currency B2 system Checking account, `stocks.market-liquidity`, as the monetary counterparty for the retained synthetic immediate-fill model. The account must never go negative and must be initialized through a trusted, idempotent, audited path.

### 7. Holdings basis is not currency-qualified

`stock_holdings.average_cost` and realized P&L are numeric but do not identify the currency of the basis. New C3 holdings basis must be explicitly denominated in the asset listing currency. Existing holdings receive compatibility metadata tied to the backfilled asset listing currency; historical cash movements are not rewritten.

### 8. The Player UI currently overstates unsupported behavior

The Market page currently:

- formats every asset price in `session.currencyCode`;
- shows one aggregate available-Checking amount;
- offers a limit-order selector even though the flow intentionally sends no limit order;
- estimates a 0.25% fee that the current Stock settlement does not charge;
- submits one immediate order without account allocation or an immutable funding quote.

C3 must display listing currency, provide one-to-three Checking-account allocation for buys, provide one same-currency destination account for sells, and remove or explicitly disable unsupported fee/limit-order implications.

### 9. Portfolio aggregation becomes a multi-currency concern

Once securities retain distinct listing currencies, total portfolio cost/value/P&L cannot be summed without either:

- per-currency subtotals; or
- a separately labeled read-only valuation conversion using accepted B1 fixing evidence.

C3 will not silently reinterpret all assets in the Player home currency.

## Observed authority inventory

| Area | Current authority | C3 action |
|---|---|---|
| Runtime asset and price | `game_session_stock_assets`, `stock_price_ticks` | Preserve; add immutable listing currency and public DTO support |
| Trading calendar | `is_stock_market_open_at`, `execute_stock_market_order_calendar_gated`, game timezone/calendar services | Preserve unchanged |
| Orders and fills | `stock_orders`, `stock_trades` | Preserve identity and immediate-fill model; add C3 evidence family |
| Holdings | `stock_holdings` | Preserve quantity/P&L authority; add basis currency and C3 atomic settlement |
| Buy cash | legacy `account_balances` + `record_player_ledger_entry` | Retire from active C3 buys; use C0 funding quote/composer |
| Sell cash | legacy direct Player ledger credit | Retire from active C3 sells; use balanced B2 market-liquidity transfer |
| Player API | ticker-based authenticated Player Stock handler/repository | Preserve scope/privacy; split buy quote from confirm and add sell destination |
| Player UI | Market page and `market-order-flow.js` | Replace session-currency display and single-account estimate with authoritative listing-currency workflow |
| Limit orders | UI-only pending state | Explicitly excluded from C3 |
| Trading fee | UI estimate only | Remove; no fee is created by C3 |

## Source inventory reviewed

- `backend/supabase/migrations/20260623093000_add_stock_market_schema_foundation_v1.sql`
- `backend/supabase/migrations/20260623123000_add_stock_market_trading_foundation_v1.sql`
- `backend/supabase/migrations/20260624130000_stock_country_cash_currency_v1.sql`
- `backend/supabase/migrations/20260719120000_add_stock_exchange_calendar_runtime_v1.sql`
- `backend/src/domains/stocks/README.md`
- `backend/src/domains/stocks/api/playerStockMarketTradingHttpHandler.ts`
- `backend/src/domains/stocks/contracts/playerStockAssetListContracts.ts`
- `backend/src/domains/stocks/contracts/stockMarketTradingContracts.ts`
- `backend/src/domains/stocks/infrastructure/supabaseStockMarketTradingRepository.ts`
- `player-terminal/src/pages/market-page.js`
- `player-terminal/src/features/market/market-order-flow.js`

The wider Stock domain contains runner, seed/copy, read, watchlist, portfolio, calendar, Story-shock, and Player public-boundary code. Those remain retained regression surfaces; they are not C3 monetary authorities.

## Risks requiring explicit implementation proof

1. Backfilling listing currency must be deterministic for every existing template/runtime asset and must fail closed on an unresolved issuer country.
2. Existing holding basis metadata is compatibility interpretation, not a rewrite of historical money.
3. Market-liquidity initialization must not create an unbounded money faucet.
4. Buy settlement must lock Stock price roots before C0/B2 account roots without violating canonical B2 account ordering.
5. Sell settlement must avoid a holdings/account deadlock when concurrent buy and sell commands target the same Player and asset.
6. Price ticks may advance between quote and settlement; exact-tick rejection and replay ordering must be proved.
7. Portfolio valuation must not add amounts from unlike currencies without visible conversion evidence.
8. The current public DTO and UI use `cash`/single-balance compatibility shapes. C3 must migrate them without exposing internal account IDs or UUIDs.

## Audit conclusion

C3 can proceed as an immediate-market-order funding cutover. It must not be described or implemented as an order-book project. The first implementation tranche is C3A: listing-currency authority, evidence-family schema, market-liquidity account identity, and legacy/current compatibility constraints. No active buy or sell path changes are authorized until C3A replay and contract checks pass.
