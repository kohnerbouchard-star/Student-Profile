# Student Mutation Schema Readiness Audit v1

Status: docs-only audit  
Source plan: `docs/plans/advanced-student-mutation-systems-v1.md`  
Target backend: Supabase Edge Function `classroom-api`

## 1. Executive summary

The current Supabase backend is ready for identity resolution, game/session scoping, staff/player access control foundations, append-only money movement, balance projections, audit logging, and staff-managed store catalog data.

It is not yet ready to implement the advanced student mutation systems directly. Most of the domain tables required by the advanced plan are either missing or only named as intended ownership boundaries. The repository has a strong core schema, but the advanced trading, analyst, inventory, dynamic pricing, player-location, idempotency, and purchase-quote concepts are not yet schema-backed.

The safest next step is not route implementation. The next step should be a migration/RPC design pass for the smallest viable vertical slice, preferably dynamic store quote/purchase or analyst forecast foundation, because those are less complex than advanced stock order execution.

Do not remove `API_URL`, `callApi()`, or `submitAction()` yet. The legacy action pipeline remains necessary until replacement Supabase schemas, transaction boundaries, routes, and frontend helpers are built and verified.

## 2. Evidence inspected

Primary files inspected:

- `docs/plans/advanced-student-mutation-systems-v1.md`
- `backend/supabase/functions/classroom-api/index.ts`
- `backend/supabase/migrations/20260615161835_create_core_tables_v1.sql`
- `backend/supabase/migrations/20260617113000_add_ledger_transaction_rpc_v1.sql`
- `backend/supabase/migrations/20260617133000_create_store_items_v1.sql`
- `backend/src/supabase/tableTypes.ts`
- `backend/src/domains/README.md`

Search terms checked included store, ledger, balance, audit, stock, analyst, inventory, item-use, location, inflation, idempotency, purchase quote, and related table names.

## 3. Current schema readiness table

| Area | Readiness | Evidence | Notes |
|---|---|---|---|
| Core game/session identity | Ready | `staff_users`, `game_sessions`, `players`, `player_access_credentials`, `player_sessions` | Strong foundation for deriving `game_session_id` and `player_id` server-side. |
| Game settings | Partially ready | `game_settings` with JSON windows | Existing JSON fields can hold early policy, but advanced pricing/inflation/location rules should eventually be typed. |
| Economy ledger | Ready for basic ledger writes | `ledger_entries`, `account_balances`, `record_player_ledger_entry` | Supports append-only ledger and balance projection. Needs domain-specific wrappers for purchases, orders, rewards, and reservations. |
| Audit log | Ready | `audit_log` | Existing append-only audit trail is reusable for sensitive student mutations. |
| Staff store catalog | Ready | `store_items`, staff catalog repository/handlers | Catalog exists. Purchase transactions are explicitly deferred. |
| Store purchase transactions | Missing | No `store_purchases` or purchase route found | Required before student store purchase migration. |
| Store price quotes | Missing | No `store_purchase_quotes` found | Required for quote-before-purchase dynamic pricing. |
| Store dynamic pricing rules | Missing | No `store_price_rules`, `regional_price_modifiers`, or typed inflation tables found | Dynamic pricing needs schema design. |
| Player location | Missing | No `player_locations` or player location columns found | Required for location-based pricing and item eligibility. |
| Inflation settings | Missing / partially possible via JSON | No typed inflation table found | Could be prototyped in `game_settings`, but that is not robust enough for advanced rules. |
| Inventory holdings | Missing | No `inventory_holdings` found | Required before item use or store purchase inventory writes. |
| Inventory events | Missing | No `inventory_events` found | Required for append-only inventory history. |
| Item-use requests | Missing | No `item_use_requests` found | Required for approval-aware item use. |
| Active item effects | Missing | No `active_item_effects` found | Required for timed buffs/discounts/cooldowns. |
| Item effect rules | Missing | No `item_effect_rules` found | Required to make item behavior server-owned. |
| Stock assets | Missing | No `stock_assets` found | Required before order system. |
| Stock price ticks | Missing | No `stock_price_ticks` found | Required for authoritative pricing and forecast settlement. |
| Stock orders | Missing | No `stock_orders` found | Required for market/limit/stop/stop-limit/trailing orders. |
| Stock trades/fills | Missing | No `stock_trades` or fill table found | Required for execution history and portfolio accounting. |
| Portfolio holdings | Missing | No `player_portfolio_holdings` found | Required for SELL validation and portfolio display. |
| Order reservations | Missing | No cash/share reservation table found | Required for pending buy/sell orders. |
| Analyst forecasts | Missing | No `analyst_forecasts` found | Required for BUY/HOLD/SELL predictions. |
| Forecast settlements | Missing | No settlement table found | Required for delayed scoring. |
| Analyst scores/reputation | Missing | No analyst score table found | Required for ramifications and leaderboard mechanics. |
| Analyst rewards | Missing / economy reusable | No analyst reward table found; ledger can pay rewards | Needs forecast-specific source records before ledger payout. |
| Idempotency | Missing | No idempotency table/key model found | Required for safe retries and double-click protection. |
| Student gameplay mutation routes | Missing | `classroom-api` has no store purchase, stock order, forecast, or item-use route | Existing router reaches `route_not_found` after current route families. |

