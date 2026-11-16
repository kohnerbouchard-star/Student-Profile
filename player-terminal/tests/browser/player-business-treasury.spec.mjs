import { expect, test } from "@playwright/test";

const keys = Object.freeze({
  business: "biz_11111111111111111111111111111111",
  eco: "bac_11111111111111111111111111111111",
  tok: "bac_22222222222222222222222222222222",
  target: "bac_33333333333333333333333333333333",
  fixing: "fxf_11111111111111111111111111111111",
  fixingOther: "fxf_22222222222222222222222222222222",
  fxQuote: "fxq_11111111111111111111111111111111",
  fxOrder: "fxo_11111111111111111111111111111111",
  fxReceipt: "fxr_22222222222222222222222222222222",
  storeQuote: "bsq_11111111111111111111111111111111",
  storeReceipt: "bsr_11111111111111111111111111111111",
  fundingQuote: "pfq_11111111111111111111111111111111",
  fundingReceipt: "pfr_11111111111111111111111111111111",
  bankTransaction: "btx_11111111111111111111111111111111",
});

function money(amount, currencyCode, precision) {
  return { amount, currencyCode, precision };
}

function responses() {
  const fundingLines = [
    {
      lineNumber: 1,
      sourceAccountKey: keys.eco,
      sourceCurrencyCode: "ECO",
      sourcePrecision: 2,
      targetCurrencyCode: "ECO",
      targetPrecision: 2,
      posted: money("1000", "ECO", 2),
      held: money("10", "ECO", 2),
      available: money("990", "ECO", 2),
      targetContribution: money("50", "ECO", 2),
      sourceDebit: money("50", "ECO", 2),
      referenceRate: "1",
      customerRate: "1",
      effectiveRate: "1",
      spreadRate: "0",
      requiresFx: false,
      roundingDisclosure: "No FX rounding is required.",
    },
    {
      lineNumber: 2,
      sourceAccountKey: keys.tok,
      sourceCurrencyCode: "TOK",
      sourcePrecision: 18,
      targetCurrencyCode: "ECO",
      targetPrecision: 2,
      posted: money("1.000000000000000001", "TOK", 18),
      held: money("0.000000000000000001", "TOK", 18),
      available: money("1", "TOK", 18),
      targetContribution: money("100", "ECO", 2),
      sourceDebit: money("1.010101010101010102", "TOK", 18),
      referenceRate: "100.000000000000000001",
      customerRate: "99.000000000000000001",
      effectiveRate: "98.999999999999999999",
      spreadRate: "0.010000000000000000",
      requiresFx: true,
      roundingDisclosure: "Source debit is ceiled once to TOK precision.",
    },
  ];
  const fundingQuote = {
    quoteKey: keys.fundingQuote,
    fundingContextKind: "business.store-procurement",
    fundingContextKey: keys.storeQuote,
    targetAmount: money("150", "ECO", 2),
    fixingKey: keys.fixing,
    policyVersion: "retail-checkout-v1",
    requiresFx: true,
    expiresAt: "2099-08-31T08:05:00.000Z",
    lines: fundingLines,
  };
  const procurementQuote = {
    businessKey: keys.business,
    quoteKey: keys.storeQuote,
    itemKey: "refined-alloy",
    itemName: "Refined Alloy",
    quantity: 3,
    countryCode: "ECO",
    itemCurrencyCode: "ELD",
    settlementCurrencyCode: "ECO",
    baseUnitPrice: 40,
    baseUnitPriceMoney: money("40", "ELD", 3),
    inflationMultiplier: 1,
    locationMultiplier: 1,
    scarcityMultiplier: 1,
    itemLocalFinalUnitPrice: 40,
    itemLocalFinalTotalPrice: 120,
    itemLocalFinalUnit: money("40", "ELD", 3),
    itemLocalFinalTotal: money("120", "ELD", 3),
    exchangeRate: 1.25,
    finalUnitPrice: 50,
    finalTotalPrice: 150,
    finalUnit: money("50", "ECO", 2),
    finalTotal: money("150", "ECO", 2),
    pricingVersion: "business-store-v2",
    expiresAt: "2099-08-31T08:04:00.000Z",
    replayed: false,
    fundingTargetAccountKey: keys.target,
    fundingQuote,
  };
  return {
    businessTreasuryFxQuote: {
      ok: true,
      outcome: "applied",
      refreshRequired: false,
      quote: {
        quoteKey: keys.fxQuote,
        product: "instant",
        sourceAccountKey: keys.tok,
        targetAccountKey: keys.eco,
        sourceAmount: money("0.1", "TOK", 18),
        referenceRate: "100.000000000000000001",
        customerRate: "99.500000000000000001",
        spreadRate: "0.005",
        feeRate: "0.02",
        feeAmount: money("0.002", "TOK", 18),
        targetAmount: money("9.95", "ECO", 2),
        fixingKey: keys.fixing,
        policyVersion: "fx-policy-v1",
        expiresAt: "2099-08-31T08:03:00.000Z",
        settlesAt: "2099-08-31T08:02:01.000Z",
        requiresFx: true,
        roundingDisclosure: "Target credit is rounded once to ECO precision.",
      },
    },
    businessTreasuryFxInstant: {
      ok: true,
      outcome: "applied",
      refreshRequired: true,
      order: {
        orderKey: keys.fxOrder,
        quoteKey: keys.fxQuote,
        product: "instant",
        status: "settled",
        sourceAccountKey: keys.tok,
        targetAccountKey: keys.eco,
        sourceAmount: money("0.1", "TOK", 18),
        feeAmount: money("0.002", "TOK", 18),
        targetAmount: money("9.95", "ECO", 2),
        referenceRate: "100.000000000000000001",
        customerRate: "99.500000000000000001",
        spreadRate: "0.005",
        feeRate: "0.02",
        fixingKey: keys.fixing,
        submittedAt: "2099-08-31T08:02:00.000Z",
        settlesAt: "2099-08-31T08:02:01.000Z",
        completedAt: "2099-08-31T08:02:01.000Z",
        receiptKey: "fxr_11111111111111111111111111111111",
      },
    },
    businessStoreQuote: {
      ok: true,
      refreshRequired: false,
      quote: procurementQuote,
    },
    businessStorePurchase: {
      ok: true,
      refreshRequired: true,
      receipt: {
        businessKey: keys.business,
        receiptKey: keys.storeReceipt,
        quoteKey: keys.storeQuote,
        itemKey: "refined-alloy",
        itemName: "Refined Alloy",
        quantity: 3,
        finalUnitPrice: 50,
        finalTotalPrice: 150,
        finalUnit: money("50", "ECO", 2),
        finalTotal: money("150", "ECO", 2),
        currencyCode: "ECO",
        warehouseQuantityOwned: 3,
        warehouseAverageUnitCost: 50,
        warehouseAverageUnitCostMoney: money("50.0000", "ECO", 4),
        completedAt: "2099-08-31T08:03:00.000Z",
        alreadyCompleted: false,
        fundingReceipt: {
          receiptKey: keys.fundingReceipt,
          quoteKey: keys.fundingQuote,
          bankTransactionKey: keys.bankTransaction,
          targetAccountKey: keys.target,
          fundingContextKind: "business.store-procurement",
          fundingContextKey: keys.storeQuote,
          targetAmount: money("150", "ECO", 2),
          targetReserveDrawAmount: money("0", "ECO", 2),
          sourceDomain: "business",
          sourceAction: "store-procurement",
          createdAt: "2099-08-31T08:03:00.000Z",
          lines: fundingLines.map(({ posted, held, available, roundingDisclosure, ...line }) => line),
        },
      },
    },
  };
}

