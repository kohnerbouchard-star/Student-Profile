import { expect, test } from "@playwright/test";

// Synthetic transport only: real terminal, store, coordinator, API, modal and
// validators. Holds allow a response to arrive after its original owner leaves.
async function fixture(page, mode = "business_offer") {
  await page.route("**/store-ownership-fixture", (route) => route.fulfill({
    contentType: "text/html", body: '<!doctype html><html><body><div id="fixture"></div></body></html>',
  }));
  await page.goto("/store-ownership-fixture#store");
  await page.evaluate(async (mode) => {
    const { createPlayerTerminal } = await import("/src/app.js");
    const { buildPlayerTerminalConfig } = await import("/src/config/player-terminal.config.js");
    const { installStorePurchaseFlow } = await import("/src/features/store/store-purchase-flow.js");
    const { PreviewTransport } = await import("/src/api/preview-transport.js");
    const { PlayerApi } = await import("/src/api/player-api.js");
    const { previewData } = await import("/src/data/preview-data.js");
    const models = structuredClone(previewData), transport = new PreviewTransport({ simulateWrites: true });
    const calls = [], invalid = [], holds = new Map();
    const config = buildPlayerTerminalConfig({
      usePreviewData: false, authenticated: true, csrfToken: "S".repeat(43), gameSessionId: "store-fixture", writeCooldownMs: 0,
      capabilities: { routes: { store: true, news: true }, actions: { storePurchase: true } },
      onSessionInvalid: (detail) => invalid.push(detail),
      apiCall: async (context) => {
        const call = { key: context.endpointKey, payload: context.payload, idempotencyKey: context.idempotencyKey, aborted: context.signal?.aborted || false };
        calls.push(call);
        context.signal?.addEventListener("abort", () => { call.aborted = true; }, { once: true });
        const next = () => context.endpointKey.startsWith("store")
          ? transport.request(context) : structuredClone(models[context.endpointKey]);
        const hold = holds.get(context.endpointKey);
        if (hold) {
          holds.delete(context.endpointKey); hold.started = true;
          await hold.promise;
          if (hold.error) throw hold.error;
        }
        if (globalThis.storeFixture?.failRefresh && ["store", "inventory", "banking", "bankingFx", "dashboard"].includes(context.endpointKey)) {
          throw { status: 400, code: "FIXTURE_REFRESH_FAILURE" };
        }
        if (globalThis.storeFixture?.losePurchaseResponse && ["storePurchase", "storeOfferPurchase"].includes(context.endpointKey)) {
          globalThis.storeFixture.losePurchaseResponse = false;
          await next(); // The synthetic server commits before the response is lost.
          throw { code: "REQUEST_TIMEOUT", status: 0 };
        }
        return next();
      },
    });
    const mount = document.querySelector("#fixture"), terminal = createPlayerTerminal({ mount, config });
    const flow = installStorePurchaseFlow({ mount, terminal, config });
    const sibling = new PlayerApi(config, { freshness: terminal.freshness });
    globalThis.storeFixture = { mode, models, calls, invalid, config, terminal, flow, sibling, holds,
      hold(key) {
        let resolve;
        const hold = { promise: new Promise((yes) => { resolve = yes; }) };
        hold.release = (error) => { hold.error = error; resolve(); };
        holds.set(key, hold); this.pending = hold;
      },
    };
  }, mode);
  await expect(page.locator('[data-page="store"]')).toBeVisible();
  await page.locator(`[data-player-store-purchase-mode="${mode}"]`).first().click();
  await expect(page.locator("[data-player-store-review]")).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  page.storeErrors = [];
  page.on("pageerror", (error) => page.storeErrors.push(error.message));
});
test.afterEach(async ({ page }) => {
  await page.evaluate(() => { storeFixture.flow.destroy(); storeFixture.terminal.destroy(); });
  expect(page.storeErrors).toEqual([]);
});

