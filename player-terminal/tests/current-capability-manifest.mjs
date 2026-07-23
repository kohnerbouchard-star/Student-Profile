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

console.log("Exact backend-generated capability manifest passed Player Terminal validation.");
