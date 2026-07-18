# Econovaria Player Terminal v7.5 — API Readiness

This build preserves the approved v7 player-terminal design, clickable country map, and host-owned session contract while hardening the frontend for staged API integration.

v7.5 replaces the all-or-nothing data bootstrap with capability-gated route loading and adds production preview lockout, transport controls, safe errors, request deduplication, write idempotency, runtime response guards, and targeted authoritative refreshes.

## Preserved from v7.4

- standardized page, panel, form, and card spacing around a controlled 4/8/12/16/24/32 scale;
- established explicit typography roles for labels, metadata, body copy, and entity names;
- prevented country, company, contract, product, item, supplier, recipe, loan, and player names from inheriting decorative microcopy sizes;
- repaired inline-flow collisions that joined category labels directly to business products, suppliers, crafting recipes, production jobs, and loan names;
- corrected long-name wrapping and grid shrink behavior across all player routes;
- corrected the mobile Store search field, which inherited a 240px flex basis when its toolbar changed to a column;
- preserved the unobstructed interactive map and its ten clickable country borders;
- retained the existing icon component and host-owned session handoff contract.

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
  environment: "production",
  allowPreviewMode: false,
  usePreviewData: false,

  sessionProvider: () =>
    window.Econovaria?.state?.getCurrentSession?.() || null,

  apiCall: async ({ endpointKey, method, path, payload, session, signal, requestId, idempotencyKey }) => {
    return window.Econovaria.api.playerTerminal({
      endpointKey,
      method,
      path,
      payload,
      playerSessionToken: session.playerSessionToken,
      gameSessionId: session.gameSessionId,
      playerSessionId: session.playerSessionId,
      signal,
      requestId,
      idempotencyKey
    });
  },

  capabilities: {
    routes: { dashboard: true, store: true, inventory: true },
    actions: { storePurchase: true }
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

See `V75_API_READINESS.md`, `ARCHITECTURE_BEFORE_AFTER_V75.md`, `SESSION_ADAPTER.md`, and `PLAYER_API_CONNECTIONS.md`.
