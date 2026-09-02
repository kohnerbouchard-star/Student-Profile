import { expect, test } from "@playwright/test";

const keys = Object.freeze({
  business: `biz_${"a".repeat(32)}`,
  product: `bpr_${"1".repeat(32)}`,
  activeOffer: `sof_${"2".repeat(32)}`,
  pendingOffer: `sof_${"3".repeat(32)}`,
  item: `itm_${"4".repeat(32)}`,
  pendingItem: `itm_${"5".repeat(32)}`,
  withdrawal: `swr_${"6".repeat(32)}`,
  ownership: `own_${"7".repeat(32)}`,
  activity: `bae_${"8".repeat(32)}`,
  warehouse: `iac_${"1".repeat(32)}`,
  wip: `iac_${"2".repeat(32)}`,
  finished: `iac_${"3".repeat(32)}`,
  transit: `iac_${"4".repeat(32)}`,
  installation: `bei_${"9".repeat(32)}`,
  equipment: `eqp_${"9".repeat(32)}`,
});

const WORKSPACE_SECTIONS = Object.freeze([
  "overview",
  "products",
  "stockroom",
  "procurement",
  "production",
  "workforce",
  "equipment",
  "sales",
  "finance",
  "governance",
  "activity",
]);

async function mountWorkspace(page) {
  await page.goto("/?preview=1#business");
  await expect(page.locator("#player-main-content .player-terminal-page")).toBeVisible();
  await page.evaluate(async ({ keys }) => {
    const [{ renderBusinessWorkspacePage }, { previewData }] = await Promise.all([
      import("/src/core/route-renderer.js"),
      import("/src/data/preview-data.js"),
    ]);
    const data = structuredClone(previewData);
    data.business.configured = true;
    data.business.company.id = keys.business;
    data.business.products = [{
      id: keys.product,
      category: "Manufacturing",
      name: "Steel Widget",
      description: "Canonical physical product",
      price: 42,
      margin: 25,
      icon: "factory",
      version: 4,
    }];
    data.business.employees = [];
    data.business.manufacturingJobs = [];
    data.business.workforceUtilization = null;
    data.business.productionReadiness = [{
      businessKey: keys.business,
      productKey: keys.product,
      productName: "Steel Widget",
      recipeKey: "recipe-steel-widget-v1",
      plannedQuantity: 10,
      status: "ready",
      nextRunReady: true,
      materialReady: true,
      laborReady: true,
      equipmentReady: true,
      materialMaxUnits: 20,
      laborMaxUnits: 18,
      equipmentMaxUnits: 15,
      maxRunnableUnits: 15,
      bottlenecks: [],
      materialLines: 1,
      materialBlockedLines: 0,
      materialRequired: 10,
      materialAvailable: 20,
      laborRequiredMinutes: 300,
      laborAvailableMinutes: 540,
      laborRequiredHeadcount: 1,
      laborAvailableHeadcount: 2,
      equipmentRequiredMinutes: 300,
      equipmentAvailableMinutes: 450,
      equipmentRequiredInstances: 1,
      equipmentAvailableInstances: 1,
      payrollPeriodKey: "payroll:1",
      equipmentPeriodKey: "equipment:1",
    }];
    data.business.governance = {
      businessKey: keys.business,
      entityType: "llc",
      taxClassification: "disregarded",
      formationState: "operational",
      ownershipModelVersion: 2,
      ownerCount: 1,
      totalUnits: "10000",
      totalVotingUnits: "10000",
      currentPosition: {
        positionKey: keys.ownership,
        ownershipKind: "membership_interest",
        units: "10000",
        votingUnits: "10000",
        ownershipBasisPoints: 10000,
        votingBasisPoints: 10000,
        effectiveAt: "2026-09-01T08:00:00.000Z",
      },
      corporateShareStructure: null,
      openProposals: [],
      readOnly: true,
    };
    data.business.salesOffers = [
      {
        offerKey: keys.activeOffer,
        itemKey: keys.item,
        canonicalKey: "steel-widget",
        itemName: "Steel Widget",
        status: "active",
        unitPrice: 42,
        currencyCode: "ECO",
        quantityOwned: 8,
        quantityReserved: 2,
        quantityAvailable: 6,
        purchaseAllowed: true,
        withdrawal: null,
        version: 3,
      },
      {
        offerKey: keys.pendingOffer,
        itemKey: keys.pendingItem,
        canonicalKey: "steel-widget-pending",
        itemName: "Steel Widget Pending",
        status: "withdrawal_pending",
        unitPrice: 45,
        currencyCode: "ECO",
        quantityOwned: 3,
        quantityReserved: 1,
        quantityAvailable: 2,
        purchaseAllowed: false,
        withdrawal: {
          requestKey: keys.withdrawal,
          mode: "full",
          requestedQuantity: null,
          resumeStatus: "active",
          requestedAt: "2026-09-02T00:00:00.000Z",
          effectiveAt: "2099-09-02T00:05:00.000Z",
          nextAttemptAt: "2099-09-02T00:05:00.000Z",
          lastAttemptAt: null,
          lastBlockReason: "inventory_reserved",
          attemptCount: 1,
        },
        version: 5,
      },
    ];
    data.business.activity = [{
      activityKey: keys.activity,
      eventType: "business.store.withdrawal.requested",
      reasonCode: "store_offer_withdrawal_requested",
      actorType: "player",
      referenceKey: keys.pendingOffer,
      occurredAt: "2026-09-02T00:00:00.000Z",
    }];
    data.business.storeSales = {
      businessKey: keys.business,
      currencyCode: "ECO",
      recentReceiptCount: 0,
      recentQuantitySold: 0,
      recentGrossRevenue: 0,
      recentCostOfGoodsSold: 0,
      recentGrossMargin: 0,
      sales: [],
      activity: [],
    };
    data.businessWorkforce = { candidates: [] };
    data.businessRecipes = { recipes: [{
      accessKey: `bra_${"1".repeat(32)}`,
      recipeKey: "recipe-steel-widget-v1",
      name: "Steel Widget Recipe",
      category: "manufacturing",
      tier: 2,
      workshopTier: 1,
      baseDurationSeconds: 180,
      difficultyProfile: "standard",
      description: "Convert approved steel inputs into a finished widget.",
      availability: {
        enabled: true,
        availableInBusinessCountry: true,
        availableNow: true,
        scarcityBand: "normal",
        eventDurationMultiplier: 1,
        routeDisruptionMultiplier: 1,
      },
      sourceType: "formation",
      grantedAt: "2026-09-01T08:00:00.000Z",
    }] };
    data.businessStockroom = {
      businessKey: keys.business,
      locations: [
        { accountKey: keys.warehouse, locationKey: "warehouse", label: "Warehouse / Materials", itemCount: 1, quantityOwned: 20, quantityReserved: 0, quantityAvailable: 20 },
        { accountKey: keys.wip, locationKey: "work_in_progress", label: "Work in Progress", itemCount: 0, quantityOwned: 0, quantityReserved: 0, quantityAvailable: 0 },
        { accountKey: keys.finished, locationKey: "finished_goods", label: "Finished Goods", itemCount: 1, quantityOwned: 8, quantityReserved: 2, quantityAvailable: 6 },
        { accountKey: keys.transit, locationKey: "in_transit", label: "In Transit", itemCount: 0, quantityOwned: 0, quantityReserved: 0, quantityAvailable: 0 },
      ],
      items: [{
        accountKey: keys.warehouse,
        locationKey: "warehouse",
        itemKey: keys.item,
        canonicalKey: "steel-billet",
        name: "Steel Billet",
        itemClass: "material",
        subtype: "input",
        quantityOwned: 20,
        quantityReserved: 0,
        quantityAvailable: 20,
        averageUnitCost: 2.5,
        costCurrencyCode: "ECO",
        version: 3,
      }],
    };
    data.businessEquipment = { equipment: [{
      businessKey: keys.business,
      installationKey: keys.installation,
      equipmentKey: keys.equipment,
      itemKey: keys.item,
      canonicalKey: "equipment.industrial-press.v1",
      itemName: "Industrial Press",
      equipmentSlot: "operations",
      capabilityKeys: ["pressing"],
      installationStatus: "installed",
      periodKey: "equipment:1",
      capacityMinutes: 480,
      reservedMinutes: 30,
      consumedMinutes: 0,
      availableMinutes: 450,
      idleMinutes: 450,
      utilizationBasisPoints: 625,
      durabilitySupported: false,
      repairSupported: false,
    }] };
    data.resourceStatus = {
      ...(data.resourceStatus || {}),
      businessStockroom: { state: "ready" },
      businessRecipes: { state: "ready" },
      businessEquipment: { state: "ready" },
      businessTreasury: { state: "unavailable" },
      store: { state: "ready" },
    };
    data.businessTreasury = null;
    data.capabilities = {
      routes: { business: true },
      actions: {
        storePurchase: true,
        businessPrice: true,
        businessProduction: true,
        businessStatus: true,
      },
      endpointKeys: { businessStorePurchase: true },
    };

    document.querySelector("#playerTerminal")?.remove();
    document.querySelector("#phase12BusinessWorkspaceFixture")?.remove();
    const fixture = document.createElement("main");
    fixture.id = "phase12BusinessWorkspaceFixture";
    fixture.className = "player-terminal-overview player-terminal-page-host";
    fixture.dataset.testid = "phase12-business-workspace-fixture";
    fixture.innerHTML = renderBusinessWorkspacePage(data);
    document.body.append(fixture);
  }, { keys });
  return page.getByTestId("phase12-business-workspace-fixture");
}

