import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

for (const [endpointKey, endpointPath, canonicalPath] of [
  ["businessStockroom", "/business/stockroom", "/players/me/business/stockroom"],
  ["businessRecipes", "/business/recipes", "/players/me/business/recipes"],
  ["businessEquipment", "/business/equipment", "/players/me/business/equipment"],
]) {
  assert.deepEqual(PLAYER_ENDPOINTS[endpointKey], { method: "GET", path: endpointPath });
  assert.equal(hasPlayerBackendRoute(endpointKey), true);
  assert.equal(PLAYER_BACKEND_ROUTE_KEYS.includes(endpointKey), true);
  assert.deepEqual(resolvePlayerBackendRequest({
    endpointKey,
    method: "GET",
    path: endpointPath,
    payload: {},
    params: {},
    session: {},
  }), {
    endpointKey,
    method: "GET",
    path: canonicalPath,
    payload: undefined,
    provisional: { method: "GET", path: endpointPath, payload: {} },
  });
}

const advertised = createResourceSupport({ session: { capabilityEndpointKeys: ["business"] } });
assert.equal(advertised.businessStockroom, true);
assert.equal(advertised.businessRecipes, true);
assert.equal(advertised.businessEquipment, true);
assert.equal(advertised.businessTreasury, false, "Treasury keeps independent capability authority.");

const businessPlan = resourcesForRoute("business");
assert.deepEqual(businessPlan.required, ["business", "countries"]);
assert.deepEqual(businessPlan.optional, ["businessWorkforce", "store"]);
assert.deepEqual(businessPlan.dependent, ["businessTreasury", "businessStockroom", "businessRecipes", "businessEquipment"]);
assert.deepEqual(dependentResourcesForRoute("business", { business: { configured: false } }), []);
assert.deepEqual(dependentResourcesForRoute("business", { business: { configured: true } }), ["businessTreasury", "businessStockroom", "businessRecipes", "businessEquipment"]);
assert.equal(resourceFreshnessMs("businessStockroom"), 10_000);
assert.equal(resourceFreshnessMs("businessRecipes"), 30_000);
assert.equal(resourceFreshnessMs("businessEquipment"), 10_000);
assert.deepEqual(validInvalidationResources(["businessStockroom", "businessRecipes", "businessEquipment", "bad"]), ["businessStockroom", "businessRecipes", "businessEquipment"]);

for (const endpointKey of ["businessManufacturingStart", "businessManufacturingCancel"]) {
  assert.equal(WRITE_INVALIDATIONS[endpointKey].includes("businessStockroom"), true);
  assert.equal(WRITE_INVALIDATIONS[endpointKey].includes("businessEquipment"), true);
}
assert.equal(WRITE_INVALIDATIONS.businessStorePurchase.includes("businessStockroom"), true);
assert.equal(WRITE_INVALIDATIONS.businessStorePurchase.includes("businessEquipment"), false);

