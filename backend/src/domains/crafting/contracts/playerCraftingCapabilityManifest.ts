import type {
  PlayerCapabilityManifest,
  PlayerCapabilityManifestResponseBody,
} from "../../players/contracts/playerCapabilityManifestContracts.ts";

const CRAFTING_ENDPOINTS = Object.freeze([
  {
    key: "crafting",
    operations: Object.freeze([
      Object.freeze({ method: "GET", pathTemplate: "/players/me/crafting" }),
      Object.freeze({ method: "POST", pathTemplate: "/players/me/crafting/jobs" }),
    ]),
  },
  {
    key: "craftingJobCancel",
    operations: Object.freeze([
      Object.freeze({ method: "POST", pathTemplate: "/players/me/crafting/jobs/:jobKey/cancel" }),
    ]),
  },
  {
    key: "craftingJobClaim",
    operations: Object.freeze([
      Object.freeze({ method: "POST", pathTemplate: "/players/me/crafting/jobs/:jobKey/claim" }),
    ]),
  },
  {
    key: "itemEffectUse",
    operations: Object.freeze([
      Object.freeze({ method: "POST", pathTemplate: "/players/me/items/:itemKey/use" }),
    ]),
  },
  {
    key: "equipmentEquip",
    operations: Object.freeze([
      Object.freeze({ method: "POST", pathTemplate: "/players/me/equipment/:equipmentKey/equip" }),
    ]),
  },
  {
    key: "equipmentSalvage",
    operations: Object.freeze([
      Object.freeze({ method: "POST", pathTemplate: "/players/me/equipment/:equipmentKey/salvage" }),
    ]),
  },
] as const);

export function addPlayerCraftingCapabilities(
  manifest: PlayerCapabilityManifest,
): PlayerCapabilityManifest {
  const endpointKeys = new Set<string>(
    manifest.endpoints.map((endpoint) => endpoint.key),
  );
  const endpoints = [
    ...manifest.endpoints,
    ...CRAFTING_ENDPOINTS.filter((endpoint) => !endpointKeys.has(endpoint.key)),
  ];

  return Object.freeze({
    ...manifest,
    capabilities: Object.freeze({
      routes: Object.freeze({
        ...manifest.capabilities.routes,
        crafting: true,
      }),
      actions: Object.freeze({
        ...manifest.capabilities.actions,
        craftItem: true,
        craftCancel: true,
        craftClaim: true,
        equipmentEquip: true,
        itemEffectUse: true,
        itemSalvage: true,
      }),
    }),
    endpoints: Object.freeze(endpoints),
  }) as unknown as PlayerCapabilityManifest;
}

export function buildPlayerCraftingCapabilityResponse(
  manifest: PlayerCapabilityManifest,
): PlayerCapabilityManifestResponseBody {
  return {
    ok: true,
    ...addPlayerCraftingCapabilities(manifest),
  } as PlayerCapabilityManifestResponseBody;
}
