import { list, object, text, number } from "./read-model-values.js";

export function normalizePortfolio(snapshot) {
  const stocks = object(object(snapshot.me).stocks);
  const summary = object(stocks.portfolio);
  const cash = number(summary.cashBalance, number(object(object(snapshot.me).cash).totalBalance));
  const equities = number(summary.holdingsMarketValue);
  const netWorth = number(object(snapshot.me).netWorth, number(summary.totalEquity, cash + equities));
  const totalGain = number(summary.unrealizedPnl) + number(summary.realizedPnl);
  const totalCost = number(summary.totalCostBasis);
  const exposure = new Map();
  for (const holding of list(stocks.holdings)) {
    const countryId = text(holding.countryCode, "unknown").toLowerCase();
    exposure.set(countryId, number(exposure.get(countryId)) + number(holding.marketValue));
  }
  return {
    netWorth,
    totalAssets: netWorth,
    liabilities: null,
    dailyChange: 0,
    totalGain,
    totalGainPercent: totalCost ? totalGain / totalCost * 100 : 0,
    history: netWorth ? [netWorth, netWorth] : [],
    allocation: [
      ...(cash ? [{ id: "cash", label: "Cash", value: cash, percent: netWorth ? cash / netWorth * 100 : 0, tone: "green" }] : []),
      ...(equities ? [{ id: "equities", label: "Equities", value: equities, percent: netWorth ? equities / netWorth * 100 : 0, tone: "cyan" }] : [])
    ],
    countryExposure: [...exposure.entries()].map(([countryId, value]) => ({
      countryId,
      value,
      percent: equities ? value / equities * 100 : 0
    }))
  };
}
