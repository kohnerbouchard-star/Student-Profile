import { businessShareListing } from "../features/market/business-share-view.js";
import { normalizeMarketObservations } from "../features/market/price-history.js";
import { list, object, text, number } from "./read-model-values.js";

function marketHistory(points, existing, listingCurrencyCode) {
  const incoming = normalizeMarketObservations(points);
  const cached = listingCurrencyCode && existing.listingCurrencyCode === listingCurrencyCode
    ? normalizeMarketObservations(existing.history)
    : [];
  if (incoming.length && (!cached.length || incoming.at(-1).tickIndex >= cached.at(-1).tickIndex)) {
    return { history: incoming, historyStatus: "loaded" };
  }
  if (cached.length) return { history: cached, historyStatus: "last-loaded" };
  return { history: incoming, historyStatus: "unavailable" };
}

function normalizeMarketAsset(stock, options = {}) {
  const existing = object(options.existing);
  const holding = object(options.holding);
  const currentPrice = number(stock.currentPrice);
  const listingCurrencyCode = text(stock.listingCurrencyCode);
  const change = number(stock.changePct);
  const currentVolatility = number(stock.currentVolatility);
  const longRunVolatility = number(stock.longRunVolatility);
  return {
    id: text(stock.assetId),
    symbol: text(stock.ticker, "—"),
    name: text(stock.companyName, text(stock.ticker, "Unknown asset")),
    type: "Stock",
    sector: text(stock.sector, "Other"),
    listingCurrencyCode,
    commonEquity: businessShareListing(stock.commonEquity),
    countryId: text(stock.countryCode).toLowerCase(),
    price: currentPrice,
    open: number(stock.openPrice, currentPrice),
    dayHigh: number(stock.dayHigh, currentPrice),
    dayLow: number(stock.dayLow, currentPrice),
    change,
    volume: number(stock.volume),
    marketCap: number(stock.marketCap),
    pe: stock.commonEquity ? 0 : number(existing.pe),
    yield: stock.commonEquity ? 0 : number(existing.yield),
    risk: currentVolatility > longRunVolatility ? "High" : "Medium",
    outlook: change > 0 ? "Positive" : change < 0 ? "Cautious" : "Stable",
    watchlisted: typeof stock.isWatchlisted === "boolean"
      ? stock.isWatchlisted
      : existing.watchlisted === true,
    owned: number(holding.quantity, number(existing.owned)),
    averageCost: number(holding.averageCost, number(existing.averageCost)),
    ...marketHistory(options.history, existing, listingCurrencyCode),
    newsIds: list(options.newsIds).length ? list(options.newsIds) : list(existing.newsIds),
    description: text(stock.description, text(existing.description))
  };
}

export function normalizeMarket(snapshot, newsItems) {
  const market = object(object(snapshot.public).market);
  const holdings = list(object(object(snapshot.me).stocks).holdings);
  const holdingByAsset = new Map(holdings.map((holding) => [holding.stockAssetId, holding]));
  const assets = list(market.stocks).map((stock) => {
    const holding = holdingByAsset.get(stock.assetId) || {};
    const relatedNews = newsItems
      .filter((item) => item.assetIds.includes(stock.assetId))
      .map((item) => item.id);
    return normalizeMarketAsset(stock, { holding, newsIds: relatedNews });
  });
  const sectors = [...new Set(assets.map((asset) => asset.sector).filter(Boolean))];
  return {
    status: text(object(snapshot.gameSession).marketStatus, "closed").toUpperCase(),
    nextClose: "Live session schedule",
    sectors: ["All", ...sectors],
    selectedAssetId: assets[0]?.id || "",
    assets
  };
}

export function normalizeMarketRead(response, currentMarket) {
  const body = object(response);
  const current = object(currentMarket);
  const existingById = new Map(list(current.assets).map((asset) => [asset.id, asset]));
  const pageAssets = list(body.assets).map((asset) => normalizeMarketAsset(asset, {
    existing: existingById.get(asset.assetId)
  }));
  // The adapter owns a shared read snapshot. Retain earlier pages here too,
  // otherwise a later marketAsset review cannot update an earlier-page ticker.
  const offset = object(body.pagination).offset;
  let assets = pageAssets;
  if (Number.isInteger(offset) && offset > 0) {
    const byId = new Map(list(current.assets).map((asset) => [asset.id, asset]));
    for (const asset of pageAssets) if (!byId.has(asset.id)) byId.set(asset.id, asset);
    assets = [...byId.values()];
  }
  const sectors = [...new Set(assets.map((asset) => asset.sector).filter(Boolean))];
  const selectedAssetId = assets.some((asset) => asset.id === current.selectedAssetId)
    ? current.selectedAssetId
    : assets[0]?.id || "";
  return {
    ...current,
    sectors: ["All", ...sectors],
    selectedAssetId,
    assets,
    pagination: object(body.pagination),
    tickIndex: number(body.tickIndex)
  };
}

export function normalizeMarketAssetRead(response, currentMarket) {
  const body = object(response);
  const stock = object(body.asset);
  const current = object(currentMarket);
  const assets = list(current.assets);
  const existing = assets.find((asset) => asset.id === stock.assetId);
  if (!stock.assetId || !existing) return current;
  const updated = normalizeMarketAsset(stock, {
    existing,
    history: list(body.history)
  });
  return {
    ...current,
    assets: assets.map((asset) => asset.id === updated.id ? updated : asset),
    selectedAssetId: updated.id,
    tickIndex: number(body.tickIndex, number(current.tickIndex))
  };
}
