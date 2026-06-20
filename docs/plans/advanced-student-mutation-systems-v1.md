# Advanced Student Mutation Systems Plan v1

Status: planning only
Target backend: Supabase Edge Function `classroom-api`
Migration posture: coexist with the legacy Cloudflare action API until each replacement is proven safe

## 1. Purpose

This plan defines the next-generation student mutation systems for Eco Novaria. It is not a one-for-one port of the four legacy actions. The goal is to use the migration boundary to build richer, explicitly modeled systems:

- advanced stock trading with server-managed orders, triggers, fills, reservations, and portfolio accounting;
- analyst forecasts with BUY, HOLD, and SELL opinions, target prices, scoring, evaluation, and ledger rewards;
- inventory holdings, append-only inventory events, item effects, and approval-aware item use;
- a dynamic store with server-issued price quotes, location and inflation inputs, stock controls, and atomic purchases.

This document is intentionally non-executable. It does not add routes, migrations, RPCs, handlers, frontend calls, or Cloudflare changes. The existing Cloudflare `API_URL`, `callApi`, and `submitAction` paths must remain available while Supabase capabilities are implemented and verified feature by feature. Removal of the legacy path is a later, separately approved cleanup.

The governing backend rules remain:

- derive `game_session_id` and `player_id` from the authenticated player session;
- scope all live simulation state to `game_session_id`;
- scope private student state to both `game_session_id` and `player_id`;
- route every monetary change through `ledger_entries` and its `account_balances` projection;
- keep API handlers thin and coordinate cross-domain work in application use cases;
- perform sensitive writes atomically and append an `audit_log` record;
- never expose service-role credentials to the frontend.

## 2. Current Legacy Actions

### 2.1 Shared request and snapshot behavior

All four frontend mutations ultimately call `frontend/src/core/api.js` `submitAction(action, payload)`. That helper:

1. calls `requirePermission(action)`;
2. requires the current session to contain a token;
3. posts `{ action, token, payload }` as JSON through `callApi` to the Cloudflare `API_URL`;
4. retries retryable results or errors up to three times after the initial attempt;
5. rejects responses where `ok !== true`;
6. merges `result.snapshot`, when present, into client state.

`frontend/src/core/snapshot.js` preserves existing sections when a response omits or returns no rows for them. It normalizes the legacy snapshot sections `profile`, `store`, `transactions`, `inventory`, `market`, `portfolio`, `ratings`, and `news`. This tolerant merge is useful during coexistence, but it cannot provide transactional guarantees or prove that separately returned sections share one database version.

The Supabase player bootstrap currently returns only `dashboard.view` and `ledger.view` in `availableActions`. The login code assigns that array directly to `currentSession.permissions`. Therefore `STORE_PURCHASE`, `STOCK_TRADE`, and `SUBMIT_RATING` remain implemented frontend/legacy request paths but are not granted by the current Supabase player bootstrap. `USE_ITEM` is a special case: `frontend/src/core/state.js` permits it for any student session even though it is absent from `PERMISSION_SETS.STUDENT.actions`. This mismatch must be resolved intentionally per migrated feature, not by broadly enabling every legacy action.

### 2.2 `STORE_PURCHASE`

Current source: `frontend/src/features/store/store.js`

- Payload: `{ itemId, quantity }`.
- Client validation: `itemId` must be present; `quantity` must be an integer of at least 1.
- Submission: `submitAction("STORE_PURCHASE", payload)`.
- Success behavior: displays `result.message` or `Purchase complete.`, then rerenders the current view and identity.
- Display state: item choices come from `state.store`; history filters `state.transactions` for mode `STORE_PURCHASE`.
- UI claim: the server checks the player's balance and item stock.

Current limitations:

- the client sends no quote identifier, quoted unit price, quote expiry, idempotency key, or `clientSubmittedAt`;
- the request has no modeled location, inflation, demand, or pricing-rule context;
- catalog price and stock are displayed as a simple snapshot, so the client cannot distinguish a stale price from a valid executable quote;
- no Supabase purchase route or purchase transaction table exists in repository migrations;
- a successful legacy response can update many snapshot sections, but its internal write consistency is outside the Supabase transaction model.

### 2.3 `STOCK_TRADE`

Current source: `frontend/src/features/trading/trading.js`

- Payload: `{ action, ticker, shares }`.
- `action`: UI choice of `BUY` or `SELL`.
- Client validation: `ticker` must be present; `shares` must be an integer of at least 1.
- Submission: `submitAction("STOCK_TRADE", payload)`.
- Success behavior: displays `result.message` or `Order submitted.`, then rerenders the current view and identity.
- Display state: market rows come from `state.market`; holdings come from `state.portfolio`; trade history is normalized into `state.transactions`.
- UI claim: the server checks market price, account balance, and holdings.

Current limitations:

- the action is an immediate BUY/SELL request, not an order object with an independent lifecycle;
- there are no market, limit, stop, stop-limit, or trailing-stop fields;
- there is no time-in-force, expiry, cancellation, partial-fill, trigger, rejection, or reservation model;
- the request sends no quote/tick identifier, maximum slippage, idempotency key, or `clientSubmittedAt`;
- no Supabase stock asset, price, order, fill, portfolio, or reservation tables/routes exist in repository evidence.

### 2.4 `SUBMIT_RATING`

Current source: `frontend/src/features/forecasts/forecasts.js`

- Payload: `{ ticker, rating, targetPrice, reason }`.
- `rating`: UI choice of `BUY`, `HOLD`, or `SELL`.
- Client validation: `ticker` is required; `targetPrice` must be above 0; `reason` must contain at least 10 characters.
- Submission: `submitAction("SUBMIT_RATING", payload)`.
- Success behavior: displays `result.message` or `Forecast saved.`, clears target and reason inputs, and rerenders.
- Display state: recent `state.ratings` show timestamp, ticker, rating, target price, reason, reward status/amount, end-of-day price, and accuracy when supplied by the legacy snapshot.

Current limitations:

- no explicit forecast horizon, baseline price/tick, due time, revision policy, or scoring version is captured;
- no confidence weighting, thesis tags, reputation, analyst ranking, or leaderboard consequence is defined;
- reward and accuracy fields are display conventions rather than a Supabase-backed evaluation contract;
- the client sends no idempotency key or `clientSubmittedAt`;
- no Supabase analyst rating, evaluation, reward, or policy tables/routes exist in repository evidence.

### 2.5 `USE_ITEM`

Current source: `frontend/src/features/inventory/inventory.js`

