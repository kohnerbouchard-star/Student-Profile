import assert from "node:assert/strict";

import {
  attachPortfolioHoldings,
  marketPositionForAsset,
  normalizePortfolioHoldings,
} from "../src/api/portfolio-market-holdings.js";
import { ROUTE_RESOURCE_PLAN } from "../src/api/resource-plan.js";
import { renderMarketPage } from "../src/pages/market-page.js";

const asset = {
  id: "asset-aura",
  symbol: "AURA",
  name: "Aura Systems",
  type: "Stock",
  sector: "Technology",
  countryId: "eld",
  price: 110,
  open: 100,
  dayHigh: 112,
  dayLow: 98,
  change: 10,
  volume: 1000,
  marketCap: 100000,
  pe: 12,
  yield: 1,
  risk: "Medium",
  outlook: "Positive",
  watchlisted: false,
  owned: 0,
  averageCost: 0,
  history: [100, 110],
  newsIds: [],
};

assert.deepEqual(
  ROUTE_RESOURCE_PLAN.market.optional,
  ["news", "banking", "bankingFx", "portfolio", "countries"],
  "Market route reloads must include authoritative Banking FX, Portfolio, and country metadata reads.",
);

const portfolio = attachPortfolioHoldings(
  { netWorth: 1220 },
  {
    holdings: [{
      stockAssetId: "asset-aura",
      ticker: "AURA",
      quantity: 2,
      averageCost: 100,
      currentPrice: 110,
      marketValue: 220,
    }],
  },
);
assert.deepEqual(normalizePortfolioHoldings({ holdings: portfolio.holdings }), portfolio.holdings);
assert.deepEqual(marketPositionForAsset(portfolio, asset), { owned: 2, averageCost: 100 });
assert.deepEqual(
  marketPositionForAsset({ holdings: [] }, { ...asset, owned: 2, averageCost: 100 }),
  { owned: 0, averageCost: 0 },
  "An authoritative empty holdings array must reset a fully sold position.",
);
assert.deepEqual(
  marketPositionForAsset({}, { ...asset, owned: 3, averageCost: 95 }),
  { owned: 3, averageCost: 95 },
  "Bootstrap data may fall back to the embedded Market position before a direct portfolio read.",
);

function terminalData(portfolioModel, marketAsset = asset) {
  return {
    session: { currencyCode: "ECO" },
    dashboard: { portfolioValue: 220, dailyChange: 0 },
    countries: [{ id: "eld", name: "Eldoria" }],
    news: { items: [] },
    banking: { checking: { available: 1000 } },
    portfolio: portfolioModel,
    market: {
      status: "OPEN",
      nextClose: "17:00",
      sectors: ["All", "Technology"],
      selectedAssetId: marketAsset.id,
      assets: [marketAsset],
    },
    resourceStatus: {
      banking: { state: "ready" },
      news: { state: "ready" },
    },
  };
}

const boughtHtml = renderMarketPage(terminalData(portfolio), {});
assert.match(boughtHtml, />2 shares</, "Market must render the authoritative purchased quantity.");
assert.match(boughtHtml, />ECO 100</, "Market must render the authoritative average cost.");

const soldHtml = renderMarketPage(
  terminalData({ ...portfolio, holdings: [] }, { ...asset, owned: 2, averageCost: 100 }),
  {},
);
assert.match(soldHtml, />0 shares</, "Market must render zero after the authoritative holding disappears.");

console.log("Portfolio-to-Market holdings reconciliation passed: route loading, purchases, average cost, and sold-out resets remain authoritative.");
