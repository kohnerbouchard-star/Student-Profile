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

const legacySessionContext = resolvePlayerBackendRequest({
  endpointKey: "dashboard",
  method: "GET",
  path: "/dashboard",
  params: {},
  payload: undefined,
  session: {
    playerSessionToken: "ps_player_session",
    gameSessionId: "legacy-game-context",
  },
});

assert.equal(
  legacySessionContext.path,
  "/players/me/game/dashboard?gameSessionId=legacy-game-context",
  "Legacy clients may continue sending a scoped game ID during convergence.",
);

console.log("Dashboard session-scope routing passed: authenticated sessions no longer require a browser-visible game UUID.");
