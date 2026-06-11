// Final market news display patch.
// One Company News card only. Removes cached/legacy duplicates from older scripts.

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

    const impactType = first(row, [
      "Impact_Type",
      "Impact Type",
      "impactType",
      "Sentiment",
      "sentiment",
      "Tone",
      "tone"
    ]);

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
      sentiment: impactType || "Neutral",
      impact: impactType || "Low",
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

  function getActiveNewsRows() {
    return (state.news || [])
      .map(normalizeNewsRow)
      .filter((item) => {
        const status = String(item.status || "Active").trim().toLowerCase();
        return status !== "inactive" && status !== "no" && status !== "false" && status !== "archived";
      });
  }

  function renderNewsList(stock) {
    const ticker = cleanTicker(stock && stock.ticker);
    const rows = getActiveNewsRows();

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
          No imported news rows are loaded in the frontend yet. This means the backend snapshot is probably not sending <strong>news</strong>.
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
  }

  renderMarketCompanyNews = function patchedRenderMarketCompanyNews(stock) {
    return renderNewsList(stock);
  };

  function getSelectedStock() {
    const ticker = document.getElementById("stockProfileTicker")?.value;
    return findMarket(ticker) || (state.market || [])[0] || null;
  }

  function purgeDuplicateNewsCards() {
    const cards = Array.from(document.querySelectorAll("#stockProfile .card"));

    cards.forEach((card) => {
      const title = card.querySelector(".card-title, h2");
      const text = String(title?.textContent || "").trim().toLowerCase();

      if (text === "company news" && card.id !== "marketImportedNewsCard") {
        card.remove();
      }
    });

    document
      .querySelectorAll('#stockProfile button[onclick*="refreshDashboard"]')
      .forEach((button) => button.remove());
  }

  function mountImportedNewsPanel() {
    const detail = document.getElementById("stockProfileDetail");
    if (!detail) return;

    purgeDuplicateNewsCards();

    const stock = getSelectedStock();
    if (!stock) return;

    let lowerGrid = detail.querySelector(".market-lower-grid");

    if (!lowerGrid) {
      lowerGrid = document.createElement("div");
      lowerGrid.className = "market-lower-grid";
      detail.appendChild(lowerGrid);
    }

    let card = document.getElementById("marketImportedNewsCard");

    if (!card) {
      card = document.createElement("div");
      card.id = "marketImportedNewsCard";
      card.className = "card";
      lowerGrid.appendChild(card);
    }

    card.innerHTML = `
      <h2 class="card-title">Company News</h2>
      <div class="status-box">Imported news from the stock news sheet.</div>
      ${renderNewsList(stock)}
    `;

    purgeDuplicateNewsCards();
  }

  const oldRenderStockProfileDetail =
    typeof window.renderStockProfileDetail === "function"
      ? window.renderStockProfileDetail
      : typeof renderStockProfileDetail === "function"
        ? renderStockProfileDetail
        : null;

  if (oldRenderStockProfileDetail) {
    window.renderStockProfileDetail = function patchedRenderStockProfileDetail() {
      const result = oldRenderStockProfileDetail.apply(this, arguments);
      window.setTimeout(mountImportedNewsPanel, 0);
      window.setTimeout(purgeDuplicateNewsCards, 50);
      return result;
    };

    try {
      renderStockProfileDetail = window.renderStockProfileDetail;
    } catch (_) {}
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest('[data-view="stockProfile"]')) {
      window.setTimeout(mountImportedNewsPanel, 80);
      window.setTimeout(purgeDuplicateNewsCards, 160);
    }
  });

  document.addEventListener("change", function (event) {
    if (event.target && event.target.id === "stockProfileTicker") {
      window.setTimeout(mountImportedNewsPanel, 0);
      window.setTimeout(purgeDuplicateNewsCards, 80);
    }
  });

  window.debugNewsState = function debugNewsState() {
    const raw = state.news || [];
    const normalized = raw.map(normalizeNewsRow);

    console.log("raw state.news count:", raw.length);
    console.log("normalized news count:", normalized.length);
    console.table(normalized.slice(0, 30));

    return normalized;
  };

  window.killDuplicateNewsCards = purgeDuplicateNewsCards;

  window.setTimeout(mountImportedNewsPanel, 300);
  window.setTimeout(purgeDuplicateNewsCards, 600);
})();
