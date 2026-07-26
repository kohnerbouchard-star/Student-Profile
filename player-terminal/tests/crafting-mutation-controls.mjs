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
      availableActions: ["use"],
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
      allowedSlot: "tool",
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
assert.match(markup, /name="slot" value="tool"/);
assert.match(markup, /name="itemKey" value="connected-effect-token"/);
assert.doesNotMatch(markup, /name="itemKey" value="ordinary-material"/);
assert.doesNotMatch(markup, /playerUuid|playerId|gameSessionId|ownerPlayerId|recipientPlayerUuid/);

const equippedMarkup = renderCraftingPage({
  ...data,
  crafting: {
    ...data.crafting,
    equipment: [{
      ...data.crafting.equipment[0],
      slot: "tool",
    }],
  },
}, { craftingRecipeId: "recipe.connected" });
assert.match(equippedMarkup, /data-endpoint="equipmentEquip"/);
assert.doesNotMatch(equippedMarkup, /data-endpoint="itemSalvage"/);

console.log("Crafting renders public-key equip, salvage, and server-approved effect-use controls without ownership fields.");
