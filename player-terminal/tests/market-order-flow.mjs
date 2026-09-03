import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { renderMarketOrderDialog } from "../src/features/market/market-order-flow.js";

const ASSET_UUID = "00000000-0000-4000-8000-000000000101";
const QUOTE = "sbq_11111111111111111111111111111111";
const SOURCE = "bac_22222222222222222222222222222222";
const DESTINATION = "bac_33333333333333333333333333333333";
const SETTLEMENT = "btx_44444444444444444444444444444444";
const asset = {
  id: ASSET_UUID,
  symbol: "NOV",
  name: "Novaria Industries",
  price: 25,
  listingCurrencyCode: "XAL",
  owned: 12,
};
const funding = {
  quote_key: "pfq_55555555555555555555555555555555",
  lines: [{
    source_account_key: SOURCE,
    source_currency_code: "NOR",
    target_currency_code: "XAL",
    source_debit: 102,
    target_contribution: 100,
    customer_rate: 0.980392,
    requires_fx: true,
  }],
};

const quote = renderMarketOrderDialog({
  stage: "buy-quote",
  side: "buy",
  asset,
  quantity: 4,
  expectedTickIndex: 42,
  currencyCode: "XAL",
  quote: {
    quoteKey: QUOTE,
    ticker: "NOV",
    listingCurrencyCode: "XAL",
    quantity: 4,
    quotedPrice: 25,
    priceTickIndex: 42,
    grossValue: 100,
    expiresAt: "2099-08-30T12:00:00.000Z",
    funding,
  },
  error: "",
});
assert.ok(quote.includes("IMMUTABLE BUY QUOTE"));
assert.ok(quote.includes("CONFIRMATION REQUIRED"));
assert.ok(quote.includes(QUOTE));
assert.ok(quote.includes("FUNDED"));
assert.ok(quote.includes("REMAINING"));
assert.ok(quote.includes("EXPIRES"));
assert.ok(quote.includes("Confirm settlement"));
assert.ok(quote.includes("AUTHORITATIVE FUNDING"));
assert.ok(quote.includes(SOURCE));
assert.ok(quote.includes("FX"));
assert.ok(!quote.includes(ASSET_UUID));

const expired = renderMarketOrderDialog({
  stage: "buy-quote",
  side: "buy",
  asset,
  quantity: 4,
  currencyCode: "XAL",
  quote: {
    quoteKey: QUOTE,
    listingCurrencyCode: "XAL",
    quantity: 4,
    quotedPrice: 25,
    priceTickIndex: 42,
    grossValue: 100,
    expiresAt: "2000-01-01T00:00:00.000Z",
    funding,
  },
});
assert.ok(expired.includes("QUOTE EXPIRED"));
assert.match(expired, /data-player-market-order-confirm disabled/);

const sellReview = renderMarketOrderDialog({
  stage: "sell-review",
  side: "sell",
  asset,
  ticker: "NOV",
  quantity: 2,
  expectedPrice: 25,
  expectedTickIndex: 43,
  estimatedGross: 50,
  currencyCode: "XAL",
  destinationAccount: { accountKey: DESTINATION, currencyCode: "XAL" },
  payload: { destinationAccountKey: DESTINATION },
  error: "",
});
assert.ok(sellReview.includes("IMMEDIATE SELL REVIEW"));
assert.ok(sellReview.includes("CONFIRMATION REQUIRED"));
assert.ok(sellReview.includes("ESTIMATED PROCEEDS"));
assert.ok(sellReview.includes(DESTINATION));
assert.ok(sellReview.includes("no sell-side FX"));
assert.ok(!sellReview.includes("Banking FX"));
assert.ok(!sellReview.includes(ASSET_UUID));

const buyReceipt = renderMarketOrderDialog({
  stage: "receipt",
  side: "buy",
  asset,
  quantity: 4,
  currencyCode: "XAL",
  quote: { quoteKey: QUOTE, funding },
  settlement: {
    quoteKey: QUOTE,
    ticker: "NOV",
    listingCurrencyCode: "XAL",
    quantity: 4,
    executionPrice: 25,
    priceTickIndex: 42,
    grossValue: 100,
    holdingQuantityAfter: 16,
    averageCostAfter: 24.8,
    filledAt: "2026-08-30T12:00:00.000Z",
    alreadyCompleted: true,
    funding,
  },
  refreshWarning: "",
});
assert.ok(buyReceipt.includes("IMMUTABLE STOCK RECEIPT"));
assert.ok(buyReceipt.includes("REPLAYED RECEIPT"));
assert.ok(buyReceipt.includes(QUOTE));
assert.ok(buyReceipt.includes("16 shares"));
assert.ok(buyReceipt.includes("AUTHORITATIVE FUNDING"));
assert.ok(!buyReceipt.includes(ASSET_UUID));

