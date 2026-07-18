# Player Inventory Read Contract

Date: 2026-07-18  
Pull request: #158  
Route: `GET /players/me/inventory`

## Authorization

The route requires `x-player-session-token`. The Backend derives immutable player UUID, active game ID, active player-session ID, session validity, and expiration from that token.

The route rejects:

- browser-selected player, owner, recipient, holding, Store-item, and session UUID scope;
- game or game-session selection through query parameters or headers;
- unsupported query parameters;
- request methods other than GET;
- stock-runner secrets.

The browser never selects Inventory ownership or game scope.

## Public identity

Inventory holdings and Store rows remain UUID-keyed internally. The browser receives the stable per-game Store `itemKey` as:

- `id`;
- `storeItemId` compatibility alias;
- `itemKey`.

Internal holding UUIDs, Store-item UUIDs, player UUIDs, game UUIDs, and session UUIDs are never serialized.

A future redemption route must resolve the public item key inside the authenticated player and game scope. It must not accept an internal holding UUID from the browser.

## Bounded persistence

The repository reads existing `inventory_holdings` and `store_items` through two bounded service-role queries.

Guardrails:

- holdings are filtered by authenticated game and player;
- only positive owned quantities are read;
- the maximum inventory size is 200 holdings;
- a one-row lookahead fails closed when the maximum is exceeded;
- Store metadata is fetched in one same-game batch, not one query per holding;
- missing or duplicate metadata fails closed;
- quantities, currency codes, item keys, status, visibility, and timestamps are validated;
- reserved quantity may not exceed owned quantity.

No migration is required for this read tranche. `inventory_holdings` already exists and is maintained by current Store-purchase and inventory-event workflows. No direct browser table access is introduced.

## Browser response

Successful reads return:

- `ok: true`;
- authoritative generation timestamp;
- `availability: available`;
- `capacity: null` until a server-owned capacity policy exists;
- deterministic categories;
- aggregate owned, reserved, available, and per-currency value summaries;
- deterministic browser-safe item records;
- explicit `inventory_empty` empty state.

Each item includes authoritative owned, reserved, and available quantities, current catalog value and currency, status, player visibility, and timestamps.

`availableActions` is empty. Generic item use remains disabled until the reviewed Inventory-redemption contract is implemented.

## Empty versus unavailable

A valid empty inventory returns HTTP 200 with `items: []` and:

```json
{
  "reason": "inventory_empty"
}
```

A schema or persistence failure returns HTTP 503 with `player_inventory_service_unavailable` and `retryable: true`.

## Caching

Successful responses use:

- `Cache-Control: private, no-store`;
- `Vary: authorization, x-player-session-token`.

## Failure semantics

- invalid route, query, or game-scope input: `400 invalid_player_inventory_request`;
- missing, expired, revoked, or inactive session: existing player-session error envelope;
- ownership UUID injection: `400 invalid_player_request`;
- cross-scope, over-limit, or duplicate public item identity: `500 player_inventory_scope_violation`;
- unavailable persistence/schema: `503 player_inventory_service_unavailable`, retryable;
- unexpected failure: `500 player_inventory_read_failed`.

## Production restriction

This contract authorizes Backend repository code and tests only. It does not authorize production migration execution, Edge Function deployment, runtime cutover, item use, or Inventory redemption activation.