- Payload: `{ itemName, itemId, quantity, note }`.
- Client validation: a locally owned item must be selected; `quantity` must be an integer of at least 1 and no greater than the locally displayed owned quantity.
- Submission: `submitAction("USE_ITEM", payload)`.
- Success behavior: always shows a successful status using `result.message` or the default notification text; it clears the note and rerenders only if `result.snapshot` is present.
- Display state: usable inventory is derived from snapshot rows with positive `quantityPurchased`.
- UI claim: an item-use request notifies the teacher.

Current limitations:

- the frontend ownership check is based on a potentially stale snapshot and is not authoritative;
- `itemName` is client-provided display data and must not define item identity or effects;
- there is no item type, effect definition, approval policy, use-request state, expiration, or event ledger;
- there are no timed effects, cooldowns, duration rules, location/game-state eligibility checks, stacking rules, or per-player/session use caps;
- the UI assumes success after `submitAction` returns, without checking `result.ok` locally because the shared helper already throws on failure;
- no Supabase inventory holding, event, item-effect, or item-use-request tables/routes exist in repository evidence;
- permission is granted by a student-only special case rather than by bootstrap capability data.

## 3. Existing Supabase Route State

The deployed entrypoint in `backend/supabase/functions/classroom-api/index.ts` currently dispatches the following route families. Methods are taken from their handlers.

| Route | Method | Current responsibility |
| --- | --- | --- |
| `/health` | `GET` effectively, though the health branch does not method-restrict | Returns `{ ok: true, service: "classroom-api", status: "ready" }`. |
| `/players/login` | `POST` | Validates hashed game join code plus hashed student code and creates a hashed player session token. |
| `/players/me` | `GET` | Validates player bearer token and returns game, player, session, balances, placeholder attendance, and available actions. |
| `/players/me/ledger` | `GET` | Returns current balances and recent player ledger entries. |
| `/staff/bootstrap` | `GET` | Resolves a Supabase Auth staff user and owned active games. |
| `/licensing/activate` | `POST` | Uses the existing licensing activation flow. |
| `/games/:gameSessionId/join-code/reset` | `POST` | Resets the owned game's join code. |
| `/games/:gameSessionId/settings` | `GET`, `PATCH` | Reads or updates the owned game's settings. |
| `/games/:gameSessionId/store/items` | `GET`, `POST` | Staff list/create for the store catalog. |
| `/games/:gameSessionId/store/items/:itemId` | `PATCH` | Staff update for one catalog item. |
| `/games/:gameSessionId/players` | `GET`, `POST` | Staff roster list/create. |
| `/games/:gameSessionId/players/:playerId/access-code/reset` | `POST` | Staff reset of a player's student access code. |
| `/games/:gameSessionId/attendance` | `GET` | Staff daily attendance view. |
| `/games/:gameSessionId/attendance/scan` | `POST` | Staff attendance scan. |
| `/games/:gameSessionId/players/seed-balances` | `POST` | Atomically seeds initial player balances through the existing RPC. |
| `/games/:gameSessionId/players/:playerId/ledger` | `GET` | Staff view of one player's ledger history. |
| `/games/:gameSessionId/players/:playerId/ledger-adjustments` | `POST` | Staff ledger adjustment through `record_player_ledger_entry`. |

`playerAttendanceClockInHttpHandler.ts` and its transactional RPC exist, and the entrypoint imports the handler, but the inspected entrypoint does not dispatch a player clock-in pathname such as `/players/me/attendance/clock-in`. That capability is implemented below the routing layer but is not currently an exposed `classroom-api` route in this repository revision.

There are explicitly no Supabase student mutation routes for store purchases, stock orders/trades, analyst forecasts, or inventory use. The staff store catalog is not a player purchase route.

## 4. Advanced Trading System Design

### 4.1 Order types

| Order type | Definition | Required price fields | Execution behavior |
| --- | --- | --- | --- |
| Market | Buy or sell as soon as the simulation market can execute. Price is not guaranteed. | Optional `maxSlippageBps` guard; no limit price. | With guaranteed classroom liquidity, executes if funds/holdings and market rules permit. Otherwise it must explicitly reject. It never guarantees the displayed quote as the final price. |
| Limit | Buy at `limitPrice` or lower, or sell at `limitPrice` or higher. | `limitPrice`. | Rests open until executable, canceled, or expired. |
| Stop | Becomes a market order after the authoritative price crosses `stopPrice`. | `stopPrice`. | Starts dormant, transitions to triggered, then follows market-order rules. |
| Stop-limit | Becomes a limit order after crossing `stopPrice`. | `stopPrice`, `limitPrice`. | Starts dormant, transitions to triggered/open, and may remain unfilled after a gap. |
| Trailing stop | Stop threshold follows the favorable market direction by a fixed amount or percentage. | Exactly one of `trailAmount` or `trailPercent`; optional initial activation price. | Maintains a server-side high-water mark for sells or low-water mark for buys, recalculates the stop, then triggers once crossed. |

### 4.2 Proposed order contract

Core server fields should include:

- `id`, `game_session_id`, `player_id`, `stock_asset_id`, and immutable ticker snapshot;
- `side` (`buy` or `sell`), `order_type`, requested quantity, filled quantity, and remaining quantity;
- `limit_price`, `stop_price`, `trail_amount`, `trail_percent`, and current trailing reference price;
- `time_in_force` (`day`, `good_til_canceled`, or a deliberately limited V1 subset) and `expires_at`;
- `status`, `rejection_code`, `cancel_reason`, `submitted_at`, `triggered_at`, `filled_at`, `canceled_at`, and `updated_at`;
- `idempotency_key` and `client_submitted_at`;
- the authoritative price/tick observed at acceptance, not a trusted client price;
- cash reservation for buy orders or share reservation for sell orders.

Recommended lifecycle:

`pending_validation -> open | rejected -> triggered -> partially_filled -> filled`

Terminal alternatives are `canceled` and `expired`. Market orders may move from `pending_validation` directly to `filled` or `rejected`. State transitions must be enforced server-side and terminal states must not reopen.

The external contract can use the requested uppercase vocabulary: `DRAFT` only for unsent client state, then server states `PENDING`, `TRIGGERED`, `PARTIALLY_FILLED` when enabled, `FILLED`, `CANCELLED`, `EXPIRED`, and `REJECTED`. Internal names such as `open` must map unambiguously to that contract.

### 4.3 Execution and consistency rules

- Resolve player and game from the bearer token.
- Verify game, player, asset, trading window, and asset status.
- Use an authoritative stock price tick selected inside the transaction or protected execution procedure.
- Prevent negative cash and negative share holdings.
- Reserve the maximum required cash for open buy orders and shares for open sell orders; release unused reservations on cancellation, expiry, rejection, or price improvement.
- Default to whole shares and no short selling unless product policy explicitly approves otherwise.
- Record each execution in an append-only fill table; update holdings as a projection from fills.
- Record cash debit/credit through the economy ledger with `source_domain = 'stocks'` and the fill/order as `source_id`.
- Write order/fill audit records and return the accepted order plus updated resources.
- A runner, likely evolved from the existing `stock-market-runner` placeholder, evaluates open and triggered orders on authoritative ticks. It must be safe under concurrent or repeated invocation.

