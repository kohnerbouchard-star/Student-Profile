import { expect, test } from "@playwright/test";

async function mountTransfers(page, missingLocalKind = "") {
  await page.route("**/banking-transfer-fixture", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><body><main id="transfer-fixture"></main></body></html>',
  }));
  await page.goto("/banking-transfer-fixture#banking");
  await page.evaluate(async (missingKind) => {
    const { createPlayerTerminal } = await import("/src/app.js");
    const { buildPlayerTerminalConfig } = await import("/src/config/player-terminal.config.js");
    const { resolvePlayerBackendRequest } = await import("/src/api/backend-routes.js");
    const { mergeTerminalRead } = await import("/src/api/read-model.js");
    const { previewData } = await import("/src/data/preview-data.js");
    const models = structuredClone(previewData);
    models.session.currencyCode = "NRC";
    const currentBalances = [
      { accountKey: "bac_11111111111111111111111111111111", accountKind: "checking", currencyCode: "ECO", postedAmount: 0, heldAmount: 0, availableAmount: 0 },
      { accountKey: "bac_22222222222222222222222222222222", accountKind: "checking", currencyCode: "NRC", postedAmount: 15.34, heldAmount: 3, availableAmount: 12.34 },
      { accountKey: "bac_33333333333333333333333333333333", accountKind: "savings", currencyCode: "ECO", postedAmount: 999, heldAmount: 0, availableAmount: 999 },
      { accountKey: "bac_44444444444444444444444444444444", accountKind: "savings", currencyCode: "NRC", postedAmount: 9.50, heldAmount: 2, availableAmount: 7.50 },
    ].filter((balance) => balance.currencyCode !== "NRC" || (missingKind !== "both" && balance.accountKind !== missingKind));
    Object.assign(models, mergeTerminalRead(models, "banking", { currentBalances, ledgerEntries: [] }));
    models.banking.transferLimit = 500;
    const writes = [];
    const config = buildPlayerTerminalConfig({
      usePreviewData: false, authenticated: true, csrfToken: "B".repeat(43), gameSessionId: "transfer-fixture",
      capabilities: { routes: { banking: true }, actions: { bankTransfer: true, savingsTransfer: true } },
      apiCall: async (context) => {
        if (["bankTransfer", "savingsTransfer"].includes(context.endpointKey)) {
          // The production adapter copies the transport idempotency key into its body.
          const request = resolvePlayerBackendRequest({ ...context,
            payload: { ...context.payload, idempotencyKey: context.idempotencyKey },
            params: {}, session: { playerSessionToken: "fixture" },
          });
          writes.push({ endpointKey: context.endpointKey, ...request });
          return { ok: true, result: { status: "posted", amount: request.payload.amount }, refreshRequired: true };
        }
        return structuredClone(models[context.endpointKey]);
      },
    });
    const terminal = createPlayerTerminal({ mount: document.querySelector("#transfer-fixture"), config });
    globalThis.transferFixture = { terminal, writes };
  }, missingLocalKind);
  await expect(page.locator('[data-page="banking"]')).toBeVisible();
  await page.locator('[data-player-form="bank-transfer"]').locator("..").evaluate((details) => { details.open = true; });
}

test("savings withdrawal validates the local available balance after holds", async ({ page }) => {
  const form = page.locator('[data-player-form="savings-transfer"]');
  await form.locator('[name="fromAccount"]').selectOption("savings");
  await form.locator('[name="toAccount"]').selectOption("checking");
  const amount = form.locator('[name="amount"]');
  await amount.fill("7.51");
  await form.locator('button[type="submit"]').click();
  expect(await amount.evaluate((input) => input.checkValidity())).toBe(false);
  expect(await page.evaluate(() => transferFixture.writes)).toEqual([]);
  await amount.fill("7.50");
  await form.locator('button[type="submit"]').click();
  await expect.poll(() => page.evaluate(() => transferFixture.writes.length)).toBe(1);
  const payload = await page.evaluate(() => transferFixture.writes[0].payload);
  expect(payload).toMatchObject({ amount: 7.50, fromAccount: "savings", toAccount: "checking" });
  expect(payload).not.toHaveProperty("currencyCode");
});

for (const missingKind of ["checking", "savings", "both"]) {
  test(`missing local ${missingKind} never enables transfers from foreign balances`, async ({ page }) => {
    await page.evaluate(() => transferFixture.terminal.destroy());
    await mountTransfers(page, missingKind);
    await expect(page.locator('[data-player-banking-balance="checking:ECO"]')).toBeVisible();
    await expect(page.locator('[data-player-banking-balance="savings:ECO"]')).toBeVisible();
    await expect(page.locator('[data-player-form="savings-transfer"] button[type="submit"]')).toBeDisabled();
    const peerSubmit = page.locator('[data-player-form="bank-transfer"] button[type="submit"]');
    if (missingKind === "savings") await expect(peerSubmit).toBeEnabled();
    else await expect(peerSubmit).toBeDisabled();
    expect(await page.evaluate(() => transferFixture.writes)).toEqual([]);
  });
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
