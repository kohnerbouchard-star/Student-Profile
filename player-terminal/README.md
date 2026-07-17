# Econovaria Player Terminal v7.4 — Visual Normalization

This build preserves the approved v7 player-terminal design, the clickable country map, and the host-owned session while adding a production-oriented player API adapter foundation.

The v7.4 pass is deliberately surgical. It adds one final normalization layer after the existing v7 stylesheets instead of rewriting the visual system.

## Corrected in this pass

- standardized page, panel, form, and card spacing around a controlled 4/8/12/16/24/32 scale;
- established explicit typography roles for labels, metadata, body copy, and entity names;
- prevented country, company, contract, product, item, supplier, recipe, loan, and player names from inheriting decorative microcopy sizes;
- repaired inline-flow collisions that joined category labels directly to business products, suppliers, crafting recipes, production jobs, and loan names;
- corrected long-name wrapping and grid shrink behavior across all player routes;
- corrected the mobile Store search field, which inherited a 240px flex basis when its toolbar changed to a column;
- preserved the unobstructed interactive map and its ten clickable country borders;
- retained the existing icon component and approved visual system unchanged.

## API adapter foundation

- sends the opaque player session through `x-player-session-token` without persisting credentials;
- maps verified endpoint keys to existing `/players/me/...` routes;
- boots with session plus the aggregate dashboard snapshot instead of 18 parallel reads;
- refreshes Market, Portfolio, Store, Contracts, Inventory, and ledger-backed Banking reads lazily;
- hydrates the interactive country map and public World news from token-scoped backend routes;
- loads bounded player-safe market history without runner credentials or client-supplied game scope;
- reads authoritative watchlist state with market assets and uses idempotent add/remove routes;
- renders real account balances and ledger activity while keeping transfers, interest policy, credit, and loans unavailable until their domains exist;
- performs Store quote and idempotent purchase as separate backend operations;
- refreshes the authoritative inventory route without fabricating a capacity policy;
- normalizes contract submission to `/players/me/contracts/:contractId/submit`;
- connects contract acceptance to `/players/me/contracts/:contractId/accept`;
- loads the token-scoped notification inbox on demand and marks bounded delivery IDs read;
- revokes logout server-side before returning control to the host sign-in flow;
- fails closed for backend capabilities that do not exist yet.

## Run the preview

```zsh
npm run verify
npm run dev
```

Open `http://localhost:4173`.

## Host integration

The terminal does not own sign-in. Set the host adapter before `src/main.js` loads:

```js
window.ECONOVARIA_PLAYER_TERMINAL_CONFIG = {
  usePreviewData: false,

  sessionProvider: () =>
    window.Econovaria?.state?.getCurrentSession?.() || null,

  apiCall: async ({ endpointKey, method, path, payload, session, backendRequest }) => {
    return window.Econovaria.api.playerTerminal({
      endpointKey,
      method,
      path,
      payload,
      backendRequest,
      playerSessionToken: session.playerSessionToken,
      gameSessionId: session.gameSessionId,
      playerSessionId: session.playerSessionId
    });
  }
};
```

The existing sign-in can also connect directly:

```js
await window.Econovaria.playerTerminal.connectSession({
  playerSessionToken: loginResult.session.token,
  gameSessionId: loginResult.gameSession.id,
  playerSessionId: loginResult.session.id
});
```

See `VISUAL_NORMALIZATION.md`, `VISUAL_AUDIT_V74.md`, `SESSION_ADAPTER.md`, and `PLAYER_API_CONNECTIONS.md`.
