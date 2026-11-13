import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWorldManagementReadModel as normalize } from "../admin/v2/src/routes/world-management/WorldManagementReadModel.js";
import { normalizeWorldManagementReadModel as legacyExport } from "../admin/v2/src/routes/world-management/WorldManagementController.js";

const fulfilled = (data) => ({ status: "fulfilled", value: { data } });

test("World read model keeps its controller export and normalizes empty and failed panels", () => {
  assert.equal(normalize, legacyExport);
  const model = normalize({ panels: { geography: fulfilled(null), travel: { status: "rejected", reason: new Error("private detail") } } });
  assert.equal(model.isEmpty, true);
  assert.equal(model.runtime, null);
  assert.equal(model.panels.geography.status, "ready");
  assert.equal(model.panels.travel.status, "failed");
  assert.equal(JSON.stringify(model).includes("private detail"), false);
});

test("World read model preserves safe projection, aggregation and nested freezing", () => {
  const uuid = "123e4567-e89b-42d3-a456-426614174000";
  const model = normalize({ panels: {
    geography: fulfilled({ runtime: { revision: 7 }, locations: [
      { public_location_id: "loc_port", country_id: "north", display_name: "한강 港", player_id: uuid },
      { public_location_id: "loc_hidden", country_id: "north", display_name: uuid },
    ] }),
    arrivals: fulfilled({ assignments: [{ public_id: `acl_${"a".repeat(32)}`, country_id: "north", class_id: "NAVIGATOR" }] }),
    residency: fulfilled({ residency: [{ current_country_id: "north", currency_code: "nrc", eligible_country_ids: ["south"], pending_country_id: "south", player_id: uuid }] }),
    travel: fulfilled({ journeys: [{ currency_code: "NRC", total_cost_minor: 125, status: "active" }] }),
  } });
  assert.equal(model.runtime.revision, 7);
  assert.equal(model.geography.locations[0].displayName, "한강 港");
  assert.equal(model.geography.locations[1].displayName, "Unnamed location");
  assert.equal(model.arrivals[0].classId, "navigator");
  assert.deepEqual(model.countries.map((c) => [c.countryId, c.locationCount, c.arrivalCount, c.residencyCount, c.pendingResidencyCount]), [["north", 2, 1, 1, 0], ["south", 0, 0, 0, 1]]);
  assert.deepEqual(model.currencies.map((c) => [c.currencyCode, c.residencyCount, c.journeyCount, c.journeyCostMinor]), [["NRC", 1, 1, 125]]);
  assert.equal(model.summary.activeJourneyCount, 1);
  assert.equal(JSON.stringify(model).includes(uuid), false);
  for (const value of [model, model.geography, model.geography.locations, model.geography.locations[0], model.countries, model.countries[0].currencies, model.panels]) assert.equal(Object.isFrozen(value), true);
});

test("World read model retains input bounds and fallback row keys", () => {
  const model = normalize({ panels: { geography: fulfilled({ locations: Array.from({ length: 1001 }, (_, i) => ({ display_name: `Place ${i}` })) }), campaign: fulfilled({ campaigns: Array.from({ length: 21 }, () => ({})) }) } });
  assert.equal(model.geography.locations.length, 1000);
  assert.equal(model.geography.locations[0].rowKey, "location-1");
  assert.equal(model.campaign.campaigns.length, 20);
  assert.equal(model.campaign.current.rowKey, "campaign-1");
});
