# Game Dashboard Domain

The game dashboard domain provides the player-safe snapshot boundary for loading
one active player's game screen with one backend request.

## Snapshot Endpoint

```text
GET /players/me/game/dashboard?gameSessionId=<gameSessionId>
```

The route uses `x-player-session-token`, resolves the active player session on
the server, and verifies the requested `gameSessionId` matches that session.
The request must not include `playerId`, `playerSessionId`, or stock runner
secret headers. Player identity and player session scope are derived only from
the resolved session token.

The response has three top-level data areas:

- `gameSession`: game metadata, market status, current stock tick, and update time.
- `me`: private data for the resolved player only, including cash balances,
  stock holdings/orders/trades, store inventory, recent purchases, and empty
  contract progress placeholders.
- `public`: game-public data scoped to the same game session, including public
  player identity, leaderboard summaries, public stock market data, market news,
  public store listing metadata, and empty contract placeholders.

## Data Boundary

Game-public data may include player IDs, display names, roster labels, country
codes, rank, net worth summaries, public stock prices, public market news, and
public store catalog metadata.

Player-private data is scoped only to the resolved player and may include cash
balances, stock holdings, orders, trades, store inventory, purchase history, and
future contract progress.

The dashboard must not expose session IDs, session tokens, session token hashes,
access codes, other players' cash balances, holdings, orders, trades, store
inventory, purchase history, contract progress, ledger entries, or runner
secrets.

## Realtime Contract

This branch prepares the public realtime contract but does not publish
Supabase broadcast events. There is no existing low-risk broadcast utility in
the current backend, so publishing is left for a later branch. This branch also
does not add Supabase Realtime auth or RLS policy migrations.

Future clients should subscribe only to the game-public channel:

```text
game:<gameSessionId>:public
```

The dashboard response includes:

```json
{
  "realtime": {
    "publicChannel": "game:<gameSessionId>:public",
    "lastSequence": null,
    "events": [
      "stock_tick",
      "market_news_posted",
      "leaderboard_updated",
      "contract_posted",
      "contract_updated",
      "store_item_posted",
      "store_item_updated",
      "store_prices_updated",
      "store_status_changed",
      "market_status_changed"
    ]
  }
}
```

Future public realtime events should use an envelope compatible with
`GamePublicRealtimeEventEnvelope` in
`contracts/playerGameDashboardContracts.ts`:

```ts
{
  gameSessionId: string;
  channel: `game:${string}:public`;
  sequence: number;
  eventType: GamePublicRealtimeEvent;
  occurredAt: string;
  payload: GamePublicRealtimeEventPayload<GamePublicRealtimeEvent>;
}
```

The public channel must never carry player-private cash, holdings, orders,
trades, ledger entries, store inventory, purchase history, contract
submissions, access codes, session IDs, session tokens, or token hashes.

## Resync Rules

The database remains the source of truth. Clients should call
`GET /players/me/game/dashboard` on first load, reconnect, tab refocus when
stale, and any time a future event sequence gap is detected.

Do not create one channel per stock or one channel per player in this
foundation. Player-private realtime channels are intentionally deferred.

## Intentional Placeholders

Contracts/missions do not have a clean current repository in this codebase, so
the dashboard returns empty contract arrays while preserving the future response
shape. Public market news is read from current `stock_market_events` rows.
Store listings and player inventory/purchase summaries use the current store
tables and remain read-only in the snapshot.
