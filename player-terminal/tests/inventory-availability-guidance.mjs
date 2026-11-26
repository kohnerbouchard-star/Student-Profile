import assert from "node:assert/strict";
import { test } from "node:test";
import { inventoryAvailabilityGuidance, renderInventoryPage } from "../src/pages/inventory-page.js";
import { previewData } from "../src/data/preview-data.js";

const holding = (overrides = {}) => ({ quantityAvailable: 2, quantityReserved: 0, availableActions: [], ...overrides });

test("unreserved quantity does not promise an unsupported action", () => {
  assert.match(inventoryAvailabilityGuidance(holding()), /no use or redemption action is offered here/);
  assert.match(inventoryAvailabilityGuidance(holding({ availableActions: ["inventory.sell"] })), /no use or redemption action/);
});

test("reserved and partially reserved holdings explain unavailable units without inventing a destination", () => {
  for (const quantityAvailable of [0, 2]) {
    const text = inventoryAvailabilityGuidance(holding({ quantityAvailable, quantityReserved: 3 }));
    assert.match(text, /Reserved units are committed to another action/);
    assert.doesNotMatch(text, /Crafting|Marketplace|Contract/);
    if (quantityAvailable === 0) assert.match(text, /No units are currently available/);
  }
});

test("zero available quantity takes precedence over published actions", () => {
  const text = inventoryAvailabilityGuidance(holding({ quantityAvailable: 0, availableActions: ["inventory.use", "inventory.redeem"] }));
  assert.match(text, /No units are currently available/);
  assert.doesNotMatch(text, /Use applies|teacher review/);
});

test("direct use aliases and redemption match the existing control precedence", () => {
  for (const action of ["use", "inventory.use"]) {
    assert.match(inventoryAvailabilityGuidance(holding({ availableActions: [action, "inventory.redeem"] })), /Use applies to available units only/);
  }
  assert.match(inventoryAvailabilityGuidance(holding({ availableActions: ["inventory.redeem"] })), /teacher review; a request is not confirmed fulfillment/);
});

test("unavailable quantity details do not invent availability", () => {
  for (const value of [undefined, null, NaN, Infinity, -1, "bad"]) {
    assert.match(inventoryAvailabilityGuidance(holding({ quantityAvailable: value })), /Refresh before taking action/);
    assert.match(inventoryAvailabilityGuidance(holding({ quantityReserved: value })), /Refresh before taking action/);
  }
  assert.match(inventoryAvailabilityGuidance(holding({ availableActions: null })), /no use or redemption action/);
});

test("page renders guidance without changing supported control keys or adding reservation links", () => {
  const data = structuredClone(previewData);
  data.inventory.items = [{
    ...data.inventory.items[0], ...holding({ quantityReserved: 1, availableActions: ["inventory.redeem"] }),
    id: "safe-holding", description: "<script>bad</script>"
  }];
  const html = renderInventoryPage(data, { inventoryCategory: "All" });
  assert.match(html, /Reserved units are committed to another action/);
  assert.match(html, /a request is not confirmed fulfillment/);
  assert.match(html, /data-player-inventory-redeem="safe-holding"/);
  assert.ok(html.includes("&lt;script&gt;bad&lt;/script&gt;"));
  assert.ok(!html.includes("<script>bad</script>"));
  assert.ok(!html.includes("data-player-inventory-effect-use"));
});
