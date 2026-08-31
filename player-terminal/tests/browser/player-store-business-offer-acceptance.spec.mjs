import { expect, test } from "@playwright/test";

const BUSINESS_OFFER_KEY = "sof_22222222222222222222222222222222";
const BUSINESS_QUOTE_KEY = "quote_22222222222222222222222222222222";
const BUSINESS_RECEIPT_KEY = "spr_22222222222222222222222222222222";
const BUSINESS_NAME = "Crescent Dynamics";
const NPC_OFFER_KEY = "sof_33333333333333333333333333333333";

async function configureWritablePreview(page) {
  await page.addInitScript(() => {
    const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
    globalThis.setTimeout = (callback, delay, ...args) => nativeSetTimeout(
      callback,
      Number(delay) === 180 ? 600 : Number(delay) === 80 ? 450 : delay,
      ...args,
    );
    globalThis.ECONOVARIA_PLAYER_TERMINAL_CONFIG = {
      usePreviewData: true,
      simulatePreviewWrites: true,
      preserveProductSurface: true,
    };
  });
}

async function openStore(page) {
  await page.goto("/?preview=1#store");
  await page.waitForFunction(() => {
    const terminal = globalThis.Econovaria?.playerTerminal;
    const state = terminal?.getState?.();
    return Boolean(
      state?.status === "ready" &&
      state?.route === "store" &&
      document.querySelector(
        '.player-terminal-store-page:not(.player-terminal-route-skeleton):not(.player-terminal-route-error)',
      ),
    );
  });
  await expect(page.getByRole("heading", { name: "Store", exact: true })).toBeVisible();
  await expect(page.locator(".player-terminal-route-skeleton")).toHaveCount(0);
  await expect(page.locator(".player-terminal-route-error")).toHaveCount(0);
}

