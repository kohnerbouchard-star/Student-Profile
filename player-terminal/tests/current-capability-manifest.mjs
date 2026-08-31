// Phase 6 exact-head acceptance synchronization marker.
import assert from "node:assert/strict";

import { buildPlayerCraftingCapabilityResponse } from "../../backend/src/domains/crafting/contracts/playerCraftingCapabilityManifest.ts";
import { buildPlayerCapabilityManifest } from "../../backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts";
import { isEndpointEnabled, resolveCapabilities } from "../src/api/capabilities.js";
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
    detail: error?.detail,
  }, null, 2));
  throw error;
}

assert.equal(manifest.manifestVersion, "2026-08-31.1");
assert.equal(manifest.capabilities.routes.dashboard, true);
assert.equal(manifest.capabilities.routes.crafting, true);
assert.equal(manifest.capabilities.routes.progression, true);
assert.ok(manifest.endpoints.some((endpoint) => endpoint.key === "dashboard"));
assert.ok(manifest.endpoints.some((endpoint) => endpoint.key === "craftingJobClaim"));
assert.ok(manifest.endpoints.some((endpoint) => endpoint.key === "progressionClaim"));
assert.ok(manifest.endpoints.some((endpoint) => endpoint.key === "businessFormationPropose"));
assert.ok(manifest.endpoints.some((endpoint) => endpoint.key === "businessFormationRespond"));
assert.ok(manifest.endpoints.some((endpoint) => endpoint.key === "businessFormationActivate"));
assert.ok(manifest.endpoints.some((endpoint) => endpoint.key === "businessManufacturingJobs"));
assert.ok(manifest.endpoints.some((endpoint) => endpoint.key === "businessManufacturingStart"));
assert.ok(manifest.endpoints.some((endpoint) => endpoint.key === "businessManufacturingCancel"));
for (const endpointKey of [
  "bankingFx",
  "bankingFxHistory",
  "bankingFxOrders",
  "bankingFxQuote",
  "bankingFxStandard",
  "bankingFxInstant",
  "bankingFxCancel",
]) {
  assert.ok(manifest.endpoints.some((endpoint) => endpoint.key === endpointKey));
}
assert.equal("businessInputPurchase" in manifest.capabilities.actions, false);
assert.equal(manifest.endpoints.some((endpoint) => endpoint.key === "businessInputPurchase"), false);

const resolved = resolveCapabilities({
  config: {},
  session: { capabilities: manifest.capabilities },
  dashboard: {},
});
assert.equal(resolved.actions.marketplaceActivate, true);
assert.equal(resolved.actions.marketplaceDispute, true);
assert.equal(resolved.actions.businessFormationPropose, true);
assert.equal(resolved.actions.businessFormationRespond, true);
assert.equal(resolved.actions.businessFormationActivate, true);
assert.equal(resolved.actions.businessProduction, true);
assert.equal(resolved.actions.bankingFxQuote, true);
assert.equal(resolved.actions.bankingFxStandard, true);
assert.equal(resolved.actions.bankingFxInstant, true);
assert.equal(resolved.actions.bankingFxCancel, true);
assert.equal(isEndpointEnabled(resolved, "marketplaceActivate"), true);
assert.equal(isEndpointEnabled(resolved, "marketplaceDispute"), true);
assert.equal(isEndpointEnabled(resolved, "businessFormationPropose"), true);
assert.equal(isEndpointEnabled(resolved, "businessFormationRespond"), true);
assert.equal(isEndpointEnabled(resolved, "businessFormationActivate"), true);
assert.equal(isEndpointEnabled(resolved, "businessManufacturingStart"), true);
assert.equal(isEndpointEnabled(resolved, "businessManufacturingCancel"), true);
assert.equal(isEndpointEnabled(resolved, "bankingFxQuote"), true);
assert.equal(isEndpointEnabled(resolved, "bankingFxStandard"), true);
assert.equal(isEndpointEnabled(resolved, "bankingFxInstant"), true);
assert.equal(isEndpointEnabled(resolved, "bankingFxCancel"), true);
assert.equal(isEndpointEnabled(resolved, "messageThreadCreate"), true);
assert.equal(isEndpointEnabled(resolved, "messageRead"), true);

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

const optionalDrift = structuredClone(generated);
const messageSearch = optionalDrift.endpoints.find((endpoint) => endpoint.key === "messageSearch");
assert.ok(messageSearch, "The generated manifest must include the optional messageSearch descriptor.");
messageSearch.operations[0].method = "PATCH";
optionalDrift.capabilities.actions.messageSearch = true;
const optionalQuarantined = validateStudentProfileCapabilityManifest(optionalDrift);
assert.equal(optionalQuarantined.capabilities.actions.messageSearch, false);
assert.equal(optionalQuarantined.endpoints.some((endpoint) => endpoint.key === "messageSearch"), false);
assert.equal(optionalQuarantined.capabilities.routes.dashboard, true);
assert.ok(optionalQuarantined.endpoints.some((endpoint) => endpoint.key === "dashboard"));

const coreDrift = structuredClone(generated);
const dashboard = coreDrift.endpoints.find((endpoint) => endpoint.key === "dashboard");
assert.ok(dashboard, "The generated manifest must include the core dashboard descriptor.");
dashboard.operations[0].method = "PATCH";
assert.throws(
  () => validateStudentProfileCapabilityManifest(coreDrift),
  (error) => error?.code === "CAPABILITY_CONTRACT_MISMATCH"
    && error?.detail?.endpointKey === "dashboard"
    && error?.detail?.method === "PATCH",
  "Core capability drift must remain fail closed with bounded diagnostics.",
);

console.log("Exact backend manifest, Business formation and manufacturing capabilities, mutation aliases, optional drift quarantine, core fail-closed validation, and safe diagnostics passed.");
