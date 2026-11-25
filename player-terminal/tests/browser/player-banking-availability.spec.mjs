import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const styles = readFileSync(new URL("../../index.html", import.meta.url), "utf8").match(/<link rel="stylesheet"[^>]+>/g).join("").replaceAll('href="./', 'href="/');

async function mount(page, amounts) {
  await page.route("**/banking-availability-fixture", route => route.fulfill({
    contentType: "text/html", body: `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">${styles}<main id="banking"></main>`,
  }));
  await page.goto("/banking-availability-fixture#banking");
  await page.evaluate(async amounts => {
    const { createPlayerTerminal } = await import("/src/app.js");
    const { buildPlayerTerminalConfig } = await import("/src/config/player-terminal.config.js");
    const { mergeTerminalRead } = await import("/src/api/read-model.js");
    const { previewData } = await import("/src/data/preview-data.js");
    const models = structuredClone(previewData);
    Object.assign(models.session, { currencyCode: "ELD", currencyResolved: true });
    Object.assign(models, mergeTerminalRead(models, "banking", { currentBalances: [{
      accountKey: "bac_11111111111111111111111111111111", accountKind: "checking", currencyCode: "ELD", ...amounts,
    }], ledgerEntries: [] }));
    const config = buildPlayerTerminalConfig({
      usePreviewData: false, authenticated: true, csrfToken: "B".repeat(43), gameSessionId: "availability-fixture",
      capabilities: { routes: { banking: true }, actions: { bankTransfer: true } },
      apiCall: async context => structuredClone(models[context.endpointKey]),
    });
    globalThis.availabilityTerminal = createPlayerTerminal({ mount: document.querySelector("#banking"), config });
  }, amounts);
  await expect(page.locator('[data-page="banking"]')).toBeVisible();
  return page.locator('[data-player-banking-balance="checking:ELD"]');
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => globalThis.availabilityTerminal?.destroy());
});

for (const [label, amounts, held, available] of [
  ["reported hold", { postedAmount: 15.34, heldAmount: 3, availableAmount: 12.34 }, "ELD 3", "ELD 12.34"],
  ["fully held", { postedAmount: 15.34, heldAmount: 15.34, availableAmount: 0 }, "ELD 15.34", "ELD 0"],
  ["unknown hold", { balance: 15.34 }, "Unavailable", "Unavailable"],
  ["reported availability with unknown hold", { postedAmount: 15.34, availableAmount: 12.34 }, "Unavailable", "ELD 12.34"],
  ["exact decimal remainder", { postedAmount: "0.30", heldAmount: "0.20" }, "ELD 0.2", "ELD 0.1"],
]) test(`${label} survives the mounted terminal read and render`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const card = await mount(page, amounts);
  await expect(card).toContainText("Posted");
  await expect(card.locator("dt", { hasText: /^Held$/ }).locator("+ dd")).toHaveText(held);
  await expect(card.locator("dt", { hasText: /^Available$/ }).locator("+ dd")).toHaveText(available);
  expect(errors).toEqual([]);
});
