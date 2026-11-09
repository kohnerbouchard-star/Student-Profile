import { expect, test } from "@playwright/test";

async function mountTransfers(page) {
  await page.route("**/banking-transfer-fixture", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><body><main id="transfer-fixture"></main></body></html>',
  }));
  await page.goto("/banking-transfer-fixture#banking");
  await page.evaluate(async () => {
    const { createPlayerTerminal } = await import("/src/app.js");
    const { buildPlayerTerminalConfig } = await import("/src/config/player-terminal.config.js");
    const { resolvePlayerBackendRequest } = await import("/src/api/backend-routes.js");
    const { previewData } = await import("/src/data/preview-data.js");
    const models = structuredClone(previewData);
    models.session.currencyCode = "ECO";
    models.banking.checking.available = 12.34;
    models.banking.checking.balance = 12.34;
    models.banking.savings = { ...models.banking.savings, configured: true, available: 12.34, balance: 12.34 };
    models.banking.transferLimit = 500;
    const writes = [];
    const config = buildPlayerTerminalConfig({
      usePreviewData: false, authenticated: true, csrfToken: "B".repeat(43), gameSessionId: "transfer-fixture",
      capabilities: { routes: { banking: true }, actions: { bankTransfer: true, savingsTransfer: true } },
      apiCall: async (context) => {
        if (["bankTransfer", "savingsTransfer"].includes(context.endpointKey)) {
          const request = resolvePlayerBackendRequest({ ...context, params: {}, session: { playerSessionToken: "fixture" } });
          writes.push({ endpointKey: context.endpointKey, ...request });
          return { ok: true, result: { status: "posted", amount: request.payload.amount }, refreshRequired: true };
        }
        return structuredClone(models[context.endpointKey]);
      },
    });
    const terminal = createPlayerTerminal({ mount: document.querySelector("#transfer-fixture"), config });
    globalThis.transferFixture = { terminal, writes };
  });
  await expect(page.locator('[data-page="banking"]')).toBeVisible();
  await page.locator('[data-player-form="bank-transfer"]').locator("..").evaluate((details) => { details.open = true; });
}

test.beforeEach(async ({ page }) => mountTransfers(page));
test.afterEach(async ({ page }) => {
  await page.evaluate(() => transferFixture.terminal.destroy());
});

for (const [endpoint, formName] of [["bankTransfer", "bank-transfer"], ["savingsTransfer", "savings-transfer"]]) {
  for (const amount of ["0.01", "0.50", "12.34"]) {
    test(`${endpoint} submits ${amount} unchanged through the real form and adapter`, async ({ page }) => {
      const form = page.locator(`[data-player-form="${formName}"]`);
      if (endpoint === "bankTransfer") await form.locator('[name="recipientPlayerIdentifier"]').fill("PLAYER-002");
      await form.locator('[name="amount"]').fill(amount);
      await form.getByRole("button", { name: endpoint === "bankTransfer" ? "Send transfer" : "Transfer funds", exact: true }).click();
      await expect.poll(() => page.evaluate(() => transferFixture.writes.length)).toBe(1);
      const write = await page.evaluate(() => transferFixture.writes[0]);
      expect(write.endpointKey).toBe(endpoint);
      expect(write.payload.amount).toBe(Number(amount));
      expect(write.path).toBe(endpoint === "bankTransfer" ? "/players/me/banking/transfers" : "/players/me/banking/savings/transfers");
      expect(write.payload.idempotencyKey).toBeTruthy();
      expect(write.payload).not.toHaveProperty("gameSessionId");
      expect(write.payload).not.toHaveProperty("playerId");
      expect(write.payload).not.toHaveProperty("currencyCode");
    });
  }
  test(`${endpoint} keeps invalid precision, bounds and available-balance validation`, async ({ page }) => {
    const form = page.locator(`[data-player-form="${formName}"]`);
    if (endpoint === "bankTransfer") await form.locator('[name="recipientPlayerIdentifier"]').fill("PLAYER-002");
    const amount = form.locator('[name="amount"]');
    for (const value of ["", "0", "-0.01", "0.001", "12.35", "500.01"]) {
      await amount.fill(value);
      await form.locator('button[type="submit"]').click();
      expect(await amount.evaluate((input) => input.checkValidity())).toBe(false);
      expect(await page.evaluate(() => transferFixture.writes)).toEqual([]);
    }
    await amount.fill("0.50");
    await form.locator('button[type="submit"]').click();
    await expect.poll(() => page.evaluate(() => transferFixture.writes.length)).toBe(1);
  });
}
