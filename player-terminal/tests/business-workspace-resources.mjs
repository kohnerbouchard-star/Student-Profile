import assert from "node:assert/strict";

import {
  PLAYER_BACKEND_ROUTE_KEYS,
  hasPlayerBackendRoute,
  resolvePlayerBackendRequest,
} from "../src/api/backend-routes.js";
import { PLAYER_ENDPOINTS } from "../src/api/endpoints.js";
import { resourceFreshnessMs, validInvalidationResources } from "../src/api/freshness.js";
import {
  WRITE_INVALIDATIONS,
  dependentResourcesForRoute,
  resourcesForRoute,
} from "../src/api/resource-plan.js";
import { createResourceSupport } from "../src/api/resource-support.js";
import { normalizeApiResponse } from "../src/api/response-normalizer.js";
import { previewData } from "../src/data/preview-data.js";
import { renderBusinessWorkspacePage } from "../src/core/route-renderer.js";

assert.deepEqual(PLAYER_ENDPOINTS.businessStockroom, {
  method: "GET",
  path: "/business/stockroom",
});
assert.deepEqual(PLAYER_ENDPOINTS.businessRecipes, {
  method: "GET",
  path: "/business/recipes",
});
assert.deepEqual(PLAYER_ENDPOINTS.businessEquipment, {
  method: "GET",
  path: "/business/equipment",
});

for (const [endpointKey, path] of [
  ["businessStockroom", "/players/me/business/stockroom"],
  ["businessRecipes", "/players/me/business/recipes"],
  ["businessEquipment", "/players/me/business/equipment"],
]) {
  assert.equal(hasPlayerBackendRoute(endpointKey), true, `${endpointKey} must resolve through the same-origin backend adapter.`);
  assert.equal(PLAYER_BACKEND_ROUTE_KEYS.includes(endpointKey), true, `${endpointKey} must be an explicit backend route key.`);
  assert.deepEqual(
    resolvePlayerBackendRequest({
      endpointKey,
      method: "GET",
      path: PLAYER_ENDPOINTS[endpointKey].path,
      payload: {},
      params: {},
      session: {},
    }),
    {
      endpointKey,
      method: "GET",
      path,
      payload: undefined,
      provisional: {
        method: "GET",
        path: PLAYER_ENDPOINTS[endpointKey].path,
        payload: {},
      },
    },
  );
}

const advertised = createResourceSupport({
  session: { capabilityEndpointKeys: ["business"] },
});
assert.equal(advertised.business, true);
assert.equal(advertised.businessStockroom, true);
assert.equal(advertised.businessRecipes, true);
assert.equal(advertised.businessEquipment, true);
assert.equal(advertised.businessTreasury, false, "Treasury keeps its independent capability authority.");

const unadvertised = createResourceSupport({
  session: { capabilityEndpointKeys: [] },
});
assert.equal(unadvertised.businessStockroom, false);
assert.equal(unadvertised.businessRecipes, false);
assert.equal(unadvertised.businessEquipment, false);

const businessPlan = resourcesForRoute("business");
assert.deepEqual(businessPlan.required, ["business", "countries"]);
assert.deepEqual(businessPlan.optional, ["businessWorkforce", "store"]);
assert.deepEqual(
  businessPlan.dependent,
  ["businessTreasury", "businessStockroom", "businessRecipes", "businessEquipment"],
  "Canonical workspace reads must load only after the overview proves a configured Business.",
);
assert.deepEqual(dependentResourcesForRoute("business", { business: { configured: false } }), []);
assert.deepEqual(
  dependentResourcesForRoute("business", { business: { configured: true } }),
  ["businessTreasury", "businessStockroom", "businessRecipes", "businessEquipment"],
);

assert.equal(resourceFreshnessMs("businessStockroom"), 10_000);
assert.equal(resourceFreshnessMs("businessRecipes"), 30_000);
assert.equal(resourceFreshnessMs("businessEquipment"), 10_000);
assert.deepEqual(
  validInvalidationResources(["businessStockroom", "businessRecipes", "businessEquipment", "not-a-resource"]),
  ["businessStockroom", "businessRecipes", "businessEquipment"],
);

for (const endpointKey of ["businessManufacturingStart", "businessManufacturingCancel"]) {
  assert.equal(
    WRITE_INVALIDATIONS[endpointKey].includes("businessStockroom"),
    true,
    `${endpointKey} must invalidate canonical Stockroom state.`,
  );
  assert.equal(
    WRITE_INVALIDATIONS[endpointKey].includes("businessEquipment"),
    true,
    `${endpointKey} must invalidate canonical Equipment capacity state.`,
  );
}
assert.equal(
  WRITE_INVALIDATIONS.businessStorePurchase.includes("businessStockroom"),
  true,
  "Funded Store procurement must invalidate canonical Stockroom state.",
);
assert.equal(
  WRITE_INVALIDATIONS.businessStorePurchase.includes("businessEquipment"),
  false,
  "Procurement does not reserve or release Equipment capacity.",
);
assert.equal(
  WRITE_INVALIDATIONS.businessPrice.includes("businessStockroom"),
  false,
  "Pricing does not mutate physical stock authority.",
);
assert.equal(
  WRITE_INVALIDATIONS.businessTreasuryFxInstant.includes("businessStockroom"),
  false,
  "Treasury FX does not mutate physical stock authority.",
);

