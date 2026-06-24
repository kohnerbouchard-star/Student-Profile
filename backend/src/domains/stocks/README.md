# Stocks Domain

The stocks domain owns stock assets, deterministic price calculations, price tick
outputs, and future stock-market workflows for each game session.

## V1 Calculation Engine

V1 exposes one pure calculation entrypoint:

```ts
calculateNextStockMarketTick(input: StockMarketEngineInput): StockMarketEngineResult
```

The engine lives in `calculations/stockMarketEngine.ts` and has no route,
database, Supabase, migration, trading, portfolio, ledger, reservation, network,
or real-market-data dependency. It calculates the next tick from explicit input
only, so the same game session, seed, tick index, and asset state always produce
the same result.

## Source Documents

- `docs/research/stock-market-simulation-models-v1.md` defines the V1 model
  direction: deterministic log-return movement, bounded ticks, factor
  decomposition, volatility memory, shocks, and frontend-compatible output rows.
- `docs/worldbuilding/econovaria-country-lore-v1.md` is the official country
  exposure source of truth. The engine recognizes only the ten official
  countries and maps their lore into deterministic exposure profiles:
  Northreach/Frostgate, Yrethia/Sableport, Thaloris/Dusk Harbor,
  Solvend/Aurora Spire, Eldoran/Crescent Bay, Valerion/Glassfall,
  Lumenor/Starfall, Syndalis/Blacklight, Xalvoria/Emberhall, and
  Dravenlok/Ironhold.

## Engine Inputs

The engine accepts game-session-scoped inputs for:

- assets, including ticker, sector, country, current price, beta, liquidity,
  volatility, optional history, optional fundamentals, and optional country or
  sector exposure overlays
- macro conditions such as growth, inflation, interest rates, confidence,
  market risk, stability, infrastructure, energy security, and global demand
- optional country and sector factors
- optional global, country, sector, and ticker shocks
- optional market regime and engine settings

Every nested runtime input that has a `gameSessionId` must match the top-level
`gameSessionId`, otherwise the engine throws before calculating.

## Engine Outputs

The result includes:

- frontend-compatible market rows for snapshot and market normalizers
- durable price tick records ready for a later persistence layer
- student-facing movement explanations with component breakdowns that teachers
  can also use when discussing why a stock moved
- deterministic synthetic timestamps such as `tick-12`
- the same `gameSessionId` on all runtime outputs

## V2 Schema Foundation

V2 adds the database foundation for market data without adding routes, runner
logic, frontend integration, trading execution, portfolio accounting, or ledger
writes.

The schema separates global reference data from runtime game data:

- `stock_templates` stores reusable global stock templates that can seed a
  game. Templates do not contain live prices for a classroom session.
- `game_session_stock_assets` stores the authoritative runtime stocks for one
  game session. A ticker such as `FROSTMIN` in two different games is stored as
  two separate runtime assets.
- `stock_price_ticks` stores append-only per-game, per-asset tick history that a
  future runner can write after calling `calculateNextStockMarketTick`.
- `stock_market_events` stores game-session-scoped shocks/events for a future
  runner to pass into the engine.
- `stock_market_regimes` stores game-session-scoped market regime state or
  schedule inputs.

Every runtime table includes `game_session_id`. Future frontend read integration
should read market rows/ticks from backend-owned runtime data. Future trading
execution must settle through ledger-safe transaction boundaries for cash,
shares, idempotency, fills, reservations, and audit records.

## V3 Backend Runner

V3 adds a backend-only Supabase Edge Function at
`supabase/functions/stock-market-runner`. It accepts only `POST`, requires
`STOCK_MARKET_RUNNER_SECRET`, and validates the matching
`x-stock-market-runner-secret` request header before doing any work.

Each request processes exactly one `gameSessionId`. The runner loads the
current per-game stock state, derives a tick index from
`stock_price_ticks` when one is not supplied, calls the pure
`calculateNextStockMarketTick` engine once, and persists the result through
the atomic `apply_stock_market_runner_tick` RPC. The default seed is
`stock-market-runner-v1:${gameSessionId}`.

The runner reads:

- `game_sessions`
- active `game_session_stock_assets`
- existing `stock_price_ticks` for duplicate and next-tick checks
- active `stock_market_events`
- active `stock_market_regimes`
- `country_profiles`
- latest represented-country `country_economic_snapshots`

The runner writes:

- updated runtime state on matching `game_session_stock_assets`
- append-only rows in `stock_price_ticks`

The RPC rejects duplicate `(game_session_id, stock_asset_id, tick_index)` rows
and validates that all asset updates and tick rows belong to the requested game
session before updating or inserting anything.

For V3 macro input, the runner does not default to neutral macro when country
snapshots exist. It loads the latest `country_economic_snapshots` for countries
represented by active stock assets, maps each latest snapshot into a
`StockMarketCountryInput`, and builds `StockMarketMacroInput` by equal-weight
averaging those snapshots. `globalDemandIndex` uses the V3 proxy average of
consumer confidence, business confidence, and export strength converted onto the confidence-index scale. If no country
snapshots exist for active stock countries, V3 falls back to neutral macro
`{ gameSessionId }` and passes `countries: []`.

V3 intentionally keeps `sectors: []` because there is no canonical runtime
stock-sector table yet. It does not seed stock assets, update templates, touch
`classroom-api`, expose student-facing writes, call real market APIs, or add
trading, portfolio, order, fill, reservation, ledger, analyst, or admin-control
behavior.

## V3.5 Seed/Copy Foundation

V3.5 adds fictional default `stock_templates` and a trusted backend-only seed
copy path for initializing one game session before runner ticks or read-only
market display.