const quoteKey = (mode) => mode === "business_offer" ? "storeOfferQuote" : "storeQuote";
const purchaseKey = (mode) => mode === "business_offer" ? "storeOfferPurchase" : "storePurchase";
async function hold(page, key) { await page.evaluate((key) => storeFixture.hold(key), key); }
async function started(page) { await expect.poll(() => page.evaluate(() => Boolean(storeFixture.pending.started))).toBe(true); }
async function release(page, error) {
  await page.evaluate((error) => storeFixture.pending.release(error), error);
  // Preview writes are deliberately delayed 180ms; wait for them to reach the
  // real API boundary, then two frames for render/focus effects.
  await page.waitForTimeout(250);
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
async function review(page) {
  await page.locator("[data-player-store-review]").click();
  await expect(page.locator("[data-player-store-confirm]")).toBeEnabled();
}
async function purchase(page) {
  await review(page);
  await page.locator("[data-player-store-confirm]").click();
  await expect(page.getByText("PURCHASE RECEIPT", { exact: true })).toBeVisible();
}

for (const mode of ["business_offer", "system_offer"]) {
  for (const edit of ["quantity", "account", "amount"]) test(`${mode}: held quote retires after ${edit} edit and change back`, async ({ page }) => {
    await fixture(page, mode);
    if (edit === "amount") {
      const account = page.locator("[data-player-store-funding-account]").nth(1);
      const value = await account.locator("option").evaluateAll((options) => options.find((option) => option.value && !option.disabled).value);
      await account.selectOption(value);
      await page.locator("[data-player-store-funding-amount]").first().fill("1");
    }
    await hold(page, quoteKey(mode));
    await page.locator("[data-player-store-review]").click(); await started(page);
    const field = page.locator(edit === "quantity" ? "[data-player-store-quantity]" : edit === "account" ? "[data-player-store-funding-account]" : "[data-player-store-funding-amount]").first();
    const previous = await field.inputValue();
    if (edit === "account") {
      const other = await field.locator("option").evaluateAll((options) => options.find((option) => option.value && !option.disabled && !option.selected).value);
      await field.selectOption(other); await field.selectOption(previous);
    } else { await field.fill("2"); await field.fill(previous); }
    await release(page);
    await expect(page.locator("[data-player-store-confirm]")).toHaveCount(0);
    await expect(field).toHaveValue(previous);
    await expect(page.locator("[data-player-store-review]")).toBeEnabled();
    expect(await page.evaluate(() => storeFixture.invalid)).toEqual([]);
    // An edit must also release the pending button so a new quote is possible.
    await review(page);
  });
}

for (const retirement of ["game", "csrf", "route-return", "destroy", "close-reopen"]) {
  for (const failure of [false, true]) test(`${retirement}: obsolete quote ${failure ? "401" : "success"} has no modal/session/focus effects`, async ({ page }) => {
    await fixture(page); await hold(page, "storeOfferQuote");
    await page.locator("[data-player-store-review]").click(); await started(page);
    await page.evaluate(async (retirement) => {
      if (retirement === "game") storeFixture.sibling.setSession({ gameSessionId: "next-game" });
      if (retirement === "csrf") storeFixture.config.csrfToken = "N".repeat(43);
      if (retirement === "destroy") storeFixture.flow.destroy();
      if (retirement === "route-return") {
        await storeFixture.terminal.navigate("news"); await storeFixture.terminal.navigate("store");
      }
    }, retirement);
    if (retirement === "close-reopen") {
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.locator('[data-player-store-purchase-mode="business_offer"]').first().click();
    }
    const before = await page.evaluate(() => document.querySelector(".player-terminal-transaction-overlay-host")?.innerHTML || "");
    await release(page, failure ? { status: 401, code: "SESSION_INVALID" } : undefined);
    expect(await page.evaluate(() => storeFixture.invalid)).toEqual([]);
    await expect(page.locator("[data-player-store-confirm]")).toHaveCount(0);
    if (["route-return", "destroy"].includes(retirement)) await expect(page.locator('[aria-labelledby="storePurchaseModalTitle"]')).toHaveCount(0);
    if (retirement === "close-reopen") expect(await page.locator(".player-terminal-transaction-overlay-host").innerHTML()).toBe(before);
  });
}

test("a held quote honors aggregate invalidation without settling it", async ({ page }) => {
  await fixture(page); await hold(page, "storeOfferQuote");
  await page.locator("[data-player-store-review]").click(); await started(page);
  await page.evaluate(() => storeFixture.sibling.invalidateResources(["bankingFx", "store"]));
  await release(page);
  await expect(page.locator("[data-player-store-confirm]")).toHaveCount(0);
  expect(await page.evaluate(() => storeFixture.terminal.freshness.isPending("bankingFx"))).toBe(true);
});

test("repeated quote and confirmation actions send one command each and keep receipt immutable", async ({ page }) => {
  await fixture(page); await hold(page, "storeOfferQuote");
  await page.locator("[data-player-store-review]").evaluate((button) => { button.click(); button.click(); });
  await started(page); await release(page);
  await expect(page.locator("[data-player-store-confirm]")).toBeEnabled();
  await hold(page, "storeOfferPurchase");
  await page.locator("[data-player-store-confirm]").evaluate((button) => { button.click(); button.click(); });
  await started(page);
  await page.keyboard.press("Escape");
  await expect(page.locator('[aria-labelledby="storePurchaseModalTitle"]')).toBeVisible();
  await release(page);
  await expect(page.getByText("PURCHASE RECEIPT", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => ["storeOfferQuote", "storeOfferPurchase"].map((key) => storeFixture.calls.filter((call) => call.key === key).length))).toEqual([1, 1]);
  const receipt = await page.locator('[aria-labelledby="storePurchaseModalTitle"] .player-terminal-connector-meta').first().textContent();
  await expect(page.locator("[data-player-store-refresh-retry]")).toHaveCount(0);
  expect(await page.locator('[aria-labelledby="storePurchaseModalTitle"] .player-terminal-connector-meta').first().textContent()).toBe(receipt);
});

for (const retirement of ["game", "close-reopen", "route-return"]) test(`${retirement}: obsolete immutable-receipt 401 does not invalidate the current session`, async ({ page }) => {
  await fixture(page); await hold(page, "storeOfferReceipt"); await purchase(page); await started(page);
  await page.evaluate(async (retirement) => {
    if (retirement === "game") storeFixture.sibling.setSession({ gameSessionId: "next-game" });
    if (retirement === "route-return") { await storeFixture.terminal.navigate("news"); await storeFixture.terminal.navigate("store"); }
  }, retirement);
  if (retirement === "close-reopen") {
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.locator('[data-player-store-purchase-mode="business_offer"]').first().click();
  }
  const calls = await page.evaluate(() => storeFixture.calls.length);
  await release(page, { status: 401, code: "SESSION_INVALID" });
  expect(await page.evaluate(() => storeFixture.invalid)).toEqual([]);
  if (retirement === "game") expect(await page.evaluate(() => storeFixture.calls.length)).toBe(calls);
  if (retirement === "close-reopen") await expect(page.locator("[data-player-store-review]")).toBeEnabled();
});

for (const mode of ["business_offer", "system_offer"]) test(`${mode}: committed purchase remains success when refresh fails; retry sends reads only`, async ({ page }) => {
  await fixture(page, mode); await review(page);
  await page.evaluate(() => { storeFixture.failRefresh = true; });
  await page.locator("[data-player-store-confirm]").click();
  await expect(page.getByText("PURCHASE RECEIPT", { exact: true })).toBeVisible();
  await expect(page.locator("[data-player-store-refresh-retry]")).toBeEnabled();
  const receipt = await page.locator('[aria-labelledby="storePurchaseModalTitle"] .player-terminal-connector-meta').first().textContent();
  await page.evaluate(() => { storeFixture.failRefresh = false; });
  await page.locator("[data-player-store-refresh-retry]").click();
  await expect(page.locator("[data-player-store-refresh-retry]")).toHaveCount(0);
  expect(await page.locator('[aria-labelledby="storePurchaseModalTitle"] .player-terminal-connector-meta').first().textContent()).toBe(receipt);
  expect(await page.evaluate((key) => storeFixture.calls.filter((call) => call.key === key).length, purchaseKey(mode))).toBe(1);
});

for (const retirement of ["game", "route-return"]) test(`${retirement}: pending settlement cannot publish into a replacement owner`, async ({ page }) => {
  await fixture(page); await review(page); await hold(page, "storeOfferPurchase");
  await page.locator("[data-player-store-confirm]").click(); await started(page);
  await page.evaluate(async (retirement) => {
    if (retirement === "game") storeFixture.sibling.setSession({ gameSessionId: "next-game" });
    else { await storeFixture.terminal.navigate("news"); await storeFixture.terminal.navigate("store"); }
  }, retirement);
  const storeReads = await page.evaluate(() => storeFixture.calls.filter((call) => call.key === "store").length);
  await release(page);
  await expect(page.getByText("PURCHASE RECEIPT", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => storeFixture.invalid)).toEqual([]);
  expect(await page.evaluate(() => storeFixture.calls.filter((call) => call.key === "storeOfferPurchase").length)).toBe(1);
  if (retirement === "route-return") {
    expect(await page.evaluate(() => storeFixture.calls.find((call) => call.key === "storeOfferPurchase").aborted)).toBe(false);
    await expect.poll(() => page.evaluate(() => storeFixture.calls.filter((call) => call.key === "store").length)).toBeGreaterThan(storeReads);
    await expect.poll(() => page.evaluate(() => storeFixture.terminal.getState().data.store.items[0].offers.find((offer) => offer.purchasability === "business_offer").availableQuantity)).toBe(2);
  }
});

test("closing a committed receipt still permits same-session authoritative convergence", async ({ page }) => {
  await fixture(page); await hold(page, "storeOfferReceipt"); await purchase(page); await started(page);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => { storeFixture.readCount = storeFixture.calls.filter((call) => call.key === "store").length; });
  await release(page);
  await expect.poll(() => page.evaluate(() => storeFixture.calls.filter((call) => call.key === "store").length > storeFixture.readCount)).toBe(true);
  await expect(page.locator('[aria-labelledby="storePurchaseModalTitle"]')).toHaveCount(0);
  expect(await page.evaluate(() => storeFixture.invalid)).toEqual([]);
});