function treasurySnapshot() {
  return {
    businessKey: keys.business,
    reportingCurrencyCode: "ECO",
    generatedAt: "2026-08-31T08:01:00.000Z",
    accounts: [
      {
        accountKey: keys.tok,
        accountKind: "checking",
        status: "active",
        currencyCode: "TOK",
        precision: 18,
        posted: money("1.000000000000000001", "TOK", 18),
        held: money("0.000000000000000001", "TOK", 18),
        available: money("1", "TOK", 18),
      },
      {
        accountKey: keys.eco,
        accountKind: "checking",
        status: "active",
        currencyCode: "ECO",
        precision: 2,
        posted: money("1000", "ECO", 2),
        held: money("10", "ECO", 2),
        available: money("990", "ECO", 2),
      },
      {
        accountKey: keys.target,
        accountKind: "checking",
        status: "active",
        currencyCode: "ELD",
        precision: 3,
        posted: money("0", "ELD", 3),
        held: money("0", "ELD", 3),
        available: money("0", "ELD", 3),
      },
    ],
    rates: [
      {
        fixingKey: keys.fixing,
        sourceCurrencyCode: "TOK",
        targetCurrencyCode: "ECO",
        referenceRate: "100.000000000000000001",
        effectiveAt: "2026-08-31T08:00:00.000Z",
        calculatedAt: "2026-08-31T08:00:01.000Z",
        policyVersion: "fx-policy-v1",
      },
      {
        fixingKey: keys.fixingOther,
        sourceCurrencyCode: "ECO",
        targetCurrencyCode: "NVA",
        referenceRate: "0.75",
        effectiveAt: "2026-08-31T08:00:00.000Z",
        calculatedAt: "2026-08-31T08:00:01.000Z",
        policyVersion: "fx-policy-v1",
      },
    ],
    orders: [],
    receipts: [{
      receiptKey: keys.fxReceipt,
      orderKey: keys.fxOrder,
      quoteKey: keys.fxQuote,
      bankTransactionKey: keys.bankTransaction,
      product: "standard",
      sourceAccountKey: keys.tok,
      targetAccountKey: keys.eco,
      sourceAmount: money("0.1", "TOK", 18),
      feeAmount: money("0", "TOK", 18),
      targetAmount: money("9.95", "ECO", 2),
      referenceRate: "100.000000000000000001",
      customerRate: "99.500000000000000001",
      spreadRate: "0.005",
      feeRate: "0",
      reserveDrawAmount: money("0", "ECO", 2),
      reserveRepaymentAmount: money("0", "TOK", 18),
      fixingKey: keys.fixing,
      completedAt: "2026-09-01T08:00:00.000Z",
    }],
  };
}

