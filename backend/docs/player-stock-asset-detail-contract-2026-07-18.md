# Player Stock Asset Detail Contract

Date: 2026-07-18  
Target PR: #158  
Route: `GET /players/me/stocks/assets/:assetId`

## Purpose

Expose one active stock asset and a bounded chart history to the authenticated Player Terminal without publishing database UUIDs or allowing the browser to select player or game ownership.

## Authentication and scope

The request requires `x-player-session-token`.

The Backend derives:

- immutable player UUID;
- active player-session ID;
- active game ID;
- session validity and expiration.

The browser must not provide game, player, owner, or player-session scope through query parameters, headers, or payload fields. The stock runner secret is prohibited.

## Public asset identifier

`:assetId` is the normalized public ticker, for example `AURA` or `BRK.B`.

Accepted syntax:

```text
[A-Z0-9][A-Z0-9.-]{0,15}
```

Lowercase route values are normalized to uppercase. Internal stock-asset UUIDs are not accepted as route identifiers and are never returned.

## Query

| Field | Default | Minimum | Maximum |
|---|---:|---:|---:|
| `historyLimit` | 200 | 1 | 500 |

Duplicate, fractional, empty, negative, excessive, and unsupported query parameters fail closed with `400 invalid_player_stock_asset_detail_request`.

## Persistence boundary

The repository first resolves one active stock row using all of:

- authenticated game ID;
- normalized ticker;
- `is_active = true`.

It reads at most two matching rows so a corrupted duplicate ticker fails closed. If no active row is available, no history query is issued.

History is then filtered simultaneously by:

- authenticated game ID;
- resolved internal stock-asset UUID;
- resolved ticker.

The query orders by `tick_index DESC, created_at DESC`, applies the requested bound in SQL, and returns the selected points to the service. The service verifies every record remains in the authenticated game and resolved asset scope, rejects duplicate tick indices, and returns history in ascending chart order.

## Success response

```json
{
  "ok": true,
  "generatedAt": "2026-07-18T06:00:00.000Z",
  "availability": "available",
  "tickIndex": 42,
  "asset": {
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
    "volume": 1200,
    "marketCap": 105000000,
    "currentVolatility": 0.05,
    "longRunVolatility": 0.04,
    "description": "Public company description"
  },
  "history": [
    {
      "tickIndex": 41,
      "price": 104,
      "previousPrice": 103,
      "changePct": 0.970874,
      "volume": 1100,
      "createdAt": "2026-07-18T05:41:00.000Z"
    },
    {
      "tickIndex": 42,
      "price": 105,
      "previousPrice": 104,
      "changePct": 0.961538,
      "volume": 1200,
      "createdAt": "2026-07-18T05:42:00.000Z"
    }
  ],
  "historyLimit": 200,
  "historyReturned": 2
}
```

The response is marked `private, no-store` and varies on authorization and player-session token.

## Privacy boundary

The response excludes:

- player UUID;
- player-session UUID;
- game UUID;
- internal stock-asset UUID;
- runner secret or runner configuration;
- fair-value anchors;
- fundamentals and country-exposure calculation inputs;
- service-role credentials.

## Errors

| HTTP | Code | Meaning |
|---:|---|---|
| 400 | `invalid_player_stock_asset_detail_request` | Malformed public ID, invalid query, or client-selected game scope. |
| 400 | `stock_runner_secret_not_allowed` | A browser attempted to submit the runner secret. |
| 401 | player-session error code | Missing, expired, revoked, inactive, or wrong-scope session. |
| 404 | `player_stock_asset_not_found` | The public ticker is not active in the authenticated game. |
| 503 | `player_stock_asset_detail_service_unavailable` | Persistence is temporarily unavailable. |
| 500 | `player_stock_asset_detail_scope_violation` | Repository output violated the authenticated scope or uniqueness invariant. |

A missing asset is distinct from a retryable persistence failure.

## Deferred behavior

- `isWatchlisted` is added only after the watchlist ownership schema and routes are reconciled.
- Market orders continue using the existing settlement path. That route must resolve the public ticker server-side before the Player Terminal uses this identifier for mutations.
- No production deployment or migration is part of this tranche.
