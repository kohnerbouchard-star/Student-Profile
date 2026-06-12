(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const dashboard = app.modules.dashboard = app.modules.dashboard || {};

  function getSnapshot(sourceState) {
    if (typeof dashboard.normalizeDashboardSnapshot === "function") {
      return dashboard.normalizeDashboardSnapshot(sourceState);
    }

    const state = sourceState || global.state || {};
    return {
      profile: state.profile || null,
      transactions: Array.isArray(state.transactions) ? state.transactions : [],
      inventory: Array.isArray(state.inventory) ? state.inventory : [],
      portfolio: Array.isArray(state.portfolio) ? state.portfolio : [],
      market: Array.isArray(state.market) ? state.market : []
    };
  }

  function toDisplayNumber(value) {
    if (app.modules.numbers && typeof app.modules.numbers.toDisplayNumber === "function") {
      return app.modules.numbers.toDisplayNumber(value);
    }

    if (typeof global.toNumber === "function") {
      return global.toNumber(value);
    }

    const number = Number(String(value ?? "").replace(/[$,%]/g, "").trim());
    return Number.isFinite(number) ? number : 0;
  }

  // display-only
  function sumDisplayRows(rows, key) {
    return (Array.isArray(rows) ? rows : []).reduce(function (total, row) {
      return total + toDisplayNumber(row && row[key]);
    }, 0);
  }

  // display-only
  function getDashboardSummary(sourceState) {
    const snapshot = getSnapshot(sourceState);
    const purchases = snapshot.transactions.filter(function (row) {
      return String(row && row.mode || "").toUpperCase() === "STORE_PURCHASE";
    });

    return {
      profileAvailable: Boolean(snapshot.profile),
      balance: snapshot.profile ? toDisplayNumber(snapshot.profile.balance) : 0,
      inventoryQuantity: sumDisplayRows(snapshot.inventory, "quantityPurchased"),
      storePurchaseAmount: sumDisplayRows(purchases, "amount"),
      portfolioCount: snapshot.portfolio.length,
      transactionCount: snapshot.transactions.length,
      inventoryRowCount: snapshot.inventory.length
    };
  }

  // display-only
  function getRecentTransactions(sourceState, limit) {
    const snapshot = getSnapshot(sourceState);
    const maxRows = Number.isFinite(Number(limit)) ? Number(limit) : 10;

    return snapshot.transactions.slice(0, Math.max(0, maxRows));
  }

  // display-only
  function getDashboardMarketSummary(sourceState) {
    const snapshot = getSnapshot(sourceState);
    const holdingTickers = snapshot.portfolio
      .map(function (row) {
        return String(row && (row.ticker || row.itemId) || "").trim().toUpperCase();
      })
      .filter(Boolean);

    return {
      marketCount: snapshot.market.length,
      portfolioCount: snapshot.portfolio.length,
      holdingTickers: holdingTickers.slice(0, 5)
    };
  }

  dashboard.selectorStatus = "extracted";
  dashboard.getDashboardSummary = getDashboardSummary;
  dashboard.getRecentTransactions = getRecentTransactions;
  dashboard.getDashboardMarketSummary = getDashboardMarketSummary;

  app.modules.dashboardSelectors = {
    status: "extracted",
    getDashboardSummary,
    getRecentTransactions,
    getDashboardMarketSummary
  };
})(window);