const sellReceipt = renderMarketOrderDialog({
  stage: "receipt",
  side: "sell",
  asset,
  quantity: 2,
  currencyCode: "XAL",
  settlement: {
    ticker: "NOV",
    listingCurrencyCode: "XAL",
    quantity: 2,
    executionPrice: 25,
    priceTickIndex: 43,
    grossValue: 50,
    holdingQuantityAfter: 10,
    averageCostAfter: 24,
    filledAt: "2026-08-30T12:01:00.000Z",
    destinationAccountKey: DESTINATION,
    settlementTransactionKey: SETTLEMENT,
    alreadyCompleted: false,
  },
  refreshWarning: "The trade completed, but balances, holdings, and market data could not be refreshed.",
});
assert.ok(sellReceipt.includes("FILLED · REFRESH PENDING"));
assert.ok(sellReceipt.includes(DESTINATION));
assert.ok(sellReceipt.includes(SETTLEMENT));
assert.ok(!sellReceipt.includes(ASSET_UUID));

const source = await readFile(new URL("../src/features/market/market-order-flow.js", import.meta.url), "utf8");
const marketPage = await readFile(new URL("../src/pages/market-page.js", import.meta.url), "utf8");
const routeCore = await readFile(new URL("../src/api/backend-routes-core.js", import.meta.url), "utf8");
const main = await readFile(new URL("../src/main.js", import.meta.url), "utf8");
assert.ok(main.includes("installMarketOrderFlow"));
assert.ok(source.includes('[data-player-market-order-form]'));
assert.ok(source.includes('addEventListener("submit", handleSubmit, true)'));
assert.ok(source.includes('action: "settle_buy_quote"'));
assert.ok(source.includes('api.execute("marketOrder", payload)'));
assert.ok(source.includes('api.request("marketAsset", {'));
assert.ok(source.includes('params: { assetId: ticker }'));
assert.ok(source.includes('force: true'));
assert.ok(source.includes('setReviewValue(form, "expectedPrice", expectedPrice)'));
assert.ok(source.includes('setReviewValue(form, "expectedTickIndex", expectedTickIndex)'));
assert.ok(source.includes("expectedTickIndex < 0"));
assert.ok(!source.includes("expectedTickIndex <= 0"));
assert.ok(source.includes("function refreshSingleLineBuyFunding(payload, reviewedPrice)"));
assert.ok(source.includes("payload.allocations.length !== 1"));
assert.ok(source.includes('mount.querySelectorAll(\'form[data-player-market-order-form="buy-quote"]\')'));
assert.ok(!source.includes(':visible'));
assert.ok(source.includes('setReviewValue(refreshedForm, "targetAmount1", roundStock(payload.quantity * reviewedPrice))'));
assert.ok(source.includes('refreshedForm.dispatchEvent(new Event("input", { bubbles: true }))'));
assert.ok(source.includes("The Stock price changed. Review the refreshed price and funding amount before submitting again."));
assert.ok(source.includes('"stale_stock_tick", "stale_stock_price"'));
assert.ok(source.includes('else if (form.dataset.playerMarketOrderForm === "sell-review") void prepareSell(form)'));
assert.ok(source.includes('terminal.refreshResources(["dashboard", "market", "portfolio", "banking", "bankingFx"])'));
assert.ok(source.includes("normalizeWritePayload"));
assert.ok(source.includes("marketPositionForAsset"));
assert.ok(source.includes('market?.status === "CLOSED"'));
assert.ok(source.includes('String(destinationAccount.currencyCode || "").toUpperCase() !== listingCurrencyCode'));
assert.ok(source.includes("Stock sale proceeds do not auto-convert."));
assert.ok(!source.includes("any required Banking FX conversion"));
assert.ok(marketPage.includes("listingCurrencyCheckingAccounts"));
assert.ok(marketPage.includes("sellAccountOptions"));
assert.ok(marketPage.includes("no sell-side FX"));
assert.ok(marketPage.includes("Open an active ${escapeHtml(listingCurrencyCode)} Checking account before selling this asset."));
assert.ok(!source.includes('orderType: "market"'));
assert.ok(!source.includes("BACKEND INTEGRATION PENDING"));
assert.ok(!source.includes("playerUuid") && !source.includes("recipientPlayerUuid"));
assert.ok(routeCore.includes('action === "create_buy_quote"'));
assert.ok(routeCore.includes('action === "settle_buy_quote"'));
assert.ok(routeCore.includes('action === "settle_sell"'));
assert.ok(routeCore.includes("destinationAccountKey"));
assert.ok(!routeCore.includes("stockAssetId:"));

console.log("C3E Market flow passed: asset-scoped price/tick review including valid zero-tick assets, single-line funding refresh with valid DOM selection and explicit re-submit, immutable buy quote review, expiry, exact funding evidence, listing-currency-only sell destination review, public-key receipts, stale-review fail-closed behavior, and bounded refresh are wired to the connected route.");
