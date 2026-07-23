import assert from "node:assert/strict";

import { buildPlayerCraftingCapabilityResponse } from "../../backend/src/domains/crafting/contracts/playerCraftingCapabilityManifest.ts";
import { buildPlayerCapabilityManifest } from "../../backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts";
import { validateStudentProfileCapabilityManifest } from "../src/integrations/student-profile-capability-manifest.js";

const generated = buildPlayerCraftingCapabilityResponse(
  buildPlayerCapabilityManifest(),
);

let manifest;
try {
  manifest = validateStudentProfileCapabilityManifest(generated);
} catch (error) {
  console.error("Exact backend capability manifest was rejected.");
  console.error(JSON.stringify({
    message: error?.message,
    code: error?.code,
    endpointKey: error?.endpointKey,
    body: error?.body,
  }, null, 2));
  throw error;
}

assert.equal(manifest.manifestVersion, "2026-07-23.2");
assert.equal(manifest.capabilities.routes.dashboard, true);
assert.equal(manifest.capabilities.routes.crafting, true);
assert.equal(manifest.capabilities.routes.progression, true);
assert.ok(manifest.endpoints.some((endpoint) => endpoint.key === "dashboard"));
assert.ok(manifest.endpoints.some((endpoint) => endpoint.key === "craftingJobClaim"));
assert.ok(manifest.endpoints.some((endpoint) => endpoint.key === "progressionClaim"));

const futureManifest = structuredClone(generated);
futureManifest.capabilities.routes.futureSimulation = true;
futureManifest.capabilities.actions.futureSimulationRun = true;
futureManifest.endpoints.push({
  key: "futureSimulation",
  operations: [{
    method: "GET",
    pathTemplate: "/players/me/future-simulation",
  }],
});

const forwardCompatible = validateStudentProfileCapabilityManifest(futureManifest);
assert.equal(forwardCompatible.capabilities.routes.futureSimulation, undefined);
assert.equal(forwardCompatible.capabilities.actions.futureSimulationRun, undefined);
assert.equal(
  forwardCompatible.endpoints.some((endpoint) => endpoint.key === "futureSimulation"),
  false,
);
assert.equal(forwardCompatible.capabilities.routes.dashboard, true);
assert.ok(forwardCompatible.endpoints.some((endpoint) => endpoint.key === "dashboard"));

console.log("Exact backend manifest and feature-scoped future capability drift passed Player Terminal validation.");
