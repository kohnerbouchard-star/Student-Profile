import assert from "node:assert/strict";

import { validateStudentProfileCapabilityManifest } from "../src/integrations/student-profile-capability-manifest.js";

const descriptor = (key, method, pathTemplate) => ({
  key,
  operations: [{ method, pathTemplate }]
});

const manifest = validateStudentProfileCapabilityManifest({
  ok: true,
  schemaVersion: 1,
  manifestVersion: "2026-07-23.2",
  service: "classroom-api",
  capabilities: {
    routes: {
      dashboard: true,
      crafting: true,
      progression: true,
      profile: true
    },
    actions: {
      craftItem: true,
      craftCancel: true,
      craftClaim: true,
      equipmentEquip: true,
      itemEffectUse: true,
      itemSalvage: true,
      progressionUnlock: true,
      progressionClaim: true
    }
  },
  endpoints: [
    descriptor("bootstrap", "GET", "/players/me"),
    descriptor("capabilities", "GET", "/players/me/capabilities"),
    descriptor("dashboard", "GET", "/players/me/game/dashboard"),
    {
      key: "crafting",
      operations: [
        { method: "GET", pathTemplate: "/players/me/crafting" },
        { method: "POST", pathTemplate: "/players/me/crafting/jobs" }
      ]
    },
    descriptor("craftingJobCancel", "POST", "/players/me/crafting/jobs/:jobKey/cancel"),
    descriptor("craftingJobClaim", "POST", "/players/me/crafting/jobs/:jobKey/claim"),
    descriptor("itemEffectUse", "POST", "/players/me/items/:itemKey/use"),
    descriptor("equipmentEquip", "POST", "/players/me/equipment/:equipmentKey/equip"),
    descriptor("equipmentSalvage", "POST", "/players/me/equipment/:equipmentKey/salvage"),
    descriptor("progression", "GET", "/players/me/progression"),
    descriptor("progressionUnlock", "POST", "/players/me/progression/skills/:skillId/unlock"),
    descriptor("progressionClaim", "POST", "/players/me/progression/rewards/:rewardId/claim")
  ]
});

assert.equal(manifest.manifestVersion, "2026-07-23.2");
assert.equal(manifest.capabilities.routes.crafting, true);
assert.equal(manifest.capabilities.routes.progression, true);
assert.ok(manifest.endpoints.some((endpoint) => endpoint.key === "craftingJobClaim"));
assert.ok(manifest.endpoints.some((endpoint) => endpoint.key === "progressionClaim"));

console.log("Current capability manifest passed: converged Crafting and Progression descriptors are accepted.");
