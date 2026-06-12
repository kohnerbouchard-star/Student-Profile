(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const dashboard = app.modules.dashboard = app.modules.dashboard || {};

  function testDashboardModule(sourceState) {
    const state = sourceState || global.state || {};
    const summary = typeof dashboard.getDashboardSummary === "function"
      ? dashboard.getDashboardSummary(state)
      : null;
    const transactions = typeof dashboard.getRecentTransactions === "function"
      ? dashboard.getRecentTransactions(state)
      : [];
    const html = typeof dashboard.renderDashboardPanel === "function"
      ? dashboard.renderDashboardPanel({ state })
      : "";
    const required = [
      "normalizeDashboardSnapshot",
      "getDashboardSummary",
      "getRecentTransactions",
      "getDashboardMarketSummary",
      "renderDashboardPanel",
      "renderDashboardSummaryCards",
      "renderRecentActivity",
      "renderDashboardEmptyState"
    ];
    const missing = required.filter(function (name) {
      return typeof dashboard[name] !== "function";
    });

    return {
      ok: missing.length === 0,
      missing,
      profileSummaryAvailable: Boolean(summary && summary.profileAvailable),
      transactionCount: Array.isArray(state.transactions) ? state.transactions.length : 0,
      inventoryCount: Array.isArray(state.inventory) ? state.inventory.length : 0,
      portfolioCount: Array.isArray(state.portfolio) ? state.portfolio.length : 0,
      recentTransactionCount: transactions.length,
      renderedPanelHasSummary: html.includes("dashboard-summary-cards"),
      renderedPanelHasActivity: html.includes("dashboard-recent-activity")
    };
  }

  dashboard.controllerStatus = "extracted";
  dashboard.testDashboardModule = testDashboardModule;

  app.modules.dashboardController = {
    status: "extracted",
    testDashboardModule
  };
})(window);