async function mountFixture(page) {
  await page.goto("/?preview=1#business");
  await expect(page.locator("#player-main-content .player-terminal-page")).toBeVisible();
  await page.evaluate(async ({ keys, snapshot, responseMap }) => {
    const [{ renderBusinessPage }, { previewData }, { installBusinessTreasuryFlow }] = await Promise.all([
      import("/src/pages/business-page.js"),
      import("/src/data/preview-data.js"),
      import("/src/features/business-treasury/business-treasury-flow.js"),
    ]);
    const data = structuredClone(previewData);
    data.business.configured = true;
    data.business.company.id = keys.business;
    data.businessTreasury = snapshot;
    data.resourceStatus = { ...(data.resourceStatus || {}), businessTreasury: { state: "ready" } };
    data.store = {
      categories: ["All"],
      items: [{
        itemKey: "refined-alloy",
        id: "refined-alloy",
        name: "Refined Alloy",
        price: 40,
        currencyCode: "ELD",
        stock: 10,
      }],
    };
    const endpointKeys = [
      "businessTreasuryAccountOpen", "businessTreasuryFxQuote",
      "businessTreasuryFxStandard", "businessTreasuryFxInstant",
      "businessTreasuryFxCancel", "businessStoreQuote", "businessStorePurchase",
    ];
    data.capabilities = {
      routes: { business: true },
      actions: {
        businessTreasuryAccountOpen: true,
        businessTreasuryFxQuote: true,
        businessTreasuryFxStandard: true,
        businessTreasuryFxInstant: true,
        businessTreasuryFxCancel: true,
        storePurchase: true,
      },
      endpointKeys: Object.fromEntries(endpointKeys.map((key) => [key, true])),
    };

    document.querySelector("#playerTerminal")?.remove();
    document.querySelector("#businessTreasuryBrowserFixture")?.remove();
    const fixture = document.createElement("main");
    fixture.id = "businessTreasuryBrowserFixture";
    fixture.className = "player-terminal-overview player-terminal-page-host";
    fixture.dataset.testid = "business-treasury-browser-fixture";
    document.body.append(fixture);
    const state = { route: "business", data };
    const calls = [];
    let refreshFailure = true;
    const render = () => { fixture.innerHTML = renderBusinessPage(data); };
    const terminal = {
      getState: () => state,
      requestRender: render,
      refreshResources: async (resources) => refreshFailure
        ? { errors: Object.fromEntries(resources.map((resource) => [resource, { code: "REQUEST_FAILED" }])) }
        : { errors: {} },
      showToast: (message) => { globalThis.__businessTreasuryToast = message; },
    };
    render();
    const controller = installBusinessTreasuryFlow({
      mount: fixture,
      terminal,
      config: {
        authenticated: true,
        apiCall: async (context) => {
          calls.push(structuredClone({
            endpointKey: context.endpointKey,
            payload: context.payload,
            path: context.path,
          }));
          return structuredClone(responseMap[context.endpointKey]);
        },
        requestTimeoutMs: 5000,
        writeCooldownMs: 0,
      },
    });
    globalThis.__businessTreasuryHarness = {
      calls,
      data,
      destroy: controller.destroy,
      renderState(resourceState, includeSnapshot = true) {
        data.resourceStatus.businessTreasury = { state: resourceState };
        data.businessTreasury = includeSnapshot ? (data.businessTreasury || snapshot) : null;
        render();
      },
      allowRefresh() { refreshFailure = false; },
    };
  }, { keys, snapshot: treasurySnapshot(), responseMap: responses() });
  return page.getByTestId("business-treasury-browser-fixture");
}

