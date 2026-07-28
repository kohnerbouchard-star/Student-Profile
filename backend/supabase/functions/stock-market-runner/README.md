# Stock Market Runner

Backend-only Supabase Edge Function for applying one calculated stock market
tick to one game session.

## Request Contract

- Method: `POST`
- Required application identity: the project `sb_publishable_` key in `apikey`
- Required signing secret: `STOCK_MARKET_RUNNER_SECRET`, retained only by the
  scheduler and Edge runtime
- Required signature headers:
  - `x-econovaria-runner-timestamp`: ten-digit Unix timestamp in seconds
  - `x-econovaria-runner-nonce`: newly generated UUIDv4 for each invocation
  - `x-econovaria-runner-signature`: `v1=<base64url HMAC-SHA256>`
- Required JSON body:
  `{ "action": "run_tick", "gameSessionId": "<uuid>" }`
- Optional JSON body fields: `tickIndex`, `seed`

The canonical HMAC payload binds the runner name, timestamp, nonce, `POST`
method, exact project origin, exact function path and query, and SHA-256 digest
of the exact request body. The network boundary rejects the retired
`x-stock-market-runner-secret` transport, malformed signatures, requests
outside the bounded clock-skew window, oversized bodies, altered project or
route targets, and altered payloads.

After signature verification, the function claims a SHA-256 nonce digest
through the service-role-only `claim_internal_runner_nonce_v2` RPC before any
market mutation. A reused nonce is denied with
`internal_runner_replay_denied`; unavailable replay storage fails closed. Raw
nonces and signing secrets are not persisted.

The runner rejects request shapes that attempt multiple game sessions. If no
seed is supplied, it uses `stock-market-runner-v1:${gameSessionId}`.

## Runtime Behavior

The function creates a service-role Supabase client, verifies application
identity and the signed invocation, claims the replay nonce, then delegates
request handling to `stockMarketRunnerHttpHandler.ts`. The handler loads one
game session through `SupabaseStockMarketRunnerRepository`, calls the pure
`calculateNextStockMarketTick` engine exactly once, then persists the tick
through `apply_stock_market_runner_tick`.

The repository reads `game_sessions`, `game_session_stock_assets`,
`stock_price_ticks`, `stock_market_events`, `stock_market_regimes`,
`country_profiles`, and `country_economic_snapshots`. It writes only through
the RPC, which updates matching `game_session_stock_assets` rows and inserts
matching `stock_price_ticks` rows.

Duplicate protection happens before calculation and again inside the RPC for
`(game_session_id, stock_asset_id, tick_index)`. Invocation replay protection
is independent of market-tick idempotency: the HMAC nonce prevents reuse of a
signed HTTP request, while the market RPC prevents duplicate tick persistence.

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
market data. Connected isolated-staging replay, key-rotation, cleanup, and
zero-residue evidence remain release requirements.
