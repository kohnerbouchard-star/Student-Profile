import { test, expect } from "@playwright/test";
test("failed claim remains visibly failed after canonical refresh", async ({ page }) => {
  await page.route("**/craft-outcome-fixture", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><main id="fixture"></main>' }));
  await page.goto("/craft-outcome-fixture");
  await page.evaluate(async () => {
    const { createPlayerTerminalLifecycle } = await import("/src/core/player-terminal-lifecycle.js");
    const { createPlayerTerminalForms } = await import("/src/core/player-terminal-forms.js");
    const { PlayerApi } = await import("/src/api/player-api.js");
    const { createStore } = await import("/src/core/store.js");
    const { createResourceFreshnessCoordinator } = await import("/src/api/resource-freshness-coordinator.js");
    const { renderCraftingPage } = await import("/src/pages/crafting-page.js");
    const { previewData } = await import("/src/data/preview-data.js");
    const jobKey = "cft_" + "a".repeat(32), models = structuredClone(previewData);
    models.crafting.queue = [{ jobKey, name: "Fixture job", quantity: 1, status: "ready", canClaim: true, canCancel: false }];
    window.craftWrites = []; window.craftToasts = [];
    const config = { authenticated: true, usePreviewData: false, csrfToken: "C".repeat(43), gameSessionId: "fixture-game",
      apiCall: async context => {
        if (context.method === "POST") { window.craftWrites.push(context.payload); models.crafting.queue = []; return { ok: true, data: { jobKey, status: "failed", outcome: "failed", committed: true, refreshRequired: true } }; }
        return structuredClone(models[context.endpointKey]);
      } };
    const freshness = createResourceFreshnessCoordinator(), api = new PlayerApi(config, { freshness });
    const store = createStore({ ui: {}, data: { ...models, capabilities: { actions: { craftClaim: true }, endpointKeys: { craftingJobClaim: true } } } });
    const mount = document.querySelector("#fixture"), showToast = (...args) => window.craftToasts.push(args);
    const lifecycle = createPlayerTerminalLifecycle({ api, store, config, freshness, mount, showToast, openConnectionModal() {} });
    const forms = createPlayerTerminalForms({ store, mount, showToast, executeEndpoint: lifecycle.executeEndpoint });
    mount.addEventListener("submit", forms.handleSubmit);
    const render = () => { const state = store.getState(); mount.innerHTML = renderCraftingPage(state.data, state.ui); };
    store.subscribe(render); render(); window.craftLifecycle = lifecycle;
  });
  await page.getByRole("button", { name: "Claim output", exact: true }).click();
  const receipt = page.locator("[data-player-crafting-job-outcome]");
  await expect(receipt).toContainText("recorded failure, not a successful output claim");
  await expect(page.getByRole("button", { name: "Claim output", exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.craftToasts.length)).toBe(1);
  expect(await page.evaluate(() => window.craftToasts[0][1])).toBe("amber");
  expect(await page.evaluate(() => window.craftWrites.length)).toBe(1);
  await page.evaluate(() => window.craftLifecycle.destroy());
});
