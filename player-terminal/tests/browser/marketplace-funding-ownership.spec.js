import { test, expect } from "@playwright/test";

async function install(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204 }));
  await page.goto("/tests/fixtures/");
  await page.setContent('<base href="/"><main id="marketplace"></main>');
  await page.evaluate(async () => {
    const { installMarketplaceFundingFlow } = await import("/src/features/marketplace/marketplace-funding-flow.js");
    const { renderMarketplacePage } = await import("/src/pages/marketplace-page.js");
    const fixtures = await import("/tests/fixtures/marketplace-funding.js");
    const { LISTING, ACCOUNT, quoteFixture, orderFixture } = fixtures;
    const mount = document.querySelector("main");
    const quote = structuredClone(quoteFixture);
    quote.reservation.expiresAt = quote.reservation.fundingQuote.expiresAt = new Date(Date.now() + 60000).toISOString();
    const state = { status: "ready", route: "marketplace", ui: { marketplaceListingId: LISTING }, data: {
      session: { gameSessionId: "game-a", currencyCode: "LUM" },
      capabilities: { routes: { marketplace: true }, actions: { marketplacePurchase: true } },
      marketplace: { listings: [{ id: LISTING, quantity: 4, unitPrice: 15, currencyCode: "LUM", version: 3,
        name: "Data Chip", description: "Fixture", condition: "New", category: "Equipment", country: "LUM", seller: "Seller", expiresAt: quote.reservation.expiresAt }], platformFeeRate: 2.5, taxRate: 1 },
      inventory: { items: [] }, bankingFx: { balances: [{ accountKey: ACCOUNT, accountKind: "checking", currencyCode: "LUM", availableAmount: 100 }] },
    } };
    const calls = [], toasts = [], subscribers = new Set();
    let resolveQuote, effects = 0, original = null;
    const config = { authenticated: true, gameSessionId: "game-a", csrfToken: "csrf-a", requestTimeoutMs: 10000, writeCooldownMs: 0,
      apiCall: async (context) => {
        calls.push({ endpoint: context.endpointKey, payload: structuredClone(context.payload), key: context.idempotencyKey });
        if (context.endpointKey === "marketplacePurchase") return new Promise((resolve) => { resolveQuote = resolve; });
        if (!original) {
          original = calls.at(-1); effects++;
          throw { code: "REQUEST_TIMEOUT", message: "Committed response lost" };
        }
        const retry = calls.at(-1);
        if (JSON.stringify(retry.payload) !== JSON.stringify(original.payload) || retry.key !== original.key) {
          throw { status: 409, code: "MARKETPLACE_FUNDED_SETTLEMENT_CONFLICT" };
        }
        return { ...orderFixture, order: { ...orderFixture.order, replayed: true } };
      } };
    function render() { mount.innerHTML = renderMarketplacePage(state.data, state.ui); }
    const terminal = { getState: () => state, requestRender: render, showToast: (...args) => toasts.push(args), refreshResources: async () => {},
      subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); } };
    render();
    const flow = installMarketplaceFundingFlow({ mount, terminal, config });
    window.marketplaceHarness = { state, calls, toasts, flow, quote, render,
      resolveQuote() { resolveQuote(quote); },
      effects: () => effects,
      notify() { render(); for (const fn of subscribers) fn(state); },
    };
  });
  return errors;
}

test("an edited quote cannot publish or focus settlement", async ({ page }) => {
  const errors = await install(page);
  await page.getByRole("button", { name: "Review exact funding quote" }).click();
  await expect.poll(() => page.evaluate(() => window.marketplaceHarness.calls.length)).toBe(1);
  await page.locator('[name="quantity"]').first().fill("2");
  await page.evaluate(() => window.marketplaceHarness.resolveQuote());
  await expect(page.locator('[data-player-marketplace-funding-form="settlement"]')).toHaveCount(0);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => window.marketplaceHarness.toasts)).toEqual([]);
  expect(errors).toEqual([]);
});

test("lost committed response remains explicitly retryable after expiry and fresh empty reads", async ({ page }) => {
  const errors = await install(page);
  await page.getByRole("button", { name: "Review exact funding quote" }).click();
  await expect.poll(() => page.evaluate(() => window.marketplaceHarness.calls.length)).toBe(1);
  await page.evaluate(() => window.marketplaceHarness.resolveQuote());
  const confirm = page.getByRole("button", { name: "Confirm quoted purchase" });
  await expect(confirm).toBeFocused();
  await confirm.click();
  const retry = page.getByRole("button", { name: "Retry confirmed purchase" });
  await expect(retry).toBeEnabled();
  await page.evaluate(() => {
    const h = window.marketplaceHarness;
    // Fresh reads replace the UI resource after the reservation expires.
    h.state.data.marketplace = { ...h.state.data.marketplace, listings: [], currentFundingQuote: null };
    h.state.data.bankingFx = { balances: [] };
    h.notify();
    h.state.data.marketplace.currentFundingQuote = { ...h.state.data.marketplace.currentFundingQuote, expiresAt: "2000-01-01T00:00:00Z" };
    h.render();
  });
  await expect(retry).toBeEnabled();
  expect(await page.evaluate(() => window.marketplaceHarness.calls.length)).toBe(2);
  await retry.click();
  await expect.poll(() => page.evaluate(() => window.marketplaceHarness.state.data.marketplace.lastFundingOrder?.replayed)).toBe(true);
  expect(await page.evaluate(() => window.marketplaceHarness.effects())).toBe(1);
  expect(await page.evaluate(() => window.marketplaceHarness.calls.length)).toBe(3);
  expect(errors).toEqual([]);
});
