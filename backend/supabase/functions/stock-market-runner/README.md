# Stock Market Runner

Backend-only Supabase Edge Function for applying one calculated stock market
tick to one game session.

## Request Contract

- Method: `POST`
- Required environment secret: `STOCK_MARKET_RUNNER_SECRET`
- Required request header: `x-stock-market-runner-secret`
- Required JSON body: `{ "gameSessionId": "<uuid>" }`
- Optional JSON body fields: `tickIndex`, `seed`

The runner rejects request shapes that attempt multiple game sessions. If no
seed is supplied, it uses `stock-market-runner-v1:${gameSessionId}`.

## Runtime Behavior

The function creates a service-role Supabase client, delegates request handling
to `stockMarketRunnerHttpHandler.ts`, loads one game session through
`SupabaseStockMarketRunnerRepository`, calls the pure
`calculateNextStockMarketTick` engine exactly once, then persists the tick
through `apply_stock_market_runner_tick`.

The repository reads `game_sessions`, `game_session_stock_assets`,
`stock_price_ticks`, `stock_market_events`, `stock_market_regimes`,
`country_profiles`, and `country_economic_snapshots`. It writes only through
the RPC, which updates matching `game_session_stock_assets` rows and inserts
matching `stock_price_ticks` rows.

Duplicate protection happens before calculation and again inside the RPC for
`(game_session_id, stock_asset_id, tick_index)`.

## Country Macro Mapping

For V3, active stock asset country codes are joined through
`country_profiles.country_code` to the latest `country_economic_snapshots` in
the same game session. Latest means highest `snapshot_sequence`; ties use the
latest `effective_at`.

Each latest country snapshot becomes one `StockMarketCountryInput`. The broad
`StockMarketMacroInput` is an equal-weight average of represented-country
snapshots. `globalDemandIndex` is the average of consumer confidence, business
confidence, and export strength across included snapshots.

If no represented-country snapshots exist, the runner falls back to neutral
macro `{ gameSessionId }` and passes `countries: []`.

## Deferred Scope

This function does not touch `classroom-api`, frontend code, stock templates,
trading, portfolios, player holdings, orders, fills, reservations, ledgers,
analyst controls, admin controls, public student writes, real APIs, or real
market data. V4 should add read-only market data surfaces before any V5 trading
execution work.
