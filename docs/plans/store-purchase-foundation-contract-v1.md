# Store Purchase Foundation Contract v1

Status: planning only  
Target backend: Supabase Edge Function `classroom-api`  
Target legacy action: `STORE_PURCHASE`  
Scope: quote + purchase foundation only

## 1. Purpose

This document defines the first implementation contract after the advanced student mutation systems plan and the schema readiness audit.

The goal is to replace the legacy `STORE_PURCHASE` action with a Supabase-backed store quote and purchase system, without attempting to build every advanced gameplay system at once.

This slice should:

- introduce a server-owned quote-before-purchase model;
- prepare for dynamic pricing without overbuilding it before location/inflation systems exist;
- use the existing `store_items`, `ledger_entries`, `account_balances`, and `audit_log` foundations;
- introduce the minimum missing schema required for safe purchases and inventory ownership;
- keep legacy `API_URL`, `callApi()`, and `submitAction()` available until the feature is fully migrated and verified.

This slice should not implement:

- stock trading or order management;
- analyst forecasts or scoring;
- advanced item-use effects;
- player movement/location mechanics;
- full inflation simulation;
- frontend migration until backend contracts are deployed and tested.

## 2. Current legacy `STORE_PURCHASE` behavior

Current frontend source:

- `frontend/src/features/store/store.js`

Current behavior:

- Store rows come from `state.store`.
- Purchase history is derived from `state.transactions` filtered to `mode === "STORE_PURCHASE"`.
- The UI shows item name, price, stock/inventory, category, and description.
- The button is enabled when `can("STORE_PURCHASE")` returns true.
- The frontend sends a simple payload through `submitAction("STORE_PURCHASE", payload)`.

Current payload:

```json
{
  "itemId": "string",
  "quantity": 1
}
```

Current expected response behavior:

- `submitAction()` throws if the response is not ok.
- On success, the UI displays `result.message || "Purchase complete."`.
- The current view and identity are rerendered.
- Snapshot merge behavior remains handled by the shared legacy path.

Current limitations:

- No quote is requested before purchase.
- No quote id, quote expiry, pricing version, idempotency key, or client submitted timestamp is sent.
- The frontend displays a price snapshot but cannot prove the price is executable.
- The frontend does not see a server-generated price breakdown.
- There is no modeled distinction between base price, inflation, location, scarcity, discount, and final price.
- There is no Supabase `store_purchases` table.
- There is no Supabase `store_purchase_quotes` table.
- There is no Supabase `inventory_holdings` table.
- There is no Supabase `inventory_events` table.
- There is no general mutation idempotency table.
- The existing staff store catalog route is not a player purchase route.

## 3. Existing backend foundations

Existing reusable foundations:

- `store_items` exists and is scoped to `game_session_id`.
- `store_items` already stores `item_key`, `name`, `description`, `category`, `price`, `currency_code`, `stock_quantity`, `status`, `visibility`, and `sort_order`.
- `ledger_entries` is the append-only source of truth for money movement.
- `account_balances` is the current balance projection/cache.
- `audit_log` exists for sensitive actions.
- `record_player_ledger_entry(...)` already atomically inserts a ledger entry, updates the balance projection, and writes an audit log entry.
- Player sessions already resolve to a trusted `game_session_id` and `player_id`.

Important boundary:

The current staff catalog route family under `/games/:gameSessionId/store/items` must stay staff/admin-only. Player purchases must use `/players/me/...` routes and derive player identity from the bearer token.

## 4. Proposed Supabase route contracts

### 4.1 Quote route

Route:

```text
POST /players/me/store/quote
```

Purpose:

Create a short-lived server-owned quote for a specific item and quantity.

Authentication:

- Player bearer token.
- Server resolves active player session.
- Server derives `game_session_id` and `player_id`.
- Request must not include trusted `playerId` or `gameSessionId`.

Request body:

```json
{
  "itemId": "uuid",
  "quantity": 1
}
```

Response body:

```json
{
  "ok": true,
  "quoteId": "uuid",
  "itemId": "uuid",
  "itemName": "Homework Pass",
  "quantity": 1,
  "baseUnitPrice": 100.00,
  "inflationMultiplier": 1.0,
  "locationMultiplier": 1.0,
  "scarcityMultiplier": 1.0,
  "discountAmount": 0.00,
  "finalUnitPrice": 100.00,
  "finalTotalPrice": 100.00,
  "currencyCode": "ECO",
  "expiresAt": "2026-06-21T00:00:00.000Z",
  "pricingVersion": "store-pricing-v1"
}
```