### 4.4 Risk controls and educational UX

- Per-order and per-player notional limits.
- Maximum open orders and daily trade count.
- Market-hours and teacher pause controls from `game_settings.stock_market_window` plus future typed policy.
- Stale-price and excessive-slippage rejection.
- Restricted assets and teacher-configured allowlists.
- Confirmation text explaining that market orders prioritize execution while limit orders prioritize price.
- A visible status timeline that distinguishes submitted, open, triggered, partially filled, filled, canceled, expired, and rejected.
- Estimated cost/proceeds must be labeled as estimates; final execution price must be shown separately.
- Stop-limit gap risk and trailing-stop behavior need concise examples before students enable those types.
- Keep this a classroom simulation: no real brokerage language that implies custody of real securities or guaranteed returns.

### 4.5 Domain placement and candidate files

Use `backend/src/domains/stocks`:

- `contracts/stockOrderContracts.ts`
- `contracts/stockOrderRequestParser.ts`
- `domain/stockOrderRules.ts`
- `domain/stockOrderStateMachine.ts`
- `domain/stockExecutionRules.ts`
- `application/placeStockOrder.ts`
- `application/cancelStockOrder.ts`
- `application/evaluatePendingStockOrders.ts`
- `infrastructure/stockOrderRepository.ts`
- `infrastructure/supabaseStockOrderRepository.ts`
- `api/stockOrderRoutePaths.ts`
- `api/playerStockOrderHttpHandler.ts`
- focused tests under `backend/src/domains/stocks/tests`.

These are candidate names only. No files are created by this plan.

## 5. Analyst Forecast System Design

### 5.1 Forecast mechanics

A forecast is a time-bounded, immutable opinion against a known baseline market tick:

- `BUY`: predicts positive return beyond a configurable neutral band by the evaluation time;
- `HOLD`: predicts return remains within the neutral band;
- `SELL`: predicts negative return beyond the neutral band;
- `targetPrice`: predicts the evaluation price and enables target-error scoring;
- `reason`: the student's thesis, with configurable minimum and maximum length;
- `horizon`: an approved evaluation window such as end of day, next market close, or teacher-selected date.

Inputs should include `stockAssetId` or ticker, `rating`, `targetPrice`, `timeHorizon` or `horizonId`, `confidenceLevel`, `reason`, optional thesis tags (`valuation`, `momentum`, `news`, `macro`, `sector`, `technical`, `risk`), `idempotencyKey`, and `clientSubmittedAt`. The server adds the baseline tick/price, submission time, evaluation deadline, player/game identity, and scoring-policy version.

### 5.2 Lifecycle and scoring

Recommended states:

`submitted -> active -> locked -> pending_evaluation -> settled -> reward_pending -> rewarded`

Terminal alternatives are `voided`, `ineligible`, and `teacher_review_required` when a rubric, moderation flag, or disputed settlement needs staff action. A submission may be editable only during a clearly defined grace period; edits should create a revision/event rather than erase the original. Once locked, future market data must not change the student's recorded premise.

Scoring should be reproducible from a versioned policy:

- directional score: whether BUY/HOLD/SELL matched the realized return band;
- target score: normalized absolute or percentage error from target to evaluation price;
- time-horizon score: whether the prediction became accurate within the selected horizon under the approved rules;
- confidence multiplier: bounded and capable of increasing both reward and penalty so high confidence is not a free bonus;
- optional reasoning quality/risk-adjusted score: teacher rubric, kept separate from deterministic market accuracy;
- total score: transparent weighted combination with a documented cap, plus streak/reputation updates if approved;
- reward: deterministic mapping from score to a non-negative ECO amount, written through the ledger exactly once.

The evaluation must store the baseline tick, evaluation tick, realized return, target error, component scores, policy version, and evaluation time. Later price corrections must create a new evaluation version or explicit re-evaluation event, not silently rewrite rewarded history.

### 5.3 Ramifications

- Students may copy forecasts; product policy should decide whether submissions become visible only after lock.
- Repeated submissions can become a reward exploit; enforce one active forecast per player/asset/horizon or another explicit cap.
- A HOLD band that is too broad rewards low-risk guessing; calibrate it by difficulty or asset volatility.
- Target prices without a fixed horizon are not meaningfully scorable.
- Reward amounts affect the classroom economy and require caps, ledger provenance, and idempotent payout.
- Settled results may update an analyst score, reputation, streak, and leaderboard, and may unlock advanced analyst tools only if product policy approves those ramifications.
- Teacher overrides must be audited and must never destroy the deterministic score record.

### 5.4 Proposed routes

- `GET /players/me/analyst/forecasts`
- `POST /players/me/analyst/forecasts`
- `GET /players/me/analyst/forecasts/:forecastId`
- `GET /players/me/analyst/score`
- `GET /games/:gameSessionId/analyst/forecasts` for staff review
- `PATCH /games/:gameSessionId/analyst/forecasts/:forecastId` only for an explicitly defined staff moderation/void action
- `POST /games/:gameSessionId/analyst/evaluations/run` only if a manual staff trigger is needed in addition to a scheduled worker
- `GET/PATCH /games/:gameSessionId/analyst-policy` for staff configuration after policy storage is designed

### 5.5 Domain placement and candidate files

Use `backend/src/domains/analyst`:

- `contracts/analystForecastContracts.ts`
- `domain/analystForecastRules.ts`
- `domain/analystScoringPolicy.ts`
- `application/submitForecast.ts`
- `application/settleForecasts.ts`
- `application/rewardAnalystForecast.ts`
- `infrastructure/forecastRepository.ts`
- `infrastructure/supabaseAnalystForecastRepository.ts`
- `api/analystForecastRoutePaths.ts`
- `api/playerForecastHttpHandler.ts`
- focused tests under `backend/src/domains/analyst/tests`.

## 6. Inventory and Item-Use System Design

### 6.1 Item types and effects

Store catalog items need a server-defined `itemType` and versioned effect definition. Suggested types:

- `consumable`: quantity decreases when use completes;
- `approval_required`: creates a teacher decision request before consumption;
- `entitlement`: grants a time-bounded or one-time classroom privilege;
- `durable`: remains owned and records uses without necessarily decreasing quantity;
- `bundle`: expands into defined child inventory grants at purchase time;
- `informational`: reveals an approved clue or content payload without arbitrary client execution.
- `timed_buff`: activates a bounded effect such as a 24-hour discount or one-market-session fee reduction;
- `location_restricted`: usable only when a server-authoritative location and game state satisfy its rules;
- `cooldown_limited`: reusable only after a server-enforced cooldown interval.

Effects must be allowlisted data interpreted by backend use cases. Do not store or execute arbitrary scripts from item metadata.

### 6.2 Data and lifecycle

Separate concepts are required:

- holding: current quantity projection for a player and catalog item;
- inventory event: append-only grant, purchase, reserve, consume, release, expire, revoke, or adjustment;
- use request: the approval and fulfillment workflow;
- effect definition/version: what an approved use is allowed to do;
- teacher decision: approver, decision, reason, and timestamp.

The item rule contract should express `requiresApproval`, `effectType`, `effectValue`, `duration`, `cooldown`, `locationRestrictions`, `stackPolicy`, `maxUsesPerPlayer`, `maxUsesPerSession`, and `inventoryDecrementPolicy`. Active timed effects need start/end times and a stacking key. Expired effects must be ignored even if cleanup is delayed.

Recommended use-request lifecycle:

`submitted -> pending_approval -> approved -> fulfilled`

Alternatives are `rejected`, `canceled`, `expired`, and `failed`. Auto-approved consumables can transition from `submitted` to `fulfilled` in one transaction. Approval-required items reserve quantity while pending so concurrent requests cannot overspend the holding.

At the UI/domain boundary this covers the requested vocabulary: an owned holding is `AVAILABLE`; a use becomes `REQUESTED`; quantity may become `RESERVED`; the decision is `APPROVED` or `REJECTED`; fulfillment records `USED`; and terminal alternatives are `EXPIRED` or `CANCELLED`.

Rules:

- derive ownership from the session and ignore client-provided item names;
- reject inactive, archived, expired, or non-usable items;
- enforce positive integer quantity and available unreserved quantity;
- decide whether a rejection releases a reservation immediately;
- consume only once, with an inventory event and request status update in the same transaction;
- make teacher notification an outbox/notification job written transactionally, then delivered asynchronously;
- record all staff decisions and adjustments in `audit_log`.

### 6.3 Proposed routes

- `GET /players/me/inventory`
- `GET /players/me/inventory/events`
- `POST /players/me/inventory/item-use-requests`
- `GET /players/me/inventory/item-use-requests`
- `GET /players/me/item-effects`
- `POST /players/me/inventory/item-use-requests/:requestId/cancel`
- `GET /games/:gameSessionId/item-use-requests`
- `POST /games/:gameSessionId/item-use-requests/:requestId/approve`
- `POST /games/:gameSessionId/item-use-requests/:requestId/reject`
- `POST /games/:gameSessionId/players/:playerId/inventory-adjustments` for audited staff correction/grant flows

### 6.4 Domain placement and candidate files

Use `backend/src/domains/inventory`:

- `contracts/itemUseContracts.ts`
- `domain/inventoryRules.ts`
- `domain/itemEffectRules.ts`
- `domain/itemUseStateMachine.ts`
- `application/requestItemUse.ts`
- `application/applyItemEffect.ts`
- `application/decideItemUse.ts`
- `infrastructure/inventoryRepository.ts`
- `infrastructure/supabaseInventoryRepository.ts`
- `api/inventoryRoutePaths.ts`
- `api/playerItemUseRequestHttpHandler.ts`
- focused tests under `backend/src/domains/inventory/tests`.

## 7. Dynamic Store Pricing System Design

### 7.1 Pricing model

The current `store_items.price` can serve as a base/catalog price, but it is not enough for dynamic pricing. The server should calculate:

`currentUnitPrice = roundCurrency(basePrice * inflationMultiplier * locationMultiplier * scarcityMultiplier * difficultyMultiplier * categoryMultiplier * teacherMultiplier - activeDiscounts + taxesAndFees)`

The exact formula and bounds must be versioned and product-approved. Proposed concepts:

- `basePrice`: teacher-managed reference price from the catalog;
- `currentPrice`: informational latest computed price for display, not necessarily executable;
- `quotedPrice`: the immutable unit price persisted on an accepted quote;
- `priceQuote`: short-lived executable offer for one player, item, quantity, currency, and rule version;
- `inflationRate` and derived `inflationMultiplier`: game-scoped economy inputs;
- `locationMultiplier`: derived from a server-authoritative game/player location context;
- `demandMultiplier`: based on bounded recent purchase demand;
- `stockMultiplier`: optional scarcity adjustment with a hard cap;
- `difficultyMultiplier`: game-difficulty contribution with documented bounds;
- `categoryMultiplier`: category or event-specific pricing contribution;
- `activeDiscounts`: eligible server-authoritative item effects or promotions;
- `taxesAndFees`: optional separately displayed additions, if product policy includes them;
- `finalUnitPrice` and `finalTotalPrice`: currency-rounded executable amounts;
- `teacherMultiplier`: explicit configured modifier, not an untracked manual override;
- `floorPrice` and `ceilingPrice`: safety bounds.

All monetary arithmetic should use database numeric values with one currency rounding rule. The quote stores every input and the final unit/total price so a later audit can reproduce the purchase.

Location is not currently modeled in repository migrations. Do not trust a client-provided location. Product must decide whether location belongs to the game, player, classroom zone, or an active simulation event before schema design.

Inflation is also not a typed field today. `game_settings` is available, but its existing JSON windows do not define an inflation contract. A future typed economy/pricing policy may live in a dedicated table or in a versioned, validated settings object after review.

### 7.2 Quote and purchase routes

Proposed player routes:

- `GET /players/me/store/items` returns visible, active catalog items plus informational current prices and availability.
- `POST /players/me/store/quote` creates a short-lived quote.
- `POST /players/me/store/purchases` atomically accepts a valid quote.
- `GET /players/me/store/purchases` returns the player's purchase history.

Quote request:

```json
{
  "itemId": "uuid",
  "quantity": 1,
  "idempotencyKey": "client-generated-opaque-key",
  "clientSubmittedAt": "ISO-8601 timestamp"
}
```

Quote response should contain `quoteId`, item identity, quantity, `baseUnitPrice`, `inflationMultiplier`, `locationMultiplier`, `scarcityMultiplier`, `difficultyMultiplier`, `discountAmount`, `finalUnitPrice`, `finalTotalPrice`, currency, `expiresAt`, and a rule-version identifier.

Purchase request:

```json
{
  "quoteId": "uuid",
  "idempotencyKey": "client-generated-opaque-key",
  "clientSubmittedAt": "ISO-8601 timestamp"
}
```

