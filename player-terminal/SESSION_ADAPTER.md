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

## Host events

- `econovaria:player-session-required`: no existing session was available.
- `econovaria:player-session-invalid`: the API returned HTTP 401.
- `econovaria:player-logout-requested`: the player selected Sign out; the host performs the actual logout.

No credentials or session tokens are persisted by this package.