## 4. Per-system readiness analysis

### 4.1 Trading / order management

Readiness: **Missing**

The advanced trading plan requires stock assets, authoritative ticks, orders, triggers, fills, portfolio holdings, reservations, and order lifecycle state. None of the required stock domain tables are present in the inspected migrations or `tableTypes.ts`.

Required concepts and classification:

| Concept | Readiness | Notes |
|---|---|---|
| `stock_assets` | Missing | No authoritative asset/ticker table found. |
| `stock_price_ticks` | Missing | No server-owned price history table found. |
| `stock_orders` | Missing | No order lifecycle table found. |
| `stock_trades` / fills | Missing | No execution history table found. |
| `player_portfolio_holdings` | Missing | No current holdings projection found. |
| Pending order lifecycle | Missing | No status model for pending, triggered, filled, expired, or cancelled orders. |
| Cash reservation | Missing | No reservation model connected to `account_balances`. |
| Share reservation | Missing | No holdings reservation model. |
| Ledger entries | Ready | `ledger_entries` and `record_player_ledger_entry` can support cash settlement once stock records exist. |
| Audit events | Ready | `audit_log` can support order and fill audit events. |

Do not implement advanced stock orders first. The schema gap is too large and the risk profile is high: double-spending, stale prices, incorrect fills, and negative holdings are all possible without a transaction-safe design.

### 4.2 Analyst forecasts

Readiness: **Missing**

The frontend legacy action supports a simple `BUY` / `HOLD` / `SELL` rating with a target price and reason, but the Supabase schema does not currently have forecast tables, settlement tables, scoring policies, confidence levels, or reward state.

Required concepts and classification:

| Concept | Readiness | Notes |
|---|---|---|
| `analyst_forecasts` | Missing | Needed for submitted forecasts and baseline price/tick. |
| `analyst_forecast_settlements` | Missing | Needed for delayed evaluation. |
| `analyst_scores` | Missing | Needed for reputation/leaderboard ramifications. |
| `analyst_rewards` | Missing / economy reusable | Ledger can record rewards, but forecast-specific reward records are missing. |
| Forecast lifecycle | Missing | No submitted/active/locked/settled/voided states. |
| Scoring windows | Missing | No horizon or evaluation window schema. |
| Confidence levels | Missing | No confidence field or policy. |
| BUY/HOLD/SELL settlement logic | Missing | Needs server-owned price/tick data first. |

Analyst forecast submission may still be one of the better first implementation candidates because the initial write path can be simpler than trading, but it still needs at least `analyst_forecasts` and an explicit settlement strategy. If stock price ticks do not exist, settlement must be deferred or mocked by a deliberate classroom/manual review model.

### 4.3 Inventory item use

Readiness: **Missing**

The store catalog exists, but ownership of purchased items does not. Item use cannot be implemented safely until inventory holdings and inventory events exist. Approval-aware item use also needs item-use request records and a policy model defining whether inventory is reserved, decremented immediately, or decremented only after approval.

Required concepts and classification:

| Concept | Readiness | Notes |
|---|---|---|
| `inventory_holdings` | Missing | Needed to prove ownership server-side. |
| `inventory_events` | Missing | Needed for append-only inventory history. |
| `item_use_requests` | Missing | Needed for teacher approval workflows. |
| `active_item_effects` | Missing | Needed for timed buffs/discounts. |
| `item_effect_rules` | Missing | Needed for server-owned item behavior. |
| Cooldowns | Missing | No cooldown policy or last-use data. |
| Approval workflow | Missing | No request status table. |
| Effect stacking policy | Missing | No rule model. |

Item use should not be implemented as a direct deletion/decrement from a client-provided `itemName`. The server must resolve item identity and player ownership from trusted records.

### 4.4 Dynamic store pricing / purchases

Readiness: **Partially ready**

This is the closest advanced system to a viable first vertical slice because `store_items` exists and has base catalog fields: item key, name, category, price, currency, stock quantity, status, visibility, and game-session scope.

However, the existing migration explicitly says purchase transactions will be added later. There is no purchase table, quote table, dynamic pricing table, player location model, inflation table, or idempotency model.

Required concepts and classification:

| Concept | Readiness | Notes |
|---|---|---|
| `store_items` | Ready | Staff-managed catalog exists. |
| Base price | Ready | `store_items.price` exists. |
| Stock quantity | Ready for catalog; purchase behavior missing | `store_items.stock_quantity` exists, but no purchase route decrements it. |
| `store_purchase_quotes` | Missing | Needed for quote-before-purchase. |
| `store_purchases` | Missing | Needed for purchase history and source records. |
| `store_price_rules` | Missing | Needed for dynamic pricing formulas. |
| `regional_price_modifiers` | Missing | Needed for location-specific pricing. |
| `inflation_settings` | Missing / could start in game settings JSON | No typed table found. |
| `player_locations` | Missing | Required for location pricing. |
| Quote expiration | Missing | Requires quote table or deterministic quote verification. |
| Discount/effect interaction | Missing | Requires active item effects and pricing rule integration. |

Recommended first candidate: **store quote + purchase foundation**, but only after designing `store_purchases`, inventory holdings/events, idempotency, and either a minimal quote table or a deterministic quote-validation strategy.

### 4.5 Economy dependencies

Readiness: **Ready for basic ledger operations; partially ready for advanced systems**

The economy foundation is strong. The core migration creates append-only `ledger_entries` and `account_balances`; the RPC `record_player_ledger_entry` inserts a ledger row, updates the balance projection, and writes an audit log in one transaction.

Required concepts and classification:

| Concept | Readiness | Notes |
|---|---|---|
| Player/account balances | Ready | `account_balances` exists. |
| Ledger entries | Ready | `ledger_entries` exists. |
| Atomic balance updates | Ready for simple ledger writes | `record_player_ledger_entry` handles one ledger entry. Complex multi-table purchases/orders need additional RPCs/use cases. |
| Audit logs | Ready | `audit_log` exists. |
| Idempotency keys | Missing | No general mutation idempotency table found. |
| Transaction-safe write boundary | Partially ready | Existing ledger RPC is reusable but insufficient alone for purchase/order/forecast/item workflows. |
| Balance reservation | Missing | Needed for pending stock orders and possibly quotes. |

The existing ledger RPC should be treated as a lower-level primitive, not the full transaction boundary for advanced gameplay mutations.

## 5. Existing reusable backend/domain pieces

Reusable foundations:

- Player login/session infrastructure can resolve active player sessions and derive `game_session_id` / `player_id` server-side.
- Staff bootstrap and staff-owned game scoping already exist.
- `ledger_entries` and `account_balances` provide the authoritative money movement model.
- `record_player_ledger_entry` provides an existing transaction-safe primitive for simple balance changes.
- `audit_log` can record sensitive actions.
- `store_items` plus staff catalog handlers provide a working catalog-management foundation.
- `game_settings` can temporarily store simple settings, but advanced inflation/location rules should not remain untyped indefinitely.
- The domain ownership map already names future `store`, `inventory`, `stocks`, `analyst`, `notifications`, and `audit` boundaries.

## 6. Missing tables/concepts

High-priority missing concepts before any advanced student mutation route:

- `idempotency_keys` or equivalent request-id storage.
- `store_purchases`.
- `inventory_holdings`.
- `inventory_events`.
- `item_use_requests`.
- `store_purchase_quotes` or a deliberate deterministic quote mechanism.
- `stock_assets`.
- `stock_price_ticks`.
- `stock_orders`.
- `stock_trades` / fills.
- `player_portfolio_holdings`.
- `analyst_forecasts`.
- `analyst_forecast_settlements`.
- `analyst_scores`.
- `player_locations`.
- typed inflation and regional pricing rules.
- active item effect and item effect rule tables.
- notification jobs or teacher-visible request surfaces for item-use approvals.

## 7. Required migrations later

Do not create these migrations in this audit branch. They are listed for planning.

Recommended migration groups:

1. **Mutation idempotency foundation**
   - `mutation_idempotency_keys` scoped by `game_session_id`, `player_id`, route/action, and key.
   - stores request hash, result reference, status, created/expires timestamps.

2. **Store purchase foundation**
   - `store_purchase_quotes` or deterministic quote validation table.
   - `store_purchases`.
   - optional `store_price_rules` for formula-based pricing.

3. **Inventory foundation**
   - `inventory_holdings`.
   - `inventory_events`.
   - `item_use_requests`.
   - later `item_effect_rules` and `active_item_effects`.

4. **Analyst forecast foundation**
   - `analyst_forecasts`.
   - later settlement, score, and reward tables.

5. **Market/trading foundation**
   - `stock_assets`.
   - `stock_price_ticks`.
   - `stock_orders`.
   - `stock_order_fills` or `stock_trades`.
   - `player_portfolio_holdings`.
   - reservation tables or reservation columns.