The server must reject expired, consumed, canceled, cross-player, cross-game, or mismatched quotes. It must never recompute a different price while pretending to accept the original quote. The atomic purchase decrements stock, inserts a purchase record, debits the ledger, updates the balance projection, grants inventory via an event, marks the quote consumed, and writes audit metadata.

### 7.3 Domain placement and candidate files

Extend `backend/src/domains/store` for catalog/pricing/purchase orchestration and call the inventory and economy boundaries:

- `contracts/storeQuoteContracts.ts`
- `contracts/storePurchaseContracts.ts`
- `domain/storePricingRules.ts`
- `domain/storePurchaseRules.ts`
- `application/calculateStorePrice.ts`
- `application/createStoreQuote.ts`
- `application/purchaseStoreItem.ts`
- `infrastructure/storePurchaseRepository.ts`
- `infrastructure/supabaseStorePurchaseRepository.ts`
- `api/playerStoreRoutePaths.ts`
- `api/playerStoreQuoteHttpHandler.ts`
- `api/playerStorePurchaseHttpHandler.ts`
- `api/storePurchaseRoutePaths.ts`
- focused tests under `backend/src/domains/store/tests`.

## 8. Data Model Planning

Classification is based only on committed migrations and `backend/src/supabase/tableTypes.ts` in this repository revision:

- **Ready**: the core table and constraints needed for this plan already exist, though feature code may still be required.
- **Partially ready**: useful foundation exists, but required columns/contracts or related transaction tables do not.
- **Missing**: no committed migration creates the proposed table/capability.
- **Unknown**: repository evidence cannot prove the state of the live remote database.

| Area | Table/capability | Classification | Evidence and gap |
| --- | --- | --- | --- |
| Identity | `players`, `player_sessions` | Ready | Core migration scopes both to game/player and stores session token hashes. |
| Economy | `ledger_entries` | Ready | Append-only money source of truth exists with game/player/source fields. |
| Economy | `account_balances` (`player_balances` equivalent) | Ready | Scoped current-balance projection and uniqueness constraint exist. |
| Audit | `audit_log` (`audit_events` equivalent) | Ready | Append-only game/actor/target metadata table exists. |
| Settings | `game_settings` | Partially ready | Stock/business windows exist as JSON; no typed trading, analyst, inflation, pricing, or location policy contract exists. |
| Store | `store_items` | Partially ready | Catalog, base `price`, stock, visibility, status, and category exist; no item type/effect version, pricing bounds, or dynamic pricing fields. |
| Store | `store_purchase_quotes` / `store_price_quotes` | Missing | No migration or generated type. |
| Store | `store_purchases` and purchase lines | Missing | Migration explicitly defers purchase transactions. |
| Store | `store_price_rules` and pricing history/inputs | Missing | No versioned pricing policy, component history, inflation input, or demand metric table. |
| Store | regional price modifiers | Missing | No region/location multiplier table. |
| Store | inflation settings | Missing | Existing settings JSON has no defined inflation field or validation contract. |
| Location | player/game simulation location | Missing | No authoritative location table or typed setting. |
| Stocks | `stock_assets` | Missing | Named as future architecture only; no migration/type. |
| Stocks | `stock_price_ticks` | Missing | Named as future architecture only; no migration/type. |
| Stocks | `stock_orders` | Missing | No order lifecycle persistence. |
| Stocks | `stock_order_fills` | Missing | No execution history persistence. |
| Stocks | `stock_trades` | Missing | No authoritative completed-trade table; proposed fills may fulfill this role after naming review. |
| Stocks | `player_portfolio_holdings` and lots | Missing | No holdings or tax-lot/projection table. |
| Stocks | cash/share reservations | Missing | No reservation table or reserved-balance field. |
| Analyst | `analyst_forecasts` or `analyst_ratings` | Missing | Named as future architecture only; no migration/type. |
| Analyst | `analyst_forecast_settlements` / evaluations | Missing | No evaluation, scoring-version, or baseline/evaluation tick storage. |
| Analyst | `analyst_scores` / reputation | Missing | No score, streak, ranking, or reputation projection. |
| Analyst | `analyst_rewards` / reward events | Missing | Ledger can pay rewards, but no exactly-once analyst payout source record exists. |
| Inventory | `inventory_holdings` | Missing | Named as future architecture only; no migration/type. |
| Inventory | `inventory_events` | Missing | Named as future architecture only; no migration/type. |
| Inventory | `item_use_requests` and decisions | Missing | No workflow table or state constraints. |
| Inventory | `item_effect_rules` / definitions/versions | Missing | Catalog has description/category only. |
| Inventory | `active_item_effects` | Missing | No timed-effect, cooldown, expiration, or stacking persistence. |
| Idempotency | mutation idempotency registry or unique keys | Missing | Existing ledger RPC does not enforce a caller idempotency key. |
| Notifications | `notification_jobs` | Missing | Named as a future domain concept only; no migration/type. |
| Production | remote-only schema drift | Unknown | This planning review did not introspect the live database; remote state must later be compared to committed migrations. |

`tableTypes.ts` covers only a subset of even the migrated core tables and does not define store, attendance, advanced trading, analyst, or inventory records. It must eventually be regenerated or deliberately extended after approved migrations, but it is not evidence that unlisted migrated tables are absent. Migration SQL is the primary repository evidence here.

## 9. Transaction and Consistency Requirements

### 9.1 Stock order placement and execution

Order acceptance must atomically validate the authoritative session/window/asset, insert the order, and reserve cash or shares. A fill must atomically lock the order and relevant projection rows, verify remaining quantity, insert a fill, apply holding changes, record the ledger entry, update balance projections, release/adjust reservations, advance order status, and append audit data. Repeated runner invocations must not produce duplicate fills.

### 9.2 Analyst submission and reward

Submission must atomically enforce per-player/asset/horizon limits and store the baseline tick plus policy version. Evaluation must atomically claim eligible forecasts or otherwise use a concurrency-safe job pattern. Reward payout must atomically mark one evaluation as rewarded and create exactly one ledger credit. A retry returns the prior reward result.

### 9.3 Inventory use

Request creation must lock/read the holding, validate available quantity, reserve it when approval is required, insert the request, add the inventory event, and enqueue teacher notification in one transaction. Approval/fulfillment must use a compare-and-set state transition, consume the reservation exactly once, record the effect outcome, and write audit data. Rejection/cancellation/expiry must release quantity exactly once.

### 9.4 Dynamic store purchase

Purchase must lock or safely decrement the catalog stock row, lock/validate the quote, verify the quote belongs to the session player and remains unconsumed/unexpired, verify funds, insert purchase history, write the ledger debit and balance projection, create the inventory grant/event, consume the quote, and append audit data in one database transaction. No successful response may represent only a subset of those writes.

