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

  function getMarketProfileModule() {
    const app = global.EconovariaFrontend || {};
    const modules = app.modules || {};
    return modules.marketProfile || {};
  }

  function findMissingMarketProfileFunctions(module) {
    return [
      "getMarketRows",
      "findMarketByTicker",
      "getSelectedTicker",
      "getSelectedStock",
      "parseMarketPercent",
      "getSectorPeers",
      "buildMarketChartPoints",
      "renderMarketChart",
      "renderMarketProfilePage",
      "renderMarketProfileDetail",
      "renderHoldingSummary",
      "renderSectorPeers"
    ].filter(function (name) {
      return typeof module[name] !== "function";
    });
  }

  function getLegacyMarketProfileSnapshot() {
    if (!global.document || !global.document.querySelectorAll) {
      return {
        hasStockProfileRoot: false,
        renderedCardCount: null,
        renderedChartCount: null,
        selectedTicker: ""
      };
    }

    const root = global.document.getElementById("stockProfile");
    const select = global.document.getElementById("stockProfileTicker");

    return {
      hasStockProfileRoot: Boolean(root),
      renderedCardCount: root ? root.querySelectorAll(".card").length : null,
      renderedChartCount: root ? root.querySelectorAll(".market-chart-v2").length : null,
      selectedTicker: select && select.value ? String(select.value).trim().toUpperCase() : ""
    };
  }

  function emptyMarketProfileResult(message) {
    return {
      ok: false,
      messages: [message],
      rawMarketCount: 0,
      selectedTicker: "",
      selectedStockFound: false,
      sectorPeerCount: 0,
      chartPointCount: 0,
      renderedPageHasShell: false,
      renderedDetailHasChart: false,
      renderedHoldingHasPosition: false,
      legacy: getLegacyMarketProfileSnapshot()
    };
  }

  function testFrontendMarketProfileModule() {
    try {
      const state = getState();
      if (!state) {
        return emptyMarketProfileResult("state is not available yet. Load a snapshot before running the Market Profile harness.");
      }

      const marketProfile = getMarketProfileModule();
      const missing = findMissingMarketProfileFunctions(marketProfile);
      const rawMarket = Array.isArray(state.market) ? state.market : [];
      const selectedTicker = typeof marketProfile.getSelectedTicker === "function"
        ? marketProfile.getSelectedTicker(state)
        : getSelectedTicker(state);
      const selectedStock = typeof marketProfile.findMarketByTicker === "function"
        ? marketProfile.findMarketByTicker(selectedTicker, state) || rawMarket[0] || null
        : rawMarket[0] || null;
      const sectorPeers = selectedStock && typeof marketProfile.getSectorPeers === "function"
        ? marketProfile.getSectorPeers(selectedStock, state)
        : [];
      const chartPoints = selectedStock && typeof marketProfile.buildMarketChartPoints === "function"
        ? marketProfile.buildMarketChartPoints(selectedStock, "1D")
        : [];
      const pageHtml = typeof marketProfile.renderMarketProfilePage === "function"
        ? marketProfile.renderMarketProfilePage({ state, selectedTicker })
        : "";
      const detailHtml = selectedStock && typeof marketProfile.renderMarketProfileDetail === "function"
        ? marketProfile.renderMarketProfileDetail(selectedStock, { state, range: "1D" })
        : "";
      const holdingHtml = selectedStock && typeof marketProfile.renderHoldingSummary === "function"
        ? marketProfile.renderHoldingSummary(selectedStock.ticker, { state })
        : "";

      const messages = [];
      if (missing.length) {
        messages.push(`Missing Market Profile module functions: ${missing.join(", ")}`);
      }

      if (!rawMarket.length) {
        messages.push("state.market is empty or missing. The harness can run, but there is no market data to compare.");
      }

      if (!selectedTicker) {
        messages.push("No selected ticker was detected. Select a stock or load market data before comparing profile rows.");
      }

      return {
        ok: missing.length === 0,
        messages,
        rawMarketCount: rawMarket.length,
        selectedTicker,
        selectedStockFound: Boolean(selectedStock),
        sectorPeerCount: sectorPeers.length,
        chartPointCount: chartPoints.length,
        renderedPageHasShell: pageHtml.includes("market-page-v2"),
        renderedDetailHasChart: detailHtml.includes("market-chart") || detailHtml.includes("market-chart-empty"),
        renderedHoldingHasPosition: holdingHtml.includes("Shares") || holdingHtml.includes("Status"),
        legacy: getLegacyMarketProfileSnapshot()
      };
    } catch (error) {
      return emptyMarketProfileResult(`Market Profile shadow harness failed gracefully: ${error && error.message || error}`);
    }
  }

  function compareLegacyAndFrontendMarketProfile() {
    const result = testFrontendMarketProfileModule();

    return Object.assign({}, result, {
      comparison: {
        rawMarketCount: result.rawMarketCount,
        selectedTicker: result.selectedTicker,
        selectedStockFound: result.selectedStockFound,
        sectorPeerCount: result.sectorPeerCount,
        chartPointCount: result.chartPointCount,
        legacyRenderedCardCount: result.legacy.renderedCardCount,
        legacyRenderedChartCount: result.legacy.renderedChartCount,
        legacySelectedTicker: result.legacy.selectedTicker
      }
    });
  }

  global.testFrontendMarketNewsModule = testFrontendMarketNewsModule;
  global.compareLegacyAndFrontendMarketNews = compareLegacyAndFrontendMarketNews;
  global.testFrontendMarketProfileModule = testFrontendMarketProfileModule;
  global.compareLegacyAndFrontendMarketProfile = compareLegacyAndFrontendMarketProfile;
})(window);
