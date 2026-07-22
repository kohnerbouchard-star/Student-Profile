import { buildPlayerCapabilityManifest } from "../../players/contracts/playerCapabilityManifestContracts.ts";
import { addPlayerCraftingCapabilities } from "./playerCraftingCapabilityManifest.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("Crafting capability decorator preserves predecessor manifest and adds reviewed routes", () => {
  const base = buildPlayerCapabilityManifest();
  const result = addPlayerCraftingCapabilities(base) as unknown as {
    capabilities: { routes: Record<string, boolean>; actions: Record<string, boolean> };
    endpoints: Array<{ key: string; operations: Array<{ method: string; pathTemplate: string }> }>;
  };

  for (const [key, enabled] of Object.entries(base.capabilities.routes)) {
    if (key !== "crafting") assertEquals(result.capabilities.routes[key], enabled);
  }
  for (const [key, enabled] of Object.entries(base.capabilities.actions)) {
    if (key !== "craftItem") assertEquals(result.capabilities.actions[key], enabled);
  }

  assertEquals(result.capabilities.routes.crafting, true);
  for (const action of [
    "craftItem", "craftCancel", "craftClaim", "equipmentEquip", "itemEffectUse", "itemSalvage",
  ]) assertEquals(result.capabilities.actions[action], true);

  const endpoints = new Map(result.endpoints.map((endpoint) => [endpoint.key, endpoint.operations]));
  assertEquals(endpoints.get("crafting"), [
    { method: "GET", pathTemplate: "/players/me/crafting" },
    { method: "POST", pathTemplate: "/players/me/crafting/jobs" },
  ]);
  assertEquals(endpoints.get("craftingJobCancel"), [
    { method: "POST", pathTemplate: "/players/me/crafting/jobs/:jobKey/cancel" },
  ]);
  assertEquals(new Set(result.endpoints.map((endpoint) => endpoint.key)).size, result.endpoints.length);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