### 9.5 Shared rules

- Use database constraints for non-negative stock, valid quantities, legal states, and uniqueness.
- Use row locks, compare-and-set updates, or a transaction RPC where concurrent updates matter.
- Keep network notifications and other external effects outside the transaction using an outbox/job row.
- Treat ledger entries, order fills, inventory events, and audit records as append-only.
- Store timestamps from the server; client timestamps are advisory metadata only.
- Every response should identify the authoritative resource versions written by the transaction.

## 10. Idempotency and Duplicate Handling

Every student mutation request should include:

- `Idempotency-Key` header as the preferred transport, or `idempotencyKey` in a validated body during the transition;
- `clientSubmittedAt` in ISO-8601 format for diagnostics and UX only.

The backend derives an idempotency scope such as `(game_session_id, player_id, action_type, idempotency_key)`. A unique constraint must enforce it. Persist a canonical request hash, status, resource ID, response status, and safe response body or response reconstruction fields.

Rules:

- first request claims the key and performs the mutation;
- identical retry while complete returns the original result without a second mutation;
- retry while processing returns a deterministic in-progress/conflict response, not a second execution;
- same key with a different canonical payload returns `409 idempotency_key_reused`;
- malformed or missing keys return `400` for write routes once enforcement is enabled;
- keys need a documented retention period that exceeds frontend retry/offline windows;
- `clientSubmittedAt` cannot determine price, market ordering, quote validity, permission, or eligibility;
- legacy `submitAction` retries make server idempotency essential before any new route is wired to that retry behavior.

For scheduled evaluation and order execution, use server-generated deterministic keys such as forecast-evaluation ID or order-fill execution key in addition to client request idempotency.

## 11. Snapshot Strategy

### Option A: Expanded monolithic snapshot

Return profile, catalog, purchases, inventory, market, portfolio, orders, forecasts, and history in one player snapshot.

Benefits: smallest immediate frontend conceptual change and familiar legacy behavior.
Costs: large payloads, coupled release cadence, ambiguous freshness across sections, expensive refreshes after every mutation, and difficult pagination.

### Option B: Success response followed by refresh

The narrow interpretation is that a mutation returns success and the frontend calls `/players/me`. This produces smaller mutation responses and reuses the player bootstrap helper, but adds request chaining, latency, and loading complexity. Critically, the current `/players/me` returns identity, session, balances, and placeholder attendance only; it does not return store, inventory, stock, or analyst state. It would need to expand, or feature-specific reads would still be required.

The recommended form of Option B is dedicated resources and targeted mutation responses:

Expose separate resources for store, inventory, orders, portfolio, analyst forecasts, and ledger. Mutations return the created/updated resource plus the small set of affected projections.

Benefits: clear ownership, pagination, cacheability, independent evolution, explicit freshness, smaller responses, and easier authorization tests.
Costs: more frontend query orchestration and an intentional loading/error model.

### Hybrid transition

Keep the current lightweight `/players/me` identity/balance bootstrap, add dedicated feature resources, and allow each migrated mutation to return a compact `affected` object such as balance, holding, stock, order, or forecast. Continue consuming legacy snapshots only for features still on Cloudflare.

**Recommendation: Option B is the long-term target, reached through the hybrid transition.** Do not reproduce the legacy all-feature snapshot as the permanent Supabase contract.

## 12. Future Frontend Helper Additions and Feature Migration

These are future changes only:

- add a player-authenticated `callClassroomPlayerRoute(path, options)` beside the existing staff helper;
- add `callPlayerStoreQuoteApi(sessionToken, payload)`;
- add `callPlayerStorePurchaseApi(sessionToken, payload)`;
- add `callPlayerStockOrderApi(sessionToken, payload)`;
- add `callPlayerCancelStockOrderApi(sessionToken, orderId)`;
- add `callPlayerForecastSubmitApi(sessionToken, payload)`;
- add `callPlayerItemUseRequestApi(sessionToken, payload)`;
- add an idempotency-key generator and retain a key until the corresponding attempt reaches a terminal response;
- add typed/normalized API error handling for validation, conflict, quote expiry, insufficient funds, insufficient shares, market closed, and stale price;
- add small stores/loaders for catalog/quotes/purchases, holdings/use requests, orders/fills/portfolio, and forecasts/evaluations;
- preserve the existing bearer player token handling and never send `playerId` as authority;
- avoid routing new feature calls through generic legacy `submitAction`; use feature-specific methods and explicit route contracts;
- refresh only affected resources after mutation and show pending/open states rather than treating every accepted action as complete;
- replace `USE_ITEM`'s hard-coded student permission exception with server-provided capabilities when its route is ready;
- enable each Supabase action permission only after its read and write paths, failure UX, and fallback policy pass acceptance tests.

Future store UI should add a quote step and show inflation, location, scarcity, discount, and final price. Trading should add an order-type ticket with conditional limit/stop/trailing fields plus pending/triggered/history views. Forecasts should add horizon, confidence, scoring explanations, active/settled history, and reputation. Inventory should show effects, cooldowns, approval state, timed effects, and location restrictions.

Feature-by-feature migration order should be store read/quote/purchase, analyst submission/evaluation, inventory read/use, then advanced stocks. Each frontend switch needs a rollback flag or equally explicit deployment control while the legacy path remains available.

## 13. Proposed Route Table

All player routes derive game/player identity from the player session token. All staff routes verify Supabase Auth and game ownership.

