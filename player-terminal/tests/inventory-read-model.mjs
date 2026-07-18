import assert from "node:assert/strict";

import { resolvePlayerBackendRequest } from "../src/api/backend-routes.js";
import { normalizePlayerInventory } from "../src/features/inventory/inventory-read-model.js";
import { renderInventoryPage } from "../src/pages/inventory-page.js";
import { previewData } from "../src/data/preview-data.js";

const response = {
  ok: true,
  gameSession: { id: "game-1", name: "Econovaria", status: "active" },
  player: {
    id: "0c80fe6d-e1d9-4e90-90f4-1b174be727f1",
    displayName: "Alex Rivera",
    rosterLabel: "Team A",
    status: "active"
  },
  generatedAt: "2026-07-18T12:00:00.000Z",
  capacity: null,
  categories: ["Consumables", "Equipment"],
  summary: {
    itemTypes: 3,
    quantityOwned: 9,
    quantityReserved: 2,
    quantityAvailable: 7,
    values: [
      { currencyCode: "ECO", totalOwnedValue: 100 },
      { currencyCode: "LUM", totalOwnedValue: 30 }
    ]
  },
  items: [
    {
      id: "holding-consumable",
      storeItemId: "item-consumable",
      itemKey: "energy-cell-pack",
      name: "Energy Cell Pack",
      description: "Restores field equipment.",
      category: "Consumables",
      quantityOwned: 5,
      quantityReserved: 2,
      quantityAvailable: 3,
      unitValue: 10,
      totalOwnedValue: 50,
      currencyCode: "ECO",
      itemStatus: "active",
      itemVisibility: "player",
      availableActions: [],
      createdAt: "2026-07-17T12:00:00.000Z",
      updatedAt: "2026-07-18T12:00:00.000Z"
    },
    {
      id: "holding-usable",
      storeItemId: "item-usable",
      itemKey: "priority-processing-token",
      name: "Priority Processing Token",
      description: "Authoritatively usable test item.",
      category: "Consumables",
      quantityOwned: 1,
      quantityReserved: 0,
      quantityAvailable: 1,
      unitValue: 50,
      totalOwnedValue: 50,
      currencyCode: "ECO",
      itemStatus: "active",
      itemVisibility: "player",
      availableActions: ["use"],
      createdAt: "2026-07-17T12:00:00.000Z",
      updatedAt: "2026-07-18T12:00:00.000Z"
    },
    {
      id: "holding-equipment",
      storeItemId: "item-equipment",
      itemKey: "market-lens",
      name: "Market Lens",
      description: "Market analysis equipment.",
      category: "Equipment",
      quantityOwned: 3,
      quantityReserved: 0,
      quantityAvailable: 3,
      unitValue: 10,
      totalOwnedValue: 30,
      currencyCode: "LUM",
      itemStatus: "active",
      itemVisibility: "player",
      availableActions: [],
      createdAt: "2026-07-17T12:00:00.000Z",
      updatedAt: "2026-07-18T12:00:00.000Z"
    }
  ]
};

const inventory = normalizePlayerInventory(response);
assert.equal(inventory.items.length, 3);
assert.equal(inventory.items[0].quantityOwned, 5);
assert.equal(inventory.items[0].quantityReserved, 2);
assert.equal(inventory.items[0].quantityAvailable, 3);
assert.equal(inventory.items[0].state, "Partially Reserved");
assert.deepEqual(inventory.items[0].availableActions, []);
assert.deepEqual(inventory.items[1].availableActions, ["use"]);
assert.equal(inventory.items[2].currencyCode, "LUM");
assert.equal(inventory.capacity, null);
assert.equal(inventory.summary.quantityAvailable, 7);
assert.ok(!JSON.stringify(inventory).includes("0c80fe6d-e1d9-4e90-90f4-1b174be727f1"), "The canonical player UUID must not be copied into the UI inventory model.");

const data = structuredClone(previewData);
data.inventory = inventory;
data.session.currencyCode = "ECO";
const html = renderInventoryPage(data, { inventoryCategory: "All" });
assert.ok(html.includes("Server managed"));
assert.ok(html.includes("NO PLAYER LIMIT"));
assert.ok(html.includes("AVAILABLE UNITS"));
assert.ok(html.includes(">7<"));
assert.ok(html.includes("RESERVED UNITS"));
assert.ok(html.includes(">2<"));
assert.ok(html.includes("Partially Reserved"));
assert.ok(html.includes("ECO 50"));
assert.ok(html.includes("LUM 30"), "Inventory values must use each item’s authoritative currency code.");
assert.ok(!html.includes('data-player-inventory-use="holding-consumable"'), "Items without an authoritative availableActions policy must not expose use controls.");
assert.match(html, /data-player-inventory-use="holding-usable"(?![^>]*disabled)/, "Only an authoritative availableActions policy may enable item use.");
assert.ok(!html.includes('data-player-inventory-use="holding-equipment"'), "Equipment must not be inferred as usable from presentation state.");
assert.ok(html.includes("Item actions execute only when the backend publishes a supported policy"));

const route = resolvePlayerBackendRequest({
  endpointKey: "inventory",
  method: "GET",
  path: "/inventory",
  payload: {},
  params: {},
  session: { playerSessionToken: "token-1", gameSessionId: "game-1", playerSessionId: "session-1" }
});
assert.equal(route.method, "GET");
assert.equal(route.path, "/players/me/inventory");
assert.equal(route.payload, undefined);

console.log("Inventory read model passed: authoritative quantities, reservations, currencies, capability-gated actions, and UUID privacy are valid.");
