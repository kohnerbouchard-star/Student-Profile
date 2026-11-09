import { list, object, text, number, shortDate } from "./read-model-values.js";

export function normalizeMarketNews(news, stocks = []) {
  const assetIdByTicker = new Map(list(stocks).map((stock) => [
    text(stock.ticker).toLowerCase(),
    text(stock.assetId)
  ]));
  return list(news).map((item) => ({
    id: text(item.id),
    category: text(item.category, "Market"),
    time: shortDate(item.createdAt, "Current"),
    title: text(item.headline, "Market update"),
    summary: text(item.explanation),
    analysis: text(item.explanation),
    severity: item.sentiment === "negative" ? "High" : item.sentiment === "mixed" ? "Medium" : "Low",
    tone: item.sentiment === "positive" ? "good" : item.sentiment === "negative" ? "warn" : item.sentiment === "mixed" ? "purple" : "cyan",
    effects: text(item.explanation) ? [text(item.explanation)] : [],
    countryIds: item.scope === "country" && item.targetKey ? [String(item.targetKey).toLowerCase()] : [],
    assetIds: item.scope === "ticker" && item.targetKey
      ? [assetIdByTicker.get(String(item.targetKey).toLowerCase())].filter(Boolean)
      : []
  }));
}

function titleCase(value, defaultValue = "") {
  return text(value, defaultValue)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function newsTone(sentiment) {
  const value = text(sentiment).toLowerCase();
  if (value === "positive") return "good";
  if (value === "negative") return "warn";
  if (value === "mixed") return "purple";
  return "cyan";
}

function worldNewsSeverity(magnitude) {
  const value = Math.abs(number(magnitude));
  if (value >= 0.75) return "High";
  if (value >= 0.25) return "Medium";
  return "Low";
}

function normalizeWorldNewsItems(items, marketAssets) {
  const assetIdByTicker = new Map(list(marketAssets).map((asset) => [
    text(asset.symbol).toLowerCase(),
    text(asset.id)
  ]));
  return list(items).map((item) => {
    const impact = object(item.impact);
    const scope = text(item.scope).toLowerCase();
    const targetKey = text(item.targetKey);
    const effects = [
      `Magnitude ${number(impact.magnitude).toFixed(2)}`,
      `Confidence ${Math.round(number(impact.confidence) * 100)}%`
    ];
    if (impact.volatility !== null && impact.volatility !== undefined) {
      effects.push(`Volatility ${number(impact.volatility).toFixed(2)}`);
    }
    if (impact.volume !== null && impact.volume !== undefined) {
      effects.push(`Volume ${number(impact.volume).toFixed(2)}`);
    }
    return {
      id: text(item.id),
      category: titleCase(item.category, "World"),
      time: shortDate(item.createdAt, "Current"),
      title: text(item.headline, "World update"),
      summary: text(item.explanation),
      analysis: text(item.explanation),
      severity: worldNewsSeverity(impact.magnitude),
      tone: newsTone(item.sentiment),
      effects,
      countryIds: scope === "country" && targetKey
        ? [targetKey.toLowerCase()]
        : [],
      assetIds: scope === "ticker" && targetKey
        ? [assetIdByTicker.get(targetKey.toLowerCase())].filter(Boolean)
        : [],
      tick: object(item.tick),
      source: text(item.source)
    };
  });
}

function countryTone(color) {
  const value = text(color).toLowerCase();
  if (["red"].includes(value)) return "red";
  if (["orange", "gold", "yellow", "amber"].includes(value)) return "amber";
  if (["purple", "violet"].includes(value)) return "purple";
  if (["green"].includes(value)) return "green";
  return "cyan";
}

function countryRisk(marketRiskIndex) {
  const value = number(marketRiskIndex, 1);
  if (value >= 1.4) return "High";
  if (value >= 0.9) return "Moderate";
  return "Low";
}

function countryPolicy(economy) {
  if (!economy || typeof economy !== "object") {
    return "No live economic policy snapshot is available.";
  }
  return `Tax ${(number(economy.taxRate) * 100).toFixed(2)}% · subsidy ${(number(economy.subsidyRate) * 100).toFixed(2)}% · base rate ${(number(economy.interestRate) * 100).toFixed(2)}%.`;
}

export function linkCountryRelations(countries, marketAssets, newsItems) {
  return list(countries).map((country) => ({
    ...country,
    relatedAssetIds: list(marketAssets)
      .filter((asset) => asset.countryId === country.id)
      .map((asset) => asset.id),
    eventIds: list(newsItems)
      .filter((item) => list(item.countryIds).includes(country.id))
      .map((item) => item.id)
  }));
}

export function normalizeCountriesRead(response, data) {
  const countries = list(object(response).items).map((item) => {
    const economy = item.economy && typeof item.economy === "object"
      ? item.economy
      : null;
    const id = text(item.countryCode).toLowerCase();
    const stabilityIndex = number(economy?.politicalStabilityIndex, 1);
    return {
      id,
      profileId: text(item.id),
      name: text(item.countryName, text(item.countryCode, "Unknown country")),
      capital: text(item.capitalName, "Not available"),
      currencyCode: text(item.currencyCode),
      mapRegion: text(object(item.map).region),
      mapColor: text(object(item.map).color),
      tone: countryTone(object(item.map).color),
      market: economy ? titleCase(economy.difficultyPreset, "Current") : "Unavailable",
      condition: economy ? text(economy.label, "Current snapshot") : "No live snapshot",
      index: number(economy?.realGdpIndex),
      growth: number(economy?.gdpGrowthRate) * 100,
      inflation: number(economy?.inflationRate) * 100,
      unemployment: number(economy?.unemploymentRate) * 100,
      baseRate: number(economy?.interestRate) * 100,
      currencyTrend: (number(economy?.exchangeRateIndex, 1) - 1) * 100,
      stability: Math.round(Math.max(0, Math.min(100, stabilityIndex * 50))),
      risk: economy ? countryRisk(economy.marketRiskIndex) : "Unavailable",
      resources: [],
      exports: [],
      tradePartners: [],
      policy: countryPolicy(economy),
      isPlayerCountry: item.isPlayerCountry === true,
      economy
    };
  });
  return linkCountryRelations(countries, data.market.assets, data.news.items);
}

export function normalizeWorldNewsRead(response, data) {
  const items = normalizeWorldNewsItems(object(response).items, data.market.assets);
  return {
    categories: ["All", ...new Set(items.map((item) => item.category).filter(Boolean))],
    selectedId: items[0]?.id || "",
    items
  };
}
