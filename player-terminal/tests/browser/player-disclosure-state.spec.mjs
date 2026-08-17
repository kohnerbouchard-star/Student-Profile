import { expect, test } from "@playwright/test";

async function openBanking(page) {
  await page.goto("/#banking");
  await expect(page.locator(".player-terminal-banking-page")).toBeVisible();
  await expect(page.locator('form[data-endpoint="bankTransfer"]')).toHaveCount(1);
}

test("Banking disclosure state survives live Player rerenders without exposing closed forms", async ({ page }) => {
  await openBanking(page);

  const details = page.locator('form[data-endpoint="bankTransfer"]').locator("xpath=ancestor::details[1]");
  const recipient = page.locator('form[data-endpoint="bankTransfer"] input[name="recipientPlayerIdentifier"]');

  await expect(details).not.toHaveAttribute("open", "");
  await expect(recipient).toBeHidden();

  await details.evaluate((element) => { element.open = true; });
  await expect(recipient).toBeVisible();

  await page.evaluate(() => globalThis.Econovaria.playerTerminal.requestRender());
  await expect(page.locator('form[data-endpoint="bankTransfer"] input[name="recipientPlayerIdentifier"]')).toBeVisible();
  expect(await page.locator('form[data-endpoint="bankTransfer"]').locator("xpath=ancestor::details[1]").evaluate((element) => element.open)).toBe(true);

  await page.locator('form[data-endpoint="bankTransfer"]').locator("xpath=ancestor::details[1]").evaluate((element) => { element.open = false; });
  await expect(page.locator('form[data-endpoint="bankTransfer"] input[name="recipientPlayerIdentifier"]')).toBeHidden();

  await page.evaluate(() => globalThis.Econovaria.playerTerminal.requestRender());
  await expect(page.locator('form[data-endpoint="bankTransfer"] input[name="recipientPlayerIdentifier"]')).toBeHidden();
  expect(await page.locator('form[data-endpoint="bankTransfer"]').locator("xpath=ancestor::details[1]").evaluate((element) => element.open)).toBe(false);
});
