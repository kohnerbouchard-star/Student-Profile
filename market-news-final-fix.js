// Final market news display patch.
// Supports Imported_Stock_News headers:
// Timestamp, Ticker, Headline, Body, Impact_Type, Price_Impact_%, Volatility_Impact, Status

(function () {
  function first(row, keys) {
    if (!row) return "";

    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
        return row[key];
      }
    }

    return "";
  }

  function cleanTicker(value) {
    return String(value || "").trim().toUpperCase();
  }

  function normalizeImportedNews(row) {
    row = row || {};

    return {
      raw: row,
      timestamp: first(row, [
        "Timestamp",
        "timestamp",
        "Date",
        "date",
        "Published",
        "Published_At",
        "Last_Updated",
        "Last Updated"
      ]),
      ticker: cleanTicker(first(row, [
        "Ticker",
        "ticker",
        "Stock",
        "stock",
        "Symbol",
        "symbol"
      ])),
      headline: first(row, [
        "Headline",
        "headline",
        "Title",
        "title",
        "News",
        "news",
        "Report",
        "report"
      ]) || "Market update",
      summary: first(row, [
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
      sentiment: first(row, [
        "Impact_Type",
        "Impact Type",
        "impactType",
        "Sentiment",
        "sentiment",
        "Tone",
        "tone"
      ]) || "Neutral",
      impact: first(row, [
        "Impact",
        "impact",
        "Impact_Level",
        "Impact Level"
      ]) || first(row, [
        "Impact_Type",
        "Impact Type",
        "Sentiment",
        "sentiment"
      ]) || "Low",
      changePct: first(row, [
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
      volatilityImpact: first(row, [
        "Volatility_Impact",
        "Volatility Impact",
        "volatilityImpact"
      ]),
      status: first(row, [
        "Status",
        "status",
        "Active",
        "active"
      ]) || "Active"
    };
  }

  const oldNormalizeNewsRow =
    typeof normalizeNewsRow === "function"
      ? normalizeNewsRow
      : function (row) {
          return row || {};
        };

  normalizeNewsRow = function patchedNormalizeNewsRow(row) {
    return {
      ...oldNormalizeNewsRow(row || {}),
      ...normalizeImportedNews(row || {})
    };
  };

  function activeNewsRows() {
    return (state.news || [])
      .map(normalizeNewsRow)
      .filter((item) => {
        const status = String(item.status || "Active").trim().toLowerCase();
        return status !== "inactive" && status !== "no" && status !== "false" && status !== "archived";
      });
  }

  renderMarketCompanyNews = function patchedRenderMarketCompanyNews(stock) {
    const ticker = cleanTicker(stock && stock.ticker);
    const rows = activeNewsRows();

    const exactTickerReports = rows.filter((item) => cleanTicker(item.ticker) === ticker);

    const marketReports = rows.filter((item) => {
      const t = cleanTicker(item.ticker);
      return t === "MARKET" || t === "ALL" || t === "GENERAL";
    });

    const anyReports = rows.filter((item) => cleanTicker(item.ticker) !== ticker);

    const reports = (
      exactTickerReports.length
        ? exactTickerReports
        : marketReports.length
          ? marketReports
          : anyReports
    ).slice(0, 8);

    if (!reports.length) {
      return `
        <div class="empty">
          No imported news rows are loaded in the frontend yet.
          Open the console and run <strong>debugNewsState()</strong>.
        </div>
      `;
    }

    return `
      <div class="company-news-list">
        ${reports.map((item) => {
          const sentiment = String(item.sentiment || "Neutral").toLowerCase();
          const sentimentClass =
            sentiment.includes("positive") || sentiment.includes("up") || sentiment.includes("beat")
              ? "news-positive"
              : sentiment.includes("negative") || sentiment.includes("down") || sentiment.includes("miss")
                ? "news-negative"
                : "news-neutral";

          const metaLine = [
            cleanTicker(item.ticker) || "Market",
            item.impact ? `${item.impact}` : "",
            item.volatilityImpact ? `Volatility ${item.volatilityImpact}` : ""
          ].filter(Boolean).join(" · ");

          return `
            <article class="company-news-card ${sentimentClass}">
              <div class="news-card-topline">
                <span class="badge">${sanitize(item.sentiment || "Neutral")}</span>
                <span>${sanitize(formatDateTime(item.timestamp || ""))}</span>
              </div>
              <h4>${sanitize(item.headline || "Market update")}</h4>
              <p>${sanitize(item.summary || "")}</p>
              <div class="news-meta">
                <span>${sanitize(metaLine)}</span>
                <span>${formatMarketPercent(item.changePct)}</span>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  };

  window.debugNewsState = function debugNewsState() {
    const raw = state.news || [];
    const normalized = raw.map(normalizeNewsRow);

    console.log("raw state.news count:", raw.length);
    console.log("normalized news count:", normalized.length);
    console.table(normalized.slice(0, 30));

    return normalized;
  };
})();
