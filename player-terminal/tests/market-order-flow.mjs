import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { renderMarketOrderDialog } from "../src/features/market/market-order-flow.js";

const asset = {
  id: "00000000-0000-4000-8000-000000000101",
  symbol: "NOV",
  name: "Novaria Industries",
  price: 25,
  owned: 12
};

const review = renderMarketOrderDialog({
  stage: "review",
  asset,
  side: "buy",
  orderType: "market",
  quantity: 4,
  estimatedGross: 100,
  availableCashLabel: "ECO 500",
  currencyCode: "ECO",
  error: ""
});
assert.ok(review.includes("MARKET ORDER REVIEW"));
assert.ok(review.includes("CONFIRMATION REQUIRED"));
assert.ok(review.includes("Current price and gross value are estimates"));
assert.ok(review.includes("data-player-market-order-confirm"));
assert.ok(!review.includes("playerSessionId"));
assert.ok(!review.includes(asset.id), "The review must not expose the internal stock asset identifier.");

const limit = renderMarketOrderDialog({
  stage: "limit-pending",
  asset,
  side: "buy",
  orderType: "limit",
  quantity: 4,
  limitPrice: 23,
  currencyCode: "ECO"
});
assert.ok(limit.includes("LIMIT ORDER"));
assert.ok(limit.includes("BACKEND INTEGRATION PENDING"));
assert.ok(limit.includes("No order was sent"));
assert.ok(!limit.includes("data-player-market-order-confirm"), "Limit orders must remain visible without executing against an unsupported backend route.");

const receipt = renderMarketOrderDialog({
  stage: "receipt",
  asset,
  side: "buy",
  quantity: 4,
  currencyCode: "ECO",
  receipt: {
    order: {
      ticker: "NOV",
      side: "buy",
      quantity: 4,
      executionPrice: 25.1,
      grossValue: 100.4,
      status: "filled",
      rejectionReason: null
    },
    cash: { accountType: "cash", currencyCode: "ECO", balance: 399.6 },
    holding: { quantity: 16, averageCost: 24.8 }
  },
  refreshWarning: ""
});
assert.ok(receipt.includes("ORDER RECEIPT"));
assert.ok(receipt.includes("FILLED"));
assert.ok(receipt.includes("ECO 25.1"));
assert.ok(receipt.includes("16 shares"));
assert.ok(!receipt.includes("ORDER ID"), "Player receipts must not depend on internal order identifiers.");
assert.ok(!receipt.includes(asset.id), "Player receipts must not expose the internal stock asset identifier.");

const refreshPending = renderMarketOrderDialog({
  stage: "receipt",
  asset,
  side: "sell",
  quantity: 2,
  currencyCode: "ECO",
  receipt: {
    order: { ticker: "NOV", side: "sell", quantity: 2, executionPrice: 25, grossValue: 50, status: "filled" },
    cash: { currencyCode: "ECO", balance: 550 },
    holding: { quantity: 10, averageCost: 24 }
  },
  refreshWarning: "Order completed, refresh pending."
});
assert.ok(refreshPending.includes("FILLED · REFRESH PENDING"));
assert.ok(refreshPending.includes("Order completed, refresh pending."));

const source = await readFile(new URL("../src/features/market/market-order-flow.js", import.meta.url), "utf8");
const routeWrapper = await readFile(new URL("../src/api/backend-routes.js", import.meta.url), "utf8");
const routeCore = await readFile(new URL("../src/api/backend-routes-core.js", import.meta.url), "utf8");
const routes = `${routeWrapper}\n${routeCore}`;
const main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
assert.ok(main.includes("installMarketOrderFlow"));
assert.ok(source.includes('addEventListener("submit", handleSubmit, true)'), "Market submission must intercept the legacy direct-submit controller.");
assert.ok(source.includes('api.execute("marketOrder"'));
assert.ok(source.includes("ticker: transaction.asset.symbol"), "Market orders must submit a public ticker.");
assert.ok(source.includes("expectedPrice: Number(transaction.asset.price)"), "Market orders must submit the reviewed price for stale-price protection.");
assert.ok(source.includes('orderType: "market"'), "The current backend request must execute market orders only.");
assert.ok(source.includes("BACKEND INTEGRATION PENDING"), "Limit-order controls must remain present while backend support is pending.");
assert.ok(source.includes("await terminal.refresh()"));
assert.ok(source.includes("The order completed, but current balances, holdings, and market data could not be refreshed"), "Committed orders must remain successful when refresh fails.");
assert.ok(!source.includes("playerUuid") && !source.includes("recipientPlayerUuid"));
assert.ok(routeWrapper.includes("resolveCoreBackendRequest"), "Messaging must layer over the preserved core route registry.");
assert.ok(routes.includes("ticker:"));
assert.ok(routes.includes("expectedPrice"));
assert.ok(!routes.includes("stockAssetId:"), "The connected Player route must not submit the internal stock asset identifier.");

console.log("Market order flow passed: ticker-only review, stale-price guard, market-only settlement, limit-order preservation, UUID-private receipts, committed-success refresh behavior, and layered route registry are valid.");
