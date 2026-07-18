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
- `econovaria:player-logout-requested`: the player selected Sign out. The Student-Profile host integration consumes this event and calls the reviewed `logout` adapter operation.
- `econovaria:player-logout-completed`: the revocation lifecycle reached a terminal outcome and local session references were cleared. Its detail includes only reason, terminal, revocation outcome, status, code, and request ID. It never includes credentials, session tokens, player UUIDs, game UUIDs, or session UUIDs.

## Logout lifecycle

Connected Student-Profile mode performs `POST /players/me/session/logout` with only `x-player-session-token`. It sends no request body, query parameters, game scope, player scope, or internal identifiers.

The host integration:

1. locks the Player Terminal against additional work;
2. attempts the reviewed revocation operation;
3. treats HTTP 401 as an already-inactive terminal outcome;
4. retries bounded transient 409, 429, 503, network, offline, and timeout failures;
5. clears all in-memory local session references after the revocation attempt reaches a terminal outcome;
6. returns to Player sign-in with `reason=logged-out`;
7. reports a truthful `localOnly` outcome if Backend revocation remains unavailable after bounded retries.

No credentials or session tokens are persisted by this package.
