# Multi-Currency Stock Market Funding Schema and Runtime Inventory v1

**Roadmap item:** `BUSINESS-V2-10A4C3`  
**Status:** `INTAKE_COMPLETE — RUNTIME_UNCHANGED`  
**Inventory source:** clean C2 handoff `ba033ac4a7759d068233513431891fc9de3ae95a`

## Purpose

This inventory identifies the existing Financial Markets surfaces C3 must extend or retain. It does not certify implementation and does not authorize runtime, deployment, scheduler, secret, or live-database work.

## Existing Stocks domain

### Public and backend API

- `backend/src/domains/stocks/api/playerStockMarketTradingHttpHandler.ts`
  - Player-safe order write.
  - Derives game, Player, session, and internal asset scope server-side.
  - Resolves a runtime stock by public ticker.
  - Requires reviewed price, side, quantity, and idempotency intent.
  - Rejects stale price before repository execution.
- `backend/src/domains/stocks/api/playerStockMarketTradingHttpHandler.test.ts`
  - Current public write contract and private-scope denial.
- `backend/src/domains/stocks/api/playerStockMarketPublicRoutePaths.ts`
  - Player Stocks route ownership.
- `backend/src/domains/stocks/api/playerStockMarketReadHttpHandler.ts`
  - Portfolio/holding/order/trade read boundary.
- `backend/src/domains/stocks/api/playerStockAssetListHttpHandler.ts`
- `backend/src/domains/stocks/api/playerStockAssetDetailHttpHandler.ts`
- `backend/src/domains/stocks/api/playerStockWatchlistHttpHandler.ts`
- `backend/src/domains/stocks/api/stockMarketTradingHttpHandler.ts`
  - Backend-secret compatibility execution surface.
- `backend/src/domains/stocks/api/stockMarketRunnerHttpHandler.ts`
  - Price-tick runner; not a Player funding authority.

### Contracts

- `backend/src/domains/stocks/contracts/stockMarketTradingContracts.ts`
  - Current order input/result, side, cash snapshot, holding snapshot, repository, and error contract.
- `backend/src/domains/stocks/contracts/stockMarketPlayerReadContracts.ts`
  - Player portfolio/holding/order/trade DTOs.
- `backend/src/domains/stocks/contracts/stockMarketReadContracts.ts`
- `backend/src/domains/stocks/contracts/stockMarketRunnerContracts.ts`
- `backend/src/domains/stocks/contracts/stockMarketEngineContracts.ts`

### Infrastructure

- `backend/src/domains/stocks/infrastructure/supabaseStockMarketTradingRepository.ts`
  - Calls `execute_stock_market_order_calendar_gated`.
  - Maps market-closed, insufficient-cash, insufficient-shares, invalid-request, and schema errors.
- `backend/src/domains/stocks/infrastructure/supabaseStockMarketTradingRepository.test.ts`
- `backend/src/domains/stocks/infrastructure/supabaseStockMarketPlayerReadRepository.ts`
- `backend/src/domains/stocks/infrastructure/supabasePlayerStockAssetListRepository.ts`
- `backend/src/domains/stocks/infrastructure/supabasePlayerStockAssetDetailRepository.ts`
- `backend/src/domains/stocks/infrastructure/supabaseStockMarketRunnerRepository.ts`
- `backend/src/domains/stocks/infrastructure/supabaseStockMarketWindowRepository.ts`

### Domain documentation

- `backend/src/domains/stocks/README.md`
  - Records the deterministic engine, runtime asset/tick schema, runner, seed/copy, Player reads, Player-safe trading, and calendar boundaries.
  - Records the inherited V5 buy/sell model using one ECO Checking projection, `record_player_ledger_entry`, `stock_holdings`, `stock_orders`, and `stock_trades`.

## Existing canonical data authorities

The exact implementation inventory must preserve these logical roots even where later migrations have revised the original schema:

- `stock_templates`
  - Global fictional security templates.
- `game_session_stock_assets`
  - Game-scoped runtime security and authoritative current-price root.
- `stock_price_ticks`
  - Append-only price history.
- `stock_market_events`
- `stock_market_regimes`
- `stock_holdings`
  - Player/security quantity, reserved quantity where present, average cost, and realized-P&L state.
- `stock_orders`
  - Order intent, side, quantity, execution/rejection status, and idempotency evidence.
- `stock_trades`
  - Fill/trade evidence.
- exchange-calendar and game-market-timezone authorities used by the calendar-gated execution wrapper.

C3 must identify and use the latest forward definition of each table/function rather than editing historical migrations.

## Existing command chain

The current Player command chain is:

```text
Player Terminal
  -> same-origin Player BFF
  -> Player Stock order route
  -> playerStockMarketTradingHttpHandler
  -> SupabaseStockMarketTradingRepository
  -> execute_stock_market_order_calendar_gated
  -> inherited stock execution function
  -> legacy Player ledger/account-balance projection
  -> stock order + trade + holding mutation
```

The target C3 chain is:

```text
Player Terminal
  -> same-origin Player BFF
  -> Stock buy quote route
  -> Financial Markets quote command
       -> authoritative security / market calendar / price / fee
       -> C0 funding quote
  -> Stock confirmation route
  -> Financial Markets atomic settlement
       -> C0 funding composition
       -> B2 settlement distribution
       -> order + fill + trade + holding + fee evidence
```

Sell execution remains Financial-Markets-owned and credits a canonical Player Checking account in listing currency.

## Existing public contract assumptions to retire

- One-step buy execution from the initial order request.
- One ECO Checking account as the only eligible purchase source.
- `expectedPrice` functioning as both UI review input and immediate execution guard without a durable funding quote.
- One cash snapshot in the result as the complete payment evidence.
- Direct buy and sell settlement through the legacy Player ledger projection.
- No public funding quote or funding receipt.
- No explicit listing currency on the Player order-review surface.
- No selected sale-proceeds account.

## Required C3 schema additions

The exact names remain implementation details, but the forward-only C3 schema must provide these capabilities without a parallel authority:

1. **Runtime security listing currency**
   - active canonical currency reference;
   - deterministic ECO backfill where no prior authority exists;
   - immutability/version rules compatible with existing assets and price ticks.

2. **Financial Markets purchase quote**
   - opaque public quote key;
   - game/Player/security scope;
   - side, quantity, order type/time-in-force where supported;
   - authoritative price/version and short expiry;
   - listing-currency gross, fee, and exact total;
   - C0 funding quote and context hash;
   - state, replay, and idempotency evidence.

3. **Funded order/fill/trade evidence**
   - C0 funding receipt;
   - B2 buyer-funding transaction;
   - Financial Markets settlement/distribution transaction;
   - settlement-clearing and fee-recipient identities;
   - listing-currency snapshots;
   - mutually exclusive legacy/funded evidence constraints.

4. **Sell-proceeds evidence**
   - canonical public target-account key relation;
   - listing-currency gross, fee, net, cost-basis relief, and realized P&L;
   - B2 settlement transaction link.

5. **Resting-order reservation evidence, only if inherited support exists**
   - accepted maximum exposure;
   - source-account allocation and B2 hold references;
   - filled/consumed/released amount;
   - exact-once cancellation/expiry release.

6. **System account registry use**
   - named Financial Markets settlement-clearing account per game/currency;
   - named fee account per game/currency;
   - existing issuer/liquidity recipient preserved or explicitly resolved.

## Required function inventory before migration authoring

C3A implementation must first record the exact latest definitions and signatures for:

- `execute_stock_market_order_calendar_gated`;
- its wrapped underlying execution function;
- any order-book, matching, fill, cancel, expiry, or reservation functions;
- any Player Stock read functions that serialize cash/order/trade/holding currency;
- `private.compose_purchase_funding_v1` and public C0 quote result types;
- B2 bank-account identity helpers and system-account provisioning;
- B2 balanced transaction/journal posting;
- canonical Player Checking-account resolution;
- direct-DML guards affecting stock, Banking, and legacy ledger projections.

The C3 contract test must fail if implementation binds an obsolete function body or bypasses the calendar-gated wrapper.

## Player Terminal surfaces requiring audit/cutover

- Stock order form and order confirmation flow.
- Market board and asset-detail price/currency labels.
- Portfolio cash/holdings/order/trade reads.
- Account-selection components already established by C0/C1/C2.
- Banking/FX account read model.
- Capability manifest, endpoint registry, resource invalidation, mutation control, recovery-state registry, and browser tests.

The Stock UI should reuse the existing account-selection and FX-disclosure patterns rather than create another wallet selector.

## Required retained workflows

C3 certification must retain, at minimum:

- Stock Market trading and Player-safe boundary tests;
- stock runner and exchange-calendar workflows;
- required game market timezone;
- Database Replay;
- Backend Typecheck and all Edge roots;
- Player Terminal Verify and connected market browser acceptance;
- Repository Quality and Supply Chain Security;
- B1 canonical FX;
- B2 Banking FX clearing;
- C0 multi-currency funding core;
- C1 Store funding;
- C2 Marketplace funding;
- Store, Marketplace, Inventory, and Business regressions touched by shared Player/account code.

## Inventory conclusion

The parent branch contains a mature Financial Markets domain and an immediate Player trading boundary, but the monetary leg remains a pre-C0 one-ECO-Checking design. C3 can be implemented as a forward-only listing-currency and settlement composition without changing the price engine or creating a second securities authority.
