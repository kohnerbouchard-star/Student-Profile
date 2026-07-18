# Player Inventory Read Contract

Date: 2026-07-18  
Pull request: #158  
Route: `GET /players/me/inventory`

## Authorization

The route requires `x-player-session-token`.

The Backend derives:

- immutable player UUID;
- active game ID;
- active player-session ID;
- session validity and expiration.

The route rejects browser-selected player, owner, game, session, recipient, holding, and Store UUID scope. It also rejects stock-runner secrets and unsupported query parameters.

## Public identity

Inventory holdings and Store rows remain UUID-keyed internally. The browser receives the stable per-game Store `itemKey` as:

- `id`;
- `storeItemId` compatibility alias;
- `itemKey`.

Internal holding UUIDs, Store-item UUIDs, player UUIDs, game UUIDs, and session UUIDs are never serialized.

A future redemption route must resolve this public item key inside the authenticated player and game scope. It must not accept an internal holding UUID from the browser.

## Response

Successful reads return:

- `ok: true`;
- authoritative generation timestamp;
- `availability: available`;
- `capacity: null` until a server-owned capacity policy exists;
- deterministic categories;
- aggregate owned, reserved, available, and currency-value summaries;
- deterministic item records;
- explicit `no_inventory` empty state.

Each item includes authoritative owned, reserved, and available quantities. A record with reserved quantity greater than owned quantity fails closed.

`availableActions` is empty. Generic item use remains disabled until the reviewed inventory-redemption contract is implemented.

## Persistence

The route reads existing:

- `inventory_holdings`;
- `store_items`.

No migration is required for this read tranche. Reads execute through the Edge service-role client; no direct browser table access is introduced.

## Failure semantics

- invalid route or query: `400 invalid_player_inventory_request`;
- missing/expired/revoked/wrong-scope session: existing player-session error envelope;
- cross-scope or duplicate public item identity: `500 player_inventory_scope_violation`;
- unavailable persistence/schema: `503 player_inventory_service_unavailable`, retryable;
- unexpected failure: `500 player_inventory_read_failed`.

A valid empty inventory returns `200`; it is not represented as service unavailability.

## Production restriction

This contract authorizes repository code and tests only. It does not authorize production migration execution, Edge Function deployment, runtime cutover, or inventory redemption activation.