async function accessibilityIssues(fixture) {
  return fixture.evaluate((root) => {
    const issues = [];
    const ids = new Map();
    for (const element of root.querySelectorAll("[id]")) {
      const id = element.id;
      ids.set(id, (ids.get(id) || 0) + 1);
    }
    for (const [id, count] of ids) {
      if (count > 1) issues.push(`duplicate-id:${id}`);
    }
    const referencedText = (element) => (element.getAttribute("aria-labelledby") || "")
      .split(/\s+/u)
      .filter(Boolean)
      .map((id) => root.querySelector(`#${CSS.escape(id)}`)?.textContent || "")
      .join(" ")
      .trim();
    for (const element of root.querySelectorAll("input, select, textarea, button")) {
      if (element.matches('input[type="hidden"]') || element.closest("[hidden]")) continue;
      const wrapped = element.closest("label")?.textContent?.trim() || "";
      const explicit = element.id
        ? root.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent?.trim() || ""
        : "";
      const name = element.getAttribute("aria-label")?.trim()
        || referencedText(element)
        || wrapped
        || explicit
        || element.textContent?.trim()
        || element.getAttribute("title")?.trim()
        || "";
      if (!name) issues.push(`unnamed-control:${element.tagName.toLowerCase()}:${element.getAttribute("name") || ""}`);
    }
    for (const element of root.querySelectorAll("[aria-labelledby], [aria-describedby]")) {
      for (const attribute of ["aria-labelledby", "aria-describedby"]) {
        for (const id of (element.getAttribute(attribute) || "").split(/\s+/u).filter(Boolean)) {
          if (!root.querySelector(`#${CSS.escape(id)}`)) issues.push(`missing-reference:${attribute}:${id}`);
        }
      }
    }
    for (const image of root.querySelectorAll("img")) {
      if (!image.hasAttribute("alt")) issues.push("image-without-alt");
    }
    for (const hidden of root.querySelectorAll('[aria-hidden="true"]')) {
      if (hidden.matches("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])")
        || hidden.querySelector("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])")) {
        issues.push("aria-hidden-focusable-content");
      }
    }
    return issues;
  });
}

