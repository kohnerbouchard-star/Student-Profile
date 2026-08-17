import { expect, test } from "@playwright/test";

async function openBanking(page) {
  await page.goto("/#banking");
  await expect(page.locator(".player-terminal-banking-page")).toBeVisible();
  await expect(page.locator('form[data-endpoint="bankTransfer"]')).toHaveCount(1);
}

test("Banking disclosure state survives live Player rerenders and releases its refresh guard after completion", async ({ page }) => {
  await openBanking(page);

  const transferForm = page.locator('form[data-endpoint="bankTransfer"]');
  const details = transferForm.locator("xpath=ancestor::details[1]");
  const recipient = transferForm.locator('input[name="recipientPlayerIdentifier"]');

  await expect(details).not.toHaveAttribute("open", "");
  await expect(recipient).toBeHidden();

  await details.evaluate((element) => { element.open = true; });
  await expect(recipient).toBeVisible();

  await page.evaluate(() => globalThis.Econovaria.playerTerminal.requestRender());
  const rerenderedForm = page.locator('form[data-endpoint="bankTransfer"]');
  const rerenderedDetails = rerenderedForm.locator("xpath=ancestor::details[1]");
  await expect(rerenderedForm.locator('input[name="recipientPlayerIdentifier"]')).toBeVisible();
  expect(await rerenderedDetails.evaluate((element) => element.open)).toBe(true);

  const submit = rerenderedForm.locator('button[type="submit"]');
  await submit.focus();
  await submit.evaluate((button) => {
    const label = document.createElement("span");
    label.textContent = "Completed";
    button.replaceChildren(label);
  });

  await expect(rerenderedDetails).not.toHaveAttribute("open", "");
  await expect(rerenderedForm.locator('input[name="recipientPlayerIdentifier"]')).toBeHidden();
  await expect(rerenderedDetails.locator("summary")).toBeFocused();

  await page.evaluate(() => globalThis.Econovaria.playerTerminal.requestRender());
  const completedForm = page.locator('form[data-endpoint="bankTransfer"]');
  const completedDetails = completedForm.locator("xpath=ancestor::details[1]");
  await expect(completedForm.locator('input[name="recipientPlayerIdentifier"]')).toBeHidden();
  expect(await completedDetails.evaluate((element) => element.open)).toBe(false);
});
