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
    const commands = ["businessEquipmentInstall", "businessStoreOfferCreate", "businessStoreOfferStock", "businessStoreOfferPublish"];
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
      capabilities: { routes: { business: true, news: true }, actions: { businessProduction: true, ...Object.fromEntries(commands.map((key) => [key, true])) } },
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
  await expect(page.locator('[data-player-form="business-manufacturing-start"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Install equipment", exact: true }).click();
  await expect(page.locator('[data-business-equipment-installation]')).toContainText("Fixture Press");
  const production = page.locator('[data-player-form="business-manufacturing-start"]');
  await expect(production.locator('[name="quantity"]')).toHaveAttribute("max", "6");
  await production.locator('[name="quantity"]').fill("4"); await production.getByRole("button").click();
  const create = page.locator('[data-player-form="business-store-offer-create"]');
  await expect(create).toBeVisible(); await create.locator('[name="unitPrice"]').fill("20"); await create.getByRole("button").click();
  const stock = page.locator('[data-player-form="business-store-offer-stock"]');
  await expect(stock.locator('[name="quantity"]')).toHaveAttribute("max", "4");
  await expect(page.getByRole("button", { name: "Publish offer", exact: true })).toHaveCount(0);
  await stock.locator('[name="quantity"]').fill("4"); await stock.getByRole("button").click();
  await page.getByRole("button", { name: "Publish offer", exact: true }).click();
  await expect(page.locator('[data-business-sales-offer]')).toContainText("ACTIVE");
  await expect(page.locator('[data-player-form="business-store-offer-stock"]')).toHaveCount(0);
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