const data = structuredClone(previewData);
const businessKey = `biz_${"a".repeat(32)}`;
data.business.company.id = businessKey;
data.resourceStatus = {
  ...(data.resourceStatus || {}),
  businessStockroom: { state: "ready" },
  businessRecipes: { state: "ready" },
  businessEquipment: { state: "ready" },
  store: { state: "ready" },
};
data.businessRecipes = {
  recipes: [{
    accessKey: "bra_11111111111111111111111111111111",
    recipeKey: "recipe-steel-widget-v1",
    name: "Steel Widget",
    category: "manufacturing",
    tier: 2,
    workshopTier: 1,
    baseDurationSeconds: 180,
    difficultyProfile: "standard",
    description: "Convert approved steel inputs into a finished widget.",
    availability: {
      enabled: true,
      availableInBusinessCountry: true,
      availableNow: true,
      scarcityBand: "normal",
      eventDurationMultiplier: 1,
      routeDisruptionMultiplier: 1,
    },
    sourceType: "grant",
    grantedAt: "2026-09-01T08:00:00.000Z",
  }],
};
data.businessStockroom = {
  businessKey,
  locations: [
    {
      accountKey: "iac_11111111111111111111111111111111",
      locationKey: "warehouse",
      label: "Warehouse",
      itemCount: 1,
      quantityOwned: 12,
      quantityReserved: 2,
      quantityAvailable: 10,
    },
    {
      accountKey: "iac_22222222222222222222222222222222",
      locationKey: "work_in_progress",
      label: "Work in Progress",
      itemCount: 0,
      quantityOwned: 0,
      quantityReserved: 0,
      quantityAvailable: 0,
    },
    {
      accountKey: "iac_33333333333333333333333333333333",
      locationKey: "finished_goods",
      label: "Finished Goods",
      itemCount: 1,
      quantityOwned: 4,
      quantityReserved: 1,
      quantityAvailable: 3,
    },
    {
      accountKey: "iac_44444444444444444444444444444444",
      locationKey: "in_transit",
      label: "In Transit",
      itemCount: 0,
      quantityOwned: 0,
      quantityReserved: 0,
      quantityAvailable: 0,
    },
  ],
  items: [
    {
      accountKey: "iac_11111111111111111111111111111111",
      locationKey: "warehouse",
      itemKey: "itm_11111111111111111111111111111111",
      canonicalKey: "steel-billet",
      name: "Steel Billet",
      itemClass: "material",
      subtype: "input",
      quantityOwned: 12,
      quantityReserved: 2,
      quantityAvailable: 10,
      averageUnitCost: 2.5,
      costCurrencyCode: "ECO",
      version: 3,
    },
    {
      accountKey: "iac_33333333333333333333333333333333",
      locationKey: "finished_goods",
      itemKey: "itm_33333333333333333333333333333333",
      canonicalKey: "steel-widget",
      name: "Steel Widget",
      itemClass: "product",
      subtype: "finished_good",
      quantityOwned: 4,
      quantityReserved: 1,
      quantityAvailable: 3,
      averageUnitCost: 18.75,
      costCurrencyCode: "ECO",
      version: 2,
    },
  ],
};
data.businessEquipment = {
  equipment: [
    {
      businessKey,
      installationKey: "bei_11111111111111111111111111111111",
      equipmentKey: "eqp_11111111111111111111111111111111",
      itemKey: "itm_55555555555555555555555555555555",
      canonicalKey: "equipment.industrial-press.v1",
      itemName: "Industrial Press",
      equipmentSlot: "operations",
      capabilityKeys: ["pressing", "forming"],
      installationStatus: "installed",
      periodKey: "equipment:1",
      capacityMinutes: 480,
      reservedMinutes: 120,
      consumedMinutes: 60,
      availableMinutes: 300,
      idleMinutes: 300,
      utilizationBasisPoints: 3750,
      durabilitySupported: false,
      repairSupported: false,
    },
    {
      businessKey,
      installationKey: "bei_22222222222222222222222222222222",
      equipmentKey: "eqp_22222222222222222222222222222222",
      itemKey: "itm_66666666666666666666666666666666",
      canonicalKey: "equipment.cnc-mill.v1",
      itemName: "CNC Mill",
      equipmentSlot: "operations",
      capabilityKeys: ["cutting"],
      installationStatus: "offline",
      periodKey: "equipment:1",
      capacityMinutes: 0,
      reservedMinutes: 0,
      consumedMinutes: 90,
      availableMinutes: 0,
      idleMinutes: 0,
      utilizationBasisPoints: 0,
      durabilitySupported: false,
      repairSupported: false,
    },
  ],
};
data.store = {
  categories: ["All"],
  items: [{
    id: "steel-widget",
    itemKey: "steel-widget",
    canonicalItemKey: "steel-widget",
    name: "Steel Widget",
    offers: [{
      offerKey: "sof_77777777777777777777777777777777",
      sellerPartyKey: "pty_77777777777777777777777777777777",
      sellerKind: "business",
      sellerName: "Crescent Dynamics",
      businessKey,
      businessName: "Crescent Dynamics",
      unitPrice: 42,
      currencyCode: "ECO",
      availableQuantity: 3,
      status: "active",
      purchasability: "self_purchase_blocked",
      purchasable: false,
      version: 4,
    }],
  }],
};

