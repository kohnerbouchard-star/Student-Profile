(function (global) {
  function getModules() {
    const app = global.EconovariaFrontend || {};
    const modules = app.modules || {};
    return modules.marketNews || {};
  }

  function getState() {
    return global.state && typeof global.state === "object" ? global.state : null;
  }

  function getSelectedTicker(state) {
    const select = global.document && global.document.getElementById
      ? global.document.getElementById("stockProfileTicker")
      : null;

    if (select && select.value) {
      return String(select.value).trim().toUpperCase();
    }

    const firstMarket = state && Array.isArray(state.market) ? state.market[0] : null;
    return String(firstMarket && firstMarket.ticker || "").trim().toUpperCase();
  }

  function getLegacyRenderedCardCount() {
    if (!global.document || !global.document.querySelectorAll) return null;

    const importedCard = global.document.querySelectorAll("#marketImportedNewsCard .company-news-card");
    if (importedCard.length) return importedCard.length;

    const stockProfileCards = global.document.querySelectorAll("#stockProfile .company-news-card");
    return stockProfileCards.length || null;
  }

  function emptyResult(message) {
    return {
      ok: false,
      messages: [message],
      rawNewsCount: 0,
      normalizedNewsCount: 0,
      selectedTicker: "",
      selectedTickerNewsCount: 0,
      firstFiveSelectedTickerHeadlines: [],
      legacyRenderedCardCount: getLegacyRenderedCardCount(),
      modularSelectedTickerCount: 0
    };
  }

  function findMissingFunctions(module) {
    return [
      "renderMarketNewsPanel",
      "renderNewsList",
      "renderNewsCard",
      "openNewsReportModal",
      "closeNewsReportModal",
      "getActiveNewsRows",
      "getNewsForTicker",
      "sortNewsNewestFirst",
      "limitNewsRows",
      "normalizeMarketNewsRow"
    ].filter(function (name) {
      return typeof module[name] !== "function";
    });
  }

  function testFrontendMarketNewsModule() {
    try {
      const state = getState();
      if (!state) {
        return emptyResult("state is not available yet. Load a snapshot before running the shadow harness.");
      }

      const marketNews = getModules();
      const missing = findMissingFunctions(marketNews);
      const rawNews = Array.isArray(state.news) ? state.news : [];
      const selectedTicker = getSelectedTicker(state);
      const normalizedRows = typeof marketNews.normalizeMarketNewsRow === "function"
        ? rawNews.map(marketNews.normalizeMarketNewsRow)
        : [];
      const selectedRows = typeof marketNews.getNewsForTicker === "function"
        ? marketNews.getNewsForTicker(selectedTicker, state)
        : [];
      const sortedRows = typeof marketNews.sortNewsNewestFirst === "function"
        ? marketNews.sortNewsNewestFirst(selectedRows)
        : selectedRows;
      const limitedRows = typeof marketNews.limitNewsRows === "function"
        ? marketNews.limitNewsRows(sortedRows, 5)
        : sortedRows.slice(0, 5);

      const messages = [];
      if (missing.length) {
        messages.push(`Missing Market News module functions: ${missing.join(", ")}`);
      }

      if (!rawNews.length) {
        messages.push("state.news is empty or missing. The harness can run, but there is no news data to compare.");
      }

      if (!selectedTicker) {
        messages.push("No selected ticker was detected. Select a stock or load market data before comparing ticker rows.");
      }

      return {
        ok: missing.length === 0,
        messages,
        rawNewsCount: rawNews.length,
        normalizedNewsCount: normalizedRows.length,
        selectedTicker,
        selectedTickerNewsCount: selectedRows.length,
        firstFiveSelectedTickerHeadlines: limitedRows.map(function (item) {
          return item && item.headline || "Market update";
        }),
        legacyRenderedCardCount: getLegacyRenderedCardCount(),
        modularSelectedTickerCount: limitedRows.length
      };
    } catch (error) {
      return emptyResult(`Market News shadow harness failed gracefully: ${error && error.message || error}`);
    }
  }

  function compareLegacyAndFrontendMarketNews() {
    const result = testFrontendMarketNewsModule();

    return Object.assign({}, result, {
      comparison: {
        rawNewsCount: result.rawNewsCount,
        normalizedNewsCount: result.normalizedNewsCount,
        selectedTicker: result.selectedTicker,
        selectedTickerNewsCount: result.selectedTickerNewsCount,
        firstFiveSelectedTickerHeadlines: result.firstFiveSelectedTickerHeadlines,
        legacyRenderedCardCount: result.legacyRenderedCardCount,
        modularSelectedTickerCount: result.modularSelectedTickerCount
      }
    });
  }

  global.testFrontendMarketNewsModule = testFrontendMarketNewsModule;
  global.compareLegacyAndFrontendMarketNews = compareLegacyAndFrontendMarketNews;
})(window);
