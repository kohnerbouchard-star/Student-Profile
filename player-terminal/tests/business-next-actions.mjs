import assert from "node:assert/strict";
import { businessNextActions, renderBusinessNextActions } from "../src/pages/business-next-actions.js";
const base = () => ({ resourceStatus: { business: { state: "ready" }, businessStockroom: { state: "ready" }, businessEquipment: { state: "ready" } }, business: { configured: true, products: [{id:"product-a"}], productionReadiness: [], salesOffers: [] } });
for (const state of ["loading", "error", "stale", "idle", undefined]) {
  const data = base(); data.resourceStatus.business.state = state;
  assert.equal(renderBusinessNextActions(data), "");
}
assert.deepEqual(businessNextActions({}), []);
const unconfigured = base(); unconfigured.business.configured = false;
assert.equal(renderBusinessNextActions(unconfigured), "");
const blocked = base(); blocked.business.productionReadiness = [{ materialReady:false, laborReady:false, equipmentReady:false, nextRunReady:false }];
assert.deepEqual(businessNextActions(blocked).map(x=>x.section), ["procurement","workforce","equipment"]);
const runnable = base(); runnable.business.productionReadiness = [{productKey:"product-a",nextRunReady:true,maxRunnableUnits:3}];
assert.match(renderBusinessNextActions(runnable), /Start a ready production run/);
runnable.business.productionReadiness[0].productKey = "unknown";
assert.doesNotMatch(renderBusinessNextActions(runnable), /Start a ready production run/);
for (const quantity of [0,-1,NaN,Infinity,"bad"]) {
  runnable.business.productionReadiness[0] = {productKey:"product-a",nextRunReady:true,maxRunnableUnits:quantity};
  assert.doesNotMatch(renderBusinessNextActions(runnable), /Start a ready production run/);
}
const stock = base(); stock.businessStockroom = {items:[{locationKey:"finished_goods",quantityAvailable:4}]}; stock.businessEquipment = {availableEquipment:[{}]};
assert.match(renderBusinessNextActions(stock), /Move finished goods/);
assert.match(renderBusinessNextActions(stock), /Install warehouse equipment/);
stock.resourceStatus.businessStockroom.state = "loading"; stock.resourceStatus.businessEquipment.state = "error";
assert.doesNotMatch(renderBusinessNextActions(stock), /Move finished goods|Install warehouse equipment/);
for (const status of ["draft","paused"]) {
  const data=base(); data.business.salesOffers=[{status,quantityAvailable:1}];
  assert.match(renderBusinessNextActions(data), /Review stocked offers for publication/);
  assert.doesNotMatch(renderBusinessNextActions(data), /Monitor published offers|Review committed sales/);
}
for (const status of ["withdrawal_pending","withdrawn","closed"]) {
  const data=base(); data.business.salesOffers=[{status,quantityAvailable:1,purchaseAllowed:true}];
  assert.doesNotMatch(renderBusinessNextActions(data), /publication|Monitor published offers/);
}
const sold=base(); sold.business.salesOffers=[{status:"active",quantityAvailable:1,purchaseAllowed:true}];
assert.match(renderBusinessNextActions(sold), /Monitor published offers/);
assert.doesNotMatch(renderBusinessNextActions(sold), /Review committed sales receipts/);
sold.business.storeSales={recentReceiptCount:1};
assert.match(renderBusinessNextActions(sold), /Review committed sales receipts/);
sold.business.salesOffers[0].purchaseAllowed=false;
assert.doesNotMatch(renderBusinessNextActions(sold), /Monitor published offers/);
const html=renderBusinessNextActions(sold);
assert.doesNotMatch(html, /<form|data-endpoint|data-player-form/);
assert.equal(html, renderBusinessNextActions(sold), "Repeated renders do not mutate state");
console.log("Business next-action guidance: authoritative read, lifecycle and navigation cases passed.");
