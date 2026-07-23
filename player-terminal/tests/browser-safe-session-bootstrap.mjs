import assert from "node:assert/strict";

import { PlayerApi } from "../src/api/player-api.js";
import { createStudentProfileApiCall } from "../src/integrations/student-profile-api-call.js";

const browserSafeSession = {
  ok: true,
  gameSession: {
    name: "Econovaria Class",
    status: "active",
  },
  player: {
    displayName: "Alex Rivera",
    rosterLabel: null,
    playerIdentifier: "CARD-200",
    status: "active",
  },
  session: {
    status: "active",
    expiresAt: "2026-07-24T03:40:00.000Z",
  },
  balances: [{
    accountType: "cash",
    balance: 1250,
    currencyCode: "ECO",
  }],
  attendance: {
    status: "not_configured",
  },
  availableActions: [
    "dashboard.view",
    "ledger.view",
    "STORE_PURCHASE",
  ],
};

const capabilityManifest = {
  ok: true,
  schemaVersion: 1,
  manifestVersion: "2026-07-23.2",
  service: "classroom-api",
  capabilities: {
    routes: {
      profile: true,
      dashboard: false,
    },
    actions: {},
  },
  endpoints: [
    {
      key: "bootstrap",
      operations: [{ method: "GET", pathTemplate: "/players/me" }],
    },
    {
      key: "capabilities",
      operations: [{ method: "GET", pathTemplate: "/players/me/capabilities" }],
    },
  ],
};

const calls = [];
const apiCall = createStudentProfileApiCall({
  request: async (request) => {
    calls.push({ endpointKey: request.endpointKey, path: request.path });
    if (request.endpointKey === "session") return structuredClone(browserSafeSession);
    if (request.endpointKey === "capabilities") return structuredClone(capabilityManifest);
    throw new Error(`Unexpected endpoint ${request.endpointKey}`);
  },
});

const api = new PlayerApi({
  usePreviewData: false,
  playerSessionToken: "player-session-token",
  requestTimeoutMs: 1000,
  writeCooldownMs: 0,
  apiCall,
});

const session = await api.request("session");

assert.equal(session.displayName, "Alex Rivera");
assert.equal(session.playerId, "CARD-200");
assert.equal(session.currencyCode, "ECO");
assert.equal(session.gameSessionId, "");
assert.equal(session.playerSessionId, "");
assert.equal(session.capabilityManifestVersion, "2026-07-23.2");
assert.deepEqual(calls, [
  { endpointKey: "session", path: "/players/me" },
  { endpointKey: "capabilities", path: "/players/me/capabilities" },
]);
assert.doesNotMatch(
  JSON.stringify(session),
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  "Browser-safe session state must not require or expose ownership UUIDs.",
);

console.log("Browser-safe Player session bootstrap passed without internal game or session UUIDs.");
