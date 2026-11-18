import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { loansFixture } from "../loans-lifecycle-fixture.mjs";
const styles = [...readFileSync(new URL("../../index.html", import.meta.url), "utf8").matchAll(/<link rel="stylesheet" href="\.([^\"]+)"\s*\/>/g)].map((match) => `<link rel="stylesheet" href="${match[1]}">`).join("");
async function mount(page) {
  await page.route("**/loans-progress-fixture", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="fixture"></div></body></html>` }));
  await page.goto("/loans-progress-fixture#loans");
  await page.evaluate(async (loans) => {
    const { createPlayerTerminal } = await import("/src/app.js");
    const { buildPlayerTerminalConfig } = await import("/src/config/player-terminal.config.js");
    const { previewData } = await import("/src/data/preview-data.js");
    const models = structuredClone(previewData); models.loans = loans;
    models.banking.checking.available = 0;
    const calls = [], repayments = [];
    const config = buildPlayerTerminalConfig({ usePreviewData: false, authenticated: true, csrfToken: "L".repeat(43), gameSessionId: "loans-fixture",
      capabilities: { routes: { loans: true, news: true }, actions: { loanRepay: true, loanApply: true } },
      apiCall: async (context) => {
        calls.push(context.endpointKey);
        if (context.endpointKey === "loanRepay") {
          repayments.push(structuredClone({ params: context.params, payload: context.payload }));
          if (globalThis.loanProgressTest.rejectRepayment) throw { status: 409, code: "INSUFFICIENT_FUNDS" };
        }
        return context.method === "GET" ? structuredClone(models[context.endpointKey]) : { ok: true };
      } });
    const terminal = createPlayerTerminal({ mount: document.querySelector("#fixture"), config });
    globalThis.loanProgressTest = { terminal, models, calls, repayments, rejectRepayment: false };
  }, loansFixture());
  await expect(page.locator(".player-terminal-loans-page")).toBeVisible();
}
test.beforeEach(async ({ page }) => { page.loanErrors = []; page.on("pageerror", (error) => page.loanErrors.push(error.message)); await mount(page); });
test.afterEach(async ({ page }) => { expect(page.loanErrors).toEqual([]); });
test("principal progress is accessible, fits both viewports and leaves payment controls unchanged", async ({ page }) => {
  const progress = page.getByRole("progressbar", { name: "Principal repaid" });
  await expect(progress).toHaveAttribute("aria-valuenow", "95.9");
  await expect(progress).toHaveAttribute("aria-valuetext", /NRC 95.99 of NRC 100.00 original principal repaid; interest excluded/);
  await expect(page.locator("[data-loan-principal-progress]")).toContainText("Remaining principal NRC 4.01");
  await expect(page.locator("[data-loan-paid-milestones]")).toContainText("Loan paid");
  const disclosure = page.locator('[data-endpoint="loanRepay"]').locator("..");
  await disclosure.locator("summary").focus(); await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(disclosure.locator('input[name="amount"]')).toHaveValue("2.00");
  await page.keyboard.press("Enter"); await expect(disclosure).not.toHaveAttribute("open", "");
  expect(await page.evaluate(() => loanProgressTest.repayments)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: test.info().outputPath("loans-principal-progress.png"), fullPage: true });
});

test("refresh and route return replace progress and remove unsupported paid milestones without mutations", async ({ page }) => {
  await page.evaluate(async () => {
    const row = loanProgressTest.models.loans.lifecycle.facilities.items[0];
    Object.assign(row, { principalBalance: "2.01", accruedInterest: "1.00", recordedOutstanding: "3.01" });
    loanProgressTest.models.loans.lifecycle.facilities.items[2].status = "active";
    await loanProgressTest.terminal.refreshResources(["loans"]);
  });
  await expect(page.getByRole("progressbar", { name: "Principal repaid" })).toHaveAttribute("aria-valuenow", "97.9");
  await expect(page.locator("[data-loan-principal-progress]")).toContainText("Stored accrued interest NRC 1.00");
  await expect(page.locator("[data-loan-paid-milestones]")).toHaveCount(0);
  await page.evaluate(() => loanProgressTest.terminal.navigate("news"));
  await expect(page.locator("[data-loan-principal-progress]")).toHaveCount(0);
  await page.evaluate(() => loanProgressTest.terminal.navigate("loans"));
  await expect(page.getByRole("progressbar", { name: "Principal repaid" })).toHaveAttribute("aria-valuenow", "97.9");
  await page.evaluate(async () => {
    loanProgressTest.models.loans.lifecycle = { version: 1, state: "unavailable" };
    await loanProgressTest.terminal.refreshResources(["loans"]);
  });
  await expect(page.getByRole("progressbar", { name: "Principal repaid" })).toHaveCount(0);
  await expect(page.locator("[data-loan-principal-progress]")).toContainText("Principal progress unavailable");
  await expect(page.locator('[data-endpoint="loanRepay"]')).toHaveCount(1);
  expect(await page.evaluate(() => loanProgressTest.repayments)).toEqual([]);
});
