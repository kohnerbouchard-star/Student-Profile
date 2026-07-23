import assert from "node:assert/strict";

import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";

const withoutBrowserGameIdentity = resolvePlayerBackendRequest({
  endpointKey: "dashboard",
  method: "GET",
  path: "/dashboard",
  params: {},
  payload: undefined,
  session: {
    playerSessionToken: "ps_player_session",
  },
});

assert.equal(
  withoutBrowserGameIdentity.path,
  "/players/me/game/dashboard",
  "Dashboard routing must work when the secure player bootstrap omits the game UUID.",
);

const staleBrowserGameIdentity = resolvePlayerBackendRequest({
  endpointKey: "dashboard",
  method: "GET",
  path: "/dashboard",
  params: {},
  payload: undefined,
  session: {
    playerSessionToken: "ps_player_session",
    gameSessionId: "stale-browser-game-context",
  },
});

assert.equal(
  staleBrowserGameIdentity.path,
  "/players/me/game/dashboard",
  "Dashboard routing must never transmit browser-held game identity; the backend derives scope from the authenticated player session.",
);

console.log("Dashboard session-scope routing passed: authenticated sessions never require or transmit a browser-visible game UUID.");
