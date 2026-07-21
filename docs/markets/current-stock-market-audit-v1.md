# Current Stock Market Runtime Audit V1

**Expansion authority:** `FULL_FINANCIAL_MARKETS_EXPANSION`  
**Audit source:** merged `main` at `6ced5aa36e60dfbd82620463f4f4bf6f56a349dd`  
**Draft authority:** PR #305  
**Status:** `REVIEWED_TARGET_ARCHITECTURE_REQUIRED_BEFORE_MIGRATIONS`

## Executive finding

The repository has a coherent, bounded stock runtime. Its deterministic factor engine, game/session isolation, ledger settlement, service-role mutation boundary, public ticker boundary, calendar gate, idempotency strategy, and append-only tick/trade history are reusable design precedents.

The database and most DTOs are explicitly stock-specific. `stock_templates`, `game_session_stock_assets`, `stock_price_ticks`, `stock_holdings`, `stock_orders`, and `stock_trades` cannot safely become the canonical multi-asset model through incremental nullable columns. Bonds, funds, indexes, trusts, commodities, preferred/convertible equity, issuer statements, yield curves, coupon schedules, reservations, partial fills, fees, listings, and exchange-specific rules require a new canonical financial-market domain with compatibility adapters for the bounded stock runtime.

## Active market tables

### Global reference

| Table | Current role | Expansion disposition |
|---|---|---|
| `stock_templates` | Reusable stock-only templates with ticker, company name, sector, country, base price, beta, liquidity, volatility, shares, and JSON exposures | Preserve for bounded beta compatibility. Do not add non-stock types. New instruments use canonical `financial_instrument_definitions` after controller migration reservation. |

### Game runtime

| Table | Current role | Expansion disposition |
|---|---|---|
| `game_session_stock_assets` | Per-game stock identity and live quote state | Preserve as bounded stock compatibility projection. New canonical listing/runtime state must support all asset classes. |
| `stock_price_ticks` | Append-only stock tick history | Preserve. New quote/tick history must reference canonical listings/instruments and support benchmark values as well as tradable prices. |
| `stock_market_events` | Game-scoped global/country/sector/ticker shocks plus public market-news metadata | Reuse through a versioned public event adapter. Do not couple new issuer/benchmark state directly to World tables. |
| `stock_market_regimes` | Game-scoped bull/bear/sideways/crisis/recovery/sector-rotation parameters | Generalize conceptually into market-regime inputs; preserve existing stock records. |
| `player_stock_watchlist` | Server-managed player watchlist resolved from public ticker to internal stock UUID | Preserve and adapt through a canonical instrument watchlist only after shared-route convergence. |

### Trading and ownership

| Table | Current role | Expansion disposition |
|---|---|---|
| `stock_holdings` | Per-player stock quantity, reserved quantity, average cost, and realized P&L | `reserved_quantity` is a useful invariant but no open-order lifecycle currently exercises it. Do not overload this table for bonds/funds/trusts. |
| `stock_orders` | Immediate stock market orders, terminal `filled` or `rejected` status, stock UUID, requested/execution price, gross value, idempotency result snapshot | Preserve for compatibility. Canonical orders require public order IDs, open states, reservation references, expiry, cumulative fills, fees, exchange/listing identity, and stale quote version. |
| `stock_trades` | Exactly one immediate fill per filled stock order | Preserve. Canonical fills must allow one or more fills only after reservation correctness is proven. |
| `ledger_entries` | Shared append-only cash movement source of truth | Reuse. All instrument settlement, coupon, maturity, fees, default recovery, conversion, and correction cash effects must post through reviewed ledger operations. |
| `account_balances` | Shared projected cash balances by game/player/account/currency | Reuse with row locking and country-currency rules. No separate market wallet. |

## Asset identity model

Current stock identity has three layers:

1. global internal UUID in `stock_templates`;
2. per-game internal UUID in `game_session_stock_assets`;
3. ticker as the player-facing identifier.

The public boundary introduced by the merged Player market reconciliation resolves ticker server-side and rejects UUID injection. This is correct for the bounded stock surface.

Expansion requirements exceed a ticker-only identity:

- every issuer, exchange, listing, instrument, benchmark, commodity, fund, trust, bond, index, order, fill, trade, and corporate action needs a stable public identifier;
- a ticker is unique only within an exchange, not globally;
- one instrument may have multiple listings;
- non-listed instruments and reference benchmarks may not have a ticker;
- internal UUIDs remain database-only.

Target rule: public APIs identify a listing with `listingPublicId` and an instrument with `instrumentPublicId`; display symbols are metadata, never authorization or database ownership keys.

## Existing order lifecycle

Current lifecycle:

`validated request → calendar/game/session/asset checks → idempotency lock → cash/holding row lock → immediate current-price execution → ledger movement → holding update → terminal order → one trade`

Supported:

- market buy;
- market sell;
- immediate full fill;
- idempotent retry;
- stale expected-price rejection at the Player boundary;
- exchange-hours rejection;
- insufficient cash/shares rejection;
- short-selling prohibition;
- game/player/session scoping.

Not supported:

- open orders;
- limit price persistence;
- cash reservation;
- asset reservation lifecycle;
- cancellation;
- expiry;
- fill-at-tick;
- multiple/partial fills;
- fee lines;
- settlement delay;
- suspension/delisting order handling;
- instrument-specific quantity/price increments.

## Holdings and Portfolio

Current Portfolio reads derive:

- country-currency cash;
- stock quantity and average cost;
- current stock price;
- market value;
- cost basis;
- unrealized and realized P&L;
- aggregate totals;
- terminal order and trade history.

The read repository resolves the authenticated player from the active `x-player-session-token`, derives game/player scope server-side, and emits player-safe DTOs without internal UUIDs on the current preferred route. Legacy query-scoped reads remain compatibility paths.

Expansion Portfolio must add asset-class grouping, accrued bond interest, clean/dirty value, fund NAV and market value, benchmark/reference display, preferred/convertible state, coupon/maturity cash-flow history, fee attribution, and valuation timestamps/versions.

## Cash settlement

Current stock settlement is atomic inside a service-role RPC and posts through `record_player_ledger_entry`. It uses the player country currency rather than a separate stock wallet. Row locking and idempotency prevent duplicate immediate executions.

Reusable invariants:

- ledger is authoritative;
- balances are projections;
- game/player/currency scope is server-derived;
- economic amount is computed server-side;
- every retry returns the stored terminal result;
- no browser-supplied settlement amount is trusted.

Required extension:

- reserved cash must be excluded from available cash without becoming a debit before fill;
- reservation release must be exactly once;
- fees, coupons, redemption, recovery, and conversion must use distinct idempotent ledger operation classes;
- open orders must not reuse the terminal immediate-order idempotency shape.

## Deterministic price-tick engine

The pure stock engine consumes explicit game-scoped asset state, macro/country/sector factors, shocks, regime, settings, seed, and tick index. It produces deterministic rows, append-ready ticks, and student-facing factor explanations.

Reusable abstractions:

- seeded deterministic noise;
- bounded return movement;
- factor decomposition;
- volatility mean reversion;
- liquidity damping;
- event/regime inputs;
- deterministic explanation output;
- one authoritative tick index;
- pure calculation separated from persistence and routes.

Stock-specific assumptions requiring adapters or replacement:

- every asset has a company name;
- every output row is a `Stock`;
- market cap and shares outstanding are universal;
- one spot price and equity-style beta drive all assets;
- all shocks target global/country/sector/ticker only;
- no yield, duration, accrued interest, NAV, divisor, constituent, conversion, coupon, default, or recovery model.

## Market calendar and exchange hours

Current authoritative calendar:

- game-configured IANA timezone, with existing games migrated to `Asia/Seoul`;
- Monday–Friday;
- 08:00 inclusive to 17:00 exclusive;
- ten fictional exchange codes in the domain contract;
- versioned holiday and early-close representation;
- runner and immediate-order gates fail closed;
- existing terminal idempotent replay remains readable after close.

Expansion requires per-exchange policy versions, holiday calendars, suspension/delisting status, minimum quantity, quantity increment, price increment, settlement convention, and instrument-specific trading eligibility. Browser time remains prohibited.

## Market regimes and event shocks

