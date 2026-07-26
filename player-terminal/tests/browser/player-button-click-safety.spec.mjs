import { expect, test } from "@playwright/test";

const ROUTES = [
  "dashboard",
  "world",
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
  "profile",
];

async function openPreviewRoute(page, route) {
  await page.addInitScript(() => {
    globalThis.ECONOVARIA_PLAYER_TERMINAL_CONFIG = {
      usePreviewData: true,
      simulatePreviewWrites: true,
      preserveProductSurface: true,
    };
  });
  await page.goto(`/?preview=1#${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((expectedRoute) => location.hash === `#${expectedRoute}`, route, { timeout: 30_000 });
  await expect(page.locator("#playerTerminal")).not.toHaveAttribute("aria-busy", "true", { timeout: 30_000 });
  await expect(page.locator(".player-terminal-page:not(.player-terminal-route-skeleton)").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".player-terminal-route-error, .player-terminal-error-shell")).toHaveCount(0);
  await dismissOverlays(page);
}

async function dismissOverlays(page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const overlay = page.locator([
      "[data-player-modal-backdrop]:visible",
      ".player-terminal-modal-backdrop:visible",
      "[role='dialog']:visible",
    ].join(", ")).last();
    if (!(await overlay.count()) || !(await overlay.isVisible().catch(() => false))) return;

    const close = overlay.locator([
      "[data-player-local-action='close-modal']:visible",
      "[data-player-modal-close]:visible",
      "button[aria-label*='Close' i]:visible",
      "button:has-text('Close'):visible",
      "button:has-text('Dismiss'):visible",
      "button:has-text('Continue'):visible",
    ].join(", ")).first();
    if (await close.count()) {
      await close.click({ timeout: 3_000 }).catch(() => {});
    } else {
      await page.keyboard.press("Escape").catch(() => {});
    }
    await page.waitForTimeout(100);
  }
}

function pageButtons(page) {
  return page.locator(".player-terminal-page:not(.player-terminal-route-skeleton)").first()
    .locator("button:visible:not([disabled]):not([aria-disabled='true']):not([data-player-action='logout'])");
}

async function buttonDescriptor(button, route, index) {
  return button.evaluate((element, context) => ({
    route: context.route,
    index: context.index,
    text: String(element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
    ariaLabel: element.getAttribute("aria-label") || "",
    endpoint: element.closest("form")?.getAttribute("data-endpoint") || "",
    action: element.getAttribute("data-player-action") || "",
    localAction: element.getAttribute("data-player-local-action") || "",
    targetRoute: element.getAttribute("data-route") || "",
  }), { route, index });
}

function describe(item) {
  return [
    item.route,
    item.action && `action=${item.action}`,
    item.localAction && `local=${item.localAction}`,
    item.endpoint && `endpoint=${item.endpoint}`,
    item.targetRoute && `route=${item.targetRoute}`,
    item.ariaLabel && `aria=${item.ariaLabel}`,
    item.text && `text=${item.text}`,
    `index=${item.index}`,
  ].filter(Boolean).join(" | ");
}

async function clickCurrentButton(page, route, index) {
  await dismissOverlays(page);
  let buttons = pageButtons(page);
  let count = await buttons.count();
  if (index >= count) return null;

  let button = buttons.nth(index);
  let item = await buttonDescriptor(button, route, index);
  if (!(await button.isVisible().catch(() => false)) || !(await button.isEnabled().catch(() => false))) return null;

  try {
    await button.click({ timeout: 5_000 });
  } catch (firstError) {
    await dismissOverlays(page);
    buttons = pageButtons(page);
    count = await buttons.count();
    if (index >= count) return null;
    button = buttons.nth(index);
    if (!(await button.isVisible().catch(() => false)) || !(await button.isEnabled().catch(() => false))) return null;
    item = await buttonDescriptor(button, route, index);
    try {
      await button.click({ timeout: 5_000 });
    } catch (secondError) {
      throw new Error(`${describe(item)} failed to click: ${secondError.message}; first attempt: ${firstError.message}`);
    }
  }
  return item;
}

for (const route of ROUTES) {
  test(`${route}: every currently actionable content button is click-safe`, async ({ page }) => {
    test.setTimeout(240_000);
    await openPreviewRoute(page, route);
    const initialCount = await pageButtons(page).count();
    expect(initialCount, `${route} rendered no actionable content buttons`).toBeGreaterThan(0);

    for (let index = 0; index < initialCount; index += 1) {
      await openPreviewRoute(page, route);
      const errors = [];
      const serverFailures = [];
      const onPageError = (error) => errors.push(error.message);
      const onConsole = (message) => {
        if (message.type() === "error") errors.push(message.text());
      };
      const onResponse = (response) => {
        if (response.status() >= 500) serverFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
      };
      page.on("pageerror", onPageError);
      page.on("console", onConsole);
      page.on("response", onResponse);

      let item = null;
      try {
        item = await clickCurrentButton(page, route, index);
        if (item) await page.waitForTimeout(350);
      } finally {
        page.off("pageerror", onPageError);
        page.off("console", onConsole);
        page.off("response", onResponse);
      }
      if (!item) continue;

      expect(errors, `${describe(item)} produced browser errors`).toEqual([]);
      expect(serverFailures, `${describe(item)} produced server errors`).toEqual([]);
      await expect(page.locator(".player-terminal-route-error, .player-terminal-error-shell"), `${describe(item)} rendered an error`).toHaveCount(0);
      await dismissOverlays(page);
    }
  });
}