const data = structuredClone(previewData);
const businessKey = `biz_${"a".repeat(32)}`;
data.business.configured = true;
data.business.company.id = businessKey;
data.business.company.name = "Crescent Dynamics";
data.business.products = [{
  id: `bpr_${"1".repeat(32)}`,
  category: "Manufacturing",
  name: "Steel Widget",
  description: "Canonical physical product",
  price: 42,
  margin: 25,
  icon: "factory",
  version: 4,
}];
data.business.manufacturingJobs = [];
data.business.productionReadiness = [{
  businessKey,
  productKey: `bpr_${"1".repeat(32)}`,
  productName: "Steel Widget",
  recipeKey: "recipe-steel-widget-v1",
  plannedQuantity: 10,
  status: "blocked",
  nextRunReady: false,
  materialReady: true,
  laborReady: false,
  equipmentReady: true,
  materialMaxUnits: 20,
  laborMaxUnits: 6,
  equipmentMaxUnits: 15,
  maxRunnableUnits: 6,
  bottlenecks: ["labor"],
  materialLines: 1,
  materialBlockedLines: 0,
  materialRequired: 10,
  materialAvailable: 20,
  laborRequiredMinutes: 600,
  laborAvailableMinutes: 360,
  laborRequiredHeadcount: 2,
  laborAvailableHeadcount: 1,
  equipmentRequiredMinutes: 300,
  equipmentAvailableMinutes: 450,
  equipmentRequiredInstances: 1,
  equipmentAvailableInstances: 1,
  payrollPeriodKey: "payroll:1",
  equipmentPeriodKey: "equipment:1",
}];
data.business.governance = {
  businessKey,
  entityType: "llc",
  taxClassification: "disregarded",
  formationState: "operational",
  ownershipModelVersion: 2,
  ownerCount: 2,
  totalUnits: "10000",
  totalVotingUnits: "10000",
  currentPosition: {
    positionKey: `own_${"2".repeat(32)}`,
    ownershipKind: "membership_interest",
    units: "6000",
    votingUnits: "6000",
    ownershipBasisPoints: 6000,
    votingBasisPoints: 6000,
    effectiveAt: "2026-09-01T08:00:00.000Z",
  },
  corporateShareStructure: null,
  openProposals: [{
    proposalKey: `bgp_${"3".repeat(32)}`,
    proposalType: "distribution",
    status: "open",
    approvalThresholdBasisPoints: 5001,
    snapshotTotalVotingUnits: "10000",
    expiresAt: "2026-09-09T08:00:00.000Z",
    resolvedAt: null,
    executedAt: null,
  }],
  readOnly: true,
};
data.business.salesOffers = [{
  offerKey: `sof_${"4".repeat(32)}`,
  itemKey: `itm_${"5".repeat(32)}`,
  canonicalKey: "steel-widget",
  itemName: "Steel Widget",
  status: "withdrawal_pending",
  unitPrice: 42,
  currencyCode: "ECO",
  quantityOwned: 3,
  quantityReserved: 1,
  quantityAvailable: 2,
  purchaseAllowed: false,
  withdrawal: {
    requestKey: `swr_${"6".repeat(32)}`,
    mode: "full",
    requestedQuantity: null,
    resumeStatus: "active",
    requestedAt: "2026-09-02T00:00:00.000Z",
    effectiveAt: "2026-09-02T00:05:00.000Z",
    nextAttemptAt: "2026-09-02T00:05:00.000Z",
    lastAttemptAt: null,
    lastBlockReason: "inventory_reserved",
    attemptCount: 1,
  },
  version: 5,
}];
data.business.activity = [{
  activityKey: `bae_${"7".repeat(32)}`,
  eventType: "business.store.withdrawal.requested",
  reasonCode: "store_offer_withdrawal_requested",
  actorType: "player",
  referenceKey: `sof_${"4".repeat(32)}`,
  occurredAt: "2026-09-02T00:00:00.000Z",
}];
data.business.storeSales = {
  businessKey,
  currencyCode: "ECO",
  recentReceiptCount: 0,
  recentQuantitySold: 0,
  recentGrossRevenue: 0,
  recentCostOfGoodsSold: 0,
  recentGrossMargin: 0,
  sales: [],
  activity: [],
};
data.business.workforceUtilization = null;
data.businessWorkforce = { candidates: [] };
data.resourceStatus = {
  ...(data.resourceStatus || {}),
  businessStockroom: { state: "ready" },
  businessRecipes: { state: "ready" },
  businessEquipment: { state: "ready" },
  store: { state: "ready" },
  businessTreasury: { state: "unavailable" },
};
data.businessRecipes = { recipes: [{
  accessKey: `bra_${"8".repeat(32)}`,
  recipeKey: "recipe-steel-widget-v1",
  name: "Steel Widget Recipe",
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
  sourceType: "formation",
  grantedAt: "2026-09-01T08:00:00.000Z",
}] };
data.businessStockroom = {
  businessKey,
  locations: [
    { accountKey: `iac_${"1".repeat(32)}`, locationKey: "warehouse", label: "Warehouse / Materials", itemCount: 1, quantityOwned: 20, quantityReserved: 0, quantityAvailable: 20 },
    { accountKey: `iac_${"2".repeat(32)}`, locationKey: "work_in_progress", label: "Work in Progress", itemCount: 0, quantityOwned: 0, quantityReserved: 0, quantityAvailable: 0 },
    { accountKey: `iac_${"3".repeat(32)}`, locationKey: "finished_goods", label: "Finished Goods", itemCount: 1, quantityOwned: 4, quantityReserved: 1, quantityAvailable: 3 },
    { accountKey: `iac_${"4".repeat(32)}`, locationKey: "in_transit", label: "In Transit", itemCount: 0, quantityOwned: 0, quantityReserved: 0, quantityAvailable: 0 },
  ],
  items: [
    { accountKey: `iac_${"1".repeat(32)}`, locationKey: "warehouse", itemKey: `itm_${"1".repeat(32)}`, canonicalKey: "steel-billet", name: "Steel Billet", itemClass: "material", subtype: "input", quantityOwned: 20, quantityReserved: 0, quantityAvailable: 20, averageUnitCost: 2.5, costCurrencyCode: "ECO", version: 3 },
    { accountKey: `iac_${"3".repeat(32)}`, locationKey: "finished_goods", itemKey: `itm_${"5".repeat(32)}`, canonicalKey: "steel-widget", name: "Steel Widget", itemClass: "finished_good", subtype: "business_product", quantityOwned: 4, quantityReserved: 1, quantityAvailable: 3, averageUnitCost: 18.75, costCurrencyCode: "ECO", version: 2 },
  ],
};
data.businessEquipment = { equipment: [{
  businessKey,
  installationKey: `bei_${"1".repeat(32)}`,
  equipmentKey: `eqp_${"1".repeat(32)}`,
  itemKey: `itm_${"9".repeat(32)}`,
  canonicalKey: "equipment.industrial-press.v1",
  itemName: "Industrial Press",
  equipmentSlot: "operations",
  capabilityKeys: ["pressing"],
  installationStatus: "installed",
  periodKey: "equipment:1",
  capacityMinutes: 480,
  reservedMinutes: 30,
  consumedMinutes: 0,
  availableMinutes: 450,
  idleMinutes: 450,
  utilizationBasisPoints: 625,
  durabilitySupported: false,
  repairSupported: false,
}] };

