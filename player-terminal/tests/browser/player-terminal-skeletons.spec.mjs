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
  business: ".player-terminal-business-layout > .player-terminal-panel:first-child",
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
  await page.waitForFunction(async (currentRoute) => {
    const ready = () => {
      const terminal = globalThis.Econovaria?.playerTerminal;
      const state = terminal?.getState?.();
      const pageNode = document.querySelector("#player-main-content .player-terminal-page:not(.player-terminal-route-skeleton):not(.player-terminal-route-error)");
      return Boolean(
        state?.status === "ready" &&
        state?.route === currentRoute &&
        pageNode &&
        !document.querySelector(".player-terminal-route-skeleton")
      );
    };
    if (!ready()) return false;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return ready();
  }, route);
  await expect(page.locator("#player-main-content .player-terminal-page:not(.player-terminal-route-skeleton):not(.player-terminal-route-error)")).toBeVisible();
  await expect(page.locator(".player-terminal-route-skeleton")).toHaveCount(0);
}

async function inspectMountedSkeleton(page, route) {
  return page.evaluate(async (currentRoute) => {
    const { renderRouteSkeleton } = await import("/src/components/route-skeletons.js");
    const host = document.querySelector(".player-terminal-page-host");
    if (!host) throw new Error("Player page host is unavailable.");
    host.innerHTML = renderRouteSkeleton(currentRoute);
    const skeleton = host.querySelector(`[data-skeleton-route="${currentRoute}"]`);
    const surfaces = [...(skeleton?.querySelectorAll(".player-terminal-skeleton-surface") || [])];
    const rect = skeleton?.getBoundingClientRect();
    return {
      exists: Boolean(skeleton),
      visible: Boolean(rect && rect.width > 0 && rect.height > 0),
      role: skeleton?.getAttribute("role") || "",
      headingVisible: Boolean(skeleton?.querySelector("h2")?.getClientRects().length),
      controlCount: skeleton?.querySelectorAll("button, input, select, textarea").length || 0,
      headingActionCount: skeleton?.querySelectorAll(".player-terminal-heading-actions").length || 0,
      surfaceCount: surfaces.length,
      allSurfacesBusy: surfaces.every((surface) => surface.getAttribute("aria-busy") === "true"),
      shapeCount: skeleton?.querySelectorAll(".player-terminal-skeleton-shape").length || 0,
      overflow: Math.max(
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
        document.body.scrollWidth - document.body.clientWidth
      )
    };
  }, route);
}

test("every route keeps the page heading and skeletonizes only data containers", async ({ page }) => {
  for (const route of ROUTES) {
    await openTerminal(page, route);
    const result = await inspectMountedSkeleton(page, route);
    expect(result.exists, `${route} skeleton exists`).toBe(true);
    expect(result.visible, `${route} skeleton is visible`).toBe(true);
    expect(result.role).toBe("status");
    expect(result.headingVisible, `${route} heading remains visible`).toBe(true);
    expect(result.controlCount, `${route} has no synthetic controls`).toBe(0);
    expect(result.headingActionCount, `${route} has no synthetic heading actions`).toBe(0);
    expect(result.surfaceCount, `${route} has data surfaces`).toBeGreaterThanOrEqual(2);
    expect(result.allSurfacesBusy, `${route} surfaces declare busy state`).toBe(true);
    expect(result.shapeCount, `${route} has bounded placeholder geometry`).toBeGreaterThan(6);
    expect(result.overflow, `${route} skeleton overflow`).toBeLessThanOrEqual(1);
  }
});

test("card-level skeletons preserve the principal container width", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Detailed geometry comparison runs once in desktop Chromium.");
  const violations = [];

  for (const route of ROUTES) {
    await openTerminal(page, route);
    const selector = GEOMETRY_TARGETS[route];
    const loadedTarget = page.locator(selector).first();
    await expect(loadedTarget).toBeVisible();
    const loadedBox = await loadedTarget.boundingBox();

    const measured = await page.evaluate(async ({ currentRoute, selector }) => {
      const { renderRouteSkeleton } = await import("/src/components/route-skeletons.js");
      const host = document.querySelector(".player-terminal-page-host");
      if (!host) throw new Error("Player page host is unavailable.");
      host.innerHTML = renderRouteSkeleton(currentRoute);
      const target = host.querySelector(selector);
      if (!target) return { box: null, overflow: Infinity };
      const rect = target.getBoundingClientRect();
      return {
        box: { width: rect.width, height: rect.height },
        overflow: Math.max(
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
          document.body.scrollWidth - document.body.clientWidth
        )
      };
    }, { currentRoute: route, selector });

    expect(loadedBox, `${route} loaded geometry`).not.toBeNull();
    expect(measured.box, `${route} skeleton geometry`).not.toBeNull();

    const widthRatio = measured.box.width / loadedBox.width;
    const heightRatio = measured.box.height / loadedBox.height;
    const detail = {
      route,
      loaded: { width: Math.round(loadedBox.width), height: Math.round(loadedBox.height) },
      skeleton: { width: Math.round(measured.box.width), height: Math.round(measured.box.height) },
      ratios: { width: Number(widthRatio.toFixed(3)), height: Number(heightRatio.toFixed(3)) },
      overflow: measured.overflow
    };

    if (widthRatio <= 0.8 || widthRatio >= 1.2 || heightRatio <= 0.3 || heightRatio >= 2.2 || measured.overflow > 1) {
      violations.push(detail);
    }
  }

  expect(violations, `Card skeleton geometry violations: ${JSON.stringify(violations)}`).toEqual([]);
});

test("skeleton motion is disabled when reduced motion is requested", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Reduced-motion styling runs once in desktop Chromium.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openTerminal(page, "dashboard");
  const animationName = await page.evaluate(async () => {
    const { renderRouteSkeleton } = await import("/src/components/route-skeletons.js");
    const host = document.querySelector(".player-terminal-page-host");
    if (!host) throw new Error("Player page host is unavailable.");
    host.innerHTML = renderRouteSkeleton("dashboard");
    const shape = host.querySelector(".player-terminal-skeleton-shape");
    return shape ? getComputedStyle(shape).animationName : "missing";
  });
  expect(animationName).toBe("none");
});