async function tabTo(page, locator, maximumTabs = 120) {
  for (let index = 0; index < maximumTabs; index += 1) {
    if (await locator.evaluate((element) => document.activeElement === element)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Keyboard focus did not reach ${await locator.getAttribute("aria-label") || "the requested control"}.`);
}

async function expectFocused(locator) {
  await expect.poll(() => locator.evaluate((element) => document.activeElement === element)).toBe(true);
}

async function expectVisibleKeyboardFocus(locator) {
  const indicator = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow,
    };
  });
  expect(indicator.outlineStyle).not.toBe("none");
  expect(indicator.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(indicator.boxShadow).not.toBe("none");
}

async function expectContained(page, selector, { vertical = false } = {}) {
  const geometry = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
    };
  });

  expect(geometry.width).toBeGreaterThan(0);
  expect(geometry.height).toBeGreaterThan(0);
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  if (vertical) {
    expect(geometry.top).toBeGreaterThanOrEqual(-1);
    expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  }
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(geometry.bodyOverflow).toBeLessThanOrEqual(1);
}

async function mountRenderedStoreState(page, fixture) {
  await page.evaluate(async (stateFixture) => {
    const [
      { createEmptyReadModels },
      { previewData },
      { renderRouteSkeleton },
      { renderStorePage },
      { renderModal },
      { resolveStorePurchaseFailure },
    ] = await Promise.all([
      import("/src/data/empty-read-models.js"),
      import("/src/data/preview-data.js"),
      import("/src/components/route-skeletons.js"),
      import("/src/pages/store-page.js"),
      import("/src/components/modal.js"),
      import("/src/features/store/store-purchase-flow.js"),
    ]);

    const host = document.querySelector(".player-terminal-page-host");
    if (!(host instanceof HTMLElement)) throw new Error("The Player route host is unavailable.");

    const item = structuredClone(previewData.store.items[0]);
    const offer = item.offers.find((candidate) => candidate.offerKey === stateFixture.offerKey);
    if (!offer) throw new Error("The Business fixture offer is unavailable.");

    const quote = {
      quoteKey: stateFixture.quoteKey,
      quoteStatus: "created",
      offerKey: offer.offerKey,
      offerVersion: offer.version,
      businessKey: offer.businessKey,
      businessName: offer.businessName,
      sellerPartyKey: offer.sellerPartyKey,
      sellerName: offer.sellerName,
      catalogItemKey: item.catalogItemKey,
      canonicalItemKey: item.canonicalItemKey,
      storeItemKey: item.storeItemKey,
      itemName: item.name,
      quantity: 2,
      availableQuantityAtQuote: offer.availableQuantity,
      unitPrice: offer.unitPrice,
      totalPrice: offer.unitPrice * 2,
      currencyCode: offer.currencyCode,
      expiresAt: "2099-08-25T01:02:00.000Z",
      pricingVersion: "business-offer-fixed-price-v2",
      replayed: false,
      contextDigest: "2".repeat(64),
    };
    const sourceAccount = previewData.bankingFx.balances[0];
    quote.fundingQuote = {
      quoteKey: `pfq_${"2".repeat(32)}`, fundingContextKind: "store.business-offer",
      fundingContextKey: quote.quoteKey, targetCurrencyCode: quote.currencyCode, targetMinorUnit: 2,
      targetAmount: String(quote.totalPrice), fixingKey: `fxf_${"2".repeat(32)}`,
      policyVersion: "player-retail-funding-v1", requiresFx: true, expiresAt: quote.expiresAt,
      lines: [{
        lineNumber: 1, sourceAccountKey: sourceAccount.accountKey,
        sourceCurrencyCode: sourceAccount.currencyCode, sourceMinorUnit: 2,
        targetCurrencyCode: quote.currencyCode, targetMinorUnit: 2,
        postedAmount: String(sourceAccount.postedAmount), heldAmount: String(sourceAccount.heldAmount),
        availableAmount: String(sourceAccount.availableAmount), targetContribution: String(quote.totalPrice),
        sourceDebit: String(quote.totalPrice), referenceRate: "1", customerRate: "0.99",
        effectiveRate: "0.99", spreadRate: "0.01", requiresFx: true,
        roundingDisclosure: "Source debit rounds up; target contribution is exact.",
      }],
    };
    const receipt = {
      receiptKey: stateFixture.receiptKey,
      quoteKey: quote.quoteKey,
      offerKey: quote.offerKey,
      businessKey: quote.businessKey,
      businessName: quote.businessName,
      sellerPartyKey: quote.sellerPartyKey,
      sellerName: quote.sellerName,
      catalogItemKey: quote.catalogItemKey,
      canonicalItemKey: quote.canonicalItemKey,
      storeItemKey: quote.storeItemKey,
      inventoryTransactionKey: `itx_${"2".repeat(32)}`,
      quantity: quote.quantity,
      unitPrice: quote.unitPrice,
      totalPrice: quote.totalPrice,
      sellerProceeds: quote.totalPrice,
      currencyCode: quote.currencyCode,
      offerVersionBefore: quote.offerVersion,
      offerVersionAfter: quote.offerVersion + 1,
      remainingListedQuantity: 1,
      completedAt: "2026-08-25T01:00:30.000Z",
      alreadyCompleted: stateFixture.kind === "replayed",
      contextDigest: quote.contextDigest,
    };
    receipt.fundingReceipt = {
      receiptKey: `pfr_${"4".repeat(32)}`, quoteKey: quote.fundingQuote.quoteKey,
      bankTransactionKey: `btx_${"4".repeat(32)}`, targetAccountKey: `bac_${"9".repeat(32)}`,
      fundingContextKind: quote.fundingQuote.fundingContextKind,
      fundingContextKey: quote.fundingQuote.fundingContextKey,
      targetCurrencyCode: quote.fundingQuote.targetCurrencyCode,
      targetMinorUnit: quote.fundingQuote.targetMinorUnit, targetAmount: quote.fundingQuote.targetAmount,
      targetReserveDrawAmount: "0", sourceDomain: "store",
      sourceAction: "business_offer_purchase_funding", createdAt: receipt.completedAt,
      lines: quote.fundingQuote.lines.map(({ postedAmount, heldAmount, availableAmount, roundingDisclosure, ...line }) => line),
    };
    const data = {
      ...createEmptyReadModels(),
      session: { currencyCode: "ELD" },
      store: structuredClone(previewData.store),
      inventory: { items: [] },
      banking: {
        balances: [{ accountType: "checking", currencyCode: "ELD", balance: 20_000 }],
        checking: { currencyCode: "ELD", available: 20_000 },
      },
      bankingFx: structuredClone(previewData.bankingFx),
      resourceStatus: { bankingFx: { state: "ready" } },
    };

    if (stateFixture.kind === "loading") {
      host.innerHTML = renderRouteSkeleton("store");
      return;
    }
    if (stateFixture.kind === "empty") {
      data.store = { categories: ["All"], items: [] };
      host.innerHTML = renderStorePage(data, { storeCategory: "All" });
      return;
    }
    if (stateFixture.kind === "catalog") {
      host.innerHTML = renderStorePage(data, { storeCategory: "All" });
      return;
    }
    if (stateFixture.kind === "unavailable" || stateFixture.kind === "sold-out") {
      const stateItem = structuredClone(item);
      const stateOffer = stateItem.offers.find((candidate) => candidate.offerKey === stateFixture.offerKey);
      stateOffer.purchasable = false;
      stateOffer.status = stateFixture.kind === "sold-out" ? "active" : "paused";
      stateOffer.availableQuantity = stateFixture.kind === "sold-out" ? 0 : 3;
      stateItem.offers = [stateOffer];
      stateItem.totalAvailableQuantity = 0;
      stateItem.stock = 0;
      stateItem.bestUnitPrice = null;
      stateItem.sellerCount = 0;
      stateItem.offerCount = 1;
      data.store = { categories: ["All", "Equipment"], items: [stateItem] };
      host.innerHTML = renderStorePage(data, { storeCategory: "All" });
      return;
    }
    if (stateFixture.kind === "error") {
      const failure = resolveStorePurchaseFailure({ code: stateFixture.code, status: 409 });
      host.innerHTML = renderModal({
        type: "storePurchase",
        stage: stateFixture.stage,
        item,
        offer,
        purchaseMode: "business_offer",
        quantity: 2,
        quote: stateFixture.stage === "review" ? quote : null,
        receipt: null,
        error: failure.message,
        processing: false,
        currencyCode: offer.currencyCode,
      });
      return;
    }

    host.innerHTML = renderModal({
      type: "storePurchase",
      stage: "receipt",
      item,
      offer,
      purchaseMode: "business_offer",
      quantity: 2,
      quote,
      receipt,
      refreshState: stateFixture.kind === "refresh-pending" ? "pending" : "complete",
      refreshWarning: stateFixture.kind === "refresh-pending"
        ? "The purchase completed, but current balances and inventory could not be refreshed."
        : "",
      processing: false,
      currencyCode: offer.currencyCode,
    });
  }, {
    ...fixture,
    offerKey: BUSINESS_OFFER_KEY,
    quoteKey: BUSINESS_QUOTE_KEY,
    receiptKey: BUSINESS_RECEIPT_KEY,
  });
}

test.beforeEach(async ({ page }) => {
  await configureWritablePreview(page);
});

test("explicit Business offer completes once with keyboard-only modal operation", async ({ page }) => {
  await openStore(page);

  const product = page.locator(".player-terminal-store-card", { hasText: "Market Lens" });
  await expect(product).toHaveCount(1);
  await expect(product).toContainText("TOTAL STOCK 13 · 3 SELLERS");
  await expect(product.getByRole("list", { name: "Offers for Market Lens" })).toBeVisible();

  const businessRow = product.locator(`[data-player-store-offer-row="${BUSINESS_OFFER_KEY}"]`);
  const businessPurchase = businessRow.locator(`[data-player-store-offer="${BUSINESS_OFFER_KEY}"]`);
  await expect(businessRow).toContainText("BUSINESS");
  await expect(businessRow).toContainText(BUSINESS_NAME);
  await expect(businessRow).toContainText("3 available");
  await expect(businessPurchase).toBeEnabled();
  await expect(businessPurchase).toHaveAttribute(
    "aria-label",
    "Purchase Market Lens from Crescent Dynamics at ELD 2,280 per unit",
  );
  const npcPurchase = product.locator('[data-player-store-offer-row="sof_33333333333333333333333333333333"] [data-player-store-purchase-mode="system_offer"]');
  await expect(npcPurchase).toBeEnabled();

  await tabTo(page, businessPurchase);
  await expectFocused(businessPurchase);
  await expectVisibleKeyboardFocus(businessPurchase);
  await page.keyboard.press("Enter");

  let dialog = page.getByRole("dialog", { name: "Market Lens" });
  const quantity = dialog.locator("[data-player-store-quantity]");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute("aria-describedby", "storePurchaseModalSummary");
  await expect(dialog.locator(".player-terminal-connector-status")).toHaveAttribute("aria-live", "polite");
  await expect(dialog).toContainText("QUOTE REQUIRED");
  await expect(dialog).toContainText("Crescent Dynamics · Business seller");
  await expect(dialog).toContainText("Checking allocation");
  await expect(dialog.locator("[data-player-store-funding-row]")).toHaveCount(3);
  await expect(dialog.locator("[data-player-store-funding-account]").first()).toHaveValue(`bac_${"1".repeat(32)}`);
  await expect(dialog).toContainText("Final ELD remainder is derived by the server");
  await expectFocused(quantity);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectFocused(businessPurchase);

  await page.keyboard.press("Enter");
  dialog = page.getByRole("dialog", { name: "Market Lens" });
  await expectFocused(dialog.locator("[data-player-store-quantity]"));
  await page.keyboard.press("Shift+Tab");
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await expectFocused(close);
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expectFocused(businessPurchase);

  await page.keyboard.press("Enter");
  dialog = page.getByRole("dialog", { name: "Market Lens" });
  const review = dialog.locator("[data-player-store-review]");
  await expectFocused(dialog.locator("[data-player-store-quantity]"));
  await page.keyboard.press("Shift+Tab");
  await expectFocused(dialog.getByRole("button", { name: "Close", exact: true }));
  await page.keyboard.press("Shift+Tab");
  await expectFocused(review);
  await page.keyboard.press("Tab");
  await expectFocused(dialog.getByRole("button", { name: "Close", exact: true }));
  await page.keyboard.press("Tab");
  await expectFocused(dialog.locator("[data-player-store-quantity]"));
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("2");
  await tabTo(page, review, 8);
  await expectFocused(review);
  await page.keyboard.press("Enter");

  dialog = page.getByRole("dialog", { name: "Review Market Lens" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("AUTHORITATIVE QUOTE");
  await expect(dialog).toContainText("CONFIRMATION REQUIRED");
  await expect(dialog).toContainText("ITEMMarket Lens");
  await expect(dialog).toContainText("SELLERCrescent Dynamics · Business seller");
  await expect(dialog).toContainText("QUANTITY2");
  await expect(dialog).toContainText("SELLER STOCK AT QUOTE3");
  await expect(dialog).toContainText("OFFER VERSION4");
  await expect(dialog).toContainText("UNIT PRICEELD 2,280");
  await expect(dialog).toContainText("FINAL TOTALELD 4,560");
  await expect(dialog).toContainText(BUSINESS_QUOTE_KEY);
  await expect(dialog).toContainText("BANKING FX FUNDING QUOTE");
  await expect(dialog).toContainText("RETAIL FX");
  await expect(dialog).toContainText("ELD 4560");
  await expect(dialog).toContainText("player-retail-funding-v1");
  await expect(dialog).toContainText("Source debit rounds up; target contribution is exact.");

  const reviewClose = dialog.getByRole("button", { name: "Close", exact: true });
  const confirm = dialog.locator("[data-player-store-confirm]");
  await expectFocused(reviewClose);
  await page.keyboard.press("Shift+Tab");
  await expectFocused(confirm);
  await page.keyboard.press("Tab");
  await expectFocused(reviewClose);
  await tabTo(page, confirm, 4);
  await expectFocused(confirm);
  await page.keyboard.press("Enter");

  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await expect(dialog).toContainText("SETTLEMENT IN PROGRESS");
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeDisabled();
  await expect(dialog.locator("[data-player-store-edit]")).toBeDisabled();
  await expect(dialog.locator("[data-player-store-confirm]")).toBeDisabled();
  await expectFocused(dialog);
  await page.keyboard.press("Tab");
  await expectFocused(dialog);
  await page.keyboard.press("Shift+Tab");
  await expectFocused(dialog);

  dialog = page.getByRole("dialog", { name: "Market Lens" });
  await expect(dialog).toContainText("PURCHASE RECEIPT");
  await expect(dialog).toContainText("COMPLETED");
  await expect(dialog).toContainText(BUSINESS_NAME);
  await expect(dialog).toContainText("QUANTITY2");
  await expect(dialog).toContainText("TOTAL PAIDELD 4,560");
  await expect(dialog).toContainText(BUSINESS_RECEIPT_KEY);
  await expect(dialog).toContainText(BUSINESS_QUOTE_KEY);
  await expect(dialog).toContainText(BUSINESS_OFFER_KEY);
  await expect(dialog).toContainText("SELLER STOCK LEFT1");
  await expect(dialog).toContainText("IMMUTABLE BANKING FUNDING RECEIPT");
  await expect(dialog).toContainText("RESERVE DRAWELD 0");
  await expect(dialog).toContainText(`pfr_${"3".repeat(32)}`);
  await expect(dialog.locator("[data-player-store-refresh-retry]")).toHaveCount(0);
  await expect(dialog).toHaveAttribute("aria-busy", "false");

  const receiptClose = dialog.getByRole("button", { name: "Close receipt" });
  await expectFocused(dialog.getByRole("button", { name: "Close", exact: true }));
  await tabTo(page, receiptClose, 6);
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expectFocused(businessPurchase);
  await expect(businessRow).toContainText("1 available");
  await expect(product).toContainText("TOTAL STOCK 11 · 3 SELLERS");
});

test("NPC seller uses the same offer-bound funded Store checkout", async ({ page }) => {
  await openStore(page);
  await page.evaluate(async () => {
    const { PreviewTransport } = await import("/src/api/preview-transport.js");
    const request = PreviewTransport.prototype.request;
    globalThis.__npcStoreFundingAudit = [];
    PreviewTransport.prototype.request = async function auditedNpcStoreRequest(context) {
      if (context.endpointKey === "storeQuote" || context.endpointKey === "storePurchase") {
        globalThis.__npcStoreFundingAudit.push({
          endpointKey: context.endpointKey,
          payload: structuredClone(context.payload),
        });
      }
      return request.call(this, context);
    };
  });

  const product = page.locator(".player-terminal-store-card", { hasText: "Market Lens" });
  const npcRow = product.locator(`[data-player-store-offer-row="${NPC_OFFER_KEY}"]`);
  const npcPurchase = npcRow.locator(`[data-player-store-offer="${NPC_OFFER_KEY}"]`);
  await expect(npcRow).toContainText("NPC");
  await expect(npcRow).toContainText("Crescent Exchange");
  await expect(npcPurchase).toHaveAttribute("data-player-store-purchase-mode", "system_offer");
  await expect(npcPurchase).toBeEnabled();
  await npcPurchase.click();

  let dialog = page.getByRole("dialog", { name: "Market Lens" });
  await expect(dialog).toContainText("Crescent Exchange · NPC seller");
  await dialog.locator("[data-player-store-review]").click();

  dialog = page.getByRole("dialog", { name: "Review Market Lens" });
  await expect(dialog).toContainText("SELLERCrescent Exchange · NPC seller");
  await expect(dialog).toContainText("OFFER VERSION2");
  await expect(dialog).toContainText("BANKING FX FUNDING QUOTE");
  const quoteRequest = await page.evaluate(() => globalThis.__npcStoreFundingAudit
    .find((entry) => entry.endpointKey === "storeQuote"));
  expect(quoteRequest).toMatchObject({
    endpointKey: "storeQuote",
    payload: {
      offerKey: NPC_OFFER_KEY,
      expectedVersion: 2,
      quantity: 1,
    },
  });
  expect(quoteRequest.payload.allocations).toHaveLength(1);
  expect(quoteRequest.payload.allocations[0].sourceAccountKey).toMatch(/^bac_[0-9a-f]{32}$/u);
  await dialog.locator("[data-player-store-confirm]").click();

  dialog = page.getByRole("dialog", { name: "Market Lens" });
  await expect(dialog).toContainText("PURCHASE RECEIPT");
  await expect(dialog).toContainText("Crescent Exchange");
  await expect(dialog).toContainText("SELLER STOCK LEFT1");
  await expect(dialog).toContainText(NPC_OFFER_KEY);
  await expect(dialog).toContainText(`itx_${"1".repeat(32)}`);
  const purchaseRequest = await page.evaluate(() => globalThis.__npcStoreFundingAudit
    .find((entry) => entry.endpointKey === "storePurchase"));
  expect(purchaseRequest).toEqual({
    endpointKey: "storePurchase",
    payload: { quoteKey: `quote_${"1".repeat(32)}` },
  });
  await expect(npcRow).toContainText("1 available");
});

test("committed refresh retries stay read-only across invalid receipt and resource timeout", async ({ page }) => {
  await openStore(page);
  await page.evaluate(async () => {
    const { PreviewTransport } = await import("/src/api/preview-transport.js");
    const terminal = globalThis.Econovaria?.playerTerminal;
    if (!terminal || typeof terminal.refreshResources !== "function") {
      throw new Error("The Player terminal refresh contract is unavailable.");
    }
    const request = PreviewTransport.prototype.request;
    const refreshResources = terminal.refreshResources;
    const audit = {
      settlementCalls: 0,
      receiptReads: 0,
      resourceRefreshes: 0,
    };
    globalThis.__phase10A4CommittedRetryRegression = audit;
    PreviewTransport.prototype.request = async function instrumentedPreviewRequest(context) {
      if (context.endpointKey === "storeOfferPurchase") audit.settlementCalls += 1;
      if (context.endpointKey === "storeOfferReceipt") audit.receiptReads += 1;
      const result = await request.call(this, context);
      if (context.endpointKey === "storeOfferReceipt" && audit.receiptReads === 1) {
        return { ok: true, data: {} };
      }
      return result;
    };
    terminal.refreshResources = async function instrumentedCommittedRefresh(resources) {
      const result = await refreshResources.call(this, resources);
      audit.resourceRefreshes += 1;
      if (audit.resourceRefreshes === 2) {
        return {
          ...result,
          errors: {
            ...(result?.errors || {}),
            dashboard: { code: "REQUEST_TIMEOUT", status: 504 },
          },
        };
      }
      return result;
    };
  });

  const businessPurchase = page.locator(`[data-player-store-offer="${BUSINESS_OFFER_KEY}"]`);
  await businessPurchase.click();
  let dialog = page.getByRole("dialog", { name: "Market Lens" });
  await dialog.locator("[data-player-store-quantity]").fill("2");
  await dialog.locator("[data-player-store-review]").click();
  dialog = page.getByRole("dialog", { name: "Review Market Lens" });
  await dialog.locator("[data-player-store-confirm]").click();

  dialog = page.getByRole("dialog", { name: "Market Lens" });
  await expect(dialog).toContainText("COMPLETED · REFRESH PENDING");
  let refreshRetry = dialog.locator("[data-player-store-refresh-retry]");
  await expect(refreshRetry).toBeEnabled();
  await expect.poll(() => page.evaluate(() => globalThis.__phase10A4CommittedRetryRegression)).toEqual({
    settlementCalls: 1,
    receiptReads: 1,
    resourceRefreshes: 1,
  });

  await refreshRetry.click();
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await expect(dialog).toContainText("COMPLETED · REFRESH PENDING");
  refreshRetry = dialog.locator("[data-player-store-refresh-retry]");
  await expect(refreshRetry).toBeEnabled();
  await expect.poll(() => page.evaluate(() => globalThis.__phase10A4CommittedRetryRegression)).toEqual({
    settlementCalls: 1,
    receiptReads: 2,
    resourceRefreshes: 2,
  });

  await refreshRetry.click();
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await expect(dialog).toContainText("PURCHASE RECEIPT");
  await expect(dialog).toContainText("COMPLETED");
  await expect(dialog).not.toContainText("REFRESH PENDING");
  await expect(dialog.locator("[data-player-store-refresh-retry]")).toHaveCount(0);
  await expect(dialog).toHaveAttribute("aria-busy", "false");
  await expect.poll(() => page.evaluate(() => globalThis.__phase10A4CommittedRetryRegression)).toEqual({
    settlementCalls: 1,
    receiptReads: 3,
    resourceRefreshes: 3,
  });
});

test("committed receipt navigation does not cancel authoritative convergence", async ({ page }) => {
  await openStore(page);
  const documentMarker = await page.evaluate(async () => {
    const { PreviewTransport } = await import("/src/api/preview-transport.js");
    const request = PreviewTransport.prototype.request;
    globalThis.__phase10A4SettlementCalls = 0;
    PreviewTransport.prototype.request = function instrumentedPreviewRequest(context) {
      if (context.endpointKey === "storeOfferPurchase") globalThis.__phase10A4SettlementCalls += 1;
      return request.call(this, context);
    };
    globalThis.__phase10A4ConvergenceMarker = crypto.randomUUID();
    return globalThis.__phase10A4ConvergenceMarker;
  });
  const businessPurchase = page.locator(`[data-player-store-offer="${BUSINESS_OFFER_KEY}"]`);
  await businessPurchase.click();
  let dialog = page.getByRole("dialog", { name: "Market Lens" });
  await dialog.locator("[data-player-store-quantity]").fill("2");
  await dialog.locator("[data-player-store-review]").click();
  dialog = page.getByRole("dialog", { name: "Review Market Lens" });
  await dialog.locator("[data-player-store-confirm]").click();
  dialog = page.getByRole("dialog", { name: "Market Lens" });
  await expect(dialog).toContainText("PURCHASE RECEIPT");
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await dialog.getByRole("button", { name: "Open inventory" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-page="inventory"]')).toBeVisible();
  await expect.poll(() => page.evaluate((offerKey) => {
    const items = globalThis.Econovaria?.playerTerminal?.getState?.()?.data?.store?.items || [];
    return items.flatMap((item) => item.offers || [])
      .find((offer) => offer.offerKey === offerKey)?.availableQuantity;
  }, BUSINESS_OFFER_KEY)).toBe(1);
  expect(await page.evaluate(() => globalThis.__phase10A4SettlementCalls)).toBe(1);
  expect(await page.evaluate(() => globalThis.__phase10A4ConvergenceMarker)).toBe(documentMarker);
});

test("rendered Store states remain distinct, safe, and screen-reader legible", async ({ page }) => {
  await openStore(page);

  await mountRenderedStoreState(page, { kind: "loading" });
  const loading = page.locator('[data-skeleton-route="store"]');
  await expect(loading).toBeVisible();
  await expect(loading).toHaveAttribute("role", "status");
  await expect(loading).toHaveAttribute("aria-live", "polite");
  await expect(loading).toHaveAttribute("aria-label", "Loading store inventory");
  await expect(loading.locator('[aria-busy="true"]')).not.toHaveCount(0);
  await expect(loading.locator("button, input, select, textarea")).toHaveCount(0);

  await mountRenderedStoreState(page, { kind: "empty" });
  await expect(page.getByText("No store items available", { exact: true })).toBeVisible();
  await expect(page.locator(".player-terminal-store-card")).toHaveCount(0);

  await mountRenderedStoreState(page, { kind: "unavailable" });
  let businessAction = page.locator(`[data-player-store-offer="${BUSINESS_OFFER_KEY}"]`);
  await expect(businessAction).toBeDisabled();
  await expect(businessAction).toHaveAccessibleName(/Unavailable Market Lens from Crescent Dynamics/);
  await expect(page.locator(`[data-player-store-offer-row="${BUSINESS_OFFER_KEY}"]`)).toContainText("3 available");

  await mountRenderedStoreState(page, { kind: "sold-out" });
  businessAction = page.locator(`[data-player-store-offer="${BUSINESS_OFFER_KEY}"]`);
  await expect(businessAction).toBeDisabled();
  await expect(businessAction).toHaveAccessibleName(/Sold out Market Lens from Crescent Dynamics/);
  await expect(page.locator(".player-terminal-store-card")).toHaveClass(/is-sold-out/);

  const failures = [
    {
      name: "unavailable",
      code: "STORE_OFFER_NOT_AVAILABLE",
      stage: "select",
      message: "This seller offer is no longer available. Refresh the Store and choose another offer.",
    },
    {
      name: "stale",
      code: "STORE_OFFER_VERSION_CONFLICT",
      stage: "select",
      message: "This seller offer changed. Refresh the Store before requesting a new quote.",
    },
    {
      name: "expired",
      code: "STORE_OFFER_SETTLEMENT_QUOTE_EXPIRED",
      stage: "select",
      message: "This Business offer quote expired. Request a new authoritative quote.",
    },
    {
      name: "conflict",
      code: "STORE_OFFER_SETTLEMENT_IDEMPOTENCY_CONFLICT",
      stage: "review",
      message: "This purchase request conflicts with an earlier Store request. Review the receipt or selected offer before retrying.",
    },
    {
      name: "insufficient funds",
      code: "STORE_OFFER_SETTLEMENT_INSUFFICIENT_FUNDS",
      stage: "review",
      message: "You do not have enough available checking funds for this Business offer purchase.",
    },
  ];

  for (const failure of failures) {
    await mountRenderedStoreState(page, { kind: "error", code: failure.code, stage: failure.stage });
    const alert = page.getByRole("alert");
    await expect(alert, failure.name).toBeVisible();
    await expect(alert, failure.name).toHaveText(failure.message);
    await expect(page.getByRole("dialog"), failure.name).toHaveAttribute("aria-describedby", "storePurchaseModalSummary");
  }

  await mountRenderedStoreState(page, { kind: "committed" });
  let receiptDialog = page.getByRole("dialog", { name: "Market Lens" });
  await expect(receiptDialog).toContainText("COMPLETED");
  await expect(receiptDialog).toContainText(BUSINESS_RECEIPT_KEY);
  await expect(receiptDialog.locator("[data-player-store-refresh-retry]")).toHaveCount(0);

  await mountRenderedStoreState(page, { kind: "replayed" });
  receiptDialog = page.getByRole("dialog", { name: "Market Lens" });
  await expect(receiptDialog).toContainText("ALREADY COMPLETED");
  await expect(receiptDialog).toContainText("was not settled twice");
  await expect(receiptDialog).toContainText(BUSINESS_RECEIPT_KEY);

  await mountRenderedStoreState(page, { kind: "refresh-pending" });
  receiptDialog = page.getByRole("dialog", { name: "Market Lens" });
  await expect(receiptDialog).toContainText("COMPLETED · REFRESH PENDING");
  await expect(receiptDialog).toContainText("The purchase completed, but current balances and inventory could not be refreshed.");
  await expect(receiptDialog.locator("[data-player-store-refresh-retry]")).toBeEnabled();
  await expect(receiptDialog.locator(".player-terminal-connector-status")).toHaveAttribute("aria-live", "polite");
});

test("Business offer and modal reflow at desktop, tablet, and Pixel-class bounds", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "The explicit viewport matrix runs once in Chromium; the keyboard journey still runs in the Pixel 7 project.");

  const viewports = [
    { name: "desktop", width: 1440, height: 900, columns: 3 },
    { name: "tablet", width: 1024, height: 768, columns: 2 },
    { name: "Pixel 7 class", width: 412, height: 915, columns: 1 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openStore(page);

    const gridColumns = await page.locator(".player-terminal-catalog-grid").evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length
    );
    expect(gridColumns, viewport.name).toBe(viewport.columns);

    const businessButton = page.locator(`[data-player-store-offer="${BUSINESS_OFFER_KEY}"]`);
    await expect(businessButton, viewport.name).toBeVisible();
    await expect(businessButton, viewport.name).toBeEnabled();
    await expectContained(page, ".player-terminal-store-page");

    const buttonHeight = await businessButton.evaluate((element) => element.getBoundingClientRect().height);
    expect(buttonHeight, viewport.name).toBeGreaterThanOrEqual(viewport.width <= 412 ? 44 : 40);

    await businessButton.click();
    await expect(page.getByRole("dialog", { name: "Market Lens" })).toBeVisible();
    await expectContained(page, '[aria-labelledby="storePurchaseModalTitle"]', { vertical: true });
    await page.keyboard.press("Escape");
  }
});

test("200 percent zoom-equivalent reflow and reduced motion preserve the Business action", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Zoom-equivalent reflow runs once from the desktop Chromium baseline.");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 720, height: 900 });
  await openStore(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    document.documentElement.dataset.playerZoomAcceptance = "200-percent";
  });

  await expect(page.locator("html")).toHaveAttribute("data-player-zoom-acceptance", "200-percent");
  await expect(page.locator(".player-terminal-mobile-nav")).toBeVisible();
  await expect(page.locator(`[data-player-store-offer="${BUSINESS_OFFER_KEY}"]`)).toBeVisible();
  await expectContained(page, ".player-terminal-store-page");

  await mountRenderedStoreState(page, { kind: "loading" });
  const animationName = await page.locator(".player-terminal-skeleton-shape").first().evaluate((element) =>
    getComputedStyle(element).animationName
  );
  expect(animationName).toBe("none");

  await mountRenderedStoreState(page, { kind: "catalog" });
  await page.locator(`[data-player-store-offer="${BUSINESS_OFFER_KEY}"]`).click();
  await expect(page.getByRole("dialog", { name: "Market Lens" })).toBeVisible();
  await expectContained(page, '[aria-labelledby="storePurchaseModalTitle"]', { vertical: true });
});
