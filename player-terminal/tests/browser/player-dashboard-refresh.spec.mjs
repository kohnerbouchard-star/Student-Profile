import { expect, test } from "@playwright/test";

async function openDashboard(page) {
  await page.addInitScript(() => {
    globalThis.ECONOVARIA_PLAYER_TERMINAL_CONFIG = {
      usePreviewData: true,
      simulatePreviewWrites: true,
      preserveProductSurface: true,
    };
  });
  await page.goto("/?preview=1#dashboard");
  await expect(page.locator(".player-terminal-dashboard-page")).toBeVisible();
}

async function horizontalOverflow(page) {
  return page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
}

test("Dashboard refresh preserves the interactive map and establishes readable hierarchy", async ({ page }, testInfo) => {
  await openDashboard(page);

  const routeStylesheetLoaded = await page.evaluate(() => [...document.styleSheets]
    .some((sheet) => String(sheet.href || "").endsWith("/css/routes/player-terminal-dashboard.css")));
  expect(routeStylesheetLoaded).toBe(true);

  await expect(page.locator(".player-terminal-command-metrics .player-terminal-metric-card")).toHaveCount(4);
  await expect(page.locator(".player-terminal-country-region")).toHaveCount(10);
  await expect(page.locator(".player-terminal-map-footer")).toBeVisible();
  await expect(page.locator(".player-terminal-map-home")).toContainText("HOME MARKET");
  await expect(page.locator(".player-terminal-map-metrics > div")).toHaveCount(3);

  const geometry = await page.evaluate(() => {
    const map = document.querySelector(".player-terminal-command-map");
    const image = document.querySelector(".player-terminal-command-map .player-terminal-world-map");
    const overlay = document.querySelector(".player-terminal-country-overlay");
    const footer = document.querySelector(".player-terminal-map-footer");
    const hit = document.querySelector(".player-terminal-country-hit");
    const region = document.querySelector(".player-terminal-country-region");
    const hud = document.querySelector(".player-terminal-map-hud");
    const metricLabel = document.querySelector(".player-terminal-metric-card small");
    const mapCopy = document.querySelector(".player-terminal-map-home p");
    const box = (element) => element?.getBoundingClientRect();
    const mapBox = box(map);
    const imageBox = box(image);
    const overlayBox = box(overlay);
    const footerBox = box(footer);
    return {
      mapHeight: mapBox?.height || 0,
      mapBottom: mapBox?.bottom || 0,
      footerTop: footerBox?.top || 0,
      imageWidthDelta: Math.abs((imageBox?.width || 0) - (overlayBox?.width || 0)),
      imageHeightDelta: Math.abs((imageBox?.height || 0) - (overlayBox?.height || 0)),
      hitPointerEvents: hit ? getComputedStyle(hit).pointerEvents : "missing",
      regionCursor: region ? getComputedStyle(region).cursor : "missing",
      hudPointerEvents: hud ? getComputedStyle(hud).pointerEvents : "missing",
      labelSize: metricLabel ? Number.parseFloat(getComputedStyle(metricLabel).fontSize) : 0,
      copySize: mapCopy ? Number.parseFloat(getComputedStyle(mapCopy).fontSize) : 0,
    };
  });

  expect(geometry.footerTop).toBeGreaterThanOrEqual(geometry.mapBottom - 1);
  expect(geometry.imageWidthDelta).toBeLessThanOrEqual(1);
  expect(geometry.imageHeightDelta).toBeLessThanOrEqual(1);
  expect(geometry.hitPointerEvents).not.toBe("none");
  expect(geometry.regionCursor).toBe("pointer");
  expect(geometry.hudPointerEvents).toBe("none");
  expect(geometry.labelSize).toBeGreaterThanOrEqual(12);
  expect(geometry.copySize).toBeGreaterThanOrEqual(13);
  expect(geometry.mapHeight).toBeGreaterThanOrEqual(testInfo.project.name.includes("mobile") ? 320 : 360);

  const country = page.locator(".player-terminal-country-region").first();
  await country.click();
  const dialog = page.locator('.player-terminal-country-modal[role="dialog"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".player-terminal-country-indicators > span")).toHaveCount(6);
  await expect(dialog.locator(".player-terminal-country-intel-grid > section")).toHaveCount(4);
  await expect(dialog.locator(".player-terminal-country-related > section")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  const overflow = await horizontalOverflow(page);
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
});
