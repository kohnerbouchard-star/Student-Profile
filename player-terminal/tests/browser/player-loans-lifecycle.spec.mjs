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
    models.banking.checking.available = 0;
    const calls = [], repayments = [];
    const config = buildPlayerTerminalConfig({ usePreviewData: false, authenticated: true, csrfToken: "L".repeat(43), gameSessionId: "loans-fixture",
      capabilities: { routes: { loans: true, news: true }, actions: { loanRepay: true, loanApply: true } },
      apiCall: async (context) => {
        calls.push(context.endpointKey);
        if (context.endpointKey === "loanRepay") {
          repayments.push(structuredClone({ params: context.params, payload: context.payload }));
          if (globalThis.loansTest.rejectRepayment) throw { status: 409, code: "INSUFFICIENT_FUNDS" };
        }
        return context.method === "GET" ? structuredClone(models[context.endpointKey]) : { ok: true };
      } });
    const terminal = createPlayerTerminal({ mount: document.querySelector("#fixture"), config });
    globalThis.loansTest = { terminal, models, calls, repayments, rejectRepayment: false };
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

test("repayment reaches the command despite zero unrelated Checking and retains native required input", async ({ page }) => {
  const form = page.locator('[data-endpoint="loanRepay"]');
  await form.locator('..').locator('summary').click();
  await form.locator('input[name="amount"]').fill('');
  await form.locator('button[type="submit"]').click();
  expect(await page.evaluate(() => loansTest.repayments.length)).toBe(0);
  await form.locator('input[name="amount"]').fill('2.00');
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => page.evaluate(() => loansTest.repayments.length)).toBe(1);
  const repayment = await page.evaluate(() => loansTest.repayments[0]);
  expect(repayment.params.loanId).toBe(loansFixture().activeLoans[0].id);
  expect(repayment.payload.amount).toBe(2);
});

test("bound-account rejection remains an error and does not fabricate repaid debt", async ({ page }) => {
  await page.evaluate(() => { loansTest.rejectRepayment = true; });
  const form = page.locator('[data-endpoint="loanRepay"]');
  await form.locator('..').locator('summary').click();
  await form.locator('input[name="amount"]').fill('2.00');
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => page.evaluate(() => loansTest.repayments.length)).toBe(1);
  await expect(page.getByText('This action conflicts with a newer update. Refresh this section and try again.', { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => loansTest.terminal.getState().data.loans.activeLoans[0].balance)).toBe(4.01);
  await expect(form.locator('button[type="submit"]')).toBeEnabled();
});

test("facility-bound repayment account updates on refresh without sending a payment", async ({ page }) => {
  const disclosure = page.locator('[data-player-loan-repayment-account]');
  await page.locator('[data-endpoint="loanRepay"]').locator('..').locator('summary').click();
  await expect(disclosure).toContainText("Repayment account unavailable");
  for (const [account, label] of [["savings", "Savings account"], ["business", "Business operating account"], ["checking", "Checking account"]]) {
    await page.evaluate(async (value) => { loansTest.models.loans.activeLoans[0].repaymentAccountType = value; await loansTest.terminal.refreshResources(["loans"]); }, account);
    await expect(disclosure).toContainText(`facility-bound ${label} in NRC`);
  }
  await page.evaluate(async () => { delete loansTest.models.loans.activeLoans[0].repaymentAccountType; await loansTest.terminal.refreshResources(["loans"]); });
  await expect(disclosure).toContainText("Repayment account unavailable");
  expect(await page.evaluate(() => loansTest.repayments)).toEqual([]);
});

test("facility receipts open by keyboard, retain reversals, and clear after unavailable refresh", async ({ page }) => {
  const receipts = page.locator('[data-player-loan-payment-history]');
  await expect(receipts).toHaveCount(1);
  await expect(receipts.locator('summary')).toContainText('Payments for Working capital');
  await receipts.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(receipts).toHaveAttribute('open', '');
  await expect(receipts.getByText('Principal NRC 0.80', { exact: false })).toHaveCount(2);
  await expect(receipts.getByText('Reversed payment; not counted toward installment payments.')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(receipts).not.toHaveAttribute('open', '');
  await receipts.locator('summary').click();
  await expect(receipts).toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.evaluate(async () => { loansTest.models.loans.lifecycle = { version: 1, state: 'unavailable' }; await loansTest.terminal.refreshResources(['loans']); });
  await expect(receipts).toHaveCount(0);
  await expect(page.getByText('Loan history unavailable', { exact: true })).toBeVisible();
  await page.evaluate(async (loans) => { loansTest.models.loans = loans; await loansTest.terminal.refreshResources(['loans']); }, loansFixture());
  await expect(receipts).toHaveCount(1);
  expect(await page.evaluate(() => loansTest.repayments)).toEqual([]);
});

test('active facility opens its own recorded repayment plan by keyboard without submitting payment', async ({ page }) => {
  const id = await page.evaluate(() => loansTest.models.loans.activeLoans[0].id);
  const amount = page.locator(`[data-loan-id="${id}"] input[name="amount"]`);
  await page.locator('.player-terminal-active-loans details').filter({ has: amount }).locator('summary').click();
  await amount.fill('1.23');
  const shortcut = page.locator(`[data-loan-forecast-link="${id}"]`);
  await shortcut.focus(); await page.keyboard.press('Enter');
  const plan = page.locator(`[data-loan-forecast="${id}"]`);
  await expect(plan).toHaveAttribute('open', '');
  await expect(plan.locator('summary')).toBeFocused();
  await expect(plan.locator('summary')).toContainText(`Working capital · ${id}`);
  await expect(amount).toHaveValue('1.23');
  expect(await page.evaluate(() => loansTest.repayments)).toEqual([]);
});
