import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Real terminal, command normalization, resource coordinator and DOM. The
// deterministic transport is not evidence of a PostgreSQL settlement.
async function mount(page) {
  const index = await readFile(new URL("../../index.html", import.meta.url), "utf8").catch(() => "");
  const styles = [...index.matchAll(/<link rel="stylesheet"[^>]+>/g)].map(([value]) => value.replace('href="./', 'href="/')).join("");
  await page.route("**/business-loop-fixture", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head>${styles}</head><body><div id="fixture"></div></body></html>` }));
  await page.goto("/business-loop-fixture#business");
  await page.evaluate(async () => {
    const { createPlayerTerminal } = await import("/src/app.js");
    const { buildPlayerTerminalConfig } = await import("/src/config/player-terminal.config.js");
    const { previewData } = await import("/src/data/preview-data.js");
    const { resolvePlayerBackendRequest } = await import("/src/api/backend-routes.js");
    const keys = { business: `biz_${"a".repeat(32)}`, equipment: `eqp_${"b".repeat(32)}`, item: `itm_${"c".repeat(32)}`, product: `bpr_${"d".repeat(32)}`, offer: `sof_${"e".repeat(32)}` };
    const models = structuredClone(previewData), calls = [];
    const commands = ["businessEquipmentInstall", "businessStoreOfferCreate", "businessStoreOfferStock", "businessStoreOfferPublish", "businessStorePurchase"];
    models.session.capabilityEndpointKeys = ["dashboard", "countries", "business", ...commands, "businessManufacturingStart"];
    const business = models.business;
    business.configured = true; business.company.id = keys.business;
    business.products = [{ id: keys.product, name: "Fixture Widget", category: "Manufacturing", price: 20, margin: 25, version: 1 }];
    business.employees = []; business.manufacturingJobs = []; business.workforceUtilization = null; business.salesOffers = []; business.activity = [];
    business.productionReadiness = [{ productKey: keys.product, productName: "Fixture Widget", recipeKey: "widget-recipe", nextRunReady: false, maxRunnableUnits: 0, bottlenecks: ["equipment"] }];
    business.storeSales = { businessKey: keys.business, currencyCode: "ECO", recentReceiptCount: 0, recentQuantitySold: 0, recentGrossRevenue: 0, recentCostOfGoodsSold: 0, recentGrossMargin: 0, sales: [], activity: [] };
    models.businessEquipment = { equipment: [], availableEquipment: [{ equipmentKey: keys.equipment, itemKey: keys.item, canonicalKey: "press", name: "Fixture Press" }], saleableStoreItems: [{ itemKey: "fixture-widget", catalogItemKey: keys.item, name: "Fixture Widget", currencyCode: "ECO" }] };
    models.businessRecipes = { recipes: [] };
    const locations = ["warehouse", "work_in_progress", "finished_goods", "in_transit"].map((locationKey, i) => ({ accountKey: `iac_${String(i + 1).repeat(32)}`, locationKey, label: locationKey, itemCount: 0, quantityOwned: 0, quantityReserved: 0, quantityAvailable: 0 }));
    models.businessStockroom = { businessKey: keys.business, locations, items: [] };
    function finished(quantity) {
      const location = locations[2]; Object.assign(location, { itemCount: quantity ? 1 : 0, quantityOwned: quantity, quantityReserved: 0, quantityAvailable: quantity });
      models.businessStockroom.items = quantity ? [{ accountKey: location.accountKey, locationKey: "finished_goods", itemKey: keys.item, canonicalKey: "fixture-widget", name: "Fixture Widget", itemClass: "finished_good", subtype: "product", quantityOwned: quantity, quantityReserved: 0, quantityAvailable: quantity, averageUnitCost: 5, costCurrencyCode: "ECO", version: 1 }] : [];
    }
    const config = buildPlayerTerminalConfig({ usePreviewData: false, authenticated: true, csrfToken: "B".repeat(43), gameSessionId: "business-loop-fixture", writeCooldownMs: 0,
      capabilities: { routes: { business: true, news: true }, actions: { businessProduction: true, storePurchase: true, ...Object.fromEntries(commands.map((key) => [key, true])) } },
      apiCall: async (context) => {
        if (context.method === "GET") return structuredClone(models[context.endpointKey]);
        const request = resolvePlayerBackendRequest({ ...context, payload: { ...context.payload, idempotencyKey: context.idempotencyKey } });
        calls.push({ endpointKey: context.endpointKey, path: request.path, payload: request.payload });
        if (globalThis.businessLoop.hold) { await new Promise((resolve) => { globalThis.businessLoop.release = resolve; }); globalThis.businessLoop.hold = false; }
        if (context.endpointKey === "businessEquipmentInstall") {
          models.businessEquipment.availableEquipment = [];
          models.businessEquipment.equipment = [{ equipmentKey: keys.equipment, installationKey: `bei_${"1".repeat(32)}`, itemName: "Fixture Press", capabilityKeys: ["press"], installationStatus: "installed", capacityMinutes: 480, availableMinutes: 480, reservedMinutes: 0 }];
          Object.assign(business.productionReadiness[0], { nextRunReady: true, maxRunnableUnits: 6, bottlenecks: [] });
        } else if (context.endpointKey === "businessManufacturingStart") {
          finished(Number(context.payload.quantity));
        } else if (context.endpointKey === "businessStoreOfferCreate") {
          business.salesOffers = [{ offerKey: keys.offer, itemKey: keys.item, canonicalKey: "fixture-widget", itemName: "Fixture Widget", unitPrice: Number(context.payload.unitPrice), currencyCode: "ECO", status: "draft", version: 1, quantityAvailable: 0, quantityOwned: 0, quantityReserved: 0, purchaseAllowed: false }];
        } else if (context.endpointKey === "businessStoreOfferStock") {
          const offer = business.salesOffers[0], quantity = Number(context.payload.quantity);
          offer.quantityAvailable += quantity; offer.quantityOwned += quantity; offer.version += 1;
          finished(locations[2].quantityAvailable - quantity);
        } else if (context.endpointKey === "businessStoreOfferPublish") {
          Object.assign(business.salesOffers[0], { status: "active", purchaseAllowed: true, version: 3 });
        }
        return { ok: true, result: { replayed: false }, refreshRequired: true };
      },
    });
    globalThis.businessLoop = { models, keys, calls, hold: false, terminal: null };
    businessLoop.terminal = createPlayerTerminal({ mount: document.querySelector("#fixture"), config });
  });
  await expect(page.getByRole("button", { name: "Install equipment", exact: true })).toBeEnabled();
}

test.beforeEach(async ({ page }) => { page.loopErrors = []; page.on("pageerror", (error) => page.loopErrors.push(error.message)); await mount(page); });
test.afterEach(async ({ page }) => { await page.evaluate(() => businessLoop.terminal.destroy()); expect(page.loopErrors).toEqual([]); });

test("equipment, manufacturing, draft, stock and publication use real Player controls", async ({ page }) => {
  const guidance = page.locator("[data-business-next-actions]");
  await expect(guidance).toContainText("Install warehouse equipment");
  await guidance.getByRole("link", { name: "Review equipment", exact: true }).click();
  await expect(page).toHaveURL(/#business$/);
  await expect(page.locator('[data-business-workspace-section="equipment"]')).toBeFocused();
  await page.getByRole("navigation", { name: "Business workspace", exact: true }).getByRole("link", { name: "Production", exact: true }).click();
  await expect(page).toHaveURL(/#business$/);
  await expect(page.locator('[data-business-workspace-section="production"]')).toBeFocused();
  expect(await page.evaluate(() => businessLoop.calls.length)).toBe(0);
  await expect(page.locator('[data-player-form="business-manufacturing-start"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Install equipment", exact: true }).click();
  await expect(page.locator('[data-business-equipment-installation]')).toContainText("Fixture Press");
  await expect(guidance).toContainText("Start a ready production run");
  await expect(guidance).not.toContainText("Install warehouse equipment");
  const production = page.locator('[data-player-form="business-manufacturing-start"]');
  await expect(production.locator('[name="quantity"]')).toHaveAttribute("max", "6");
  await production.locator('[name="quantity"]').fill("4"); await production.getByRole("button").click();
  await expect(guidance).toContainText("Move finished goods toward a sale");
  const create = page.locator('[data-player-form="business-store-offer-create"]');
  await expect(create).toBeVisible(); await create.locator('[name="unitPrice"]').fill("20"); await create.getByRole("button").click();
  const stock = page.locator('[data-player-form="business-store-offer-stock"]');
  await expect(stock.locator('[name="quantity"]')).toHaveAttribute("max", "4");
  await expect(page.getByRole("button", { name: "Publish offer", exact: true })).toHaveCount(0);
  await stock.locator('[name="quantity"]').fill("4"); await stock.getByRole("button").click();
  await expect(guidance).toContainText("Review stocked offers for publication");
  await page.getByRole("button", { name: "Publish offer", exact: true }).click();
  await expect(page.locator('[data-business-sales-offer]')).toContainText("ACTIVE");
  await expect(page.locator('[data-player-form="business-store-offer-stock"]')).toHaveCount(0);
  await expect(guidance).toContainText("Monitor published offers");
  await expect(guidance).not.toContainText("Review committed sales receipts");
  const calls = await page.evaluate(() => businessLoop.calls);
  expect(calls.map((call) => call.endpointKey)).toEqual(["businessEquipmentInstall", "businessManufacturingStart", "businessStoreOfferCreate", "businessStoreOfferStock", "businessStoreOfferPublish"]);
  for (const call of calls) { expect(call.payload.idempotencyKey).toBeTruthy(); expect(call.payload.gameSessionId).toBeUndefined(); expect(call.payload.playerId).toBeUndefined(); expect(call.payload.businessKey).toBeUndefined(); }
  expect(calls[3].payload.expectedOfferVersion).toBe(1); expect(calls[4].payload.expectedOfferVersion).toBe(2);
  await expect(page.locator("[data-business-store-sales]")).toContainText("only when a buyer completes a Store purchase");
  // A committed seller receipt arrives through the existing read authority.
  await page.evaluate(async () => {
    const { models, keys, terminal } = businessLoop;
    const sale = { receiptKey: `spr_${"1".repeat(32)}`, quoteKey: `quote_${"2".repeat(32)}`, offerKey: keys.offer, itemKey: "fixture-widget", quantity: 2, grossRevenue: 40, costOfGoodsSold: 10, grossMargin: 30, currencyCode: "ECO", completedAt: "2026-11-09T12:00:00.000Z" };
    const activity = { ...sale, activityKey: `bae_${"3".repeat(32)}`, eventType: "business.store.sale.completed", reasonCode: "business_store_offer_purchase", occurredAt: sale.completedAt };
    Object.assign(models.business.storeSales, { recentReceiptCount: 1, recentQuantitySold: 2, recentGrossRevenue: 40, recentCostOfGoodsSold: 10, recentGrossMargin: 30, sales: [sale], activity: [activity] });
    await terminal.refreshResources(["business"]);
  });
  await expect(guidance).toContainText("Review committed sales receipts");
  const receipt = page.locator("[data-business-store-sale-receipt]");
  await expect(receipt).toContainText("ECO 40");
  await expect(receipt).toContainText("ECO 10");
  await expect(receipt).toContainText("ECO 30");

});

test("repeated submission cannot create two installation writes and navigation retains outcome", async ({ page }) => {
  await page.evaluate(() => { businessLoop.hold = true; });
  const form = page.locator('[data-player-form="business-equipment-install"]');
  await form.getByRole("button").click();
  await expect.poll(() => page.evaluate(() => businessLoop.calls.length)).toBe(1);
  await form.evaluate((node) => node.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await expect.poll(() => page.evaluate(() => businessLoop.calls.length)).toBe(1);
  await page.evaluate(() => { businessLoop.terminal.navigate("news"); businessLoop.release(); });
  await expect(page.locator('[data-page="news"]')).toBeVisible();
  await page.evaluate(() => businessLoop.terminal.navigate("business"));
  await expect(page.locator('[data-business-equipment-installation]')).toContainText("Fixture Press");
  await expect(page.getByRole("button", { name: "Install equipment", exact: true })).toHaveCount(0);
});

test('manufacturing progress shows recorded output and navigates without a new command', async ({ page }) => {
  await page.evaluate(async () => {
    const { models, keys, terminal } = businessLoop;
    models.business.manufacturingJobs = [{
      jobKey: `mfg_${'f'.repeat(32)}`, businessKey: keys.business, productKey: keys.product,
      productName: 'Fixture Widget', status: 'queued', resourceState: 'reserved', priority: 'standard',
      quantity: 10, completedOutputQuantity: null, queuedAt: '2026-11-01T12:00:00Z',
      startedAt: null, completesAt: '2026-11-01T13:00:00Z',
      completedAt: null, cancelledAt: null, failedAt: null, failureCode: null, canCancel: false,
    }];
    await terminal.refreshResources(['business']);
  });
  const queued = page.locator('[data-business-job-progress="queued"]');
  await expect(queued).toContainText('Waiting to start');
  await expect(queued.locator('time')).toHaveAttribute('datetime', '2026-11-01T12:00:00.000Z');
  await expect(queued).not.toContainText('Recorded completed output');
  await expect(queued.getByRole('link', { name: 'Review Stockroom' })).toHaveCount(0);
  await expect(page.locator('[data-business-stockroom-location="finished_goods"]')).toHaveCount(0);
  expect(await page.evaluate(() => businessLoop.calls.length)).toBe(0);
  await page.evaluate(async () => {
    const { models, keys, terminal } = businessLoop;
    Object.assign(models.business.manufacturingJobs[0], {
      status: 'completed', resourceState: 'consumed', completedOutputQuantity: 6,
      startedAt: '2026-11-01T12:00:00Z', completedAt: '2026-11-01T13:00:00Z',
    });
    // Independent current inventory read: six recorded output units need not
    // mean six available now. Never derive this projection from the job card.
    const location = models.businessStockroom.locations.find((row) => row.locationKey === 'finished_goods');
    Object.assign(location, { itemCount: 1, quantityOwned: 6, quantityReserved: 2, quantityAvailable: 4 });
    models.businessStockroom.items = [{
      accountKey: location.accountKey, locationKey: 'finished_goods', itemKey: keys.item,
      canonicalKey: 'fixture-widget', name: 'Fixture Widget', itemClass: 'finished_good', subtype: 'product',
      quantityOwned: 6, quantityReserved: 2, quantityAvailable: 4, averageUnitCost: 5, costCurrencyCode: 'ECO', version: 2,
    }];
    await terminal.refreshResources(['business', 'businessStockroom']);
  });
  await expect(queued).toHaveCount(0);
  const progress = page.locator('[data-business-job-progress="completed"]');
  await expect(progress).toContainText('Recorded completed output: 6 units');
  await expect(progress).toContainText('not current available stock or sales revenue');
  await expect(progress.locator('time')).toHaveAttribute('datetime', '2026-11-01T13:00:00.000Z');
  await progress.getByRole('link', { name: 'Review Stockroom' }).click();
  await expect(page.locator('#business-workspace-stockroom')).toBeFocused();
  const itemKey = await page.evaluate(() => businessLoop.keys.item);
  const finishedItem = page.locator(`#business-workspace-stockroom [data-business-stockroom-item="${itemKey}"][data-business-stockroom-location="finished_goods"]`);
  await expect(finishedItem).toBeVisible();
  await expect(finishedItem).toContainText('Fixture Widget');
  await expect(finishedItem).toContainText('4 available · 2 reserved · 6 owned');
  await expect(progress).toContainText('Recorded completed output: 6 units');
  expect(await page.evaluate(() => businessLoop.calls.length)).toBe(0);
});

