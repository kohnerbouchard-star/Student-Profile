import { expect, test } from "@playwright/test";

async function openProgression(page) {
  await page.goto("/?preview=1#progression");
  await expect(page.locator(".player-terminal-progression-page")).toBeVisible();
}

test("Progression renders bounded public data without page overflow", async ({ page }) => {
  await openProgression(page);
  await expect(page.getByRole("heading", { name: "Progression" })).toBeVisible();
  await expect(page.locator(".player-terminal-level-orb")).toHaveText(/\d+/);
  await expect(page.getByRole("progressbar", { name: "Level progress" })).toBeVisible();
  await expect(page.getByText(/Next at [\d,]+ XP|Maximum level reached/)).toBeVisible();
  await expect(page.getByText("SKILL POINTS")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Progression tabs, requirements, and command controls remain keyboard reachable", async ({ page }) => {
  await openProgression(page);
  const skillsTab = page.getByRole("tab", { name: "Skills" });
  await skillsTab.focus();
  await page.keyboard.press("Enter");
  await expect(skillsTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".player-terminal-skills-panel")).toBeVisible();
  await expect(page.getByText("No guaranteed economic return").first()).toBeVisible();
  await expect(page.getByText(/Requires |No prerequisite skill/).first()).toBeVisible();
  const unlock = page.locator("[data-player-skill-unlock]").first();
  await expect(unlock).toBeVisible();

  const achievementsTab = page.getByRole("tab", { name: "Achievements" });
  await achievementsTab.focus();
  await page.keyboard.press("Enter");
  await expect(achievementsTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".player-terminal-achievements-panel")).toBeVisible();
});
