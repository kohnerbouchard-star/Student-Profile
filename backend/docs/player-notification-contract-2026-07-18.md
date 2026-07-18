# Player Notification Contract

Date: 2026-07-18  
Pull request: #158

## Routes

- `GET /players/me/notifications`
- `POST /players/me/notifications/read`

Both routes require `x-player-session-token`. Player UUID, game ID, and active session ID are derived by the Backend. Browser-selected ownership or game scope is rejected.

## Public identifiers

The original notification tables use UUID primary keys. Those persistence UUIDs are not browser contracts.

Forward migration `20260718083500_add_player_notification_public_ids_v1.sql` adds:

- `notifications.public_notification_id`, formatted `ntf_<32 hex>`;
- `notification_deliveries.public_delivery_id`, formatted `ndl_<32 hex>`.

These are independent random identifiers, not encodings of the internal UUIDs. List cursors and read acknowledgements use `public_delivery_id`. Browser responses do not include notification, delivery, player, game, or session UUIDs.

## List behavior

Supported query fields:

- `status`: `unread`, `read`, `dismissed`, or `all`; default `unread`;
- `limit`: 1–50; default 20;
- `cursor`: opaque base64url cursor containing delivered timestamp and public delivery ID.

Ordering is newest delivery first, then public delivery ID descending. The repository reads one-row lookahead for bounded pagination and batch-loads notification metadata without returning payload JSON.

The generic inbox intentionally excludes `notifications.payload`; purpose-built cutscene/dashboard routes remain responsible for story payload delivery.

A valid empty result returns `200` with `notifications_empty`. Persistence or schema unavailability returns retryable `503`.

## Mark-read behavior

The mutation accepts exactly:

```json
{
  "deliveryIds": ["ndl_..."]
}
```

Rules:

- 1–50 unique public delivery IDs;
- no query string;
- no ownership/game fields;
- body maximum 4,096 bytes;
- all deliveries must belong to the authenticated player and game;
- missing or foreign deliveries return `404` without revealing which ID failed;
- already-read deliveries are idempotent;
- unread deliveries receive one authoritative `seen_at` timestamp;
- final state is re-read before returning success;
- concurrent state conflicts return retryable `409`.

## Security and caching

- exact route parsing; malformed or spoofed prefixes fail closed;
- runner secrets rejected;
- service-role persistence only behind the Edge route;
- browser table privileges remain revoked;
- notification tables use forced RLS after the forward migration;
- successful list and mutation responses use `private, no-store` and vary by authorization/session token.

## Production restriction

The migration and Edge changes are repository-only in PR #158. No production migration, Edge deployment, runtime cutover, or Auth change is authorized.
