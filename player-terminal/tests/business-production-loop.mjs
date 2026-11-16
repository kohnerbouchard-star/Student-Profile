import assert from "node:assert/strict";
import { renderBusinessEquipmentInstall, renderBusinessOfferDrafts, renderBusinessOfferStock } from "../src/pages/business-production-controls.js";
import { normalizeWritePayload } from "../src/api/payload-normalizer.js";
import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import { normalizeApiResponse } from "../src/api/response-normalizer.js";
import { WRITE_INVALIDATIONS, IDEMPOTENT_WRITE_ENDPOINTS } from "../src/api/resource-plan.js";
import { isEndpointEnabled } from "../src/api/capabilities.js";

const item = `itm_${"1".repeat(32)}`, equipment = `eqp_${"2".repeat(32)}`, offer = `sof_${"3".repeat(32)}`;
const commands = ["businessEquipmentInstall", "businessStoreOfferCreate", "businessStoreOfferStock", "businessStoreOfferPublish"];
const data = {
  capabilities: { actions: Object.fromEntries(commands.map((key) => [key, true])), endpointKeys: Object.fromEntries(commands.map((key) => [key, true])) },
  resourceStatus: Object.fromEntries(["business", "businessStockroom", "businessEquipment"].map((key) => [key, { state: "ready" }])),
  business: { salesOffers: [] },
  businessEquipment: { equipment: [], availableEquipment: [{ equipmentKey: equipment, itemKey: item, name: "Press <safe>", canonicalKey: "press" }], saleableStoreItems: [{ itemKey: "steel-widget", catalogItemKey: item, name: "Widget", currencyCode: "ECO" }] },
  businessStockroom: { items: [{ itemKey: item, locationKey: "finished_goods", quantityAvailable: 6, name: "Widget" }] },
};
const draft = { offerKey: offer, itemKey: item, status: "draft", quantityAvailable: 0, version: 3 };
assert.match(renderBusinessEquipmentInstall(data), /Press &lt;safe&gt;/);
assert.match(renderBusinessEquipmentInstall(data), /business-equipment-install/);
assert.match(renderBusinessOfferDrafts(data), /Create draft offer/);
assert.match(renderBusinessOfferStock(data, draft), /max="6"/);
assert.doesNotMatch(renderBusinessOfferStock(data, draft), /Publish offer/);
assert.match(renderBusinessOfferStock(data, { ...draft, quantityAvailable: 2 }), /Publish offer/);
assert.doesNotMatch(renderBusinessOfferStock(data, { ...draft, status: "withdrawal_pending", quantityAvailable: 2 }), /data-player-form/);
assert.doesNotMatch(renderBusinessOfferStock(data, { ...draft, status: "active", quantityAvailable: 2 }), /Publish offer/);
assert.doesNotMatch(renderBusinessOfferDrafts({ ...data, business: { salesOffers: [draft] } }), /Create draft offer/);
assert.doesNotMatch(renderBusinessOfferDrafts({ ...data, businessEquipment: { ...data.businessEquipment, saleableStoreItems: [{ itemKey: "steel-widget", catalogItemKey: `itm_${"9".repeat(32)}`, name: "Widget", currencyCode: "ECO" }] } }), /Create draft offer/, "Matching names cannot substitute for catalog identity.");
for (const resource of ["business", "businessStockroom", "businessEquipment"]) {
  const unavailable = structuredClone(data); unavailable.resourceStatus[resource].state = "error";
  const html = [renderBusinessEquipmentInstall(unavailable), renderBusinessOfferDrafts(unavailable), renderBusinessOfferStock(unavailable, draft)].join("");
  if (resource === "business") assert.doesNotMatch(html, /type="submit"\s*>/);
  if (resource === "businessStockroom") assert.doesNotMatch(renderBusinessOfferStock(unavailable, draft), /Add listing stock/);
}
for (const key of commands) {
  assert.ok(IDEMPOTENT_WRITE_ENDPOINTS.has(key));
  assert.ok(WRITE_INVALIDATIONS[key].includes("business"));
  assert.equal(isEndpointEnabled({ actions: { [key]: true }, endpointKeys: [] }, key), false);
  assert.equal(isEndpointEnabled(data.capabilities, key), true);
}
const cases = [
  ["businessEquipmentInstall", { equipmentKey: equipment }, "/players/me/business/equipment/install"],
  ["businessStoreOfferCreate", { itemKey: "steel-widget", unitPrice: "12.50" }, "/players/me/business/store/offers"],
  ["businessStoreOfferStock", { offerKey: offer, quantity: "2", expectedOfferVersion: "3" }, `/players/me/business/store/offers/${offer}/stock`],
  ["businessStoreOfferPublish", { offerKey: offer, expectedOfferVersion: "3" }, `/players/me/business/store/offers/${offer}/publish`],
];
for (const [endpointKey, raw, path] of cases) {
  const payload = normalizeWritePayload(endpointKey, { ...raw, playerId: "injected", gameSessionId: "injected", businessKey: "injected", amount: 123, status: "active" });
  assert.equal(payload.playerId, undefined); assert.equal(payload.gameSessionId, undefined); assert.equal(payload.businessKey, undefined);
  const resolved = resolvePlayerBackendRequest({ endpointKey, payload: { ...payload, idempotencyKey: "business-loop-test-key" }, method: "POST", path: "/provisional" });
  assert.equal(resolved.path, path); assert.equal(resolved.payload.idempotencyKey, "business-loop-test-key");
  assert.equal(resolved.payload.offerKey, undefined, "Offer key belongs only in the authenticated route.");
  assert.equal(resolved.payload.status, undefined);
}
for (const quantity of [0, -1, 1.2, Infinity, NaN, "wrong", Number.MAX_SAFE_INTEGER + 1]) {
  assert.throws(() => normalizeWritePayload("businessStoreOfferStock", { offerKey: offer, expectedOfferVersion: 3, quantity }));
}
for (const key of ["businessStoreOfferStock", "businessStoreOfferPublish"]) {
  assert.throws(() => normalizeWritePayload(key, { offerKey: "untrusted", expectedOfferVersion: 3, quantity: 1 }));
  assert.throws(() => normalizeWritePayload(key, { offerKey: offer, expectedOfferVersion: 0, quantity: 1 }));
}
assert.throws(() => normalizeWritePayload("businessStoreOfferCreate", { itemKey: "widget", unitPrice: -1 }));
assert.throws(() => normalizeApiResponse("businessEquipment", { ...data.businessEquipment, availableEquipment: [{ equipmentKey: "bad", itemKey: item, name: "Press" }] }));
console.log("Business production loop: controls, authority, invalidation, input and route contracts passed.");

