import { expect, test } from "@playwright/test";

const ROUTES = [
  "dashboard", "news", "market", "portfolio", "business", "contracts", "store",
  "marketplace", "inventory", "crafting", "banking", "loans", "messages", "progression", "profile"
];

const GEOMETRY_TARGETS = Object.freeze({
  dashboard: ".player-terminal-command-map",
  news: ".player-terminal-news-detail",
  market: ".player-terminal-chart-frame",
  portfolio: ".player-terminal-networth-chart",
  business: ".player-terminal-company-overview",
  contracts: ".player-terminal-contract-detail",
  store: ".player-terminal-store-card",
  marketplace: ".player-terminal-marketplace-detail",
  inventory: ".player-terminal-inventory-card",
  crafting: ".player-terminal-recipe-detail",
  banking: ".player-terminal-bank-card",
  loans: ".player-terminal-loan-offers",
  messages: ".player-terminal-message-thread",
  progression: ".player-terminal-progression-hero",
  profile: ".player-terminal-profile-identity"
});

async function openTerminal(page, route) {
  await page.goto(`/#${route}`);
  await expect(page).toHaveURL(new RegExp(`#${route}$`));
  await expect(page.locator("#player-main-content .player-terminal-page")).toBeVisible();
  await expect(page.locator(".player-terminal-route-skeleton")).toHaveCount(0);
  await expect(page.locator("#playerTerminal")).not.toHaveAttribute("aria-busy", "true");
}

async function mountSkeleton(page, route) {
  await page.evaluate(async (currentRoute) => {
    const { renderRouteSkeleton } = await import("/src/components/route-skeletons.js");
    const host = document.querySelector(".player-terminal-page-host");
    if (!host) throw new Error("Player page host is unavailable.");
    host.innerHTML = renderRouteSkeleton(currentRoute);
  }, route);
  await expect(page.locator(`[data-skeleton-route="${route}"]`)).toBeVisible();
}

async function overflow(page) {
  return page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth
  ));
}

test("every approved route has an accessible shape-specific skeleton", async ({ page }) => {
  for (const route of ROUTES) {
    await openTerminal(page, route);
    await mountSkeleton(page, route);
    const skeleton = page.locator(`[data-skeleton-route="${route}"]`);
    await expect(skeleton).toHaveAttribute("aria-busy", "true");
    await expect(skeleton).toHaveAttribute("role", "status");
    await expect(skeleton.getByRole("heading", { level: 2 })).toBeVisible();
    expect(await skeleton.locator(".player-terminal-skeleton-shape").count()).toBeGreaterThan(8);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  }
});

test("route skeletons preserve the loaded component footprint", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Detailed geometry comparison runs once in desktop Chromium.");
  const violations = [];

  for (const route of ROUTES) {
    await openTerminal(page, route);
    const selector = GEOMETRY_TARGETS[route];
    const loadedTarget = page.locator(selector).first();
    await expect(loadedTarget).toBeVisible();
    const loadedBox = await loadedTarget.boundingBox();
    const loadedPageHeight = await page.locator(".player-terminal-page").evaluate((element) => element.scrollHeight);

    await mountSkeleton(page, route);
    const skeletonTarget = page.locator(selector).first();
    await expect(skeletonTarget).toBeVisible();
    const skeletonBox = await skeletonTarget.boundingBox();
    const skeletonPageHeight = await page.locator(".player-terminal-page").evaluate((element) => element.scrollHeight);
    const pageOverflow = await overflow(page);

    expect(loadedBox, `${route} loaded geometry`).not.toBeNull();
    expect(skeletonBox, `${route} skeleton geometry`).not.toBeNull();

    const widthRatio = skeletonBox.width / loadedBox.width;
    const heightRatio = skeletonBox.height / loadedBox.height;
    const pageHeightRatio = skeletonPageHeight / loadedPageHeight;
    const detail = {
      route,
      loaded: { width: Math.round(loadedBox.width), height: Math.round(loadedBox.height), pageHeight: loadedPageHeight },
      skeleton: { width: Math.round(skeletonBox.width), height: Math.round(skeletonBox.height), pageHeight: skeletonPageHeight },
      ratios: {
        width: Number(widthRatio.toFixed(3)),
        height: Number(heightRatio.toFixed(3)),
        pageHeight: Number(pageHeightRatio.toFixed(3))
      },
      overflow: pageOverflow
    };

    if (widthRatio <= 0.82 || widthRatio >= 1.18 || heightRatio <= 0.5 || heightRatio >= 2.1 || pageHeightRatio <= 0.55 || pageOverflow > 1) {
      violations.push(detail);
    }
  }

  expect(violations, `Skeleton geometry violations: ${JSON.stringify(violations)}`).toEqual([]);
});

test("skeleton motion is disabled when reduced motion is requested", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Reduced-motion styling runs once in desktop Chromium.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openTerminal(page, "dashboard");
  await mountSkeleton(page, "dashboard");
  const animationName = await page.locator(".player-terminal-skeleton-shape").first().evaluate((element) => getComputedStyle(element).animationName);
  expect(animationName).toBe("none");
});
