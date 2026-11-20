import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { renderBusinessProductionIntents } from "../src/pages/business-workspace-page.js";

const businessKey = `biz_${"a".repeat(32)}`;
const readyProductKey = `bpr_${"1".repeat(32)}`;
const blockedProductKey = `bpr_${"2".repeat(32)}`;
const base = {
  capabilities: {
    actions: { businessProduction: true },
    endpointKeys: null,
  },
  business: {
    company: { id: businessKey },
    products: [
      { id: readyProductKey, name: "Ready Widget" },
      { id: blockedProductKey, name: "Blocked Widget" },
    ],
    productionReadiness: [],
  },
};

const blocked = structuredClone(base);
blocked.business.productionReadiness = [
  {
    productKey: blockedProductKey,
    productName: "Blocked Widget",
    recipeKey: "recipe-blocked-widget-v1",
    nextRunReady: false,
    maxRunnableUnits: 8,
  },
];
const blockedHtml = renderBusinessProductionIntents(blocked);
assert.match(blockedHtml, /data-business-production-intent="blocked"/u);
assert.match(blockedHtml, /No runnable production intent/u);
assert.doesNotMatch(blockedHtml, /data-player-form="business-manufacturing-start"/u);
assert.doesNotMatch(blockedHtml, /Blocked Widget/u, "Blocked products belong in readiness evidence, not an enabled intent.");

const ready = structuredClone(base);
ready.business.productionReadiness = [
  {
    productKey: readyProductKey,
    productName: "Ready Widget",
    recipeKey: "recipe-ready-widget-v1",
    nextRunReady: true,
    maxRunnableUnits: 6,
  },
  {
    productKey: blockedProductKey,
    productName: "Blocked Widget",
    recipeKey: "recipe-blocked-widget-v1",
    nextRunReady: false,
    maxRunnableUnits: 20,
  },
];
const readyHtml = renderBusinessProductionIntents(ready);
assert.match(readyHtml, /data-business-production-intent="ready"/u);
assert.match(readyHtml, /data-player-form="business-manufacturing-start"/u);
assert.match(readyHtml, new RegExp(`name="productKey"[^>]+value="${readyProductKey}"`, "u"));
assert.match(readyHtml, /name="quantity"[^>]+min="1"[^>]+max="6"[^>]+value="6"/u);
assert.match(readyHtml, /Start Ready Widget/u);
assert.doesNotMatch(readyHtml, /Blocked Widget/u);
assert.doesNotMatch(readyHtml, /max="10000"/u);

const largerRun = structuredClone(ready);
largerRun.business.productionReadiness[0].maxRunnableUnits = 18;
const largerRunHtml = renderBusinessProductionIntents(largerRun);
assert.match(largerRunHtml, /name="quantity"[^>]+min="1"[^>]+max="18"[^>]+value="10"/u);

const invalidMaximum = structuredClone(ready);
invalidMaximum.business.productionReadiness[0].maxRunnableUnits = 0;
const invalidMaximumHtml = renderBusinessProductionIntents(invalidMaximum);
assert.match(invalidMaximumHtml, /data-business-production-intent="blocked"/u);
assert.doesNotMatch(invalidMaximumHtml, /business-manufacturing-start/u);

const routeSource = await readFile(new URL("../src/core/route-renderer.js", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../src/pages/business-workspace-page.js", import.meta.url), "utf8");
assert.match(routeSource, /business-workspace\.js/u);
assert.doesNotMatch(routeSource, /STOCKROOM_ORDER/u);
assert.doesNotMatch(routeSource, /function production\(/u);
assert.doesNotMatch(routeSource, /max="10000"/u);
assert.match(pageSource, /nextRunReady !== true/u);
assert.match(pageSource, /maxRunnableUnits/u);
assert.match(pageSource, /renderBusinessProductionIntents/u);
assert.doesNotMatch(pageSource, /max="10000"/u);

process.stdout.write("Business workspace page boundary and production intent enforcement passed.\n");