for (const endpoint of ["storeOfferQuote", "storeOfferReceipt"]) test(`a current ${endpoint} 401 retains session recovery`, async ({ page }) => {
  await fixture(page); await hold(page, endpoint);
  if (endpoint === "storeOfferQuote") await page.locator("[data-player-store-review]").click();
  else await purchase(page);
  await started(page); await release(page, { status: 401, code: "SESSION_INVALID" });
  expect(await page.evaluate(() => storeFixture.invalid.length)).toBe(1);
  await expect(page.locator('[aria-labelledby="storePurchaseModalTitle"]')).toHaveCount(0);
});

for (const stage of ["select", "review", "receipt"]) test(`session rotation retires an idle ${stage} action before it sends traffic`, async ({ page }) => {
  await fixture(page);
  if (stage !== "select") await review(page);
  if (stage === "receipt") {
    await page.evaluate(() => { storeFixture.failRefresh = true; });
    await page.locator("[data-player-store-confirm]").click();
    await expect(page.locator("[data-player-store-refresh-retry]")).toBeEnabled();
  }
  await page.evaluate(() => {
    storeFixture.sibling.setSession({ gameSessionId: "next-game" });
    storeFixture.callCount = storeFixture.calls.length;
  });
  await page.locator(stage === "select" ? "[data-player-store-review]" : stage === "review" ? "[data-player-store-confirm]" : "[data-player-store-refresh-retry]").click();
  await expect(page.locator('[aria-labelledby="storePurchaseModalTitle"]')).toHaveCount(0);
  expect(await page.evaluate(() => storeFixture.calls.length)).toBe(await page.evaluate(() => storeFixture.callCount));
  expect(await page.evaluate(() => storeFixture.invalid)).toEqual([]);
});

