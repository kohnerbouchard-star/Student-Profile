import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loansFixture } from "../loans-lifecycle-fixture.mjs";
const styles = [...readFileSync(new URL("../../index.html", import.meta.url), "utf8").matchAll(/<link rel="stylesheet" href="\.([^\"]+)"\s*\/>/g)].map((match) => `<link rel="stylesheet" href="${match[1]}">`).join("");
async function mount(page) {
  await page.route("**/loans-lifecycle-fixture", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="fixture"></div></body></html>` }));
  await page.goto("/loans-lifecycle-fixture#loans");
  await page.evaluate(async (loans) => {
    const { createPlayerTerminal } = await import("/src/app.js");
    const { buildPlayerTerminalConfig } = await import("/src/config/player-terminal.config.js");
    const { previewData } = await import("/src/data/preview-data.js");
    const models = structuredClone(previewData); models.loans = loans;
    const calls = [];
    const config = buildPlayerTerminalConfig({ usePreviewData: false, authenticated: true, csrfToken: "L".repeat(43), gameSessionId: "loans-fixture",
      capabilities: { routes: { loans: true, news: true }, actions: { loanRepay: true, loanApply: true } },
      apiCall: async (context) => { calls.push(context.endpointKey); return structuredClone(models[context.endpointKey]); } });
    const terminal = createPlayerTerminal({ mount: document.querySelector("#fixture"), config });
    globalThis.loansTest = { terminal, models, calls };
  }, loansFixture());
  await expect(page.locator(".player-terminal-loans-page")).toBeVisible();
}
test.beforeEach(async ({ page }) => { page.loanErrors = []; page.on("pageerror", (error) => page.loanErrors.push(error.message)); await mount(page); });
test.afterEach(async ({ page }) => { expect(page.loanErrors).toEqual([]); });
test("default history and exact partial-installment forecast are usable and fit the viewport", async ({ page }) => {
  await expect(page.getByText("Default does not erase this debt", { exact: false })).toBeVisible();
  const disclosure = page.locator(".player-terminal-loan-schedule details");
  await disclosure.locator("summary").focus(); await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("open", ""); await expect(disclosure.getByText("NRC 2.01", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter"); await expect(disclosure).not.toHaveAttribute("open", "");
  await disclosure.locator("summary").click(); await expect(disclosure.getByText("NRC 2.01", { exact: true })).toBeVisible();
  await expect(page.locator('[data-endpoint="loanRepay"]')).toHaveCount(1);
  await expect(page.locator('[data-endpoint="loanRepay"] input')).toHaveValue("2.00");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: test.info().outputPath("loans-lifecycle.png"), fullPage: true });
});
test("route departure, return, refresh and optional history failure do not keep stale records", async ({ page }) => {
  await page.evaluate(() => loansTest.terminal.navigate("news")); await expect(page.locator(".player-terminal-loans-page")).toHaveCount(0);
  await page.evaluate(() => loansTest.terminal.navigate("loans")); await expect(page.locator(".player-terminal-loans-page")).toBeVisible();
  await page.evaluate(async () => { loansTest.models.loans.lifecycle = { version: 1, state: "unavailable" }; loansTest.models.loans.repaymentForecast = null; await loansTest.terminal.refreshResources(["loans"]); });
  await expect(page.getByText("Loan history unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("Default does not erase this debt", { exact: false })).toHaveCount(0);
  await expect(page.locator('[data-endpoint="loanRepay"]')).toHaveCount(1);
  await page.evaluate(async (loans) => { loansTest.models.loans = loans; await loansTest.terminal.refreshResources(["loans"]); }, loansFixture());
  await expect(page.getByText("Default does not erase this debt", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => loansTest.calls.filter((key) => key === "loanRepay"))).toEqual([]);
});