test('reserved listing stock is not presented as a completed sale or available withdrawal', async ({ page }) => {
  await page.evaluate(async () => {
    const { models, keys, terminal } = businessLoop;
    models.business.salesOffers = [{
      offerKey: keys.offer, itemKey: keys.item, canonicalKey: 'fixture-widget', itemName: 'Fixture Widget',
      unitPrice: 20, currencyCode: 'ECO', status: 'active', version: 1,
      quantityOwned: 8, quantityReserved: 3, quantityAvailable: 5, purchaseAllowed: true, withdrawal: null,
    }];
    await terminal.refreshResources(['business']);
  });
  const offer = page.locator('[data-business-sales-offer]');
  await expect(offer.locator('[data-player-form="business-store-withdrawal-reduce"]')).toHaveCount(1);
  await expect(offer.getByRole('button', { name: 'Reduce listing', exact: true })).toBeEnabled();
  await page.evaluate(async () => {
    const { models, terminal } = businessLoop;
    Object.assign(models.business.salesOffers[0], { quantityReserved: 8, quantityAvailable: 0, version: 2 });
    await terminal.refreshResources(['business']);
  });
  const custody = offer.locator('[data-business-offer-custody]');
  await expect(custody.locator('dl > div').filter({ hasText: 'OWNED IN LISTING' }).locator('dd')).toHaveText('8');
  await expect(custody.locator('dl > div').filter({ hasText: 'RESERVED IN LISTING' }).locator('dd')).toHaveText('8');
  await expect(custody.locator('dl > div').filter({ hasText: 'AVAILABLE IN LISTING' }).locator('dd')).toHaveText('0');
  await expect(custody).toContainText('This does not prove they were sold');
  await expect(offer.locator('[data-player-form="business-store-withdrawal-reduce"]')).toHaveCount(0);
  await expect(page.locator('[data-business-store-sale-receipt]')).toHaveCount(0);
  expect(await page.evaluate(() => businessLoop.calls.length)).toBe(0);
});