// Exercise the real shared write coordinator for all four new commands.
const { PlayerApi } = await import("../src/api/player-api.js");
for (const [endpointKey, raw] of cases) {
  const calls = [];
  let finish;
  let loseResponse = true;
  const api = new PlayerApi({ usePreviewData: false, writeCooldownMs: 0, requestTimeoutMs: 5000,
    apiCall: async (context) => {
      calls.push(context);
      if (loseResponse) {
        await new Promise((resolve) => { finish = resolve; });
        throw { code: "REQUEST_TIMEOUT", status: 0 };
      }
      return { ok: true, result: { replayed: true }, refreshRequired: true };
    },
  });
  const payload = normalizeWritePayload(endpointKey, raw);
  const first = api.execute(endpointKey, payload);
  const second = api.execute(endpointKey, payload);
  assert.equal(first, second, `${endpointKey} repeated submission shares one pending write.`);
  const rejected = assert.rejects(first);
  await new Promise(setImmediate); assert.equal(calls.length, 1); finish(); await rejected;
  loseResponse = false;
  const replay = await api.execute(endpointKey, payload);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].idempotencyKey, calls[0].idempotencyKey, `${endpointKey} uncertain response reuses its exact intent identity.`);
  assert.deepEqual(replay.invalidatedResources, [...WRITE_INVALIDATIONS[endpointKey]]);
}
console.log("Business commands: repeated-click deduplication and uncertain-response idempotency reuse passed.");
