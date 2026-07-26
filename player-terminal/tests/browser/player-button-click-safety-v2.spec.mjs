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
}

async function markEnabledButtons(page) {
  return page.locator(".player-terminal-page:not(.player-terminal-route-skeleton)").first().evaluate((root) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const buttons = [...root.querySelectorAll("button")]
      .filter((button) => visible(button))
      .filter((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true")
      .filter((button) => button.getAttribute("data-player-action") !== "logout");
    buttons.forEach((button, index) => button.setAttribute("data-click-sweep-index", String(index)));
    return buttons.map((button, index) => ({
      index,
      text: String(button.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
      ariaLabel: button.getAttribute("aria-label") || "",
      endpoint: button.closest("form")?.getAttribute("data-endpoint") || "",
      action: button.getAttribute("data-player-action") || "",
      localAction: button.getAttribute("data-player-local-action") || "",
      route: button.getAttribute("data-route") || "",
      type: button.getAttribute("type") || "button",
    }));
  });
}

function descriptor(route, item) {
  return [
    route,
    item.action && `action=${item.action}`,
    item.localAction && `local=${item.localAction}`,
    item.endpoint && `endpoint=${item.endpoint}`,
    item.route && `route=${item.route}`,
    item.ariaLabel && `aria=${item.ariaLabel}`,
    item.text && `text=${item.text}`,
    `index=${item.index}`,
  ].filter(Boolean).join(" | ");
}

for (const route of ROUTES) {
  test(`${route}: every currently enabled content button is click-safe`, async ({ page }) => {
    test.setTimeout(240_000);
    await openPreviewRoute(page, route);
    const initial = await markEnabledButtons(page);
    expect(initial.length, `${route} rendered no enabled content buttons`).toBeGreaterThan(0);

    for (let index = 0; index < initial.length; index += 1) {
      await openPreviewRoute(page, route);
      const current = await markEnabledButtons(page);
      if (index >= current.length) continue;
      const item = current[index];
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

      const button = page.locator(`[data-click-sweep-index="${index}"]`).first();
      await expect(button, descriptor(route, item)).toBeVisible();
      await expect(button, descriptor(route, item)).toBeEnabled();
      try {
        await button.click({ timeout: 10_000 });
        await page.waitForTimeout(350);
      } catch (error) {
        throw new Error(`${descriptor(route, item)} failed to click: ${error.message}`);
      } finally {
        page.off("pageerror", onPageError);
        page.off("console", onConsole);
        page.off("response", onResponse);
      }

      expect(errors, `${descriptor(route, item)} produced browser errors`).toEqual([]);
      expect(serverFailures, `${descriptor(route, item)} produced server errors`).toEqual([]);
      await expect(page.locator(".player-terminal-route-error, .player-terminal-error-shell"), `${descriptor(route, item)} rendered an error`).toHaveCount(0);
    }
  });
}