Validation:

- `itemId` is required and must resolve to an item in the player's `game_session_id`.
- `quantity` must be an integer greater than zero.
- Item must be `active` and `visible` for player purchase.
- If finite stock is enforced, quote creation may reject if requested quantity is greater than available stock.
- Quote creation must not debit balance or decrement stock.

### 4.2 Purchase route

Route:

```text
POST /players/me/store/purchases
```

Purpose:

Convert a valid quote into a completed store purchase.

Authentication:

- Player bearer token.
- Server resolves active player session.
- Server derives `game_session_id` and `player_id`.

Request body:

```json
{
  "quoteId": "uuid",
  "idempotencyKey": "client-generated-key",
  "clientSubmittedAt": "2026-06-21T00:00:00.000Z"
}
```

Response body:

```json
{
  "ok": true,
  "message": "Purchase complete.",
  "purchaseId": "uuid",
  "quoteId": "uuid",
  "finalTotalPrice": 100.00,
  "currencyCode": "ECO",
  "refreshRequired": true
}
```

Validation:

- `quoteId` is required.
- `idempotencyKey` is required.
- Quote must belong to the authenticated player and game session.
- Quote must be unexpired and unused.
- Quote item must still exist.
- Item must still be purchasable unless product policy allows quote-locking through status changes.
- Stock and balance must be checked at purchase time, not only at quote time.

### 4.3 Purchase history route

Route:

```text
GET /players/me/store/purchases
```

Purpose:

Return the authenticated player's store purchase history.

Authentication:

- Player bearer token.
- Server resolves active player session.

Response body:

```json
{
  "ok": true,
  "purchases": [
    {
      "purchaseId": "uuid",
      "itemId": "uuid",
      "itemName": "Homework Pass",
      "quantity": 1,
      "finalTotalPrice": 100.00,
      "currencyCode": "ECO",
      "status": "COMPLETED",
      "createdAt": "2026-06-21T00:00:00.000Z"
    }
  ]
}
```

V1 can defer this route if `/players/me` eventually returns recent purchases, but the route should be included in the contract so purchase history is not permanently coupled to the full player bootstrap payload.

## 5. Minimal v1 dynamic pricing policy

V1 must be conservative and server-owned.

Pricing inputs:

| Component | V1 source | Initial value | Later expansion |
|---|---|---:|---|
| Base unit price | `store_items.price` | actual catalog price | admin catalog remains the source of base price |
| Inflation multiplier | server policy | `1.0` | typed inflation setting or game settings policy |
| Location multiplier | server policy | `1.0` | player location and regional pricing |
| Scarcity multiplier | server policy | `1.0` | stock/demand formula |
| Discount amount | server policy | `0.00` | active item effects or coupons |
| Final unit price | calculated server-side | formula result | remains server-owned |
| Final total price | calculated server-side | unit x quantity minus discounts | remains server-owned |

Formula for v1:

```text
finalUnitPrice = roundCurrency(baseUnitPrice * inflationMultiplier * locationMultiplier * scarcityMultiplier)
finalTotalPrice = roundCurrency((finalUnitPrice * quantity) - discountAmount)
```

Rules:

- Frontend must never submit trusted price values.
- Quote response may display price breakdown, but purchase execution must verify the server-side quote record.
- Missing inflation/location/scarcity systems must not be faked with client data.
- V1 should store multiplier values even when they are all neutral, so later pricing changes do not break the contract.
- V1 should use a `pricingVersion`, starting with `store-pricing-v1`.

## 6. Required future migrations

Do not create these migrations in this planning branch.

### 6.1 `store_purchase_quotes`

Purpose:

Store short-lived price quotes for player purchases.

Key columns:

- `id uuid primary key default gen_random_uuid()`
- `game_session_id uuid not null references game_sessions(id)`
- `player_id uuid not null`
- `store_item_id uuid not null references store_items(id)`
- `quantity integer not null`
- `currency_code text not null default 'ECO'`
- `base_unit_price numeric(14,2) not null`
- `inflation_multiplier numeric(10,4) not null default 1`
- `location_multiplier numeric(10,4) not null default 1`
- `scarcity_multiplier numeric(10,4) not null default 1`
- `discount_amount numeric(14,2) not null default 0`
- `final_unit_price numeric(14,2) not null`
- `final_total_price numeric(14,2) not null`
- `pricing_version text not null`
- `status text not null default 'CREATED'`
- `created_at timestamptz not null default now()`
- `expires_at timestamptz not null`
- `used_at timestamptz null`
- `cancelled_at timestamptz null`

Important constraints:

- `(game_session_id, player_id)` foreign key to `players(game_session_id, id)`.
- `quantity > 0`.
- prices and multipliers non-negative.
- status check: `CREATED`, `USED`, `EXPIRED`, `CANCELLED`.
- active quote lookup index on `(game_session_id, player_id, id, status, expires_at)`.

### 6.2 `store_purchases`

Purpose:

Store completed or failed purchase records as source records for ledger/inventory/audit.

Key columns:

- `id uuid primary key default gen_random_uuid()`
- `game_session_id uuid not null references game_sessions(id)`
- `player_id uuid not null`
- `store_item_id uuid not null references store_items(id)`
- `quote_id uuid null references store_purchase_quotes(id)`
- `quantity integer not null`
- `currency_code text not null default 'ECO'`
- `final_unit_price numeric(14,2) not null`
- `final_total_price numeric(14,2) not null`
- `ledger_entry_id uuid null references ledger_entries(id)`
- `status text not null default 'COMPLETED'`
- `idempotency_key text not null`
- `client_submitted_at timestamptz null`
- `created_at timestamptz not null default now()`

Important constraints:

- `(game_session_id, player_id)` foreign key to `players(game_session_id, id)`.
- `quantity > 0`.
- `final_total_price >= 0`.
- status check: `COMPLETED`, `FAILED`, `REVERSED`.
- unique idempotency constraint on `(game_session_id, player_id, idempotency_key)` or via shared idempotency table.

### 6.3 `inventory_holdings`

Purpose:

Represent current item ownership by player.

Key columns:

- `id uuid primary key default gen_random_uuid()`
- `game_session_id uuid not null references game_sessions(id)`
- `player_id uuid not null`
- `store_item_id uuid not null references store_items(id)`
- `quantity_owned integer not null default 0`
- `quantity_reserved integer not null default 0`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Important constraints:

- `(game_session_id, player_id)` foreign key to `players(game_session_id, id)`.
- unique `(game_session_id, player_id, store_item_id)`.
- quantities cannot be negative.

### 6.4 `inventory_events`

Purpose:

Append-only history of inventory changes.

Key columns:

- `id uuid primary key default gen_random_uuid()`
- `game_session_id uuid not null references game_sessions(id)`
- `player_id uuid not null`
- `store_item_id uuid not null references store_items(id)`
- `quantity_delta integer not null`
- `event_type text not null`
- `source_domain text not null`
- `source_action text not null`
- `source_id uuid null`
- `created_at timestamptz not null default now()`
- `metadata jsonb not null default '{}'::jsonb`

Important constraints:

- `quantity_delta <> 0`.
- event type check: `PURCHASED`, `USED`, `RESERVED`, `RELEASED`, `ADJUSTED`, `REVERSED`.

### 6.5 `mutation_idempotency_keys`

Purpose:

Prevent duplicate purchases and provide safe retry behavior.

Key columns:

- `id uuid primary key default gen_random_uuid()`
- `game_session_id uuid not null references game_sessions(id)`
- `player_id uuid not null`
- `route_key text not null`
- `idempotency_key text not null`
- `request_hash text not null`
- `status text not null default 'STARTED'`
- `result_type text null`
- `result_id uuid null`
- `response_body jsonb null`
- `created_at timestamptz not null default now()`
- `completed_at timestamptz null`
- `expires_at timestamptz not null`

Important constraints:

- unique `(game_session_id, player_id, route_key, idempotency_key)`.
- status check: `STARTED`, `COMPLETED`, `FAILED`.

## 7. Store quote lifecycle

Quote lifecycle states:

- `CREATED`: quote was calculated and can be used until expiry.
- `USED`: quote was consumed by a successful purchase.
- `EXPIRED`: quote is no longer usable.
- `CANCELLED`: quote was invalidated by explicit policy or cleanup.

