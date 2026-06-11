// Allows the frontend to merge partial backend snapshots without clearing missing sections.
// This lets Apps Script return smaller/faster snapshots after actions.
// Load after stock-trade-history-fixes.js so normalizeStockTradeRow is available.

function getPresentArray(snapshot, keys) {
  if (!snapshot) return undefined;

  for (const key of keys) {
    if (Array.isArray(snapshot[key])) {
      return snapshot[key];
    }
  }

  return undefined;
}

function hasPresentObject(snapshot, keys) {
  if (!snapshot) return null;

  for (const key of keys) {
    if (snapshot[key] && typeof snapshot[key] === 'object' && !Array.isArray(snapshot[key])) {
      return snapshot[key];
    }
  }

  return null;
}

mergeSnapshot = function patchedMergeSnapshot(snapshot) {
  snapshot = snapshot || {};

  const next = {
    ...emptyState(),
    ...state
  };

  const profileSource = hasPresentObject(snapshot, ['profile', 'student', 'currentStudent', 'account']);

  if (profileSource) {
    next.profile = normalizeProfile(profileSource);
  }

  const storeRows = getPresentArray(snapshot, ['store', 'storeItems', 'items', 'availableItems']);
  if (storeRows !== undefined) {
    next.store = storeRows.map(normalizeStoreItem);
  }

  const inventoryRows = getPresentArray(snapshot, ['inventory', 'studentInventory', 'itemsOwned', 'ownedItems']);
  if (inventoryRows !== undefined) {
    next.inventory = inventoryRows.map(normalizeInventoryItem);
  }

  const marketRows = getPresentArray(snapshot, ['market', 'stocks', 'stockMarket', 'marketRows']);
  if (marketRows !== undefined) {
    next.market = marketRows.map(normalizeMarketRow);
  }

  const portfolioRows = getPresentArray(snapshot, ['portfolio', 'holdings', 'positions', 'stockPortfolio']);
  if (portfolioRows !== undefined) {
    next.portfolio = portfolioRows.map(normalizePortfolioRow);
  }

  const ratingRows = getPresentArray(snapshot, ['ratings', 'predictions', 'analystRatings', 'ratingHistory']);
  if (ratingRows !== undefined) {
    next.ratings = ratingRows.map(normalizeRatingRow).sort(sortNewestFirst);
  }

  const newsRows = getPresentArray(snapshot, ['news', 'stockNews', 'reports', 'stockNewsReports']);
  if (newsRows !== undefined) {
    next.news = newsRows.map(normalizeNewsRow).sort(sortNewestFirst);
  }


  const transactionRows = getPresentArray(snapshot, [
    'transactions',
    'recentTransactions',
    'history',
    'transactionHistory',
    'activity',
    'recentActivity'
  ]);

  const stockTradeRows = getPresentArray(snapshot, [
    'stockTrades',
    'stockTradeLog',
    'tradeLog',
    'trades',
    'recentTrades',
    'stockTransactions',
    'stockHistory',
    'Stock_Trade_Log',
    'Stock_Trade'
  ]);

  if (transactionRows !== undefined || stockTradeRows !== undefined) {
    const generalTransactions = transactionRows !== undefined
      ? transactionRows.map(normalizeTransaction)
      : (next.transactions || []).filter((t) => !String(t.mode || '').toUpperCase().includes('STOCK'));

    const stockTransactions = stockTradeRows !== undefined
      ? stockTradeRows.map(normalizeStockTradeRow)
      : (next.transactions || []).filter((t) => String(t.mode || '').toUpperCase().includes('STOCK'));

    next.transactions = [...generalTransactions, ...stockTransactions].sort(sortNewestFirst);
  }

  state = next;
};
