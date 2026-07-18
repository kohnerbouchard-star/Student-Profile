# Player Session Logout Contract

Date: 2026-07-18  
Pull request: #158  
Route: `POST /players/me/session/logout`

## Request

The route requires `x-player-session-token` and accepts no query parameters or request fields. An empty body or an empty JSON object is accepted. The request body is capped at 1,024 bytes.

The browser must not submit:

- player, owner, recipient, session, or game identifiers;
- internal session UUIDs;
- runner secrets;
- game-scope headers.

The Backend hashes the supplied token and resolves the exact token-owned `player_sessions` row through the service-role repository.

## Behavior

For an active, unexpired session:

1. resolve and validate the active player, game, and session scope;
2. conditionally update the exact row where token hash, session UUID, game ID, player UUID, active status, and null revocation state all match;
3. set `status = revoked` and one authoritative `revoked_at` timestamp;
4. return a UUID-private success body.

The conditional update prevents broad or cross-session revocation.

## Idempotency and concurrency

A repeated logout with the same token is successful when the row is already revoked. The response sets `alreadyLoggedOut: true` and returns the original revocation timestamp.

If another identical request wins the conditional update, the loser re-reads the token-owned row. A matching revoked row is treated as a successful replay. An unresolved state transition returns retryable `409 player_logout_conflict`.

Missing, unknown, inactive, or expired sessions return `401 invalid_player_session`.

## Response

```json
{
  "ok": true,
  "message": "Player session logged out.",
  "alreadyLoggedOut": false,
  "status": "revoked",
  "revokedAt": "2026-07-18T09:00:00.000Z"
}
```

The response never includes the internal session, player, or game UUID. Successful responses use `private, no-store` and vary by authorization/session token.

## Failure semantics

- malformed route, query, headers, or body: `400 invalid_player_logout_request`;
- missing/unknown/expired/inactive token: `401 invalid_player_session`;
- concurrent unresolved transition: retryable `409 player_logout_conflict`;
- repository unavailability: retryable `503 player_logout_service_unavailable`;
- scope invariant failure: `500 player_logout_scope_violation`.

## Production restriction

This contract authorizes repository code and tests only. It does not authorize Edge deployment, production Auth changes, runtime cutover, credential rotation, or production data mutation.