| Domain | Method and route | Audience | Purpose |
| --- | --- | --- | --- |
| Store | `GET /players/me/store/items` | Player | Visible catalog and informational current prices. |
| Store | `POST /players/me/store/quote` | Player | Create executable, expiring price quote. |
| Store | `POST /players/me/store/purchases` | Player | Atomically consume quote, debit cash, decrement stock, grant inventory. |
| Store | `GET /players/me/store/purchases` | Player | Paginated purchase history. |
| Store | `GET /games/:gameSessionId/store/items` | Staff | Existing catalog list, extended carefully later. |
| Store | `POST /games/:gameSessionId/store/items` | Staff | Existing catalog create. |
| Store | `PATCH /games/:gameSessionId/store/items/:itemId` | Staff | Existing catalog update. |
| Store | `GET/PATCH /games/:gameSessionId/store/pricing-policy` | Staff | Future typed pricing controls. |
| Store | `GET /games/:gameSessionId/store/purchases` | Staff | Review purchase history and reconciliation state. |
| Inventory | `GET /players/me/inventory` | Player | Current holdings projection. |
| Inventory | `GET /players/me/inventory/events` | Player | Paginated inventory history. |
| Inventory | `POST /players/me/inventory/item-use-requests` | Player | Request or immediately perform allowed item use. |
| Inventory | `GET /players/me/inventory/item-use-requests` | Player | Request history and states. |
| Inventory | `GET /players/me/item-effects` | Player | Active timed effects, cooldowns, and restrictions. |
| Inventory | `POST /players/me/inventory/item-use-requests/:requestId/cancel` | Player | Cancel an eligible pending request. |
| Inventory | `GET /games/:gameSessionId/item-use-requests` | Staff | Review pending/history. |
| Inventory | `PATCH /games/:gameSessionId/item-use-requests/:requestId` | Staff | Approve or reject with an audited state transition. |
| Inventory | `POST /games/:gameSessionId/players/:playerId/inventory-adjustments` | Staff | Audited grant/correction. |
| Stocks | `GET /players/me/stocks/assets` | Player | Tradable assets and current authoritative display price. |
| Stocks | `GET /players/me/stocks/portfolio` | Player | Holdings, reservations, and valuation. |
| Stocks | `GET /players/me/stocks/orders` | Player | Paginated order history/open orders. |
| Stocks | `POST /players/me/stocks/orders` | Player | Place market/limit/stop/stop-limit/trailing order. |
| Stocks | `GET /players/me/stocks/orders/:orderId` | Player | Order and fill timeline. |
| Stocks | `PATCH /players/me/stocks/orders/:orderId/cancel` | Player | Cancel eligible open order and release reservations. |
| Stocks | `GET /players/me/stocks/trades` | Player | Paginated completed trade/fill history. |
| Stocks | `GET/PATCH /games/:gameSessionId/stocks/policy` | Staff | Market/risk controls after typed policy design. |
| Stocks | `GET /games/:gameSessionId/stocks/orders` | Staff | Review game order state and execution failures. |
| Stocks | `POST /games/:gameSessionId/stocks/orders/:orderId/cancel` | Staff | Audited emergency/admin cancellation. |
| Analyst | `GET /players/me/analyst/forecasts` | Player | Forecast history and evaluations. |
| Analyst | `POST /players/me/analyst/forecasts` | Player | Submit a forecast against a fixed baseline tick/horizon. |
| Analyst | `GET /players/me/analyst/forecasts/:forecastId` | Player | Forecast details and score. |
| Analyst | `GET /players/me/analyst/score` | Player | Score, reputation, streak, and rank if enabled. |
| Analyst | `GET /games/:gameSessionId/analyst/forecasts` | Staff | Review classroom forecasts. |
| Analyst | `PATCH /games/:gameSessionId/analyst/forecasts/:forecastId` | Staff | Future audited moderation/void action only. |
| Analyst | `GET/PATCH /games/:gameSessionId/analyst-policy` | Staff | Scoring, horizon, cap, and reward policy. |
| Analyst | `POST /games/:gameSessionId/analyst/evaluations/run` | Staff/system | Optional manual evaluation trigger with idempotent worker behavior. |

Route naming and exact payloads require contract review before implementation. Do not add every route in one release; add only those needed by the current phase.

## 14. Implementation Phases

### Phase 1: Planning document only

This document is the only deliverable in this phase. No runtime implementation occurs.

### Phase 2: Schema readiness audit

Compare the live Supabase schema with committed migrations, resolve the Section 16 product questions, define feature flags/fallback behavior, and agree on acceptance scenarios. Do not implement routes until table readiness is confirmed.

### Phase 3: Approved migrations, RPCs, and shared mutation design

Design required migrations/RPCs, idempotency storage, transaction conventions, player-session reuse, typed error envelopes, audit conventions, outbox notifications, and repository interfaces. Each migration and transaction boundary requires separate approval before implementation. Plan concurrency tests for duplicate requests and game/player isolation.

### Phase 4: Simplest backend foundation

Start with store quote calculation against `store_items` and approved settings/pricing rules. Forecast submission can also be an early candidate after analyst tables exist. Do not begin with advanced stock execution, which has the largest concurrency and lifecycle surface.

### Phase 5: Implement one domain at a time

1. Store quote and purchase.
2. Forecast submission and scoring foundation.
3. Inventory item-use requests and effects.
4. Stock order management.

The store purchase phase needs the minimal inventory grant boundary, but the full item-use workflow remains the third domain increment. Market and limit orders should precede stop and stop-limit orders; trailing stops should be last.

### Phase 6: Frontend migration one feature at a time

Migrate each feature only after its backend routes are deployed and tested. Keep feature-specific rollback controls and leave all unmigrated actions on the legacy path.

### Phase 7: Coexistence verification and legacy retirement decision

Run reconciliation, load, security, retry, and rollback tests per game. Monitor duplicate rates, rejected mutations, ledger/projection drift, stale quote rates, and order execution lag. Only after all student mutations are migrated should a separate change propose removing Cloudflare `API_URL`, `callApi`, or `submitAction`.

## 15. Risk Register