test("Business treasury and procurement review exact terms and recover committed refresh", async ({ page }) => {
  const fixture = await mountFixture(page);

  await expect(fixture.getByText("Canonical Checking accounts & FX")).toBeVisible();
  await expect(fixture.getByText("TOK 1.000000000000000000", { exact: true })).toBeVisible();
  await expect(fixture.getByText(/target reserve draw ECO 0\.00 · source reserve repayment TOK 0\.000000000000000000/iu)).toBeVisible();
  const fxForm = fixture.locator('[data-player-business-treasury-form="quote"]');
  await expect(fxForm.locator('input[name="sourceAmount"]')).toHaveAttribute(
    "step",
    "0.000000000000000001",
  );
  await fxForm.locator('select[name="targetCurrencyCode"]').selectOption("ECO");
  await fxForm.locator('input[name="sourceAmount"]').fill("0.1");
  await fxForm.locator('select[name="product"]').selectOption("instant");
  await fxForm.getByRole("button", { name: "Review exact quote" }).click();

  const fxQuote = fixture.locator("[data-business-treasury-quote]");
  await expect(fxQuote).toContainText("REFERENCE RATE");
  await expect(fxQuote).toContainText("100.000000000000000001");
  await expect(fxQuote).toContainText("BANK SPREAD");
  await expect(fxQuote).toContainText("0.50%");
  await expect(fxQuote).toContainText("INSTANT FEE · 2.00%");
  await expect(fxQuote.getByRole("button", { name: "Convert instantly" })).toBeFocused();
  await fxQuote.getByRole("button", { name: "Convert instantly" }).click();
  await expect(fixture.getByText("Conversion committed; refresh pending")).toBeVisible();
  await expect(fixture.getByText("Receipt fxr_1111…111111 is authoritative. Balances will refresh without resubmitting.")).toBeVisible();

  const procurement = fixture.locator(".player-terminal-business-procurement");
  await expect(procurement.getByText("Server-derived at quote", { exact: true })).toBeVisible();
  const rows = procurement.locator("[data-business-procurement-allocation]");
  await rows.nth(0).locator('select[name="sourceAccountKey"]').selectOption(keys.eco);
  await expect(rows.nth(0).locator('input[name="targetAmount"]')).toBeDisabled();
  await expect(rows.nth(0)).toContainText("SERVER-DERIVED REMAINDER");
  await rows.nth(1).locator('select[name="sourceAccountKey"]').selectOption(keys.tok);
  await expect(rows.nth(0).locator('input[name="targetAmount"]')).toBeEnabled();
  await expect(rows.nth(1).locator('input[name="targetAmount"]')).toBeDisabled();
  await expect(rows.nth(1)).toContainText("SERVER-DERIVED REMAINDER");
  await rows.nth(0).locator('input[name="targetAmount"]').fill("50.00");
  await expect(procurement.locator("[data-business-procurement-funded]")).toHaveText("ECO 50.00");
  await procurement.locator('input[name="quantity"]').fill("3");
  await procurement.getByRole("button", { name: "Review funded procurement quote" }).click();

  const fundedQuote = fixture.locator("[data-business-procurement-quote]");
  await expect(fundedQuote).toContainText("IMMUTABLE FUNDED QUOTE");
  await expect(fundedQuote).toContainText("ECO 150.00");
  await expect(fundedQuote).toContainText("TOK 1.010101010101010102");
  await expect(fundedQuote).toContainText("spread 1.00%");
  await fundedQuote.getByRole("button", { name: "Confirm atomic procurement" }).click();
  const receipt = fixture.locator(`[data-business-procurement-receipt="${keys.storeReceipt}"]`);
  await expect(receipt).toContainText("IMMUTABLE PROCUREMENT RECEIPT");
  await expect(receipt).toContainText("ECO 150.00");
  await expect(receipt).toContainText("ECO 50.0000");
  await expect(fixture.getByText("Procurement committed; refresh pending")).toBeVisible();

  const calls = await page.evaluate(() => globalThis.__businessTreasuryHarness.calls);
  expect(calls.find((entry) => entry.endpointKey === "businessStoreQuote")?.payload.allocations)
    .toEqual([
      { sourceAccountKey: keys.eco, targetAmount: "50" },
      { sourceAccountKey: keys.tok, targetAmount: null },
    ]);
  expect(calls.find((entry) => entry.endpointKey === "businessTreasuryFxQuote")?.payload)
    .toMatchObject({ sourceAmount: "0.1", targetCurrencyCode: "ECO", product: "instant" });
  expect(JSON.stringify(calls)).not.toContain("gameSessionId");

  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Business treasury preserves valid cached evidence across freshness states", async ({ page }) => {
  const fixture = await mountFixture(page);
  for (const [state, label] of [["refreshing", "REFRESHING"], ["stale", "STALE"], ["degraded", "STALE"]]) {
    await page.evaluate((next) => globalThis.__businessTreasuryHarness.renderState(next, true), state);
    await expect(fixture.locator(`[data-business-treasury-state="${state}"]`)).toBeVisible();
    await expect(fixture.getByText(label, { exact: true })).toBeVisible();
    await expect(fixture.locator("[data-business-treasury-account]")).toHaveCount(3);
  }
  await page.evaluate(() => globalThis.__businessTreasuryHarness.renderState("loading", false));
  await expect(fixture.getByLabel("Loading Business treasury")).toBeVisible();
  await page.evaluate(() => globalThis.__businessTreasuryHarness.renderState("empty", false));
  await expect(fixture.getByText("No canonical treasury snapshot")).toBeVisible();
  await page.evaluate(() => globalThis.__businessTreasuryHarness.renderState("unavailable", false));
  await expect(fixture.getByText("Current balances could not be refreshed")).toBeVisible();
  await expect(fixture.getByRole("button", { name: "Retry treasury" })).toBeVisible();
});

