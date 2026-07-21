# PR #249 — Connected Marketplace Browser Fixture

The desktop/mobile Marketplace acceptance fixture runs in explicit connected API mode and seeds the Player Terminal through the host runtime’s authoritative session-storage contract:

- storage key: `econovaria.player.auth.v1`;
- bounded fields: `playerSessionToken`, `sessionExpiresAt`, and `storedAt`;
- no internal Player UUID, game UUID, service-role key, or ownership field is supplied by the browser fixture;
- `host-runtime.js` remains responsible for resolving the stored session and constructing `ECONOVARIA_PLAYER_SESSION` and `ECONOVARIA_PLAYER_TERMINAL_CONFIG`.

The test verifies that a Marketplace purchase remains committed exactly once when the subsequent authoritative Marketplace refresh fails, on both desktop and mobile Chromium.

This evidence is pre-Crafting only. It does not authorize staging migration application, migration rekeying, ready-for-review status, or merge.
