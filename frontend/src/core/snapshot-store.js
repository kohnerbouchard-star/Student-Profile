(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};

  function identity(value) {
    return value || {};
  }

  function getGlobalFunction(name, fallback) {
    return typeof global[name] === "function" ? global[name] : fallback;
  }

  function getDefaultDependencies(overrides) {
    return Object.assign({
      emptyState: getGlobalFunction("emptyState", function () { return {}; }),
      normalizeProfile: getGlobalFunction("normalizeProfile", identity),
      normalizeStoreItem: getGlobalFunction("normalizeStoreItem", identity),
      normalizeInventoryItem: getGlobalFunction("normalizeInventoryItem", identity),
      normalizeMarketRow: getGlobalFunction("normalizeMarketRow", identity),
      normalizePortfolioRow: getGlobalFunction("normalizePortfolioRow", identity),
      normalizeRatingRow: getGlobalFunction("normalizeRatingRow", identity),
      normalizeNewsRow: getGlobalFunction("normalizeNewsRow", identity),
      normalizeTransaction: getGlobalFunction("normalizeTransaction", identity),
      normalizeStockTradeRow: getGlobalFunction("normalizeStockTradeRow", identity),
      sortNewestFirst: getGlobalFunction("sortNewestFirst", function () { return 0; })
    }, overrides || {});
  }

  function getPresentArray(snapshot, keys) {
    if (!snapshot) return undefined;

    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (Array.isArray(snapshot[key])) {
        return snapshot[key];
      }
    }

    return undefined;
  }

  function hasPresentObject(snapshot, keys) {
    if (!snapshot) return null;

    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (snapshot[key] && typeof snapshot[key] === "object" && !Array.isArray(snapshot[key])) {
        return snapshot[key];
      }
    }

    return null;
  }

  function normalizeRows(rows, normalizer) {
    return rows.map(function (row) {
      return normalizer(row);
    });
  }

  function mergeTransactions(snapshot, next, dependencies) {
    const transactionRows = getPresentArray(snapshot, [
      "transactions",
      "recentTransactions",
      "history",
      "transactionHistory",
      "activity",
      "recentActivity"
    ]);
    const stockTradeRows = getPresentArray(snapshot, [
      "stockTrades",
      "stockTradeLog",
      "tradeLog",
      "trades",
      "recentTrades",
      "stockTransactions",
      "stockHistory",
      "Stock_Trade_Log",
      "Stock_Trade"
    ]);

    if (transactionRows === undefined && stockTradeRows === undefined) {
      return;
    }

    const existingTransactions = Array.isArray(next.transactions) ? next.transactions : [];
    const generalTransactions = transactionRows !== undefined
      ? normalizeRows(transactionRows, dependencies.normalizeTransaction)
      : existingTransactions.filter(function (transaction) {
        return !String(transaction.mode || "").toUpperCase().includes("STOCK");
      });
    const stockTransactions = stockTradeRows !== undefined
      ? normalizeRows(stockTradeRows, dependencies.normalizeStockTradeRow)
      : existingTransactions.filter(function (transaction) {
        return String(transaction.mode || "").toUpperCase().includes("STOCK");
      });

    next.transactions = generalTransactions
      .concat(stockTransactions)
      .sort(dependencies.sortNewestFirst);
  }

  function mergePartialSnapshot(snapshot, currentState, dependencyOverrides) {
    const sourceSnapshot = snapshot || {};
    const dependencies = getDefaultDependencies(dependencyOverrides);
    const next = Object.assign(
      {},
      dependencies.emptyState(),
      currentState || {}
    );

    const profileSource =
      hasPresentObject(sourceSnapshot, ["profile", "student", "currentStudent", "account"]) ||
      (Array.isArray(sourceSnapshot.students) ? sourceSnapshot.students[0] : null) ||
      (Array.isArray(sourceSnapshot.studentRows) ? sourceSnapshot.studentRows[0] : null);

    if (profileSource) {
      next.profile = dependencies.normalizeProfile(profileSource);
    }

    const storeRows = getPresentArray(sourceSnapshot, ["store", "storeItems", "items", "availableItems"]);
    if (storeRows !== undefined) {
      next.store = normalizeRows(storeRows, dependencies.normalizeStoreItem);
    }

    const inventoryRows = getPresentArray(sourceSnapshot, ["inventory", "studentInventory", "itemsOwned", "ownedItems"]);
    if (inventoryRows !== undefined) {
      next.inventory = normalizeRows(inventoryRows, dependencies.normalizeInventoryItem);
    }

    const marketRows = getPresentArray(sourceSnapshot, ["market", "stocks", "stockMarket", "marketRows"]);
    if (marketRows !== undefined) {
      next.market = normalizeRows(marketRows, dependencies.normalizeMarketRow);
    }

    const portfolioRows = getPresentArray(sourceSnapshot, ["portfolio", "holdings", "positions", "stockPortfolio"]);
    if (portfolioRows !== undefined) {
      next.portfolio = normalizeRows(portfolioRows, dependencies.normalizePortfolioRow);
    }

    const ratingRows = getPresentArray(sourceSnapshot, ["ratings", "predictions", "analystRatings", "ratingHistory"]);
    if (ratingRows !== undefined) {
      next.ratings = normalizeRows(ratingRows, dependencies.normalizeRatingRow).sort(dependencies.sortNewestFirst);
    }

    const newsRows = getPresentArray(sourceSnapshot, ["news", "stockNews", "reports", "stockNewsReports"]);
    if (newsRows !== undefined) {
      next.news = normalizeRows(newsRows, dependencies.normalizeNewsRow).sort(dependencies.sortNewestFirst);
    }

    mergeTransactions(sourceSnapshot, next, dependencies);

    return next;
  }

  function createSnapshotMerger(dependencyOverrides) {
    return function snapshotMerger(snapshot, currentState) {
      return mergePartialSnapshot(snapshot, currentState, dependencyOverrides);
    };
  }

  app.modules.snapshotStore = {
    status: "extracted",
    description: "Frontend state merge helpers. Backend snapshots remain the source of truth.",
    getPresentArray,
    hasPresentObject,
    mergePartialSnapshot,
    createSnapshotMerger
  };
})(window);
