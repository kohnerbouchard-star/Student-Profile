(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const marketNews = app.modules.marketNews = app.modules.marketNews || {};

  function cleanTicker(value) {
    return typeof marketNews.cleanTicker === "function"
      ? marketNews.cleanTicker(value)
      : String(value || "").trim().toUpperCase();
  }

  function normalizeRow(row) {
    return typeof marketNews.normalizeMarketNewsRow === "function"
      ? marketNews.normalizeMarketNewsRow(row)
      : row || {};
  }

  function getState(sourceState) {
    return sourceState || global.state || {};
  }

  function isActiveNewsRow(item) {
    const status = String(item && item.status || "Active").trim().toLowerCase();
    return status !== "inactive" && status !== "no" && status !== "false" && status !== "archived";
  }

  // display-only
  function getActiveNewsRows(sourceState) {
    const news = getState(sourceState).news;
    const rows = Array.isArray(news) ? news : [];

    return rows
      .map(normalizeRow)
      .filter(isActiveNewsRow);
  }

  // display-only
  function newsTimeValue(item) {
    const value = item && (item.timestamp || item.date || "");
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // display-only
  function sortNewsNewestFirst(rows) {
    return (Array.isArray(rows) ? rows : [])
      .slice()
      .sort(function (a, b) {
        return newsTimeValue(b) - newsTimeValue(a);
      });
  }

  // display-only
  function getNewsForTicker(stockOrTicker, sourceState) {
    const ticker = cleanTicker(
      stockOrTicker && typeof stockOrTicker === "object"
        ? stockOrTicker.ticker
        : stockOrTicker
    );

    return getActiveNewsRows(sourceState)
      .filter(function (item) {
        return cleanTicker(item.ticker) === ticker;
      });
  }

  // display-only
  function limitNewsRows(rows, limit) {
    const maxRows = Number.isFinite(Number(limit)) ? Number(limit) : 5;
    return (Array.isArray(rows) ? rows : []).slice(0, Math.max(0, maxRows));
  }

  marketNews.selectorStatus = "extracted";
  marketNews.getActiveNewsRows = getActiveNewsRows;
  marketNews.getNewsForTicker = getNewsForTicker;
  marketNews.sortNewsNewestFirst = sortNewsNewestFirst;
  marketNews.limitNewsRows = limitNewsRows;
})(window);