| Risk | Impact | Mitigation / acceptance evidence |
| --- | --- | --- |
| Duplicate frontend retries create repeated purchases, trades, uses, or rewards | Financial/inventory corruption | Database-enforced idempotency plus replay/concurrency tests. |
| Balance and domain record diverge | Unreconcilable economy | One transaction for domain write, ledger, projection, and audit; reconciliation job/test. |
| Purchase quote and charged price mismatch | Student trust and balance corruption | Persist executable quote components; atomically consume the exact unexpired quote. |
| Inflation calculation differs across reads and writes | Unpredictable pricing | Version one server-side formula and store its inputs/version on every quote. |
| Player location is missing or stale | Wrong price or eligibility | Define one authoritative location owner; fail closed or omit the modifier when unavailable. |
| Oversold catalog stock | Negative stock/unfair purchases | Conditional decrement or row lock with non-negative constraint. |
| Inventory holding underflows | Duplicate/invalid item use | Lock or compare-and-set available quantity and enforce non-negative constraints. |
| Timed item effects stack unexpectedly | Economy/gameplay abuse | Effect stacking key and explicit replace/reject/cap policy. |
| Oversold portfolio shares | Negative holdings | Reserve shares at order acceptance and lock projection during fills. |
| Cash overcommitted across open orders | Negative balance | Explicit cash reservations included in available-balance calculation. |
| Stale or manipulated price | Unfair execution | Server-authoritative ticks, quote/freshness bounds, never trust client price. |
| Trigger orders execute twice | Duplicate fills/ledger entries | Atomic state claim, unique execution keys, idempotent runner. |
| Concurrent order placement/execution races reservations | Negative cash/shares | Transaction locks, reservation uniqueness, and concurrency stress tests. |
| Pending-order evaluator misses or repeats ticks | Incorrect fills | Durable cursor/tick IDs, replay-safe evaluation, execution-lag alarms. |
| Stop-limit semantics surprise students | Confusion and complaints | Plain-language confirmation, status timeline, gap-risk example. |
| Forecasts use future information | Invalid scoring | Persist baseline tick/time and lock policy; server time only. |
| Forecast rewards inflate the economy | Economy imbalance | Versioned caps, teacher policy, monitoring, and ledger provenance. |
| Students dispute forecast scoring | Classroom trust issue | Store baseline/evaluation ticks, policy version, component scores, and audited re-evaluation. |
| Item use consumes twice or approval loses quantity | Inventory corruption | Reservation/event model and compare-and-set state transitions. |
| Arbitrary item effects become code execution | Security incident | Allowlisted typed effects; no scripts in item metadata. |
| Notification delivery failure blocks a mutation | Poor reliability | Transactional outbox; asynchronous retries; mutation success independent of chat provider. |
| Teacher cannot see pending item approvals | Requests remain unresolved | Staff queue, counts/status filters, age alerts, and notification delivery status. |
| Dynamic pricing becomes opaque or discriminatory | Trust/product risk | Bounded documented components, audit snapshot, no unapproved personal attributes. |
| Client-provided location is spoofed | Pricing abuse | Server-authoritative location model or omit location until one exists. |
| Permissions enabled before routes are ready | Broken student workflow | Capability rollout per feature; bootstrap and frontend switch deployed together. |
| Legacy and Supabase state diverge during coexistence | Conflicting balances/history | One authoritative writer per feature/game, explicit cutover boundary, reconciliation report. |
| Legacy and Supabase snapshots use different shapes | Missing/stale UI sections | Feature-specific normalizers, contract fixtures, and targeted refreshes during migration. |
| Remote schema differs from migrations | Deployment failure/data loss | Schema diff before migration; no assumptions from local types alone. |
| Large monolithic snapshot hides stale sections | Incorrect UI decisions | Dedicated resources and explicit affected-resource refresh. |
| Service-role key reaches browser or logs | Critical credential exposure | Edge-only secret, redaction checks, security audit in every rollout. |

## 16. Open Product Questions

### Trading

- Are fractional shares allowed, or whole shares only?
- Is short selling prohibited for V1?
- Which time-in-force values are educationally useful: day only, day plus GTC, or custom expiry?
- Should class-period-only expiration be supported?
- Are partial fills useful, or should classroom liquidity guarantee all-or-reject fills?
- What tick source and cadence are authoritative inside the simulation?
- What price movement triggers stop orders: last trade, simulated mark, bid/ask, or closing price?
- Are trailing stops supported on sell orders only at first?
- What per-order, daily notional, and open-order limits apply by difficulty?
- Can teachers pause trading or cancel student orders, and how is that explained/audited?
- How should market closure handle open day and GTC orders?

### Analyst forecasts

- Which horizons are supported and who configures them?
- What return band defines HOLD by difficulty or volatility?
- Should confidence affect both reward and penalty, and by how much?
- Can a forecast be edited during a grace period, and are revisions visible?
- Is one forecast allowed per player/asset/horizon or multiple competing forecasts?
- When do classmates or teachers see a student's thesis?
- What exact directional/target/rubric weights and reward caps apply?
- How are missing ticks, halted assets, and corrected prices handled?
- Can staff void or rescore, and must prior rewards be reversed or retained?
- What submission rate and duplicate-thesis controls limit forecast spam?

### Inventory and item use

- Which catalog item types are approved for V1?
- Which effects can auto-fulfill, and which always require teacher approval?
- Is quantity reserved while a request awaits approval?
- For approval-required items, is inventory decremented on request, approval, or fulfillment?
- Can students cancel pending requests, and until what state?
- Do items expire, transfer, combine, or support partial use?
- What does `durable` ownership mean for repeated uses?
- Can effects stack, and do replace, reject, highest-wins, or capped-additive rules apply?
- Are item rules and effect values admin-configurable or fixed by approved templates?
- Which notification channel is required, and what is the fallback if delivery fails?
- Can teachers grant/revoke inventory, and what reasons are mandatory?

### Store and pricing

- What is `location`: player location, classroom zone, game region, or event context?
- Who sets location, and when can it change?
- Where does inflation come from and how often does it change?
- Which modifiers are visible to students?
- What floors, ceilings, and maximum change per period apply?
- How long is a quote valid?
- Does a quote reserve stock or only price?
- Are purchases all-or-nothing for quantity?
- Are refunds, returns, purchase limits, discounts, bundles, and taxes in scope?
- Does a teacher price edit invalidate outstanding quotes?
- Can a catalog item use infinite inventory, and how is that represented without a magic stock number?

### Economy

- Is `ledger_entries` confirmed as the authoritative balance history for every new mutation?
- Is `account_balances` confirmed as the only current-balance projection used for eligibility checks?
- Must every mutation write `audit_log`, including reads that issue executable quotes?
- Should inflation and difficulty multipliers live in validated `game_settings` JSON or dedicated typed tables?

### Migration and operations

- Is cutover controlled globally, per game, per student, or per feature?
- During coexistence, which system is authoritative for each feature and how is dual writing prohibited?
- What reconciliation thresholds block rollout?
- What retention is required for orders, fills, quotes, idempotency records, events, and audit logs?
- What load profile should stock runner and evaluation worker support?
- What is the rollback policy after a Supabase mutation has already changed ledger/inventory state?

## 17. Final Recommendation

Build these capabilities as four coordinated domain systems, not four renamed action handlers. Start with the shared mutation foundation and the dynamic store purchase transaction because it exercises the essential cross-domain pattern: server-derived identity, an expiring authoritative quote, stock mutation, ledger debit, balance projection, inventory grant, idempotency, and audit in one transaction.

Then complete inventory use, analyst evaluation/rewards, and the stock foundation. Deliver market and limit orders before stop families; trailing stops should be the last trading increment because they demand durable reference-price state and highly reliable repeated execution.

Adopt dedicated resource APIs as the long-term response model, using a hybrid transition around the existing `/players/me` bootstrap. Keep Cloudflare `API_URL`, `callApi`, and `submitAction` until every legacy student mutation has a proven Supabase replacement, feature-specific reconciliation is clean, permissions are deliberately enabled, and rollback behavior is tested. Do not dual-write the same student mutation to both backends.

Before implementation, approve the product rules, compare the live schema to committed migrations, design the transaction and idempotency contracts, and review each migration/route phase separately. This preserves the existing classroom experience while moving the authoritative mutation systems to an auditable, game-scoped, player-scoped Supabase architecture.
