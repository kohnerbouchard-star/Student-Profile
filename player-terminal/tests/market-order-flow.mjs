import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildMarketOrderConfirmation,
  buildMarketOrderReview,
  buildMarketOrderResult,
} from "../src/features/market/market-order-flow.js";

const asset = {
  symbol: "AUR",
  name: "Aurelia Systems",
  price: 24.75,
};

const buyReview = buildMarketOrderReview({
  asset,
  side: "buy",
  quantity: 3,
  orderType: "market",
});
assert.equal(buyReview.side, "buy");
assert.equal(buyReview.quantity, 3);
assert.equal(buyReview.ticker, "AUR");
assert.equal(buyReview.expectedPrice, 24.75);
assert.equal(buyReview.estimatedValue, 74.25);
assert.equal(buyReview.orderType, "market");
assert.equal(buyReview.backendSupported, true);
assert.equal(buyReview.requiresConfirmation, true);
assert.equal("stockAssetId" in buyReview, false);

const sellReview = buildMarketOrderReview({
  asset,
  side: "sell",
  quantity: 2,
  orderType: "market",
});
assert.equal(sellReview.estimatedValue, 49.5);
assert.equal(sellReview.backendSupported, true);

const limitReview = buildMarketOrderReview({
  asset,
  side: "buy",
  quantity: 1,
  orderType: "limit",
  limitPrice: 20,
});
assert.equal(limitReview.backendSupported, false);
assert.equal(limitReview.orderType, "limit");
assert.equal(limitReview.limitPrice, 20);

assert.throws(() => buildMarketOrderReview({ asset, side: "buy", quantity: 0, orderType: "market" }), /quantity/i);
assert.throws(() => buildMarketOrderReview({ asset, side: "hold", quantity: 1, orderType: "market" }), /side/i);
assert.throws(() => buildMarketOrderReview({ asset: { ...asset, symbol: "" }, side: "buy", quantity: 1, orderType: "market" }), /ticker/i);

const confirmation = buildMarketOrderConfirmation(buyReview);
assert.ok(confirmation.includes("AUR"));
assert.ok(confirmation.includes("3"));
assert.ok(confirmation.includes("24.75"));
assert.ok(confirmation.includes("market order"));

const filled = buildMarketOrderResult({
  transaction: {
    ...buyReview,
    response: {
      ok: true,
      data: {
        outcome: "applied",
        orderId: "ord_public_123",
        ticker: "AUR",
        side: "buy",
        quantity: 3,
        executedPrice: 24.75,
        executedValue: 74.25,
        currencyCode: "LUM",
        newCashBalance: 925.75,
        completedAt: "2026-07-21T03:10:00.000Z",
      },
    },
  },
  refreshWarning: "",
});
assert.ok(filled.includes("FILLED"));
assert.ok(filled.includes("ord_public_123"));
assert.ok(filled.includes("LUM"));
assert.ok(!filled.includes("00000000-0000-"));

const refreshPending = buildMarketOrderResult({
  transaction: {
    ...buyReview,
    response: {
      ok: true,
      data: {
        outcome: "applied",
        orderId: "ord_public_456",
        ticker: "AUR",
        side: "buy",
        quantity: 3,
        executedPrice: 24.75,
        executedValue: 74.25,
        currencyCode: "LUM",
        completedAt: "2026-07-21T03:10:00.000Z",
      },
    },
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
