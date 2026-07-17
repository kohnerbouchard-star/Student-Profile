import { expect, test } from "@playwright/test";

const ROUTES = [
  "dashboard",
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

async function openTerminal(page, route = "dashboard") {
  await page.goto(`/#${route}`);
  await expect(page.locator("#player-main-content")).toBeVisible();
  await expect(page.locator(".player-terminal-page")).toBeVisible();
}

async function horizontalOverflow(page) {
  return page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth
  }));
}

test("all approved routes render in the actual application", async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  for (const route of ROUTES) {
    await openTerminal(page, route);
    await expect(page).toHaveURL(new RegExp(`#${route}$`));
    await expect(page.locator(".player-terminal-page")).not.toContainText("undefined");
    await expect(page.locator(".player-terminal-route-error")).toHaveCount(0);
  }

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("shell has one main landmark and an operational skip link", async ({ page }) => {
  await openTerminal(page);
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("#player-main-content")).toHaveAttribute("tabindex", "-1");
  const skip = page.locator('a[href="#player-main-content"]');
  await expect(skip).toHaveCount(1);
  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#player-main-content")).toBeFocused();
});

test("country map is keyboard operable and restores focus", async ({ page }) => {
  await openTerminal(page, "dashboard");
  const country = page.locator(".player-terminal-country-region").first();
  await country.focus();
  await expect(country).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: /world intelligence/i });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".player-terminal-app-root")).toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(country).toBeFocused();
});

test("message drafts survive thread rerenders in memory", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Two-pane draft behavior is covered on desktop Chromium.");
  await openTerminal(page, "messages");
  const threads = page.locator("[data-player-message-thread]");
  expect(await threads.count()).toBeGreaterThan(1);
  const firstThread = threads.nth(0);
  const firstThreadId = await firstThread.getAttribute("data-player-message-thread");
  const secondThread = threads.nth(1);
  const draft = `Unsent draft ${Date.now()}`;
  await page.locator('form[data-endpoint="messageSend"] textarea[name="body"]').fill(draft);
  await secondThread.click();
  await expect(page.locator('form[data-endpoint="messageSend"] textarea[name="body"]')).toHaveValue("");
  await page.locator(`[data-player-message-thread="${firstThreadId}"]`).click();
  await expect(page.locator('form[data-endpoint="messageSend"] textarea[name="body"]')).toHaveValue(draft);
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((key) => /draft/i.test(key)));
  expect(stored).toEqual([]);
});

test("Store purchase opens quote selection before confirmation", async ({ page }) => {
  await openTerminal(page, "store");
  const purchase = page.locator("[data-player-purchase]:not([disabled])").first();
  await purchase.focus();
  await purchase.click();
  const dialog = page.getByRole("dialog", { name: /store purchase/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("QUOTE REQUIRED");
  await expect(dialog.locator("[data-player-store-quantity]")).toBeVisible();
  await expect(dialog.locator("[data-player-store-review]")).toBeVisible();
  await expect(dialog.locator("[data-player-store-confirm]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(purchase).toBeFocused();
});

test("limit-order interface remains visible and sends no unsupported order", async ({ page }) => {
  await openTerminal(page, "market");
  const form = page.locator('form[data-player-form="market-order"]');
  await form.locator('select[name="orderType"]').selectOption("limit");
  await form.locator('input[name="quantity"]').fill("3");
  await form.locator('input[name="limitPrice"]').fill("12.50");
  await form.locator('button[type="submit"]').click();
  const dialog = page.getByRole("dialog", { name: /limit order/i });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("BACKEND INTEGRATION PENDING");
  await expect(dialog).toContainText("No order was sent");
  await expect(dialog.locator("[data-player-market-order-confirm]")).toHaveCount(0);
});

test("mobile viewport has no page-level horizontal overflow", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "Mobile reflow is covered by the mobile Chromium project.");
  await openTerminal(page, "dashboard");
  const overflow = await horizontalOverflow(page);
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
  await expect(page.locator(".player-terminal-mobile-nav")).toBeVisible();
});

test("zoom-equivalent narrow layout preserves reflow and critical controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Zoom-equivalent reflow is covered once in desktop Chromium.");
  await page.setViewportSize({ width: 640, height: 900 });
  await openTerminal(page, "contracts");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await expect(page.getByRole("heading", { name: "Contracts" })).toBeVisible();
  await expect(page.locator(".player-terminal-mobile-nav")).toBeVisible();
  const overflow = await horizontalOverflow(page);
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
  const clippedControls = await page.locator("button:visible").evaluateAll((buttons) => buttons.filter((button) => button.scrollWidth > button.clientWidth + 2 && getComputedStyle(button).whiteSpace !== "nowrap").length);
  expect(clippedControls).toBe(0);
});
