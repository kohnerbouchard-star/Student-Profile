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

## Future Phases

Future work should keep the calculation boundary intact:

- V2 schema work should persist game-session-scoped stock templates, copied
  session assets, price ticks, market events, and regimes without adding
  trading behavior yet.
- V3 runner work should load exactly one game session, call
  `calculateNextStockMarketTick` with explicit inputs, and persist the returned
  game-session-scoped rows/ticks in an orchestration layer outside this module.
- V5 trading execution should settle market BUY/SELL activity only after the
  read path is stable, and it must use ledger-safe transaction boundaries for
  cash, shares, idempotency, and audit records.

Future API handlers, persistence, scheduled tick orchestration, trading,
portfolios, analyst features, admin controls, and audit logs should call the
pure engine rather than moving calculation logic into routes, Supabase
functions, or frontend code.