const normalizerContext = { config: {}, requestId: "req_phase12", path: "/players/me/business" };
assert.deepEqual(
  normalizeApiResponse("businessStockroom", data.businessStockroom, {
    ...normalizerContext,
    path: "/players/me/business/stockroom",
  }),
  data.businessStockroom,
);
assert.deepEqual(
  normalizeApiResponse("businessRecipes", data.businessRecipes, {
    ...normalizerContext,
    path: "/players/me/business/recipes",
  }),
  data.businessRecipes,
);

const badQuantity = structuredClone(data.businessStockroom);
badQuantity.locations[0].quantityAvailable = 11;
assert.throws(
  () => normalizeApiResponse("businessStockroom", badQuantity, normalizerContext),
  /incomplete data/u,
  "Stockroom quantities must reconcile before rendering.",
);
const badAccount = structuredClone(data.businessStockroom);
badAccount.items[0].accountKey = "iac_99999999999999999999999999999999";
assert.throws(
  () => normalizeApiResponse("businessStockroom", badAccount, normalizerContext),
  /incomplete data/u,
  "Stockroom items must remain bound to their canonical location account.",
);
const privateIdentifier = structuredClone(data.businessStockroom);
privateIdentifier.items[0].name = "00000000-0000-4000-8000-000000000099";
assert.throws(
  () => normalizeApiResponse("businessStockroom", privateIdentifier, normalizerContext),
  /incomplete data/u,
  "Private UUIDs must not cross the Player Stockroom boundary.",
);
const badRecipe = structuredClone(data.businessRecipes);
badRecipe.recipes[0].accessKey = "not-a-public-access-key";
assert.throws(
  () => normalizeApiResponse("businessRecipes", badRecipe, normalizerContext),
  /incomplete data/u,
  "Recipe access must retain its public bra_ identity.",
);

const workspace = renderBusinessWorkspacePage(data);
for (const token of [
  'aria-label="Business workspace"',
  'data-business-workspace-section="overview"',
  'data-business-workspace-section="recipes"',
  'data-business-workspace-section="stockroom"',
  'data-business-workspace-section="procurement"',
  'data-business-workspace-section="production"',
  'data-business-workspace-section="workforce"',
  'data-business-workspace-section="equipment"',
  'data-business-workspace-section="sales"',
  'data-business-workspace-section="finance"',
  'data-business-workspace-section="activity"',
  'id="business-stockroom-warehouse"',
  'id="business-stockroom-finished_goods"',
  'data-business-equipment-installation="bei_11111111111111111111111111111111"',
  'data-business-sales-offer="sof_77777777777777777777777777777777"',
  "Procurement unavailable",
  "FINISHED GOODS & ACTIVE LISTINGS",
  "Pending withdrawal timing is not inferred",
  "Steel Billet",
  "Steel Widget",
  "Industrial Press",
  "CNC Mill",
  "pressing · forming",
  "Finished Goods",
  "HISTORICAL INPUT SUMMARY · NON-AUTHORITATIVE",
]) {
  assert.match(workspace, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Workspace must render ${token}.`);
}
assert.doesNotMatch(workspace, /business_inventory/u, "The canonical Stockroom surface must not identify the retired aggregate table as authority.");

const unavailable = structuredClone(data);
unavailable.resourceStatus.businessStockroom = { state: "unavailable" };
delete unavailable.businessStockroom;
const unavailableHtml = renderBusinessWorkspacePage(unavailable);
assert.match(unavailableHtml, /Canonical Stockroom unavailable/u);
assert.match(unavailableHtml, /historical aggregate Business inventory summary is not used as Stockroom authority/u);

const unavailableEquipment = structuredClone(data);
unavailableEquipment.resourceStatus.businessEquipment = { state: "unavailable" };
delete unavailableEquipment.businessEquipment;
const unavailableEquipmentHtml = renderBusinessWorkspacePage(unavailableEquipment);
assert.match(unavailableEquipmentHtml, /Equipment capacity unavailable/u);
assert.match(unavailableEquipmentHtml, /No inferred machine capacity is shown/u);

const unavailableStore = structuredClone(data);
unavailableStore.resourceStatus.store = { state: "unavailable" };
delete unavailableStore.store;
const unavailableStoreHtml = renderBusinessWorkspacePage(unavailableStore);
assert.match(unavailableStoreHtml, /FINISHED GOODS & ACTIVE LISTINGS/u);
assert.match(unavailableStoreHtml, /PARTIAL READ/u);
assert.match(unavailableStoreHtml, /Pending withdrawal timing is not inferred/u);

process.stdout.write("Business workspace resource and rendering verification passed.\n");
