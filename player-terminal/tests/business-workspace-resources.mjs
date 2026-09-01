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

process.stdout.write("Business workspace resource wiring verification passed.\n");
