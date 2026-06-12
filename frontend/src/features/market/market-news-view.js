(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const marketNews = app.modules.marketNews = app.modules.marketNews || {};

  function sanitize(value) {
    if (app.modules.sanitize && typeof app.modules.sanitize.sanitizeHtml === "function") {
      return app.modules.sanitize.sanitizeHtml(value);
    }

    if (typeof global.sanitize === "function") {
      return global.sanitize(value);
    }

    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      }[char];
    });
  }

  function cleanTicker(value) {
    return typeof marketNews.cleanTicker === "function"
      ? marketNews.cleanTicker(value)
      : String(value || "").trim().toUpperCase();
  }

  // display-only
  function formatDateTime(value) {
    if (typeof global.formatDateTime === "function") {
      return global.formatDateTime(value);
    }

    if (!value) return "Unavailable";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
  }

  // display-only
  function formatMarketPercent(value) {
    if (typeof global.formatMarketPercent === "function") {
      return global.formatMarketPercent(value);
    }

    if (value === undefined || value === null || value === "") return "Unavailable";
    const raw = String(value).trim();
    const number = Number(raw.replace("%", ""));
    if (!Number.isFinite(number)) return raw;
    const normalized = raw.includes("%") || Math.abs(number) > 1 ? number : number * 100;
    return `${normalized >= 0 ? "+" : ""}${normalized.toFixed(2)}%`;
  }

  function getSentimentClass(item) {
    const sentiment = String(item && item.sentiment || "Neutral").toLowerCase();

    if (sentiment.includes("positive") || sentiment.includes("up") || sentiment.includes("beat")) {
      return "news-positive";
    }

    if (sentiment.includes("negative") || sentiment.includes("down") || sentiment.includes("miss")) {
      return "news-negative";
    }

    return "news-neutral";
  }

  // display-only
  function renderNewsCard(item, index, selectedTicker) {
    const source = item || {};
    const ticker = cleanTicker(source.ticker) || selectedTicker || "Market";
    const metaLine = [
      ticker,
      source.impact ? `${source.impact}` : "",
      source.volatilityImpact ? `Volatility ${source.volatilityImpact}` : ""
    ].filter(Boolean).join(" - ");

    return `
      <article
        class="company-news-card ${getSentimentClass(source)}"
        data-news-index="${index}"
        tabindex="0"
        role="button"
        aria-label="Open news report: ${sanitize(source.headline || "Market update")}"
      >
        <div class="news-card-topline">
          <span class="badge">${sanitize(source.sentiment || "Neutral")}</span>
          <span>${sanitize(formatDateTime(source.timestamp || source.date || ""))}</span>
        </div>
        <h4>${sanitize(source.headline || "Market update")}</h4>
        <p>${sanitize(source.summary || "")}</p>
        <div class="news-meta">
          <span>${sanitize(metaLine)}</span>
          <span>${sanitize(formatMarketPercent(source.changePct))}</span>
        </div>
      </article>
    `;
  }

  // display-only
  function renderNewsList(stockOrTicker, options) {
    const config = options || {};
    const ticker = cleanTicker(
      stockOrTicker && typeof stockOrTicker === "object"
        ? stockOrTicker.ticker
        : stockOrTicker
    );
    const sourceState = config.state || global.state || {};

    const getNewsForTicker = marketNews.getNewsForTicker || function () { return []; };
    const sortNewsNewestFirst = marketNews.sortNewsNewestFirst || function (rows) { return rows || []; };
    const limitNewsRows = marketNews.limitNewsRows || function (rows, limit) {
      return (rows || []).slice(0, limit || 5);
    };

    const reports = limitNewsRows(
      sortNewsNewestFirst(getNewsForTicker(ticker, sourceState)),
      config.limit || 5
    );

    marketNews.selectedNewsReports = reports;
    global.__selectedStockNewsReports = reports;

    if (!reports.length) {
      return `
        <div class="empty">
          No news reports are available for <strong>${sanitize(ticker || "this stock")}</strong> yet.
        </div>
      `;
    }

    return `
      <div class="company-news-list">
        ${reports.map(function (item, index) {
          return renderNewsCard(item, index, ticker);
        }).join("")}
      </div>
    `;
  }

  // display-only
  function renderMarketNewsPanel(stockOrTicker, options) {
    const ticker = cleanTicker(
      stockOrTicker && typeof stockOrTicker === "object"
        ? stockOrTicker.ticker
        : stockOrTicker
    );

    return `
      <h2 class="card-title">Company News</h2>
      <div class="status-box">Showing latest 5 reports for ${sanitize(ticker || "the selected stock")}.</div>
      ${renderNewsList(stockOrTicker, options)}
    `;
  }

  marketNews.status = "extracted";
  marketNews.renderMarketNewsPanel = renderMarketNewsPanel;
  marketNews.renderNewsList = renderNewsList;
  marketNews.renderNewsCard = renderNewsCard;
  marketNews.formatMarketPercent = formatMarketPercent;
})(window);
