import assert from "node:assert/strict";

import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";

function resolveNews(payload = {}) {
  return resolvePlayerBackendRequest({
    endpointKey: "news",
    method: "GET",
    path: "/news",
    payload,
    params: {},
    session: {
      playerSessionToken: "player-session-token",
    },
  });
}

const defaultRequest = resolveNews();
assert.equal(defaultRequest.method, "GET");
assert.equal(
  defaultRequest.path,
  "/players/me/world/news?limit=50",
  "The Player Terminal default must not exceed the World News backend maximum.",
);

const boundedRequest = resolveNews({ limit: 25, category: "macro" });
assert.equal(
  boundedRequest.path,
  "/players/me/world/news?limit=25&category=macro",
);

assert.doesNotMatch(defaultRequest.path, /limit=100(?:&|$)/);

console.log("Player World News route passed: default and explicit page sizes match the backend contract.");
