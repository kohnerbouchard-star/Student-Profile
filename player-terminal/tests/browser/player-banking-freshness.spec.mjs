import { expect, test } from "@playwright/test";

const exactQuote = { quote: {
  quoteKey: "fxq_11111111111111111111111111111111", product: "instant",
  sourceAccountKey: "bac_11111111111111111111111111111111", targetAccountKey: "bac_22222222222222222222222222222222",
  sourceCurrencyCode: "ECO", targetCurrencyCode: "ELD", sourceMinorUnit: 2, targetMinorUnit: 2,
  sourceAmountMode: "source_debit", sourceAmount: "100", referenceRate: "1.5", customerRate: "1.49", spreadRate: "0.005",
  feeAmount: "2.00", targetAmount: "149.00", fixingKey: "fxf_11111111111111111111111111111111", policyVersion: "fx-policy-v1",
  expiresAt: "2099-08-26T08:02:00.000Z", settlesAt: "2099-08-26T08:01:01.000Z", requiresFx: true,
} };

async function fixture(page) {
  await page.route("**/banking-freshness-fixture", (route) => route.fulfill({
    contentType: "text/html",
    body: '<!doctype html><html><body><div id="banking-fixture"></div></body></html>',
  }));
  await page.goto("/banking-freshness-fixture#banking");
  await page.evaluate(async () => {
    const { createPlayerTerminal } = await import("/src/app.js");
    const { buildPlayerTerminalConfig } = await import("/src/config/player-terminal.config.js");
    const { installBankingReadFlow } = await import("/src/features/banking/banking-read-flow.js");
    const { installFormDraftPreserver } = await import("/src/forms/form-draft-preserver.js");
    const { previewData } = await import("/src/data/preview-data.js");
    const models = structuredClone(previewData), holds = new Map(), calls = [], invalid = [];
    models.banking.pagination = { cursor: null, nextCursor: "offset_2", hasMore: true, limit: 2 };
    models.banking.transactions = models.banking.transactions.slice(0, 2);
    models.banking.transactions[0].description = "initial Banking activity";
    const config = buildPlayerTerminalConfig({
      usePreviewData: false, authenticated: true, csrfToken: "B".repeat(43), gameSessionId: "browser-fixture",
      capabilities: { routes: { banking: true, news: true }, actions: { bankingFxQuote: true, bankingFxInstant: true, bankingFxStandard: true, bankingFxCancel: true } },
      onSessionInvalid: (detail) => invalid.push(detail),
      apiCall: async (context) => {
        calls.push({ endpointKey: context.endpointKey, payload: context.payload, idempotencyKey: context.idempotencyKey });
        const hold = holds.get(context.endpointKey);
        if (hold) { holds.delete(context.endpointKey); hold.started = true; return hold.promise; }
        return structuredClone(models[context.endpointKey]);
      },
    });
    const mount = document.querySelector("#banking-fixture");
    const drafts = installFormDraftPreserver(mount);
    const terminal = createPlayerTerminal({ mount, config });
    const flow = installBankingReadFlow({ mount, terminal, config });
    globalThis.bankingFixture = { models, calls, invalid, config, terminal, flow, drafts,
      hold(key) {
        let resolve, reject;
        const hold = { promise: new Promise((yes, no) => { resolve = yes; reject = no; }) };
        hold.resolve = resolve; hold.reject = reject; holds.set(key, hold); this.pending = hold;
      },
    };
  });
  await expect(page.locator('[data-page="banking"]')).toBeVisible();
  await expect(page.locator("[data-player-banking-load-more]")).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.bankingErrors = errors;
  await fixture(page);
});

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    bankingFixture.flow.destroy(); bankingFixture.drafts.destroy(); bankingFixture.terminal.destroy();
  });
  expect(page.bankingErrors).toEqual([]);
});

async function waitStarted(page) {
  await expect.poll(() => page.evaluate(() => Boolean(bankingFixture.pending?.started))).toBe(true);
}

async function release(page, value, failure = false) {
  await page.evaluate(async ({ value, failure }) => {
    bankingFixture.pending[failure ? "reject" : "resolve"](value);
    await new Promise(requestAnimationFrame);
  }, { value, failure });
}

test("a held page cannot overwrite a newer refresh in the real terminal store and DOM", async ({ page }) => {
  const old = await page.evaluate(() => {
    bankingFixture.hold("banking"); return structuredClone(bankingFixture.models.banking);
  });
  await page.locator("[data-player-banking-load-more]").click(); await waitStarted(page);
  await page.evaluate(async () => {
    bankingFixture.models.banking.checking.balance = 98765;
    bankingFixture.models.banking.transactions[0].description = "new authoritative Banking activity";
    await bankingFixture.terminal.refreshResources(["banking"]);
  });
  await release(page, old);
  await expect(page.getByText("new authoritative Banking activity", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => bankingFixture.terminal.getState().data.banking.checking.balance)).toBe(98765);
  await expect(page.locator("[data-player-banking-page-error]")).toBeHidden();
});

