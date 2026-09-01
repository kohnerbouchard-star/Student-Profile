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

for (const [endpointKey, path] of [
  ["businessStockroom", "/players/me/business/stockroom"],
  ["businessRecipes", "/players/me/business/recipes"],
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
assert.equal(advertised.businessTreasury, false, "Treasury keeps its independent capability authority.");

const unadvertised = createResourceSupport({
  session: { capabilityEndpointKeys: [] },
});
assert.equal(unadvertised.businessStockroom, false);
assert.equal(unadvertised.businessRecipes, false);

const businessPlan = resourcesForRoute("business");
assert.deepEqual(businessPlan.required, ["business", "countries"]);
assert.deepEqual(businessPlan.optional, ["businessWorkforce", "store"]);
assert.deepEqual(
  businessPlan.dependent,
  ["businessTreasury", "businessStockroom", "businessRecipes"],
  "Canonical workspace reads must load only after the overview proves a configured Business.",
);
assert.deepEqual(dependentResourcesForRoute("business", { business: { configured: false } }), []);
assert.deepEqual(
  dependentResourcesForRoute("business", { business: { configured: true } }),
  ["businessTreasury", "businessStockroom", "businessRecipes"],
);

assert.equal(resourceFreshnessMs("businessStockroom"), 10_000);
assert.equal(resourceFreshnessMs("businessRecipes"), 30_000);
assert.deepEqual(
  validInvalidationResources(["businessStockroom", "businessRecipes", "not-a-resource"]),
  ["businessStockroom", "businessRecipes"],
);

for (const endpointKey of ["businessManufacturingStart", "businessManufacturingCancel", "businessStorePurchase"]) {
  assert.equal(
    WRITE_INVALIDATIONS[endpointKey].includes("businessStockroom"),
    true,
    `${endpointKey} must invalidate canonical Stockroom state.`,
  );
}

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
const businessKey = data.business.company.id;
data.resourceStatus = {
  ...(data.resourceStatus || {}),
  businessStockroom: { state: "ready" },
  businessRecipes: { state: "ready" },
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

const workspace = renderBusinessWorkspacePage(data);
for (const token of [
  'aria-label="Business workspace"',
  'data-business-workspace-section="overview"',
  'data-business-workspace-section="recipes"',
  'data-business-workspace-section="stockroom"',
  'data-business-workspace-section="procurement"',
  'data-business-workspace-section="production"',
  'data-business-workspace-section="workforce"',
  'data-business-workspace-section="sales"',
  'data-business-workspace-section="finance"',
  'data-business-workspace-section="activity"',
  'id="business-stockroom-warehouse"',
  'id="business-stockroom-finished_goods"',
  "Steel Billet",
  "Steel Widget",
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

process.stdout.write("Business workspace resource and rendering verification passed.\n");
