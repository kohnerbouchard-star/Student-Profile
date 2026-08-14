import { expect, test } from "@playwright/test";

const ROUTE_FAMILIES = [
  "news",
  "market",
  "portfolio",
  "business",
  "contracts",
  "store",
  "marketplace",
  "inventory",
  "crafting",
  "banking",
  "loans",
  "messages",
  "progression",
  "profile"
];

async function configurePreview(page) {
  await page.addInitScript(() => {
    globalThis.ECONOVARIA_PLAYER_TERMINAL_CONFIG = {
      usePreviewData: true,
      simulatePreviewWrites: true,
      preserveProductSurface: true,
    };
  });
}

async function waitForStableRoute(page) {
  await page.waitForFunction(async () => {
    const isReady = () => {
      const routePage = document.querySelector(
        ".player-terminal-page:not(.player-terminal-route-skeleton):not(.player-terminal-route-error)"
      );
      return Boolean(
        routePage?.querySelector(".player-terminal-page-heading h2") &&
        !document.querySelector(".player-terminal-route-skeleton")
      );
    };

    if (!isReady()) return false;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return isReady();
  });
}

async function openRoute(page, route) {
  await page.goto(`/?preview=1#${route}`);
  await waitForStableRoute(page);
  await expect(page.locator(".player-terminal-page:not(.player-terminal-route-skeleton)")).toBeVisible();
  await expect(page.locator(".player-terminal-page-heading h2")).toBeVisible();
  await expect(page.locator(".player-terminal-route-skeleton")).toHaveCount(0);
  await expect(page.locator(".player-terminal-route-error")).toHaveCount(0);
}

async function horizontalOverflow(page) {
  return page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
}

test.beforeEach(async ({ page }) => {
  await configurePreview(page);
});

test("shared route owner is active across every Player Terminal route family", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Full route-family scan runs once in desktop Chromium.");

  await openRoute(page, ROUTE_FAMILIES[0]);
  const stylesLoaded = await page.evaluate(() => {
    const hrefs = [...document.styleSheets].map((sheet) => String(sheet.href || ""));
    const sharedOwners = [
      "/css/routes/player-terminal-shared-layout.css",
      "/css/routes/player-terminal-shared-cards.css",
      "/css/routes/player-terminal-shared-lists.css",
      "/css/routes/player-terminal-shared-states.css",
      "/css/routes/player-terminal-shared-details.css",
      "/css/routes/player-terminal-shared-responsive.css",
      "/css/routes/player-terminal-shared-overlays.css",
    ];
    const retiredOwners = [
      "/css/player-terminal-base.css",
      "/css/player-terminal.css",
      "/css/player-terminal-ux.css",
      "/css/player-terminal-polish.css",
      "/css/player-terminal-normalization.css",
      "/css/player-terminal-shell-compat.css",
      "/css/player-terminal-route-compat.css",
    ];
    return {
      route: sharedOwners.every((suffix) => hrefs.some((href) => href.endsWith(suffix))),
      legacy: retiredOwners.some((suffix) => hrefs.some((href) => href.endsWith(suffix))),
    };
  });
  expect(stylesLoaded).toEqual({ route: true, legacy: false });

  for (const route of ROUTE_FAMILIES) {
    await openRoute(page, route);
    await expect(page).toHaveURL(new RegExp(`#${route}$`));
    const result = await page.evaluate(() => {
      const visible = (element) => Boolean(element && element.getClientRects().length);
      const numericStyle = (element, property) => element ? Number.parseFloat(getComputedStyle(element)[property]) : 0;
      const headingCopy = document.querySelector(".player-terminal-page-heading p");
      const routeSurface = [...document.querySelectorAll([
        ".player-terminal-panel",
        ".player-terminal-store-card",
        ".player-terminal-inventory-card",
        ".player-terminal-marketplace-card",
        ".player-terminal-business-product",
        ".player-terminal-recipe-row",
        ".player-terminal-loan-offer",
        ".player-terminal-news-row",
        ".player-terminal-asset-row",
        ".player-terminal-contract-row",
        ".player-terminal-transaction-row",
        ".player-terminal-thread-row",
        ".player-terminal-bank-card"
      ].join(","))].find(visible);
      const labels = [...document.querySelectorAll([
        ".player-terminal-metric-card small",
        ".player-terminal-filter-row button",
        ".player-terminal-chart-toolbar button",
        ".player-terminal-news-filters button",
        ".player-terminal-contract-tabs button",
        ".player-terminal-progression-tabs button",
        ".player-terminal-asset-row small",
        ".player-terminal-news-row small",
        ".player-terminal-contract-row small",
        ".player-terminal-transaction-row small",
        ".player-terminal-thread-row small"
      ].join(","))].filter(visible);
      return {
        headingCopySize: numericStyle(headingCopy, "fontSize"),
        surfaceRadius: numericStyle(routeSurface, "borderRadius"),
        minimumLabelSize: labels.length ? Math.min(...labels.map((element) => numericStyle(element, "fontSize"))) : 12,
      };
    });

    expect(result.headingCopySize).toBeGreaterThanOrEqual(13);
    expect(result.surfaceRadius).toBeGreaterThanOrEqual(6);
    expect(result.minimumLabelSize).toBeGreaterThanOrEqual(11);

    const overflow = await horizontalOverflow(page);
    expect(overflow.document, `${route} document overflow`).toBeLessThanOrEqual(1);
    expect(overflow.body, `${route} body overflow`).toBeLessThanOrEqual(1);
  }
});

test("representative mobile routes retain readable cards and page-level containment", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile route density runs in the mobile Chromium project.");

  for (const route of ["market", "contracts", "store", "banking", "messages", "profile"]) {
    await openRoute(page, route);
    const overflow = await horizontalOverflow(page);
    expect(overflow.document, `${route} document overflow`).toBeLessThanOrEqual(1);
    expect(overflow.body, `${route} body overflow`).toBeLessThanOrEqual(1);

    const measurements = await page.evaluate(() => {
      const visible = (element) => Boolean(element && element.getClientRects().length);
      const panel = [...document.querySelectorAll(".player-terminal-panel")].find(visible);
      const button = [...document.querySelectorAll(".player-terminal-page button")].find(visible);
      return {
        panelWidth: panel?.getBoundingClientRect().width || 0,
        viewportWidth: document.documentElement.clientWidth,
        buttonHeight: button?.getBoundingClientRect().height || 44,
      };
    });
    expect(measurements.panelWidth).toBeLessThanOrEqual(measurements.viewportWidth + 1);
    expect(measurements.buttonHeight).toBeGreaterThanOrEqual(40);
  }
});

test("shared transactional modal uses the refreshed, contained presentation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Modal geometry is verified once in desktop Chromium.");
  await openRoute(page, "store");
  await page.locator("[data-player-purchase]:not([disabled])").first().click();
  const dialog = page.locator('[aria-labelledby="storePurchaseModalTitle"]');
  await expect(dialog).toBeVisible();
  const geometry = await dialog.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      radius: Number.parseFloat(style.borderRadius),
      width: rect.width,
      viewportWidth: document.documentElement.clientWidth,
      maxHeight: rect.height,
      viewportHeight: document.documentElement.clientHeight,
    };
  });
  expect(geometry.radius).toBeGreaterThanOrEqual(10);
  expect(geometry.width).toBeLessThanOrEqual(geometry.viewportWidth - 16);
  expect(geometry.maxHeight).toBeLessThanOrEqual(geometry.viewportHeight - 8);
});
