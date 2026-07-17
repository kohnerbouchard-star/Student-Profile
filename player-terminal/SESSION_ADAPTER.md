# Session and API Adapter Contract

## Ownership

The existing application owns sign-in, credentials, session creation, session replacement, and sign-out. The player terminal only consumes an authenticated session.

## Session input

The terminal accepts:

```ts
{
  playerSessionToken: string;
  gameSessionId?: string;
  playerSessionId?: string;
  accessToken?: string;
}
```

It can receive this through `sessionProvider`, `connectSession(session)`, the global `ECONOVARIA_PLAYER_SESSION`, or the `econovaria:player-session-ready` event.

## Generic API call

Every terminal request is passed to one function:

```ts
apiCall({
  endpointKey,
  method,
  path,
  payload,
  session,
  config
})
```

`endpointKey` is the stable frontend contract. `path` is a provisional route hint from the v7 package. The backend adapter may ignore `path` and switch on `endpointKey` until the final backend routes are synchronized.

The function must return the v7 read model expected by the requested endpoint. Writes must return only after the backend confirms the operation.

For mapped production capabilities, the context also includes `backendRequest`. It contains the normalized `/players/me/...` route and backend payload while the original `method`, `path`, and `payload` remain available for backward compatibility.

Direct HTTP mode sends `playerSessionToken` as `x-player-session-token`. `accessToken`, when provided, is used only for the Edge Function gateway authorization header. Player authorization remains bound to the custom player session.

## Host events

- `econovaria:player-session-required`: no existing session was available.
- `econovaria:player-session-invalid`: the API returned HTTP 401.
- `econovaria:player-logout-requested`: the backend player session has been revoked (or was already invalid); the host returns to its existing sign-in surface.

Logout clears the session from memory before dispatching the host event, and the event does not include the opaque player-session token. No credentials or session tokens are persisted by this package.
