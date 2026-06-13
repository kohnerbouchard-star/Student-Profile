// Allows the frontend to merge partial backend snapshots without clearing missing sections.
// This lets Apps Script return smaller/faster snapshots after actions.
// Loaded after the trading stock-history compatibility helper so stock trade rows can be normalized.

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

function hasRows(rows) {
  return Array.isArray(rows) && rows.length > 0;
}

mergeSnapshot = function patchedMergeSnapshot(snapshot) {
  snapshot = snapshot || {};

  const next = {
    ...emptyState(),
    ...state
  };

  const profileSource =
    hasPresentObject(snapshot, ['profile', 'student', 'currentStudent', 'account']) ||
    (Array.isArray(snapshot.students) ? snapshot.students[0] : null) ||
    (Array.isArray(snapshot.studentRows) ? snapshot.studentRows[0] : null);

  if (profileSource) {
    next.profile = normalizeProfile(profileSource);
  }

  const storeRows = getPresentArray(snapshot, ['store', 'storeItems', 'items', 'availableItems']);
  if (hasRows(storeRows)) {
    next.store = storeRows.map(normalizeStoreItem);
  }

  const inventoryRows = getPresentArray(snapshot, ['inventory', 'studentInventory', 'itemsOwned', 'ownedItems']);
  if (hasRows(inventoryRows)) {
    next.inventory = inventoryRows.map(normalizeInventoryItem);
  }

  const marketRows = getPresentArray(snapshot, ['market', 'stocks', 'stockMarket', 'marketRows']);
  if (hasRows(marketRows)) {
    next.market = marketRows.map(normalizeMarketRow);
  }

  const portfolioRows = getPresentArray(snapshot, ['portfolio', 'holdings', 'positions', 'stockPortfolio']);
  if (hasRows(portfolioRows)) {
    next.portfolio = portfolioRows.map(normalizePortfolioRow);
  }

  const ratingRows = getPresentArray(snapshot, ['ratings', 'predictions', 'analystRatings', 'ratingHistory']);
  if (hasRows(ratingRows)) {
    next.ratings = ratingRows.map(normalizeRatingRow).sort(sortNewestFirst);
  }

  const newsRows = getPresentArray(snapshot, ['news', 'stockNews', 'reports', 'stockNewsReports']);
  if (hasRows(newsRows)) {
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

  const hasGeneralTransactions = hasRows(transactionRows);
  const hasStockTransactions = hasRows(stockTradeRows);

  if (hasGeneralTransactions || hasStockTransactions) {
    const generalTransactions = hasGeneralTransactions
      ? transactionRows.map(normalizeTransaction)
      : (next.transactions || []).filter((t) => !String(t.mode || '').toUpperCase().includes('STOCK'));

    const stockTransactions = hasStockTransactions && typeof normalizeStockTradeRow === 'function'
      ? stockTradeRows.map(normalizeStockTradeRow)
      : (next.transactions || []).filter((t) => String(t.mode || '').toUpperCase().includes('STOCK'));

    next.transactions = [...generalTransactions, ...stockTransactions].sort(sortNewestFirst);
  }

  state = next;
};

window.Econovaria = window.Econovaria || {};
window.Econovaria.core = window.Econovaria.core || {};
window.Econovaria.core.snapshot = window.Econovaria.core.snapshot || {};
Object.assign(window.Econovaria.core, { mergeSnapshot });
Object.assign(window.Econovaria.core.snapshot, { mergeSnapshot });
