import { expect, test } from "@playwright/test";

async function openTerminal(page, route = "store") {
  await page.goto(`/#${route}`);
  await expect(page.locator("#player-main-content")).toBeVisible();
  await expect(page.locator(".player-terminal-page")).toBeVisible();
}

function recoveryRegion(page) {
  return page.locator("[data-player-recovery-region]");
}

test("offline recovery locks writes and online recovery restores them", async ({ page }) => {
  await openTerminal(page, "store");
  const purchase = page.locator("[data-player-purchase]:not([disabled])").first();
  await expect(purchase).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(recoveryRegion(page)).toBeVisible();
  await expect(recoveryRegion(page)).toHaveAttribute("data-player-recovery-state", "offline");
  await expect(recoveryRegion(page)).toHaveAttribute("role", "alert");
  await expect(purchase).toBeDisabled();
  await expect(purchase).toHaveAttribute("data-player-recovery-disabled", "true");

  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(recoveryRegion(page)).toHaveAttribute("data-player-recovery-state", "restored");
  await expect(purchase).toBeEnabled();
  await expect(recoveryRegion(page).getByRole("button", { name: "Refresh terminal" })).toBeVisible();
});

test("paused-game recovery survives route rerender and remains keyboard operable", async ({ page }) => {
  await openTerminal(page, "store");

  await page.evaluate(() => window.dispatchEvent(new CustomEvent("econovaria:player-recovery-signal", {
    detail: { code: "GAME_MUTATIONS_PAUSED" },
  })));
  await expect(recoveryRegion(page)).toHaveAttribute("data-player-recovery-state", "game-paused");
  await expect(recoveryRegion(page)).toContainText("Economic actions are temporarily paused");
  await expect(page.locator("[data-player-purchase]").first()).toBeDisabled();

  await page.evaluate(() => { window.location.hash = "contracts"; });
  await expect(page).toHaveURL(/#contracts$/);
  await expect(page.locator("#player-main-content")).toBeVisible();
  await expect(recoveryRegion(page)).toBeVisible();
  await expect(recoveryRegion(page)).toHaveAttribute("data-player-recovery-state", "game-paused");

  const retry = recoveryRegion(page).getByRole("button", { name: "Refresh terminal" });
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(recoveryRegion(page)).toHaveAttribute("data-player-recovery-state", "restored");
});

test("committed-write ambiguity tells the player not to submit twice", async ({ page }) => {
  await openTerminal(page, "store");

  await page.evaluate(() => window.dispatchEvent(new CustomEvent("econovaria:player-recovery-signal", {
    detail: { code: "COMMITTED_REFRESH_PENDING" },
  })));

  await expect(recoveryRegion(page)).toHaveAttribute("data-player-recovery-state", "committed-refresh-pending");
  await expect(recoveryRegion(page)).toContainText("The action was saved");
  await expect(recoveryRegion(page)).toContainText("Do not submit the action again");
  await expect(page.locator("[data-player-purchase]:not([disabled])").first()).toBeVisible();
});