async function horizontalOverflow(page) {
  return page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
}

async function accessibilityIssues(fixture) {
  return fixture.evaluate((root) => {
    const issues = [];
    const ids = new Set();
    for (const element of root.querySelectorAll("[id]")) {
      if (ids.has(element.id)) issues.push(`duplicate-id:${element.id}`);
      ids.add(element.id);
    }
    const visible = (element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
    };
    for (const element of root.querySelectorAll("button, a[href], input:not([type='hidden']), select, textarea")) {
      if (!visible(element)) continue;
      const labelledBy = String(element.getAttribute("aria-labelledby") || "")
        .split(/\s+/u)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ")
        .trim();
      const labelText = Array.from(element.labels || []).map((label) => label.textContent || "").join(" ").trim();
      const name = String(element.getAttribute("aria-label") || element.getAttribute("title") || labelledBy || labelText || element.textContent || "").trim();
      if (!name) issues.push(`unnamed-control:${element.tagName.toLowerCase()}`);
    }
    return issues;
  });
}

test("Phase 12 Business workspace is keyboard and screen-reader operable across Chromium layouts", async ({ page }, testInfo) => {
  const fixture = await mountWorkspace(page);
  const workspace = fixture.locator("[data-business-workspace-v2]");
  await expect(workspace).toBeVisible();
  await expect(workspace.getByRole("heading", { name: "Business", level: 2 })).toBeVisible();

  const sections = workspace.locator("[data-business-workspace-section]");
  await expect(sections).toHaveCount(WORKSPACE_SECTIONS.length);
  const sectionKeys = await sections.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-business-workspace-section")));
  expect(sectionKeys).toEqual(WORKSPACE_SECTIONS);

  const navigation = workspace.getByRole("navigation", { name: "Business workspace" });
  await expect(navigation).toBeVisible();
  const links = navigation.locator("a[data-business-workspace-link]");
  await expect(links).toHaveCount(WORKSPACE_SECTIONS.length);
  expect(await links.allTextContents()).toEqual([
    "Overview", "Products / Recipes", "Stockroom", "Procurement", "Production",
    "Workforce", "Equipment", "Sales", "Finance", "Ownership / Governance", "Activity",
  ]);

  await links.nth(0).focus();
  await expect(links.nth(0)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(links.nth(1)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(links.nth(2)).toBeFocused();

  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(await accessibilityIssues(fixture)).toEqual([]);

  const overflow = await horizontalOverflow(page);
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);

  if (testInfo.project.name.includes("mobile")) {
    const touchTargets = workspace.locator('form[data-endpoint="businessStoreWithdrawal"] button:visible');
    await expect(touchTargets).toHaveCount(2);
    const heights = await touchTargets.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(heights.every((height) => height >= 40), `Business seller touch targets: ${JSON.stringify(heights)}`).toBe(true);
  }
});

test("Phase 12 seller controls expose bounded active intent and lock pending withdrawals", async ({ page }) => {
  const fixture = await mountWorkspace(page);
  const active = fixture.locator(`[data-business-sales-offer="${keys.activeOffer}"]`);
  const pending = fixture.locator(`[data-business-sales-offer="${keys.pendingOffer}"]`);
  await expect(active).toBeVisible();
  await expect(pending).toBeVisible();

  const reduce = active.locator('form[data-player-form="business-store-withdrawal-reduce"]');
  const full = active.locator('form[data-player-form="business-store-withdrawal-full"]');
  await expect(reduce).toHaveAttribute("data-endpoint", "businessStoreWithdrawal");
  await expect(full).toHaveAttribute("data-endpoint", "businessStoreWithdrawal");
  await expect(reduce.locator('input[name="offerKey"]')).toHaveValue(keys.activeOffer);
  await expect(reduce.locator('input[name="mode"]')).toHaveValue("reduce");
  await expect(full.locator('input[name="mode"]')).toHaveValue("full");
  await expect(reduce.locator('input[name="expectedOfferVersion"]')).toHaveValue("3");
  await expect(full.locator('input[name="expectedOfferVersion"]')).toHaveValue("3");
  await expect(reduce.locator('input[name="quantity"]')).toHaveAttribute("max", "6");
  await expect(active.locator('input[name="businessKey"]')).toHaveCount(0);

  const quantity = reduce.getByLabel("REDUCE LISTED QUANTITY");
  await quantity.focus();
  await expect(quantity).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(reduce.getByRole("button", { name: "Reduce listing" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(full.getByRole("button", { name: "Withdraw listing" })).toBeFocused();

  await expect(pending).toContainText("WITHDRAWAL PENDING");
  await expect(pending).toContainText("Purchases disabled while withdrawal is pending.");
  await expect(pending).toContainText("blocked: inventory_reserved");
  await expect(pending.locator('form[data-endpoint="businessStoreWithdrawal"]')).toHaveCount(0);
  const pendingState = pending.locator("[data-business-withdrawal-effective-at]");
  await expect(pendingState).toHaveAttribute("data-business-withdrawal-effective-at", "2099-09-02T00:05:00.000Z");
  const remaining = Number(await pendingState.getAttribute("data-business-withdrawal-remaining-seconds"));
  expect(Number.isSafeInteger(remaining) && remaining > 0).toBe(true);
});