Optional later state:

- `RESERVED`: quote temporarily reserves stock or balance. Not recommended for v1 because it adds reservation complexity.

Quote rules:

- Quote belongs to exactly one `game_session_id` and `player_id`.
- Quote stores item id, quantity, price breakdown, final total, currency, pricing version, created time, expiry, and status.
- Quote must not trust client price data.
- Quote should expire quickly, for example 2-5 minutes.
- Purchase must verify quote ownership, status, expiry, item, and quantity.
- Purchase must still verify balance and stock at execution time.
- Quote creation does not guarantee purchase execution unless product later adds reservation semantics.

## 8. Purchase transaction boundary

Future use case / RPC:

```text
purchase_store_item(...)
```

Recommended inputs:

- `p_session_token_hash` or already-resolved trusted player context from Edge handler.
- `p_game_session_id`.
- `p_player_id`.
- `p_quote_id`.
- `p_idempotency_key`.
- `p_client_submitted_at`.
- request metadata JSON.

Atomic behavior:

1. Resolve or receive trusted active player session context.
2. Validate idempotency key.
3. Check whether the same idempotency key already completed.
4. If completed with same request hash, return original result.
5. If completed/started with different request hash, reject `idempotency_conflict`.
6. Lock quote row for update.
7. Validate quote belongs to the same game session and player.
8. Validate quote is `CREATED` and unexpired.
9. Lock store item row for update.
10. Validate item exists, belongs to same game session, is `active`, and is `visible`.
11. Validate stock quantity is sufficient.
12. Lock or update account balance safely.
13. Validate cash balance is sufficient.
14. Insert `store_purchases` row.
15. Insert ledger debit using either `record_player_ledger_entry` or an expanded purchase-specific transaction function.
16. Decrement `store_items.stock_quantity` if finite-stock behavior is enabled.
17. Insert or update `inventory_holdings`.
18. Insert `inventory_events` row with `event_type = 'PURCHASED'`.
19. Insert `audit_log` row.
20. Mark quote `USED`.
21. Mark idempotency row `COMPLETED`.
22. Return purchase id, total, currency, and refresh instruction.

Critical rule:

The final implementation must not perform quote validation, ledger debit, stock decrement, and inventory update as separate unprotected client-visible operations. They must be one transaction boundary.

## 9. Idempotency contract

Every purchase request should include a frontend-generated idempotency key.

Recommended key format:

```text
store-purchase:<uuid-or-random-token>
```

Requirements:

- Key must be scoped by `game_session_id`, `player_id`, and route/action.
- Server must hash the meaningful request body and store that hash with the key.
- Duplicate request with the same key and same hash should return the original result.
- Duplicate request with the same key and different hash should return `idempotency_conflict`.
- Started-but-not-completed records should either block briefly or be recoverable through timeout/expiry policy.
- Idempotency records should expire after a defined window, for example 24 hours to 7 days.

This is required before enabling purchase retries or double-click-prone mobile UI.

## 10. Error contract

All errors should use stable JSON:

```json
{
  "ok": false,
  "error": {
    "code": "example_code",
    "message": "Human readable message.",
    "retryable": false
  }
}
```

Required error codes:

| Code | When | Retryable |
|---|---|---|
| `unauthorized` | Missing/invalid player bearer token | false |
| `invalid_request` | Malformed body, invalid item id, invalid quantity, missing idempotency key | false |
| `item_not_found` | Item does not exist in player's game session | false |
| `item_unavailable` | Item is not active/visible | false |
| `insufficient_stock` | Requested quantity exceeds stock | false |
| `insufficient_balance` | Player lacks cash balance | false |
| `quote_not_found` | Quote id does not exist for this player/session | false |
| `quote_expired` | Quote expired before purchase | false |
| `quote_already_used` | Quote was already consumed | false |
| `idempotency_conflict` | Same key used for a different request | false |
| `purchase_failed` | Unexpected server failure | maybe true only if no write committed |

Implementation must be careful with `purchase_failed`: once a write may have committed, the safer response is to resolve through idempotency rather than telling the client to blindly retry.

## 11. Frontend migration plan

Do not edit frontend in this contract branch.

Future helpers in `frontend/src/core/api.js`:

- `callPlayerStoreQuoteApi(sessionToken, payload)`
- `callPlayerStorePurchaseApi(sessionToken, payload)`
- `callPlayerStorePurchasesApi(sessionToken)`

Future UI changes in `frontend/src/features/store/store.js`:

- Replace direct purchase click with quote step.
- Show price breakdown before final purchase.
- Show base price, inflation multiplier, location multiplier, scarcity multiplier, discount, and final total.
- Show quote expiry time or warning.
- Generate idempotency key for purchase confirmation.
- Lock purchase controls while quote/purchase requests are running.
- After purchase, call `/players/me` or another refresh helper when `refreshRequired === true`.
- Keep legacy `submitAction("STORE_PURCHASE", ...)` until the Supabase route is fully deployed and tested.

Potential user flow:

1. Player selects item and quantity.
2. Player clicks `Get Quote`.
3. UI displays server quote and price breakdown.
4. Player clicks `Confirm Purchase`.
5. UI sends quote id and idempotency key.
6. Server completes purchase and returns `refreshRequired: true`.
7. UI refreshes player state.

## 12. Implementation phases

### Phase 1: Contract only

This document.

### Phase 2: Migration PR

Add only the required schema for:

- `store_purchase_quotes`;
- `store_purchases`;
- `inventory_holdings`;
- `inventory_events`;
- `mutation_idempotency_keys` or equivalent.

No route implementation in the migration PR unless explicitly approved.

### Phase 3: RPC/use-case contract tests

Add tests for:

- valid quote creation;
- invalid quantity;
- unavailable item;
- expired quote;
- insufficient balance;
- insufficient stock;
- duplicate idempotency key with same body;
- duplicate idempotency key with different body;
- successful purchase writes all required records atomically.

### Phase 4: Backend route implementation

Add player routes:

- `POST /players/me/store/quote`;
- `POST /players/me/store/purchases`;
- optionally `GET /players/me/store/purchases`.

Keep handlers thin and push transaction logic into store/economy/inventory application code or RPC.

### Phase 5: Frontend helper and UI migration

Add Supabase helpers and migrate store UI away from `submitAction("STORE_PURCHASE", ...)`.

### Phase 6: Legacy retirement

Remove legacy `STORE_PURCHASE` only after:

- backend route is deployed;
- frontend is migrated;
- purchase behavior is verified;
- no active caller needs the legacy action.

Do not remove global `API_URL`, `callApi()`, or `submitAction()` until the other legacy actions are also migrated.

## 13. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Duplicate purchases | Player is charged twice or receives duplicate inventory | Require idempotency before purchase route launch. |
| Stale quote | Player confirms a price that no longer reflects rules | Short quote expiry; validate quote at purchase. |
| Stock underflow | Multiple players buy the last item concurrently | Lock item row or use conditional stock decrement in transaction. |
| Balance corruption | Balance debited without inventory or inventory granted without debit | One transaction boundary for purchase, ledger, stock, inventory, audit. |
| Inventory mismatch | Purchase history and inventory diverge | Use `store_purchases` as source record and `inventory_events` as inventory source history. |
| Dynamic pricing confusion | Students do not understand why price changed | Show quote breakdown and expiry. |
| Frontend/backend divergence | Legacy snapshot behavior differs from Supabase purchase state | Migrate one store flow at a time and refresh from Supabase after purchase. |
| Overbuilding pricing | Location/inflation work blocks store purchase | Use neutral multipliers in v1 while storing the breakdown shape. |
| Staff catalog confusion | Staff item management gets mixed with player purchase logic | Keep staff `/games/:gameSessionId/store/items` routes separate from player `/players/me/store/...` routes. |
| Partial write failure | Money, stock, inventory, and audit disagree | Transaction-safe RPC/use case with rollback on failure. |

## 14. Final recommendation

Implement store quote + purchase foundation before stock orders.

This is the best first vertical slice because:

- `store_items` already exists;
- `ledger_entries` and `account_balances` already exist;
- `audit_log` already exists;
- staff catalog management already exists;
- the schema gap is smaller than advanced stock order management.

The next PR after this contract should be a migration-only PR for the required purchase, inventory, and idempotency tables. Do not implement routes until those schemas are reviewed and merged.

Keep `API_URL`, `callApi()`, and `submitAction()` until the Supabase store purchase route is built, tested, deployed, and the frontend store caller is migrated.