`stock_market_regimes` supports bull, bear, sideways, crisis, recovery, and sector rotation with bounded drift/volatility/news/volume parameters.

`stock_market_events` supports global, country, sector, and ticker shocks and carries public news metadata. This is sufficient as an inbound versioned event seam but not as the issuer master or instrument exposure store.

Target architecture must map public World/Business events into immutable market-event commands, then evaluate versioned issuer/instrument/benchmark exposure rules. No direct reads from World or Business internal tables.

## Watchlists

`player_stock_watchlist` is correctly server-managed, game/player/asset scoped, RLS-forced, and inaccessible to browser roles. Insert validation requires an active player and active same-game stock asset.

Expansion should use a canonical instrument/listing watchlist with stable public IDs. Existing stock watchlist data remains intact and can be projected through a compatibility adapter.

## Ledger integration

The stock runtime correctly avoids a separate stock cash balance. Buy/sell settlement uses shared ledger and balance tables.

New economic operations need unique audited operation classes:

- order cash reserve/release;
- trade settlement;
- exchange/transaction fee;
- coupon payment;
- maturity redemption;
- default recovery;
- preferred dividend;
- conversion cash-in-lieu only if separately approved;
- fund/trust distribution;
- bounded Admin correction.

No operation may silently rewrite prior ledger history.

## Rate limits

Merged Player market work publishes central rate-limit operations for Portfolio reads and market-order writes. The Player route rejects runner-secret headers and relies on the shared player-session boundary.

Expansion must add distinct centrally dispatched limits for:

- instrument/issuer/statement/detail reads;
- open-order reads;
- order submission;
- cancellation;
- Admin activation/configuration;
- issuer/bond/fund/index corrections;
- protected processors for tick, coupon, maturity, rebalance, expiry, fill, and credit events.

Shared dispatcher files remain blocked until the current beta serial sequence and controller collision rules permit additive reconciliation.

## `classroom-api` publication

Current Player publication is additive through `classroom-api`. The preferred merged public routes are:

- `GET /players/me/stocks/portfolio`;
- `POST /players/me/stocks/orders`.

Legacy holdings/orders/trades repository actions exist behind the domain read service. The public route parser rejects malformed suffixes and the Player boundary derives session/game scope from the authenticated token.

Expansion routes must use stable public IDs and must not place game, player, session, issuer, instrument, listing, order, fill, or trade UUIDs in URLs or payloads.

## Admin routes

The current stock foundation has trusted runner, seed-copy, read, and trading Edge Functions plus bounded Admin-compatible market controls elsewhere in the repository. It does not provide a canonical issuer/instrument/bond/fund/index review console, exchange-rule editor, credit-event workflow, suspension/delisting workflow, or auditable market correction model.

Admin expansion must be additive through `admin-api` after shared-file synchronization. No Admin operation may mutate historical ticks, fills, statements, coupon payments, maturity events, or ledger rows in place.

## Player routes and UI

The accepted Player Terminal includes stock market and Portfolio integration, ticker-based order confirmation, stale-price handling, committed-success behavior, and responsive recovery states. The expansion must preserve the accepted shell and add asset-class-specific details without redesign.

Required new states include loading, empty, stale, offline, unavailable, validation error, reservation pending, open, partially filled, filled, cancelled, expired, rejected, and committed-success.

## Current simulations and tests

Existing tests cover:

- deterministic engine equality and seed variation;
- ten-country exposure recognition;
- supported sectors;
- bounded price movement and volatility;
- game/session mismatch rejection;
- runner repository and HTTP behavior;
- seed/copy idempotency;
- board and tick history reads;
- immediate buy/sell and ledger settlement;
- insufficient cash/shares;
- short-selling denial;
- duplicate order replay;
- Player public route privacy and UUID injection denial;
- stale price;
- closed/paused/ended game behavior;
- calendar/timezone behavior;
- Player order/Portfolio UI behavior;
- protected tick trigger behavior.

Missing expansion simulations include cross-asset returns, bond cash flows, yield curves, credit migration/default/recovery, fund/index rebalance, benchmark continuity, open-order concurrency, reservation release, partial fills, fees, concentration, arbitrage, load, and wealth-distribution effects.

## Current stock migrations

The active stock migration family includes:

- `20260623093000_add_stock_market_schema_foundation_v1`;
- `20260623103000_add_stock_market_runner_apply_rpc_v1`;
- `20260623113000_seed_default_stock_templates_v1`;
- `20260623114000_add_stock_market_seed_copy_rpc_v1`;
- `20260623115000_add_stock_market_latest_ticks_read_rpc_v1`;
- `20260623123000_add_stock_market_trading_foundation_v1`;
- `20260623123500_harden_stock_market_trading_active_session_v1`;
- `20260623124500_fix_stock_market_seed_copy_ambiguous_columns_v1`;
- `20260623125000_fix_country_snapshot_initializer_conflict_v1`;
- `20260623125500_fix_country_snapshot_default_baseline_v1`;
- `20260624130000_stock_country_cash_currency_v1`;
- `20260624131500_fix_stock_market_order_country_cash_rpc_v1`;
- `20260624132500_drop_unused_stock_order_rpc_v1`;
- `20260625103000_extend_stock_market_events_news_metadata_v1`;
- `20260718064000_add_player_stock_watchlist_v1`;
- `20260719120000_add_stock_exchange_calendar_runtime_v1`;
- `20260719133000_require_stock_market_timezone_v1`.

The expansion will add only new forward migrations in a controller-reserved range. None are created in the audit tranche.

## Security boundaries

Current strengths:

- RLS enabled, and newer sensitive tables force RLS;
- browser roles have no direct table access;
- mutation RPCs are service-role only;
- fixed or bounded search paths;
- player session token is separate from Supabase gateway authorization;
- game/player scope is resolved server-side;
- public responses omit internal UUIDs on preferred routes;
- idempotency and row/advisory locks protect economic writes;
- cross-game foreign keys and filters are explicit;
- runner secret is rejected on Player routes;
- market hours and game lifecycle fail closed.

Required hardening:

- eliminate legacy public DTO UUID fields from new routes;
- create public-ID uniqueness and immutable identity rules;
- separate definition activation from runtime listing activation;
- enforce unsupported asset/order features fail closed;
- bound imported definition and holdings payloads;
- redact evidence and processor logs;
- prevent browser-controlled fee, yield, coupon, NAV, divisor, conversion, recovery, or settlement values;
- prove cancellation/fill/expiry races under row locks.

## Performance assumptions

Current runtime was designed for a bounded classroom stock set, not 3,200 active instruments:

- runner loads active game stocks and writes one tick per asset;
- latest-history reads use game/asset/tick indexes;
- Portfolio reads join holdings to runtime assets;
- immediate order execution locks a small number of rows;
- public realtime emits a board-style stock tick event;
- no order book or open-order scan exists.

The full library must remain inactive by default. Activation must be subset-based and indexed by game, exchange, listing status, asset class, and next processor time. Processors require bounded batches and resumable cursors. Realtime must publish compact invalidation/version events rather than broadcasting 3,200 full records per tick.

## Abstraction decision

### Reuse directly

- shared ledger and balance model;
- player-session authentication helper;
- service-role-only mutation pattern;
- public-key resolution pattern;
- deterministic seeded calculation utilities;
- explicit game/session scope validation;
- append-only history;
- idempotency and transactional locking;
- exchange calendar fail-closed rule;
- central rate-limit dispatch;
- capability publication model;
- Player committed-success and recovery-state conventions.

### Reuse through adapter

- stock factor engine;
- stock events/regimes;
- stock templates/runtime assets;
- stock Portfolio projection;
- stock watchlist;
- current stock routes;
- current tick publisher.

### Do not generalize in place

- `stock_templates`;
- `game_session_stock_assets`;
- `stock_price_ticks`;
- `stock_holdings`;
- `stock_orders`;
- `stock_trades`;
- ticker-global uniqueness;
- one-fill terminal order status;
- equity-only fundamentals JSON;
- company-name requirement;
- stock-only public DTOs.

## Audit conclusion

The expansion must create a canonical multi-asset domain beside the bounded stock runtime, then publish compatibility projections. The bounded beta stock behavior remains unchanged. Migration and shared-file implementation are blocked until Chat 1 records PR #305 ownership, migration range, collision rules, merge position, and staging release-train ownership.
