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

const fixtureDocument = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="/css/player-terminal-tokens.css" />
  <link rel="stylesheet" href="/css/player-terminal-foundation.css" />
  <link rel="stylesheet" href="/css/routes/player-terminal-shared-layout.css" />
  <link rel="stylesheet" href="/css/routes/player-terminal-shared-cards.css" />
  <link rel="stylesheet" href="/css/routes/player-terminal-shared-lists.css" />
  <link rel="stylesheet" href="/css/routes/player-terminal-shared-states.css" />
  <link rel="stylesheet" href="/css/routes/player-terminal-shared-details.css" />
  <link rel="stylesheet" href="/css/routes/player-terminal-shared-responsive.css" />
  <link rel="stylesheet" href="/css/routes/player-terminal-shared-overlays.css" />
  <link rel="stylesheet" href="/css/routes/player-terminal-dashboard.css" />
  <link rel="stylesheet" href="/css/player-terminal-interior-v2.css" />
  <link rel="stylesheet" href="/css/player-terminal-finance-v2.css" />
  <link rel="stylesheet" href="/css/player-terminal-communications-v2.css" />
  <link rel="stylesheet" href="/css/player-terminal-economy-items-v2.css" />
  <link rel="stylesheet" href="/css/player-terminal-operations-v2.css" />
  <link rel="stylesheet" href="/css/player-terminal-world-v2.css" />
</head>
<body>
  <main id="playerTerminal" data-player-terminal-root="true" aria-label="Econovaria player terminal"></main>
</body>
</html>`;

async function render(page, craftingData = crafting) {
  await page.route("**/__crafting-component-fixture", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixtureDocument,
    });
  });
  await page.goto("/__crafting-component-fixture");
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
  }, craftingData);
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

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`empty recipes retain owned workshop controls on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const retained = {
      ...crafting,
      recipes: [],
      equipment: [{ equipmentKey: "eqp_" + "a".repeat(32), name: "Retained Filter", allowedSlot: "utility", slot: "" }],
      effects: [{ summary: "Retained active effect", status: "active", stackCount: 1 }],
      effectHistory: [{ summary: "Retained effect history", action: "applied", createdAt: "2026-11-09" }],
    };
    await render(page, retained);
    const surface = page.locator(".player-terminal-crafting-page");
    await expect(surface.getByText("No recipes available", { exact: true })).toBeVisible();
    await expect(surface.locator('[data-endpoint="craftItem"]')).toHaveCount(0);
    await expect(surface.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await expect(surface.getByRole("button", { name: "Claim output" })).toBeVisible();
    await expect(surface.getByRole("button", { name: "Equip · utility" })).toBeVisible();
    await expect(surface.getByRole("button", { name: "Salvage", exact: true })).toBeVisible();
    await expect(surface.getByText("Retained active effect", { exact: true })).toBeVisible();
    await expect(surface.getByText("Retained effect history", { exact: true })).toBeVisible();
    // Use native keyboard submission to prove the retained public-key forms are usable.
    await page.evaluate(() => {
      window.workshopSubmissions = [];
      document.addEventListener("submit", (event) => {
        event.preventDefault();
        window.workshopSubmissions.push({ endpoint: event.target.dataset.endpoint, fields: Object.fromEntries(new FormData(event.target)) });
      });
    });
    for (const name of ["Cancel", "Claim output", "Equip · utility", "Salvage"]) {
      await surface.getByRole("button", { name, exact: true }).focus();
      await page.keyboard.press("Enter");
    }
    expect(await page.evaluate(() => window.workshopSubmissions)).toEqual([
      { endpoint: "craftCancel", fields: { jobKey: crafting.queue[0].jobKey } },
      { endpoint: "craftClaim", fields: { jobKey: crafting.queue[1].jobKey } },
      { endpoint: "equipmentEquip", fields: { equipmentKey: retained.equipment[0].equipmentKey, slot: "utility" } },
      { endpoint: "itemSalvage", fields: { equipmentKey: retained.equipment[0].equipmentKey } },
    ]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    // A later read can restore recipes even when the previously selected ID vanished.
    await page.evaluate(async (data) => {
      const { renderCraftingPage } = await import("/src/pages/crafting-page.js");
      document.getElementById("playerTerminal").innerHTML = renderCraftingPage({ crafting: data }, { craftingRecipeId: "removed.recipe" });
    }, crafting);
    await expect(surface.getByRole("button", { name: /Craft item/i })).toBeEnabled();
    await expect(surface.locator('[data-player-crafting-recipe="recipe.field_filter"]')).toHaveClass(/active/);
    await expect(surface.getByText("No recipes available", { exact: true })).toHaveCount(0);
  });
}
