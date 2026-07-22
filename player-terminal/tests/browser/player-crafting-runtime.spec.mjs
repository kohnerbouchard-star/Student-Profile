import { expect, test } from "@playwright/test";

const crafting = {
  workshopLevel: "Tier 1",
  workshopNote: "Server-authoritative deterministic fabrication",
  materialSlotsUsed: 2,
  materialSlotsMax: 999,
  durabilitySupported: false,
  repairSupported: false,
  recipes: [{
    id: "recipe.field_filter",
    recipeKey: "recipe.field_filter",
    name: "Field Filter",
    category: "utility",
    duration: "3 min",
    description: "A bounded approved recipe.",
    unlockStatus: "Unlocked",
    enabled: true,
    ingredients: [
      { itemKey: "fiber", name: "Fiber", owned: 4, required: 2 },
      { itemKey: "carbon", name: "Carbon", owned: 2, required: 1 },
    ],
    outputs: [{ itemKey: "field_filter", quantity: 1, outputKind: "equipment" }],
    outputQuantity: 1,
    effect: "Field Filter",
    requiredWorkshop: "Tier 1",
    maxCraft: 2,
    image: "",
  }],
  queue: [{
    id: "cft_00000000000000000000000000000001",
    jobKey: "cft_00000000000000000000000000000001",
    recipeKey: "recipe.field_filter",
    name: "Field Filter",
    quantity: 1,
    status: "in_progress",
    remaining: "2 min",
    remainingSeconds: 120,
    progress: 40,
    canCancel: true,
    canClaim: false,
  }, {
    id: "cft_00000000000000000000000000000002",
    jobKey: "cft_00000000000000000000000000000002",
    recipeKey: "recipe.field_filter",
    name: "Field Filter",
    quantity: 1,
    status: "completed",
    remaining: "Ready",
    remainingSeconds: 0,
    progress: 100,
    canCancel: false,
    canClaim: true,
  }],
  equipment: [],
  effects: [],
  effectHistory: [],
};

async function render(page) {
  await page.goto("/#crafting");
  await page.evaluate(async (craftingData) => {
    const { renderCraftingPage } = await import("/src/pages/crafting-page.js");
    const mount = document.getElementById("playerTerminal");
    if (!(mount instanceof HTMLElement)) {
      throw new Error("Crafting browser fixture requires #playerTerminal.");
    }
    mount.innerHTML = renderCraftingPage(
      { crafting: craftingData },
      { craftingRecipeId: "recipe.field_filter" },
    );
  }, crafting);
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`crafting surface remains bounded and keyboard-operable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await render(page);

    const surface = page.locator(".player-terminal-crafting-page");
    await expect(surface).toBeVisible();
    await expect(surface.getByRole("heading", { name: "Crafting" })).toBeVisible();
    await expect(surface.getByRole("button", { name: /Field Filter/i }).first()).toBeVisible();
    await expect(surface.getByRole("spinbutton", { name: "QUANTITY" })).toHaveValue("1");
    await expect(surface.getByRole("button", { name: /Craft item/i })).toBeEnabled();
    await expect(surface.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(surface.getByRole("button", { name: "Claim output" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/durability|repair/i);
    await expect(page.locator("body")).not.toContainText(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );

    const controls = surface.locator("button:not([disabled]), input:not([type=hidden])");
    const controlCount = await controls.count();
    expect(controlCount).toBeGreaterThanOrEqual(5);
    await controls.first().focus();
    for (let index = 0; index < controlCount; index += 1) {
      await expect(page.locator(":focus")).toBeVisible();
      await page.keyboard.press("Tab");
    }

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
  });
}
