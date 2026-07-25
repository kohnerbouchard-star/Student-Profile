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

const EXCLUDED_ACTIONS = new Set(["logout"]);

async function openPreviewRoute(page, route) {
  await page.addInitScript(() => {
    globalThis.ECONOVARIA_PLAYER_TERMINAL_CONFIG = {
      usePreviewData: true,
      simulatePreviewWrites: true,
      preserveProductSurface: true,
    };
  });
  await page.goto(`/?preview=1#${route}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#playerTerminal")).not.toHaveAttribute("aria-busy", "true", {
    timeout: 30_000,
  });
  await expect(
    page.locator(`.player-terminal-page[data-page="${route}"]:not(.player-terminal-route-skeleton)`),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".player-terminal-route-error")).toHaveCount(0);
}

function contentButtons(page) {
  return page.locator(".player-terminal-page:not(.player-terminal-route-skeleton)").getByRole("button");
}

async function visibleButtonInventory(page) {
  const buttons = contentButtons(page);
  const inventory = [];
  for (let index = 0; index < await buttons.count(); index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible()) || !(await button.isEnabled())) continue;
    inventory.push(await button.evaluate((element, stableIndex) => ({
      index: stableIndex,
      text: String(element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
      ariaLabel: element.getAttribute("aria-label") || "",
      endpoint: element.closest("form")?.getAttribute("data-endpoint") || "",
      action: element.getAttribute("data-player-action") || "",
      localAction: element.getAttribute("data-player-local-action") || "",
      type: element.getAttribute("type") || "button",
    }), index));
  }
  return inventory;
}

function descriptor(route, button) {
  return [
    route,
    button.action && `action=${button.action}`,
    button.localAction && `local=${button.localAction}`,
    button.endpoint && `endpoint=${button.endpoint}`,
    button.ariaLabel && `aria=${button.ariaLabel}`,
    button.text && `text=${button.text}`,
    `index=${button.index}`,
  ].filter(Boolean).join(" | ");
}

for (const route of ROUTES) {
  test(`${route}: every initially enabled content button is click-safe`, async ({ page }) => {
    test.setTimeout(180_000);
    await openPreviewRoute(page, route);
    const inventory = await visibleButtonInventory(page);
    expect(inventory.length, `${route} rendered no enabled content buttons`).toBeGreaterThan(0);

    for (const item of inventory) {
      if (EXCLUDED_ACTIONS.has(item.action)) continue;

      await openPreviewRoute(page, route);
      const errors = [];
      const serverFailures = [];
      const onPageError = (error) => errors.push(error.message);
      const onConsole = (message) => {
        if (message.type() === "error") errors.push(message.text());
      };
      const onResponse = (response) => {
        if (response.status() >= 500) {
          serverFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
        }
      };
      page.on("pageerror", onPageError);
      page.on("console", onConsole);
      page.on("response", onResponse);

      const button = contentButtons(page).nth(item.index);
      await expect(button, descriptor(route, item)).toBeVisible();
      await expect(button, descriptor(route, item)).toBeEnabled();

      try {
        await button.click({ timeout: 10_000 });
        await page.waitForTimeout(300);
      } catch (error) {
        throw new Error(`${descriptor(route, item)} failed to click: ${error.message}`);
      } finally {
        page.off("pageerror", onPageError);
        page.off("console", onConsole);
        page.off("response", onResponse);
      }

      expect(errors, `${descriptor(route, item)} produced browser errors`).toEqual([]);
      expect(serverFailures, `${descriptor(route, item)} produced server errors`).toEqual([]);
      await expect(
        page.locator(".player-terminal-route-error"),
        `${descriptor(route, item)} rendered a route error`,
      ).toHaveCount(0);
    }
  });
}
