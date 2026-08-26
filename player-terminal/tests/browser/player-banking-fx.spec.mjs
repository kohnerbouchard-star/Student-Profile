import { expect, test } from "@playwright/test";

async function mountBankingFxFixture(page) {
  await page.goto("/?preview=1#banking");
  await expect(page.locator("#player-main-content .player-terminal-page")).toBeVisible();
  await expect(page.locator(".player-terminal-route-skeleton")).toHaveCount(0);
  await page.evaluate(async () => {
    const [{ renderBankingPage }, { previewData }, { installBankingReadFlow }] = await Promise.all([
      import("/src/pages/banking-page.js"),
      import("/src/data/preview-data.js"),
      import("/src/features/banking/banking-read-flow.js"),
    ]);
    const data = structuredClone(previewData);
    data.capabilities = {
      routes: { banking: true },
      actions: {
        bankingFxQuote: true,
        bankingFxStandard: true,
        bankingFxInstant: true,
        bankingFxCancel: true,
        bankTransfer: false,
        savingsTransfer: false,
      },
    };
    data.resourceStatus = { bankingFx: { state: "ready" } };
    data.banking.balances = data.bankingFx.balances.map((balance) => ({
      ...balance,
      accountType: balance.accountKind,
      balance: balance.postedAmount,
      available: balance.availableAmount,
    }));
    data.banking.checking = {
      accountId: data.bankingFx.balances[0].accountKey,
      balance: data.bankingFx.balances[0].postedAmount,
      postedAmount: data.bankingFx.balances[0].postedAmount,
      heldAmount: data.bankingFx.balances[0].heldAmount,
      available: data.bankingFx.balances[0].availableAmount,
      availableAmount: data.bankingFx.balances[0].availableAmount,
      pending: data.bankingFx.balances[0].heldAmount,
      currencyCode: data.bankingFx.balances[0].currencyCode,
    };
    data.bankingFx.currentQuote = {
      quoteKey: "fxq_33333333333333333333333333333333",
      product: "instant",
      sourceAccountKey: "bac_11111111111111111111111111111111",
      targetAccountKey: "bac_22222222222222222222222222222222",
      sourceCurrencyCode: "ECO",
      targetCurrencyCode: "ELD",
      sourceMinorUnit: 2,
      targetMinorUnit: 2,
      sourceAmountMode: "source_debit",
      sourceAmount: "100",
      referenceRate: "1.44",
      customerRate: "1.4328",
      spreadRate: "0.005",
      feeAmount: "2",
      targetAmount: "143.28",
      fixingKey: "fxf_11111111111111111111111111111111",
      policyVersion: "fx-policy-v1",
      expiresAt: "2026-08-26T08:02:00.000Z",
      settlesAt: "2026-08-26T08:01:01.000Z",
      requiresFx: true,
      roundingDisclosure: "Expected credit is rounded once to ELD minor units.",
    };
    document.querySelector("#playerTerminal")?.remove();
    document.querySelector("#playerBankingFxBrowserFixture")?.remove();
    const fixture = document.createElement("main");
    fixture.id = "playerBankingFxBrowserFixture";
    fixture.className = "player-terminal-overview player-terminal-page-host";
    fixture.setAttribute("data-testid", "banking-fx-browser-fixture");
    fixture.innerHTML = renderBankingPage(data);
    document.body.append(fixture);
    installBankingReadFlow({
      mount: fixture,
      terminal: {
        getState: () => ({ route: "banking", data }),
        refreshResources: async () => {},
        showToast: () => {},
      },
      config: { usePreviewData: true, simulatePreviewWrites: false },
    });
  });
  return page.getByTestId("banking-fx-browser-fixture");
}

test("Banking FX exposes canonical balances, exact quote terms, and order states", async ({ page }) => {
  const fixture = await mountBankingFxFixture(page);

  const eco = fixture.locator('[data-player-banking-balance="checking:ECO"]');
  await expect(eco).toContainText("Posted");
  await expect(eco).toContainText("Held");
  await expect(eco).toContainText("Available");
  await expect(eco).toContainText("ECO 32,680");
  await expect(eco).toContainText("ECO 1,200");
  await expect(eco).toContainText("ECO 31,480");

  const source = fixture.locator("#player-banking-fx-source");
  const target = fixture.locator("#player-banking-fx-target");
  const amount = fixture.locator("#player-banking-fx-amount");
  const product = fixture.locator("#player-banking-fx-product");
  await expect(source.locator("option")).toHaveCount(3);
  await expect(source.locator('option[value="bac_44444444444444444444444444444444"]')).toHaveCount(0);
  await expect(target.locator('option[value="ECO"]')).toHaveAttribute("disabled", "");
  await expect(target.locator('option[value="ELD"]')).not.toHaveAttribute("disabled", "");
  await expect(target.locator('option[value="XAL"]')).toHaveCount(1);
  await expect(amount).toHaveAttribute("step", "0.01");

  await source.focus();
  await expect(source).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(amount).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(product).toBeFocused();

  await expect(fixture.getByText("LAST FIXING", { exact: true })).toBeVisible();
  await expect(fixture.getByText("NEXT FIXING", { exact: true })).toBeVisible();
  await expect(fixture.getByText("7 days", { exact: true })).toBeVisible();
  await expect(fixture.getByText("30 days", { exact: true })).toBeVisible();
  await expect(fixture.getByText("Game to date", { exact: true })).toBeVisible();

  const quote = fixture.locator("[data-player-banking-fx-quote]");
  await expect(quote).toContainText("Reference rate");
  await expect(quote).toContainText("Customer rate");
  await expect(quote).toContainText("Bank spread");
  await expect(quote).toContainText("2.00% separate fee");
  await expect(quote).toContainText("Expected credit");
  await expect(quote.getByRole("button", { name: "Convert instantly" })).toBeEnabled();

  await expect(fixture.getByRole("heading", { name: /Pending orders/ })).toBeVisible();
  await expect(fixture.getByRole("heading", { name: /Completed orders/ })).toBeVisible();
  await expect(fixture.getByRole("button", { name: "Cancel pending order" })).toBeEnabled();

  await source.selectOption("bac_22222222222222222222222222222222");
  await expect(target.locator('option[value="ELD"]')).toHaveAttribute("disabled", "");
  await expect(target.locator('option[value="ECO"]')).not.toHaveAttribute("disabled", "");
  await expect(quote).toContainText("Selections changed");
  await expect(quote.getByRole("button", { name: "Convert instantly" })).toHaveCount(0);

  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Banking FX renders a bounded error without hiding ledger activity", async ({ page }) => {
  const fixture = await mountBankingFxFixture(page);
  await page.evaluate(async () => {
    const [{ renderBankingPage }, { previewData }] = await Promise.all([
      import("/src/pages/banking-page.js"),
      import("/src/data/preview-data.js"),
    ]);
    const data = structuredClone(previewData);
    data.capabilities = { routes: { banking: true }, actions: {} };
    data.resourceStatus = { bankingFx: { state: "unavailable" } };
    document.querySelector("#playerBankingFxBrowserFixture").innerHTML = renderBankingPage(data);
  });

  await expect(fixture.locator('[data-player-banking-fx-state="error"]')).toBeVisible();
  await expect(fixture.getByText("FX service unavailable")).toBeVisible();
  await expect(fixture.getByText("POSTED LEDGER ACTIVITY", { exact: true })).toBeVisible();
  await expect(fixture.getByText("Contract reward · Market Analysis")).toBeVisible();
});