test("pagination deduplicates through subscribers, preserves a draft and restores keyboard focus", async ({ page }) => {
  const next = await page.evaluate(() => {
    bankingFixture.hold("banking");
    bankingFixture.before = bankingFixture.terminal.getState();
    const next = structuredClone(bankingFixture.models.banking);
    next.transactions = [next.transactions[1], { ...next.transactions[0], id: "next-row", description: "next page activity" }];
    next.pagination.nextCursor = "offset_3";
    return next;
  });
  await page.locator("#player-banking-fx-amount").fill("123.45");
  await page.locator("[data-player-banking-load-more]").focus();
  await page.keyboard.press("Enter"); await waitStarted(page); await release(page, next);
  await expect(page.getByText("next page activity", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => ({
    ids: bankingFixture.terminal.getState().data.banking.transactions.map(({ id }) => id),
    priorCount: bankingFixture.before.data.banking.transactions.length,
    immutable: bankingFixture.before !== bankingFixture.terminal.getState(),
  }))).toEqual({ ids: ["txn-1", "txn-2", "next-row"], priorCount: 2, immutable: true });
  await expect(page.locator("#player-banking-fx-amount")).toHaveValue("123.45");
  await expect(page.locator("[data-player-banking-load-more]")).toBeFocused();
});

test("leaving and returning retires a held page and its obsolete session error", async ({ page }) => {
  await page.evaluate(() => bankingFixture.hold("banking"));
  await page.locator("[data-player-banking-load-more]").click(); await waitStarted(page);
  await page.evaluate(() => bankingFixture.terminal.navigate("news"));
  await expect.poll(() => page.evaluate(() => bankingFixture.terminal.getState().route)).toBe("news");
  await page.evaluate(() => bankingFixture.terminal.navigate("banking"));
  await expect(page.locator('[data-page="banking"]')).toBeVisible();
  await release(page, { status: 401, code: "SESSION_INVALID" }, true);
  expect(await page.evaluate(() => ({ status: bankingFixture.terminal.getState().status, invalid: bankingFixture.invalid }))).toEqual({ status: "ready", invalid: [] });
  await expect(page.locator("[data-player-banking-page-error]")).toBeHidden();
  await expect(page.locator("[data-player-banking-load-more]")).toBeEnabled();
});

test("changing FX intent rejects an obsolete quote without a toast or focus theft", async ({ page }) => {
  await page.locator("#player-banking-fx-amount").fill("100");
  await page.evaluate(() => bankingFixture.hold("bankingFxQuote"));
  await page.locator('[data-player-banking-fx-form="quote"] button[type="submit"]').click(); await waitStarted(page);
  await page.locator("#player-banking-fx-amount").fill("200");
  await release(page, exactQuote);
  expect(await page.evaluate(() => bankingFixture.terminal.getState().data.bankingFx.currentQuote)).toBeNull();
  await expect(page.locator(".player-terminal-toast")).toHaveCount(0);
  await expect(page.locator("[data-player-banking-fx-error]")).toBeHidden();
  await expect(page.locator("#player-banking-fx-amount")).toHaveValue("200");
  await expect(page.locator("#player-banking-fx-amount")).toBeFocused();
});

test("an accepted quote publishes through the terminal and input invalidation preserves the draft", async ({ page }) => {
  await page.locator('[name="product"]').selectOption("instant");
  await page.locator("#player-banking-fx-amount").fill("100");
  await page.evaluate(() => bankingFixture.hold("bankingFxQuote"));
  await page.locator('[data-player-banking-fx-form="quote"] button[type="submit"]').click(); await waitStarted(page);
  await release(page, exactQuote);
  await expect(page.locator('[data-player-banking-fx-form="order"] button[type="submit"]')).toBeFocused();
  expect(await page.evaluate(() => bankingFixture.terminal.getState().data.bankingFx.currentQuote.quoteKey)).toBe(exactQuote.quote.quoteKey);
  await expect(page.locator("#player-banking-fx-amount")).toHaveValue("100");
  await page.locator("#player-banking-fx-amount").fill("275.25");
  expect(await page.evaluate(() => bankingFixture.terminal.getState().data.bankingFx.currentQuote)).toBeNull();
  await expect(page.locator("#player-banking-fx-amount")).toHaveValue("275.25");
  await expect(page.locator("#player-banking-fx-amount")).toBeFocused();
  await expect(page.getByText("Selections changed", { exact: true })).toBeVisible();
  await expect(page.locator('[data-player-banking-fx-form="order"]')).toHaveCount(0);
});