test("a quote made stale by newer funding evidence cannot be confirmed", async ({ page }) => {
  await fixture(page); await review(page);
  await page.evaluate(() => storeFixture.sibling.invalidateResources(["bankingFx"]));
  await page.locator("[data-player-store-confirm]").click();
  await expect(page.locator("[data-player-store-review]")).toBeEnabled();
  expect(await page.evaluate(() => storeFixture.calls.filter((call) => call.key === "storeOfferPurchase").length)).toBe(0);
});

for (const mode of ["business_offer", "system_offer"]) test(`${mode}: lost committed response retries the original command and idempotency key`, async ({ page }) => {
  await fixture(page, mode); await review(page);
  const before = await page.evaluate((mode) => {
    storeFixture.losePurchaseResponse = true;
    const offerKey = storeFixture.calls.find((call) => call.key === (mode === "business_offer" ? "storeOfferQuote" : "storeQuote")).payload.offerKey;
    storeFixture.selectedOffer = offerKey;
    return storeFixture.terminal.getState().data.store.items.flatMap((item) => item.offers).find((offer) => offer.offerKey === offerKey).availableQuantity;
  }, mode);
  await page.locator("[data-player-store-confirm]").click();
  await expect(page.locator("[data-player-store-confirm]")).toBeEnabled();
  // New aggregate evidence and local quote expiry must not turn an ambiguous
  // confirmed command into a different purchase. Its original replay key owns it.
  await page.evaluate(async () => {
    await storeFixture.terminal.refreshResources(["store", "bankingFx"]);
    const now = Date.now(); Date.now = () => now + 180_000;
  });
  await page.locator("[data-player-store-confirm]").click();
  await expect(page.getByText("PURCHASE RECEIPT", { exact: true })).toBeVisible();
  const calls = await page.evaluate((mode) => ({
    quotes: storeFixture.calls.filter((call) => call.key === (mode === "business_offer" ? "storeOfferQuote" : "storeQuote")),
    purchases: storeFixture.calls.filter((call) => call.key === (mode === "business_offer" ? "storeOfferPurchase" : "storePurchase")),
  }), mode);
  expect(calls.quotes).toHaveLength(1); expect(calls.purchases).toHaveLength(2);
  expect(calls.purchases[1].payload).toEqual(calls.purchases[0].payload);
  expect(calls.purchases[1].idempotencyKey).toBe(calls.purchases[0].idempotencyKey);
  expect(calls.purchases[0].idempotencyKey).toBeTruthy();
  await expect.poll(() => page.evaluate(() => storeFixture.terminal.getState().data.store.items.flatMap((item) => item.offers).find((offer) => offer.offerKey === storeFixture.selectedOffer).availableQuantity)).toBe(before - 1);
  await expect(page.locator("[data-player-store-review]")).toHaveCount(0);
});
