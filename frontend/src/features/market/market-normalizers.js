(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const marketNews = app.modules.marketNews = app.modules.marketNews || {};

  function first(row, keys) {
    if (!row) return "";

    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
        return row[key];
      }
    }

    return "";
  }

  // display-only
  function cleanTicker(value) {
    return String(value || "").trim().toUpperCase();
  }

  function legacyNormalizeNewsRow(row) {
    if (typeof global.normalizeNewsRow === "function") {
      return global.normalizeNewsRow(row || {});
    }

    return row || {};
  }

  // display-only
  function normalizeImportedNewsRow(row) {
    const source = row || {};
    const impactType = first(source, [
      "Impact_Type",
      "Impact Type",
      "impactType",
      "Sentiment",
      "sentiment",
      "Tone",
      "tone"
    ]);

    return {
      raw: source,
      timestamp: first(source, [
        "Timestamp",
        "timestamp",
        "Date",
        "date",
        "Published",
        "Published_At",
        "Last_Updated",
        "Last Updated"
      ]),
      ticker: cleanTicker(first(source, [
        "Ticker",
        "ticker",
        "Stock",
        "stock",
        "Symbol",
        "symbol"
      ])),
      headline: first(source, [
        "Headline",
        "headline",
        "Title",
        "title",
        "News",
        "news",
        "Report",
        "report"
      ]) || "Market update",
      summary: first(source, [
        "Body",
        "body",
        "Summary",
        "summary",
        "Description",
        "description",
        "Details",
        "details",
        "Note",
        "note",
        "Notes",
        "notes"
      ]),
      sentiment: impactType || "Neutral",
      impact: impactType || "Low",
      changePct: first(source, [
        "Price_Impact_%",
        "Price Impact %",
        "Price_Impact",
        "Price Impact",
        "Change_%",
        "Change %",
        "changePct",
        "Change",
        "change"
      ]),
      volatilityImpact: first(source, [
        "Volatility_Impact",
        "Volatility Impact",
        "volatilityImpact"
      ]),
      status: first(source, [
        "Status",
        "status",
        "Active",
        "active"
      ]) || "Active"
    };
  }

  // display-only
  function normalizeMarketNewsRow(row) {
    return Object.assign(
      {},
      legacyNormalizeNewsRow(row || {}),
      normalizeImportedNewsRow(row || {})
    );
  }

  marketNews.status = "extracted";
  marketNews.cleanTicker = cleanTicker;
  marketNews.normalizeMarketNewsRow = normalizeMarketNewsRow;
})(window);
