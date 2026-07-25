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

const ROUTE_SURFACES = Object.freeze({
  dashboard: ".player-terminal-dashboard-page",
  world: ".player-world-page",
  news: ".player-terminal-news-page",
  market: ".player-terminal-market-page",
  portfolio: ".player-terminal-portfolio-page",
  business: ".player-terminal-business-page",
  contracts: ".player-terminal-contracts-page",
  store: ".player-terminal-store-page",
  marketplace: ".player-terminal-marketplace-page",
  inventory: ".player-terminal-inventory-page",
  crafting: ".player-terminal-crafting-page",
  banking: ".player-terminal-banking-page",
  loans: ".player-terminal-loans-page",
  messages: ".player-terminal-messages-page",
  progression: ".player-terminal-progression-page",
  profile: ".player-terminal-profile-page",
});

const EXCLUDED_ACTIONS = new Set(["logout"]);
const IDENTITY_ATTRIBUTES = Object.freeze([
  "data-player-action",
  "data-player-local-action",
  "data-route",
  "data-player-country",
  "data-player-news-category",
  "data-player-news-select",
  "data-player-news-link",
  "data-player-market-link",
  "data-player-market-select",
  "data-player-market-sector",
  "data-player-market-watchlist",
  "data-player-store-category",
  "data-player-purchase",
  "data-player-contract-tab",
  "data-player-contract-select",
  "data-player-contract-accept",
  "data-player-inventory-category",
  "data-player-inventory-use",
  "data-player-marketplace-category",
  "data-player-marketplace-select",
  "data-player-marketplace-cancel",
  "data-player-message-thread",
  "data-player-loan-offer",
  "data-player-crafting-recipe",
  "data-player-progression-tab",
  "data-player-skill-unlock",
  "data-player-reward-claim",
  "data-range",
]);

function routeRoot(page, route) {
  const selector = ROUTE_SURFACES[route];
  if (!selector) throw new Error(`No Player route surface selector is registered for ${route}.`);
  return page.locator(`${selector}:not(.player-terminal-route-skeleton)`).first();
}

async function openPreviewRoute(page, route) {
  await page.addInitScript(() => {
    globalThis.ECONOVARIA_PLAYER_TERMINAL_CONFIG = {
      usePreviewData: true,
      simulatePreviewWrites: true,
      preserveProductSurface: true,
    };
  });
  await page.goto(`/?preview=1#${route}`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(`#${route}$`));
  await expect(page.locator("#playerTerminal")).not.toHaveAttribute("aria-busy", "true", {
    timeout: 30_000,
  });
  await expect(routeRoot(page, route)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".player-terminal-route-error")).toHaveCount(0);
}

function contentButtons(page, route) {
  return routeRoot(page, route).getByRole("button");
}

async function visibleButtonInventory(page, route) {
  const buttons = contentButtons(page, route);
  const inventory = [];
  const signatureCounts = new Map();
  for (let index = 0; index < await buttons.count(); index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible()) || !(await button.isEnabled())) continue;
    const item = await button.evaluate((element, attributes) => {
      const identityAttribute = attributes.find((attribute) => element.hasAttribute(attribute)) || "";
      const identityValue = identityAttribute ? element.getAttribute(identityAttribute) || "" : "";
      const text = String(element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160);
      const ariaLabel = element.getAttribute("aria-label") || "";
      const endpoint = element.closest("form")?.getAttribute("data-endpoint") || "";
      return {
        text,
        accessibleName: ariaLabel || text,
        ariaLabel,
        endpoint,
        identityAttribute,
        identityValue,
        action: element.getAttribute("data-player-action") || "",
        localAction: element.getAttribute("data-player-local-action") || "",
        type: element.getAttribute("type") || "button",
      };
    }, IDENTITY_ATTRIBUTES);
    const signature = [
      item.endpoint,
      item.identityAttribute,
      item.identityValue,
      item.accessibleName,
      item.type,
    ].join("\u001f");
    const occurrence = signatureCounts.get(signature) || 0;
    signatureCounts.set(signature, occurrence + 1);
    inventory.push({ ...item, signature, occurrence });
  }
  return inventory;
}

function descriptor(route, button) {
  return [
    route,
    button.action && `action=${button.action}`,
    button.localAction && `local=${button.localAction}`,
    button.endpoint && `endpoint=${button.endpoint}`,
    button.identityAttribute && `${button.identityAttribute}=${button.identityValue}`,
    button.ariaLabel && `aria=${button.ariaLabel}`,
    button.text && `text=${button.text}`,
    `occurrence=${button.occurrence}`,
  ].filter(Boolean).join(" | ");
}

function buttonLocator(page, route, item) {
  let scope = routeRoot(page, route);
  if (item.endpoint) {
    scope = scope.locator(`form[data-endpoint=${JSON.stringify(item.endpoint)}]`);
  }

  let candidates;
  if (item.identityAttribute) {
    candidates = scope.locator(
      `${item.type === "submit" ? "button" : ""}[${item.identityAttribute}=${JSON.stringify(item.identityValue)}]`,
    );
  } else {
    candidates = scope.getByRole("button", {
      name: item.accessibleName,
      exact: true,
    });
  }
  return candidates.nth(item.occurrence);
}

for (const route of ROUTES) {
  test(`${route}: every initially enabled content button is click-safe`, async ({ page }) => {
    test.setTimeout(180_000);
    await openPreviewRoute(page, route);
    const inventory = await visibleButtonInventory(page, route);
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

      const button = buttonLocator(page, route, item);
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
