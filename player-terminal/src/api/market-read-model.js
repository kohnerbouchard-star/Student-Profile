import { businessShareListing } from "../features/market/business-share-view.js";
import { list, object, text, number } from "./read-model-values.js";

function marketHistory(historyPoints, existing, previousClose, currentPrice) {
  const history = list(historyPoints)
    .map((point) => Number(object(point).price))
    .filter(Number.isFinite);
  if (history.length) return history;

  const existingHistory = list(existing?.history)
    .map(Number)
    .filter(Number.isFinite);
  if (existingHistory.length > 2) {
    return [...existingHistory.slice(0, -1), currentPrice];
  }
  return [previousClose, currentPrice];
}

function normalizeMarketAsset(stock, options = {}) {
  const existing = object(options.existing);
  const holding = object(options.holding);
  const currentPrice = number(stock.currentPrice);
  const previousClose = number(stock.previousClose, currentPrice);
  const change = number(stock.changePct);
  const currentVolatility = number(stock.currentVolatility);
  const longRunVolatility = number(stock.longRunVolatility);
  return {
    id: text(stock.assetId),
    symbol: text(stock.ticker, "—"),
    name: text(stock.companyName, text(stock.ticker, "Unknown asset")),
    type: "Stock",
    sector: text(stock.sector, "Other"),
    listingCurrencyCode: text(stock.listingCurrencyCode),
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
    history: marketHistory(options.history, existing, previousClose, currentPrice),
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
  const assets = list(body.assets).map((asset) => normalizeMarketAsset(asset, {
    existing: existingById.get(asset.assetId)
  }));
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
