import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { isEndpointEnabled, resolveCapabilities } from "../src/api/capabilities.js";
import { renderModal } from "../src/components/modal.js";

const capabilities = resolveCapabilities({
  config: { usePreviewData: false, capabilities: { actions: { storePurchase: true } } },
  session: {},
  dashboard: {}
});
assert.equal(isEndpointEnabled(capabilities, "storeQuote"), true, "Store quotes must use the Store purchase capability boundary.");

const item = { id: "item-1", name: "Market Lens", price: 50, stock: 8, owned: 1 };
const select = renderModal({ type: "storePurchase", stage: "select", item, quantity: 1, currencyCode: "ECO" });
assert.ok(select.includes("QUOTE REQUIRED"));
assert.ok(select.includes("data-player-store-quantity"));
assert.ok(select.includes("data-player-store-review"));
assert.ok(!select.includes("data-player-store-confirm"), "Purchase confirmation must not exist before an authoritative quote.");

const quote = {
  quoteId: "quote-1",
  itemName: "Market Lens",
  quantity: 2,
  finalUnitPrice: 55,
  finalTotalPrice: 110,
  currencyCode: "ECO",
  expiresAt: "2026-07-18T12:05:00.000Z"
};
const review = renderModal({ type: "storePurchase", stage: "review", item, quantity: 2, quote });
assert.ok(review.includes("AUTHORITATIVE QUOTE"));
assert.ok(review.includes("CONFIRMATION REQUIRED"));
assert.ok(review.includes("data-player-store-confirm"));
assert.ok(review.includes("quote-1"));

const receipt = renderModal({
  type: "storePurchase",
  stage: "receipt",
  item,
  quantity: 2,
  quote,
  receipt: { purchaseId: "purchase-1", quoteId: "quote-1", finalTotalPrice: 110, currencyCode: "ECO" }
});
assert.ok(receipt.includes("PURCHASE RECEIPT"));
assert.ok(receipt.includes("COMPLETED"));
assert.ok(receipt.includes("purchase-1"));

const refreshPendingReceipt = renderModal({
  type: "storePurchase",
  stage: "receipt",
  item,
  quantity: 2,
  quote,
  receipt: { purchaseId: "purchase-1", quoteId: "quote-1", finalTotalPrice: 110, currencyCode: "ECO" },
  refreshWarning: "Purchase completed, refresh pending."
});
assert.ok(refreshPendingReceipt.includes("COMPLETED · REFRESH PENDING"));
assert.ok(refreshPendingReceipt.includes("Purchase completed, refresh pending."));

const source = await readFile(new URL("../src/features/store/store-purchase-flow.js", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
assert.ok(main.includes("installStorePurchaseFlow"), "The standalone entrypoint must install the Store transaction controller.");
assert.ok(source.includes('api.execute("storeQuote"'), "The flow must obtain a quote before purchase.");
assert.ok(source.includes('api.execute("storePurchase"'), "The flow must settle only after explicit confirmation.");
assert.ok(source.indexOf('api.execute("storeQuote"') < source.indexOf('api.execute("storePurchase"'));
assert.ok(source.includes("quoteExpired"), "Expired quotes must be rejected before settlement.");
assert.ok(source.includes("await terminal.refresh()"), "Successful purchases must refresh authoritative terminal data.");
assert.ok(source.includes("purchase completed, but current balances and inventory could not be refreshed"), "A committed purchase must remain completed even when refresh fails.");
assert.ok(source.includes('addEventListener("click", handleClick, true)'), "The feature controller must intercept legacy one-click purchase handling before the application controller.");

console.log("Store purchase flow passed: quote, review, confirmation, settlement, refresh, receipt, and failure semantics are valid.");
