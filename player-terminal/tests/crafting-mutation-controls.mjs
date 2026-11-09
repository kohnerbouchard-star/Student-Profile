import assert from "node:assert/strict";

import { renderCraftingPage } from "../src/pages/crafting-page.js";

const equipmentKey = `eqp_${"a".repeat(32)}`;
const data = {
  inventory: {
    items: [{
      itemKey: "connected-effect-token",
      name: "Connected Effect Token",
      category: "Consumable",
      quantityAvailable: 2,
      availableActions: ["inventory.use"],
    }, {
      itemKey: "ordinary-material",
      name: "Ordinary Material",
      category: "Material",
      quantityAvailable: 5,
      availableActions: [],
    }],
  },
  crafting: {
    workshopLevel: "Tier 1",
    workshopNote: "Server-authoritative deterministic fabrication",
    materialSlotsUsed: 2,
    materialSlotsMax: 999,
    recipes: [{
      id: "recipe.connected",
      name: "Connected Output",
      category: "utility",
      duration: "1 min",
      description: "Approved recipe.",
      enabled: true,
      unlockStatus: "Unlocked",
      ingredients: [{ itemKey: "ordinary-material", name: "Ordinary Material", owned: 5, required: 1 }],
      outputQuantity: 1,
      effect: "Connected output",
      requiredWorkshop: "Tier 1",
      maxCraft: 5,
      image: "",
    }],
    queue: [],
    equipment: [{
      id: equipmentKey,
      equipmentKey,
      name: "Connected Equipment",
      slot: "",
      allowedSlot: "utility",
      status: "active",
    }],
    effects: [],
    effectHistory: [],
  },
};

const markup = renderCraftingPage(data, { craftingRecipeId: "recipe.connected" });
for (const endpoint of ["craftItem", "equipmentEquip", "itemSalvage", "itemEffectUse"]) {
  assert.match(markup, new RegExp(`data-endpoint="${endpoint}"`), `missing ${endpoint} control`);
}
assert.match(markup, new RegExp(`name="equipmentKey" value="${equipmentKey}"`));
assert.match(markup, /name="slot" value="utility"/);
assert.match(markup, /name="itemKey" value="connected-effect-token"/);
assert.doesNotMatch(markup, /name="itemKey" value="ordinary-material"/);
assert.doesNotMatch(markup, /playerUuid|playerId|gameSessionId|ownerPlayerId|recipientPlayerUuid/);

const equippedMarkup = renderCraftingPage({
  ...data,
  crafting: {
    ...data.crafting,
    equipment: [{
      ...data.crafting.equipment[0],
      slot: "utility",
    }],
  },
}, { craftingRecipeId: "recipe.connected" });
assert.match(equippedMarkup, /data-endpoint="equipmentEquip"/);
assert.doesNotMatch(equippedMarkup, /data-endpoint="itemSalvage"/);

const legacyTokenMarkup = renderCraftingPage({
  ...data,
  inventory: {
    items: [{
      ...data.inventory.items[0],
      availableActions: ["use"],
    }],
  },
}, { craftingRecipeId: "recipe.connected" });
assert.doesNotMatch(legacyTokenMarkup, /data-endpoint="itemEffectUse"/);

console.log("Crafting renders public-key equip, salvage, and server-approved effect-use controls without ownership fields.");

// Recipe availability is independent of already-owned jobs, equipment and effects.
const retainedCrafting = {
  ...data.crafting,
  recipes: [],
  queue: [
    { jobKey: "cft_" + "b".repeat(32), name: "Running job", quantity: 1, status: "in_progress", canCancel: true, canClaim: false },
    { jobKey: "cft_" + "c".repeat(32), name: "Completed job", quantity: 1, status: "completed", canCancel: false, canClaim: true },
    { jobKey: "cft_" + "d".repeat(32), name: "Locked job", quantity: 1, status: "in_progress", canCancel: false, canClaim: false },
  ],
  effects: [{ summary: "Retained active effect", status: "active", stackCount: 1 }],
  effectHistory: [{ summary: "Retained effect history", action: "applied", createdAt: "2026-11-09" }],
};
for (const recipes of [[], undefined, null]) {
  const emptyRecipes = renderCraftingPage({ ...data, crafting: { ...retainedCrafting, recipes } }, { craftingRecipeId: "removed.recipe" });
  assert.match(emptyRecipes, /No recipes available/);
  assert.doesNotMatch(emptyRecipes, /data-endpoint="craftItem"|data-player-crafting-recipe=/);
  for (const endpoint of ["craftCancel", "craftClaim", "equipmentEquip", "itemSalvage", "itemEffectUse"]) {
    assert.match(emptyRecipes, new RegExp(`data-endpoint="${endpoint}"`));
  }
  assert.equal((emptyRecipes.match(/data-endpoint="craftCancel"/g) || []).length, 1);
  assert.equal((emptyRecipes.match(/data-endpoint="craftClaim"/g) || []).length, 1);
  assert.match(emptyRecipes, /3 jobs/);
  assert.match(emptyRecipes, /Retained active effect/);
  assert.match(emptyRecipes, /Retained effect history/);
  assert.doesNotMatch(emptyRecipes, /playerUuid|playerId|gameSessionId|ownerPlayerId|recipientPlayerUuid/);
}
const idleMarkup = renderCraftingPage({ crafting: { ...data.crafting, recipes: [], queue: [], equipment: [] } }, {});
assert.match(idleMarkup, /No items are currently being fabricated/);
assert.match(idleMarkup, /No crafted equipment is available/);
assert.doesNotMatch(idleMarkup, /data-endpoint=/);
const restoredMarkup = renderCraftingPage(data, { craftingRecipeId: "removed.recipe" });
assert.match(restoredMarkup, /data-recipe-id="recipe.connected"/);
assert.match(renderCraftingPage({}, {}), /No recipes available/);
console.log("Empty recipe catalogs preserve independent queue, equipment, effect and history controls; recipe restoration remains usable.");
