# Econovaria Player Terminal v7.4 — Visual Normalization

This build preserves the approved v7 player-terminal design, the clickable country map, and the host-owned session/API adapter.

The v7.4 pass is deliberately surgical. It adds one final normalization layer after the existing v7 stylesheets instead of rewriting the visual system.

## Corrected in this pass

- standardized page, panel, form, and card spacing around a controlled 4/8/12/16/24/32 scale;
- established explicit typography roles for labels, metadata, body copy, and entity names;
- prevented country, company, contract, product, item, supplier, recipe, loan, and player names from inheriting decorative microcopy sizes;
- repaired inline-flow collisions that joined category labels directly to business products, suppliers, crafting recipes, production jobs, and loan names;
- corrected long-name wrapping and grid shrink behavior across all player routes;
- corrected the mobile Store search field, which inherited a 240px flex basis when its toolbar changed to a column;
- preserved the unobstructed interactive map and its ten clickable country borders;
- retained the existing icon component and session/API adapter unchanged.

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

  apiCall: async ({ endpointKey, method, path, payload, session }) => {
    return window.Econovaria.api.playerTerminal({
      endpointKey,
      method,
      path,
      payload,
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