The `initialize_stock_market_assets_for_game` RPC copies active templates into
`game_session_stock_assets` for one `gameSessionId`. It supports only
`missing_only` and `reset_empty_only`, never deletes existing assets, never
overwrites existing assets, and creates `tick_index = 0` baseline
`stock_price_ticks` for newly inserted assets only. Baseline ticks use template
base price for both `price` and `previous_price`, `log_return = 0`,
`change_pct = 0`, `volume = 0`, and an initialization explanation JSON object.

The seed/copy Edge Function lives at
`supabase/functions/stock-market-seed-copy`, accepts only `POST`, uses
`STOCK_MARKET_RUNNER_SECRET` plus `x-stock-market-runner-secret`, and does not
schedule itself. One request initializes or tops up one game session.

The seed/copy RPC is `SECURITY DEFINER`, uses a fixed `search_path`, revokes
public execution, and grants execute only to `service_role`.

## V4 Read-Only Market Data

V4 adds a backend-only read endpoint at `supabase/functions/stock-market-read`.
It accepts only `POST`, uses the same backend secret pattern, and performs no
writes.

Board requests read active `game_session_stock_assets` for the requested game
session and include the latest tick volume from `stock_price_ticks`. Ticker
requests return the requested stock plus history from `stock_price_ticks`, which
is the authoritative graph-history source. `game_session_stock_assets.chart_history`
may remain a small cached sparkline, but V4 read history does not depend on it.

If no stocks exist for the requested game session, the read endpoint returns
`ok: true`, an empty `stocks` array, and an `emptyState` with reason
`stock_market_not_initialized` and recommended action `run_stock_market_seed_copy`.

## V5 Trading Foundation

V5 adds backend-only stock trading infrastructure at
`supabase/functions/stock-market-trading`. It accepts only `POST`, uses
`STOCK_MARKET_RUNNER_SECRET` plus `x-stock-market-runner-secret`, and processes
one `gameSessionId` and one `playerSessionId` per request.

V5 adds actual-cash market order execution and share accounting:

- `stock_holdings` stores per-player, per-runtime-stock share quantity,
  reserved quantity, average cost, and realized P&L metadata.
- `stock_orders` records market orders, filled or rejected outcomes, and the
  idempotency key used to prevent duplicate execution on retries.
- `stock_trades` records one immediate fill per filled order.
- `ledger_entries` remains the append-only cash movement source of truth.
- `account_balances` remains the projected player cash balance table.

The `execute_stock_market_order` RPC validates the game session, player session,
active runtime stock asset, side, quantity, and idempotency key. It supports
market orders only. Buys fill at
`game_session_stock_assets.current_price`, require enough real player cash in
`account_balances` for `account_type = 'cash'` and `currency_code = 'ECO'`,
debit cash through `record_player_ledger_entry`, increase holdings, and update
weighted average cost. Sells require owned shares, prevent short selling, credit
real player cash through `record_player_ledger_entry`, reduce holdings, and
update realized P&L metadata.

Idempotency is scoped by `(game_session_id, player_session_id, idempotency_key)`.
If a request is retried with the same key, the RPC returns the stored order
result without executing another ledger, account balance, holding, order, or
trade write. Filled orders create exactly one `stock_trades` row.

The trading RPC is `SECURITY DEFINER`, uses fixed `search_path`, revokes public
execution, and grants execute only to `service_role`. Cross-game leakage is
guarded by explicit `game_session_id` filters, runtime-stock composite foreign
keys, player-session membership validation, and ledger writes scoped to the
resolved `player_id`.

V5 intentionally does not add limit orders, partial fills, short selling,
fees, reservations, order books, trading reads, UI, scheduler/cron behavior,
real-world financial APIs, store purchase writes, inventory writes, or a
separate stock wallet. Advanced order types are deferred because they require a
separate lifecycle for open orders, cash/share reservation, release-on-cancel,
tick-time execution, partial fills, and expiry. Future read endpoints can expose
holdings, orders, trades, and cash snapshots after the backend trading boundary
is stable.

## V6 Player Portfolio Reads

V6 adds a backend-only player stock read endpoint at
`supabase/functions/stock-market-player-read`. It accepts only `POST`, uses
`STOCK_MARKET_RUNNER_SECRET` plus `x-stock-market-runner-secret`, and performs
no writes.

Each request contains exactly one `gameSessionId`, one `playerSessionId`, and
one action:

- `read_portfolio`
- `read_holdings`
- `read_orders`
- `read_trades`

The endpoint resolves the player from the active `player_sessions` row for the
requested game session. The session must be active, not revoked, and not
expired. Cash and holdings are read for the resolved player and requested game;
orders and trades are read newest-first for the requested player session and
game. History limits are bounded by the handler.

V6 reads:

- `player_sessions`
- `account_balances`
- `stock_holdings`
- `stock_orders`
- `stock_trades`
- `game_session_stock_assets`

Portfolio and holdings responses include current cash, holding rows enriched
with runtime stock metadata, market value, cost basis, unrealized P&L,
unrealized P&L percentage, realized P&L, and summary totals. Order and trade
responses expose the stored market-order and fill records from V5.

V6 intentionally does not insert, update, delete, execute trades, write ledger
entries, widen RLS policies, add frontend UI, add scheduler behavior, add order
books, add reservations, add advanced order types, or call real-world financial
APIs.

## Future Phases

Future work should keep the calculation boundary intact:

- Frontend/admin wiring should let trusted staff initialize one game session and
  display the read-only market board without adding student stock writes.
- Frontend/player wiring can consume the V6 player read endpoint after the
  backend-only secret boundary is replaced or mediated by an appropriate
  student-safe access layer.

Future API handlers, persistence, scheduled tick orchestration, trading,
analyst features, admin controls, and audit logs should call the
pure engine rather than moving calculation logic into routes, Supabase
functions, or frontend code.
