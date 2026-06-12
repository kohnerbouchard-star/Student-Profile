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

  function getApiClientModule() {
    const app = global.EconovariaFrontend || {};
    const modules = app.modules || {};
    return modules.apiClient || {};
  }

  function testFrontendApiClientModule() {
    try {
      const apiClient = getApiClientModule();
      const requiredFunctions = [
        "isRetryableBusyResult",
        "isRetryableBusyError",
        "isBusyMessage",
        "getRetryDelay",
        "callWithRetry",
        "createApiClient",
        "createLegacyCallApiRetryWrapper"
      ];
      const missing = requiredFunctions.filter(function (name) {
        return typeof apiClient[name] !== "function";
      });
      const expectedActions = [
        "LOGIN",
        "LOGOUT",
        "GET_SNAPSHOT",
        "GET_STOCK_HISTORY",
        "GET_STOCK_NEWS",
        "STORE_PURCHASE",
        "STOCK_TRADE",
        "SUBMIT_RATING",
        "USE_ITEM"
      ];
      const actionNames = apiClient.ACTION_NAMES || {};
      const missingActions = expectedActions.filter(function (actionName) {
        return actionNames[actionName] !== actionName;
      });
      const retryableMessages = [
        "System is busy",
        "Service unavailable",
        "Network error",
        "Failed to fetch",
        "Try again, busy lock"
      ];
      const nonRetryableMessages = [
        "Insufficient balance",
        "Invalid quantity",
        "Market closed"
      ];
      const retryablePass = retryableMessages.every(function (message) {
        return typeof apiClient.isBusyMessage === "function" && apiClient.isBusyMessage(message);
      });
      const nonRetryablePass = nonRetryableMessages.every(function (message) {
        return typeof apiClient.isBusyMessage === "function" && !apiClient.isBusyMessage(message);
      });
      const sampleDelay = typeof apiClient.getRetryDelay === "function"
        ? apiClient.getRetryDelay(1, { baseDelayMs: 100, maxDelayMs: 500 }, function () { return 0.5; })
        : 0;
      const delayInRange = sampleDelay >= 200 && sampleDelay <= 500;
      const messages = [];

      if (missing.length) {
        messages.push(`Missing API client functions: ${missing.join(", ")}`);
      }

      if (missingActions.length) {
        messages.push(`Missing API action constants: ${missingActions.join(", ")}`);
      }

      if (!retryablePass) {
        messages.push("One or more retryable busy messages were not classified as retryable.");
      }

      if (!nonRetryablePass) {
        messages.push("One or more business-rule messages were incorrectly classified as retryable.");
      }

      if (!delayInRange) {
        messages.push("Retry delay sample was outside expected bounds.");
      }

      return {
        ok: messages.length === 0,
        messages,
        expectedActionCount: expectedActions.length,
        missingActionCount: missingActions.length,
        retryablePass,
        nonRetryablePass,
        sampleDelay,
        legacyRetryPatchInstalled: Boolean(global.__apiRetryPatchInstalled),
        legacyCallApiDetected: typeof global.callApi === "function"
      };
    } catch (error) {
      return {
        ok: false,
        messages: [`API client shadow harness failed gracefully: ${error && error.message || error}`],
        expectedActionCount: 0,
        missingActionCount: 0,
        retryablePass: false,
        nonRetryablePass: false,
        sampleDelay: 0,
        legacyRetryPatchInstalled: Boolean(global.__apiRetryPatchInstalled),
        legacyCallApiDetected: typeof global.callApi === "function"
      };
    }
  }

  function compareLegacyAndFrontendApiRetry() {
    const result = testFrontendApiClientModule();

    return Object.assign({}, result, {
      comparison: {
        legacyRetryPatchInstalled: result.legacyRetryPatchInstalled,
        legacyCallApiDetected: result.legacyCallApiDetected,
        expectedActionCount: result.expectedActionCount,
        missingActionCount: result.missingActionCount,
        retryablePass: result.retryablePass,
        nonRetryablePass: result.nonRetryablePass,
        sampleDelay: result.sampleDelay
      }
    });
  }

  function getSnapshotStoreModule() {
    const app = global.EconovariaFrontend || {};
    const modules = app.modules || {};
    return modules.snapshotStore || {};
  }

  function testFrontendSnapshotStoreModule() {
    try {
      const snapshotStore = getSnapshotStoreModule();
      const requiredFunctions = [
        "getPresentArray",
        "hasPresentObject",
        "mergePartialSnapshot",
        "createSnapshotMerger"
      ];
      const missing = requiredFunctions.filter(function (name) {
        return typeof snapshotStore[name] !== "function";
      });
      const currentState = {
        profile: { name: "Existing Student" },
        store: [{ id: "old-store" }],
        inventory: [{ id: "kept-inventory" }],
        market: [{ ticker: "ABC" }],
        portfolio: [{ ticker: "ABC", sharesOwned: 2 }],
        ratings: [{ id: "kept-rating" }],
        news: [{ ticker: "ABC", headline: "Kept news" }],
        transactions: [
          { id: "general-old", mode: "STORE_PURCHASE" },
          { id: "stock-old", mode: "STOCK_BUY" }
        ]
      };
      const partialSnapshot = {
        storeItems: [{ id: "new-store" }],
        stockTradeLog: [{ id: "stock-new", mode: "STOCK_SELL" }]
      };
      const dependencies = {
        emptyState: function () {
          return {
            profile: null,
            store: [],
            inventory: [],
            market: [],
            portfolio: [],
            ratings: [],
            news: [],
            transactions: []
          };
        },
        normalizeProfile: function (row) { return row; },
        normalizeStoreItem: function (row) { return row; },
        normalizeInventoryItem: function (row) { return row; },
        normalizeMarketRow: function (row) { return row; },
        normalizePortfolioRow: function (row) { return row; },
        normalizeRatingRow: function (row) { return row; },
        normalizeNewsRow: function (row) { return row; },
        normalizeTransaction: function (row) { return row; },
        normalizeStockTradeRow: function (row) { return row; },
        sortNewestFirst: function () { return 0; }
      };
      const merged = typeof snapshotStore.mergePartialSnapshot === "function"
        ? snapshotStore.mergePartialSnapshot(partialSnapshot, currentState, dependencies)
        : currentState;
      const messages = [];
      const storeUpdated = merged.store && merged.store[0] && merged.store[0].id === "new-store";
      const inventoryPreserved = merged.inventory && merged.inventory[0] && merged.inventory[0].id === "kept-inventory";
      const newsPreserved = merged.news && merged.news[0] && merged.news[0].headline === "Kept news";
      const generalTransactionPreserved = merged.transactions && merged.transactions.some(function (row) {
        return row.id === "general-old";
      });
      const stockTransactionUpdated = merged.transactions && merged.transactions.some(function (row) {
        return row.id === "stock-new";
      });

      if (missing.length) {
        messages.push(`Missing Snapshot Store functions: ${missing.join(", ")}`);
      }

      if (!storeUpdated) {
        messages.push("Partial store rows were not applied.");
      }

      if (!inventoryPreserved || !newsPreserved) {
        messages.push("Missing snapshot sections were not preserved.");
      }

      if (!generalTransactionPreserved || !stockTransactionUpdated) {
        messages.push("Transaction merge did not preserve general rows while updating stock rows.");
      }

      return {
        ok: messages.length === 0,
        messages,
        storeUpdated,
        inventoryPreserved,
        newsPreserved,
        generalTransactionPreserved,
        stockTransactionUpdated,
        legacyMergeSnapshotDetected: typeof global.mergeSnapshot === "function"
      };
    } catch (error) {
      return {
        ok: false,
        messages: [`Snapshot Store shadow harness failed gracefully: ${error && error.message || error}`],
        storeUpdated: false,
        inventoryPreserved: false,
        newsPreserved: false,
        generalTransactionPreserved: false,
        stockTransactionUpdated: false,
        legacyMergeSnapshotDetected: typeof global.mergeSnapshot === "function"
      };
    }
  }

  function compareLegacyAndFrontendSnapshotMerge() {
    const result = testFrontendSnapshotStoreModule();

    return Object.assign({}, result, {
      comparison: {
        legacyMergeSnapshotDetected: result.legacyMergeSnapshotDetected,
        storeUpdated: result.storeUpdated,
        inventoryPreserved: result.inventoryPreserved,
        newsPreserved: result.newsPreserved,
        generalTransactionPreserved: result.generalTransactionPreserved,
        stockTransactionUpdated: result.stockTransactionUpdated
      }
    });
  }

  global.testFrontendMarketNewsModule = testFrontendMarketNewsModule;
  global.compareLegacyAndFrontendMarketNews = compareLegacyAndFrontendMarketNews;
  global.testFrontendMarketProfileModule = testFrontendMarketProfileModule;
  global.compareLegacyAndFrontendMarketProfile = compareLegacyAndFrontendMarketProfile;
  global.testFrontendApiClientModule = testFrontendApiClientModule;
  global.compareLegacyAndFrontendApiRetry = compareLegacyAndFrontendApiRetry;
  global.testFrontendSnapshotStoreModule = testFrontendSnapshotStoreModule;
  global.compareLegacyAndFrontendSnapshotMerge = compareLegacyAndFrontendSnapshotMerge;
})(window);