6. **Location/inflation foundation**
   - `player_locations`.
   - `inflation_settings` or typed game/regional economy settings.
   - `regional_price_modifiers`.

## 8. Required RPC/transaction boundaries later

The existing `record_player_ledger_entry` RPC is useful, but each advanced system needs a higher-level transaction boundary.

Recommended future transaction boundaries:

- `purchase_store_item(...)`
  - validates session/player/item/quote/idempotency;
  - checks balance;
  - decrements stock;
  - writes purchase row;
  - updates inventory;
  - writes ledger and audit rows atomically.

- `request_item_use(...)`
  - validates session/player/holding/item rules;
  - reserves or decrements inventory according to policy;
  - creates request/event/effect;
  - writes audit and notification rows atomically.

- `submit_analyst_forecast(...)`
  - validates ticker/rating/horizon/confidence;
  - records baseline price/tick if available;
  - writes forecast and audit rows atomically.

- `settle_analyst_forecasts(...)`
  - evaluates closed forecast windows;
  - writes settlement, score, reward ledger, and audit records atomically.

- `place_stock_order(...)`
  - validates asset/price/order fields;
  - reserves cash or holdings;
  - immediately fills market orders where appropriate;
  - writes order/fill/ledger/portfolio/audit rows atomically.

- `evaluate_pending_stock_orders(...)`
  - evaluates open orders against authoritative price ticks;
  - triggers/fills/expirs orders safely under repeated runner invocation.

## 9. Recommended implementation order

Recommended order:

1. **Schema readiness cleanup and contracts**
   - Decide idempotency design.
   - Decide snapshot/refresh behavior.
   - Decide whether dynamic pricing starts with typed tables or constrained `game_settings` JSON.

2. **Store quote + purchase foundation**
   - Best first vertical slice because `store_items`, ledger, balances, and audit already exist.
   - Requires `store_purchases`, inventory holdings/events, and idempotency before a safe route.

3. **Inventory holding + item-use request foundation**
   - Natural follow-on from store purchases.
   - Enables approval-aware items and teacher-facing workflows.

4. **Analyst forecast submission foundation**
   - Can begin with submitted forecasts before full settlement/scoring if product accepts deferred evaluation.
   - Needs stock price/tick policy before automatic scoring.

5. **Stock asset + price tick foundation**
   - Needed by both forecasts and advanced trading.

6. **Advanced stock order management**
   - Last among the four systems because it has the largest schema, transaction, and race-condition surface.

## 10. Risks if implementation starts before schema readiness

| Risk | Why it matters | Mitigation |
|---|---|---|
| Balance corruption | Purchases/trades can debit/credit incorrectly without atomic boundaries. | Use transaction-safe RPC/use cases and ledger source records. |
| Duplicate mutations | Retries/double-clicks can duplicate purchases, trades, or item effects. | Add idempotency before write routes. |
| Inventory underflow | Store/item-use can consume more inventory than owned or stocked. | Use row locks/conditional updates in transaction boundaries. |
| Stale price execution | Trading and dynamic store pricing can execute on outdated client state. | Server-owned quote/tick selection and expiry. |
| Missing ownership proof | Item use cannot trust client snapshot quantity. | Add inventory holdings/events. |
| Forecast scoring disputes | Forecast outcomes cannot be audited without baseline/settlement records. | Store baseline tick, horizon, scoring version, and settlement rows. |
| Permission mismatch | Frontend actions may not align with Supabase available actions. | Add capability flags only after backend routes exist. |
| Route/router bloat | Logic could be stuffed into `classroom-api/index.ts`. | Keep router thin and domain handlers/use cases separate. |
| Legacy divergence | Cloudflare behavior may differ from Supabase implementation during coexistence. | Migrate feature-by-feature with explicit compatibility checks. |
| Missing teacher visibility | Item-use requests may notify no one if notification/admin views are absent. | Design request review surfaces before enabling approval workflows. |

## 11. Final recommendation

Do not implement the advanced student mutation routes yet.

The current backend is ready for:

- player/staff identity resolution;
- game-session scoping;
- store catalog management;
- basic ledger/balance writes;
- audit logging.

The current backend is not ready for:

- dynamic store purchases with quotes, inflation, and location;
- inventory ownership and item-use requests;
- analyst forecast settlement/scoring;
- advanced stock order management.

Recommended next PR should be a docs-only migration/RPC contract plan for the first vertical slice. The best candidate is **store quote + purchase foundation**, provided the design includes inventory holdings/events and idempotency. Analyst forecast submission is a possible alternative if the product accepts deferred scoring until stock price ticks exist.

Keep `API_URL`, `callApi()`, and `submitAction()` until each replacement feature is schema-backed, route-backed, tested, deployed, and migrated on the frontend.