const normalizerContext = { config: {}, requestId: "req_phase12", path: "/players/me/business" };
assert.deepEqual(normalizeApiResponse("businessStockroom", data.businessStockroom, { ...normalizerContext, path: "/players/me/business/stockroom" }), data.businessStockroom);
assert.deepEqual(normalizeApiResponse("businessRecipes", data.businessRecipes, { ...normalizerContext, path: "/players/me/business/recipes" }), data.businessRecipes);

const badQuantity = structuredClone(data.businessStockroom);
badQuantity.locations[0].quantityAvailable = 21;
assert.throws(() => normalizeApiResponse("businessStockroom", badQuantity, normalizerContext), /incomplete data/u);

const workspace = renderBusinessWorkspacePage(data);
for (const token of [
  'data-business-workspace-v2',
  'aria-label="Business workspace"',
  'data-business-workspace-section="overview"',
  'data-business-workspace-section="products"',
  'data-business-workspace-section="stockroom"',
  'data-business-workspace-section="procurement"',
  'data-business-workspace-section="production"',
  'data-business-workspace-section="workforce"',
  'data-business-workspace-section="equipment"',
  'data-business-workspace-section="sales"',
  'data-business-workspace-section="finance"',
  'data-business-workspace-section="governance"',
  'data-business-workspace-section="activity"',
  'data-business-production-readiness="bpr_11111111111111111111111111111111"',
  'bottleneck labor',
  'WITHDRAWAL PENDING',
  'blocked: inventory_reserved',
  'OWNERSHIP / GOVERNANCE',
  '60.00%',
  'business.store.withdrawal.requested',
  'Steel Billet',
  'Industrial Press',
]) assert.match(workspace, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Workspace must render ${token}.`);

for (const retired of [
  'data-player-form="business-product-create"',
  'data-endpoint="businessProductCreate"',
  "Create a product",
  "HISTORICAL INPUT SUMMARY",
  "INPUT INVENTORY",
  "Pending withdrawal timing is not inferred",
]) assert.doesNotMatch(workspace, new RegExp(retired.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Configured workspace must retire ${retired}.`);

const routeSource = await readFile(new URL("../src/core/route-renderer.js", import.meta.url), "utf8");
assert.match(routeSource, /configured === true[\s\S]*renderConfiguredBusinessWorkspacePage/u);
assert.match(routeSource, /return renderBusinessFormationPage\(data\)/u);
assert.doesNotMatch(routeSource, /const base = renderBusinessFormationPage/u);
assert.doesNotMatch(routeSource, /anchorBusinessWorkspaceSections/u);
assert.doesNotMatch(routeSource, /appendBusinessWorkspacePanels/u);

const unconfigured = structuredClone(data);
unconfigured.business.configured = false;
const formation = renderBusinessWorkspacePage(unconfigured);
assert.match(formation, /BUSINESS FORMATION/u);
assert.doesNotMatch(formation, /data-business-workspace-v2/u);

const unavailable = structuredClone(data);
unavailable.resourceStatus.businessStockroom = { state: "unavailable" };
delete unavailable.businessStockroom;
const unavailableHtml = renderBusinessWorkspacePage(unavailable);
assert.match(unavailableHtml, /Canonical Stockroom unavailable/u);
assert.match(unavailableHtml, /Historical aggregate Business inventory is not substituted/u);

process.stdout.write("Business workspace cutover, canonical projection, and rendering verification passed.\n");