test("Business treasury passes the automated accessibility contract and keyboard focus order", async ({ page }) => {
  const fixture = await mountFixture(page);
  expect(await accessibilityIssues(fixture)).toEqual([]);

  const accountDetails = fixture.locator(".player-terminal-business-treasury-actions details").first();
  await accountDetails.locator("summary").click();
  await expect(accountDetails).toHaveAttribute("open", "");
  const accountForm = fixture.locator('[data-player-business-treasury-form="account"]');
  const currency = accountForm.locator('select[name="currencyCode"]');
  await currency.focus();
  await expect(currency).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(accountForm.getByRole("button", { name: "Open Checking account" })).toBeFocused();

  const quoteForm = fixture.locator('[data-player-business-treasury-form="quote"]');
  const sourceAccount = quoteForm.locator('select[name="sourceAccountKey"]');
  await sourceAccount.focus();
  await page.keyboard.press("Tab");
  await expect(quoteForm.locator('select[name="targetCurrencyCode"]')).toBeFocused();
});

test("Business treasury remains usable without horizontal overflow on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await mountFixture(page);
  await expect(fixture.getByText("Canonical Checking accounts & FX")).toBeVisible();
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
  const firstAccount = fixture.locator("[data-business-treasury-account]").first();
  await firstAccount.scrollIntoViewIfNeeded();
  await expect(firstAccount).toBeVisible();
});
