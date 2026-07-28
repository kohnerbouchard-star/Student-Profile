function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizePortfolioHoldings(response) {
  const holdings = Array.isArray(response?.holdings) ? response.holdings : [];
  return holdings
    .map((holding) => ({
      stockAssetId: boundedText(holding?.stockAssetId),
      ticker: boundedText(holding?.ticker).toUpperCase(),
      quantity: Math.max(0, finiteNumber(holding?.quantity)),
      averageCost: Math.max(0, finiteNumber(holding?.averageCost)),
      currentPrice: Math.max(0, finiteNumber(holding?.currentPrice)),
      marketValue: finiteNumber(holding?.marketValue),
      unrealizedPnl: finiteNumber(holding?.unrealizedPnl),
      realizedPnl: finiteNumber(holding?.realizedPnl),
    }))
    .filter((holding) => holding.stockAssetId || holding.ticker);
}

export function attachPortfolioHoldings(portfolio, response) {
  return {
    ...(portfolio && typeof portfolio === "object" ? portfolio : {}),
    holdings: normalizePortfolioHoldings(response),
  };
}

export function marketPositionForAsset(portfolio, asset) {
  const authoritative = Array.isArray(portfolio?.holdings) ? portfolio.holdings : null;
  if (!authoritative) {
    return {
      owned: Math.max(0, finiteNumber(asset?.owned)),
      averageCost: Math.max(0, finiteNumber(asset?.averageCost)),
    };
  }

  const assetId = boundedText(asset?.id);
  const ticker = boundedText(asset?.symbol).toUpperCase();
  const holding = authoritative.find((candidate) =>
    (assetId && boundedText(candidate?.stockAssetId) === assetId) ||
    (ticker && boundedText(candidate?.ticker).toUpperCase() === ticker)
  );

  return {
    owned: Math.max(0, finiteNumber(holding?.quantity)),
    averageCost: Math.max(0, finiteNumber(holding?.averageCost)),
  };
}
