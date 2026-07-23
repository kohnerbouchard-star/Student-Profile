import assert from "node:assert/strict";

import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import { validateStudentProfileCapabilityManifest } from "../src/integrations/student-profile-capability-manifest.js";

const manifest = {
  schemaVersion: 1,
  manifestVersion: "2026-07-20.1",
  service: "classroom-api",
  capabilities: {
    routes: {
      dashboard: true,
      profile: true
    },
    actions: {}
  },
  endpoints: [
    {
      key: "bootstrap",
      operations: [{ method: "GET", pathTemplate: "/players/me" }]
    },
    {
      key: "dashboard",
      operations: [{ method: "GET", pathTemplate: "/players/me/game/dashboard" }]
    }
  ]
};

const validated = validateStudentProfileCapabilityManifest(manifest);
assert.equal(validated.manifestVersion, "2026-07-20.1");
assert.equal(validated.capabilities.routes.dashboard, true);
assert.equal(validated.capabilities.routes.profile, true);
assert.deepEqual(validated.endpoints.map((endpoint) => endpoint.key), [
  "bootstrap",
  "dashboard"
]);

const session = {
  gameSessionId: "game-1",
  playerSessionId: "session-1"
};
assert.deepEqual(
  resolvePlayerBackendRequest({
    endpointKey: "session",
    method: "GET",
    path: "/session",
    params: {},
    payload: undefined,
    session
  }),
  {
    endpointKey: "session",
    method: "GET",
    path: "/players/me",
    payload: undefined,
    provisional: {
      method: "GET",
      path: "/session",
      payload: undefined
    }
  }
);
assert.equal(
  resolvePlayerBackendRequest({
    endpointKey: "dashboard",
    method: "GET",
    path: "/dashboard",
    params: {},
    payload: undefined,
    session
  }).path,
  "/players/me/game/dashboard"
);

assert.throws(
  () => validateStudentProfileCapabilityManifest({
    ...manifest,
    endpoints: manifest.endpoints.filter((endpoint) => endpoint.key !== "dashboard")
  }),
  (error) => error.code === "CAPABILITY_CONTRACT_MISMATCH" &&
    /routes\.dashboard.*missing its endpoint descriptor/i.test(error.message)
);

assert.throws(
  () => validateStudentProfileCapabilityManifest({
    ...manifest,
    endpoints: [{
      key: "bootstrap",
      operations: [{ method: "GET", pathTemplate: "/players/me-unsafe" }]
    }],
    capabilities: { routes: { profile: true }, actions: {} }
  }),
  (error) => error.code === "CAPABILITY_CONTRACT_MISMATCH"
);

console.log("Dashboard and Profile capability publication passed: exact routes, manifest coverage, and fail-closed mismatches are valid.");
