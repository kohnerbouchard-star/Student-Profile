# Player Stock Asset List Contract

**Date:** 2026-07-18  
**Repository:** `kohnerbouchard-star/Student-Profile`  
**Branch:** `agent/player-backend-reconciliation-v2`  
**Status:** Backend-only checkpoint; no production deployment or runtime cutover authorized

## Endpoint

`GET /players/me/stocks/assets`

The route is authenticated exclusively through `x-player-session-token`. The Backend derives the immutable player UUID and active game scope from that session. The route does not accept a client-selected player, owner, session, recipient, game, or stock-table UUID.

## Query

| Field | Default | Bounds | Meaning |
|---|---:|---:|---|
| `limit` | 50 | 1–100 | Maximum assets returned in one page |
| `offset` | 0 | 0–10,000 | Deterministic zero-based page offset |

Duplicate values, non-integers, unsupported query fields, malformed extra path segments, and game-scope query or header selection are rejected with `400 invalid_player_stock_asset_list_request`.

## Data scope

The repository reads only active `game_session_stock_assets` rows for the authenticated game and joins current volume/tick metadata through the existing `read_latest_stock_market_ticks_for_game` RPC.

The implementation performs one bounded asset query and one latest-tick query. It does not issue a query per asset.

Assets are ordered by normalized ticker and then internal asset UUID. The internal UUID is used only to correlate repository records and current ticks inside the Backend.

## Browser DTO

The response is compatible with the Player Terminal Market read model:

```json
{
  "ok": true,
  "generatedAt": "2026-07-18T05:00:00.000Z",
  "availability": "available",
  "tickIndex": 42,
  "sectors": ["All", "AI_AEROSPACE"],
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
      "description": "Public company description"
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

`assetId` is the normalized public ticker. It is not the `game_session_stock_assets.id` UUID. The response does not serialize internal player, player-session, game-session, stock-asset, assignment, holding, order, trade, tick, or event UUIDs.

Duplicate ticker values in one authenticated game are treated as a server-side scope/data-integrity violation rather than exposing the internal UUID as a fallback identifier.

## Empty and unavailable states

A valid authenticated game with no active stock assets returns `200`, `availability: "available"`, an empty `assets` array, and:

```json
{
  "reason": "stock_market_not_initialized"
}
```

Persistence or schema-read failures return retryable `503 player_stock_asset_service_unavailable`. A legitimate empty market is therefore distinct from temporary service unavailability.

## Response controls

Successful responses include:

- `Cache-Control: private, no-store`
- `Vary: authorization, x-player-session-token`

The stock-market runner secret is prohibited on the player route.

## Deliberately excluded from this checkpoint

- asset detail;
- bounded price history;
- watchlist reads or writes;
- Market order changes;
- migrations or schema changes;
- Admin or Player Terminal changes;
- Edge Function deployment or production cutover.

## Market-order integration boundary

The existing stock-order settlement implementation currently receives the internal stock-asset UUID. Before connected Player Terminal Market orders are enabled, the mutation boundary must resolve the public ticker `assetId` inside the authenticated game to exactly one active internal stock asset and then invoke the existing settlement implementation. The browser must not be changed back to submitting ownership or stock-table UUIDs.
