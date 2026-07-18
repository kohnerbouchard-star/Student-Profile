# Player Stock Watchlist Contract

Date: 2026-07-18  
Target PR: #158  
Status: Backend implementation checkpoint; no production deployment authorized

## Routes

### Read the authenticated player's watchlist

`GET /players/me/stocks/watchlist`

Optional query parameters:

- `limit`: integer from 1 through 100; default 50.
- `offset`: integer from 0 through 10,000; default 0.

### Add an asset

`PUT /players/me/stocks/watchlist/:assetId`

### Remove an asset

`DELETE /players/me/stocks/watchlist/:assetId`

`assetId` is the normalized public ticker, such as `AURA` or `BRK.B`. Internal stock-table UUIDs are rejected at the HTTP boundary.

Mutation routes accept no query parameters and no request body.

## Authentication and ownership

All routes require `x-player-session-token`.

The Backend derives:

- immutable player UUID;
- active player-session UUID;
- game UUID;
- session status and expiration.

The browser may not select game, player, owner, or session scope through query parameters, headers, or a mutation body. The stock market runner secret is prohibited.

## Read response

A successful read returns HTTP 200:

```json
{
  "ok": true,
  "generatedAt": "2026-07-18T06:30:00.000Z",
  "availability": "available",
  "tickIndex": 42,
  "assets": [
    {
      "assetId": "AURA",
      "ticker": "AURA",
      "companyName": "Aurora Aerospace Systems",
      "sector": "AI_AEROSPACE",
      "countryCode": "SOLVEND",
      "currentPrice": 105,
      "previousClose": 100,
      "changePct": 5,
      "openPrice": 100,
      "dayHigh": 106,
      "dayLow": 99,
      "volume": 1000,
      "marketCap": 105000000,
      "currentVolatility": 0.05,
      "longRunVolatility": 0.04,
      "description": "Public company description",
      "isWatchlisted": true
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "returned": 1,
    "hasMore": false,
    "nextOffset": null
  },
  "emptyState": null
}
```

A valid empty first page returns `assets: []` with:

```json
{
  "reason": "stock_watchlist_empty"
}
```

Inactive or removed assets are omitted from the browser response even if a historical watchlist row remains. Pagination continues to follow deterministic watchlist-entry order.

## Mutation response and idempotency

A successful PUT or DELETE returns HTTP 200:

```json
{
  "ok": true,
  "generatedAt": "2026-07-18T06:30:00.000Z",
  "assetId": "AURA",
  "isWatchlisted": true,
  "changed": true
}
```

Idempotency semantics:

- PUT on an asset already present returns `changed: false`.
- DELETE on an asset already absent returns `changed: false`.
- PUT is restricted to one active asset with the ticker inside the authenticated game.
- DELETE resolves the same-game ticker and can remove a stale row after an asset becomes inactive.
- duplicate active ticker resolution fails closed rather than selecting an arbitrary internal row.

No browser-supplied idempotency key is required because the database unique constraint and scoped delete operation make the desired state idempotent.

## Persistence model

Migration:

`backend/supabase/migrations/20260718064000_add_player_stock_watchlist_v1.sql`

The table key is an internal UUID. Its authoritative uniqueness boundary is:

`(game_session_id, player_id, stock_asset_id)`

Composite foreign keys enforce same-game player and asset ownership. A before-insert trigger rejects inactive players and inactive stock assets.

The table has forced RLS and no browser policies. `public`, `anon`, and `authenticated` have all table privileges revoked. Only `service_role` receives `SELECT`, `INSERT`, and `DELETE`; no update privilege is granted.

The migration is forward-only. This checkpoint does not execute it in production.

## Privacy boundary

Responses never serialize:

- player UUID;
- player-session UUID;
- game UUID;
- watchlist-row UUID;
- stock-table UUID.

The public ticker is the only asset identifier exposed by this contract.

## Error contract

Errors use the shared Edge envelope:

```json
{
  "ok": false,
  "error": {
    "code": "player_stock_watchlist_asset_not_found",
    "message": "Stock asset is not available in the authenticated game.",
    "retryable": false
  }
}
```

Principal codes:

- `missing_player_session` or another authoritative session error: 401/403.
- `invalid_player_stock_watchlist_request`: 400.
- `stock_runner_secret_not_allowed`: 400.
- `method_not_allowed`: 405.
- `player_stock_watchlist_asset_not_found`: 404.
- `player_stock_watchlist_scope_violation`: 500, non-retryable.
- `player_stock_watchlist_service_unavailable`: 503, retryable.

## Cache controls

Successful responses include:

- `Cache-Control: private, no-store`
- `Vary: authorization, x-player-session-token`

## Deferred work

This tranche does not:

- modify the Player Terminal;
- modify Admin code;
- deploy the migration or Edge Function;
- alter stock-order settlement;
- include watchlist state in collection/detail responses;
- advertise support through the capability manifest yet.
