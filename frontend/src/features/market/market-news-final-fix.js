// Final market news display patch.
// One Company News card only. Removes cached/legacy duplicates from older scripts.
// Shows selected-stock news only and opens full news reports in a popup.

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

  function newsTimeValue(item) {
    const value = item && (item.timestamp || item.date || "");
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function ensureNewsReportModal_() {
    if (!document.getElementById("marketNewsPopupStyle")) {
      const style = document.createElement("style");
      style.id = "marketNewsPopupStyle";
      style.textContent = `
        .market-news-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(15, 23, 42, 0.54);
          backdrop-filter: blur(6px);
        }

        .market-news-modal {
          width: min(760px, 100%);
          max-height: min(82vh, 760px);
          overflow: auto;
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 22px;
          background: #ffffff;
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.26);
        }

        .market-news-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 22px 24px 14px;
          border-bottom: 1px solid rgba(226, 232, 240, 0.9);
        }

        .market-news-modal-kicker {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 10px;
        }

        .market-news-modal-title {
          margin: 0;
          font-size: 22px;
          line-height: 1.25;
          color: #0f172a;
        }

        .market-news-modal-close {
          border: 0;
          border-radius: 999px;
          padding: 8px 12px;
          cursor: pointer;
          background: #eef2f7;
          color: #334155;
          font-weight: 800;
        }

        .market-news-modal-body {
          padding: 20px 24px 24px;
        }

        .market-news-modal-summary {
          margin: 0 0 18px;
          color: #334155;
          line-height: 1.65;
          font-size: 15px;
        }

        .market-news-modal-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .market-news-modal-stat {
          padding: 12px 14px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          background: #f8fafc;
        }

        .market-news-modal-stat span {
          display: block;
          margin-bottom: 4px;
          font-size: 12px;
          color: #64748b;
        }

        .market-news-modal-stat strong {
          color: #0f172a;
          font-size: 14px;
        }

        .company-news-card {
          cursor: pointer;
          transition: transform 0.14s ease, box-shadow 0.14s ease;
        }

        .company-news-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 34px rgba(15, 23, 42, 0.10);
        }

        .company-news-card:focus {
          outline: 3px solid rgba(59, 130, 246, 0.35);
          outline-offset: 3px;
        }

        @media (max-width: 640px) {
          .market-news-modal-grid {
            grid-template-columns: 1fr;
          }
        }
      `;
      document.head.appendChild(style);
    }

    let modal = document.getElementById("marketNewsPopupRoot");

    if (!modal) {
      modal = document.createElement("div");
      modal.id = "marketNewsPopupRoot";
      modal.className = "market-news-modal-backdrop hidden";
      modal.innerHTML = "";
      document.body.appendChild(modal);
    }

    return modal;
  }

  function openNewsReportModal_(item) {
    const modal = ensureNewsReportModal_();

    const ticker = cleanTicker(item.ticker) || "Market";
    const sentiment = item.sentiment || "Neutral";
    const impact = item.impact || "Low";
    const change = item.changePct !== "" && item.changePct !== undefined && item.changePct !== null
      ? formatMarketPercent(item.changePct)
      : "—";

    modal.innerHTML = `
      <div class="market-news-modal" role="dialog" aria-modal="true" aria-label="News report">
        <div class="market-news-modal-header">
          <div>
            <div class="market-news-modal-kicker">
              <span class="badge">${sanitize(ticker)}</span>
              <span class="badge">${sanitize(sentiment)}</span>
              <span class="badge">${sanitize(impact)}</span>
            </div>
            <h2 class="market-news-modal-title">${sanitize(item.headline || "Market update")}</h2>
          </div>
          <button class="market-news-modal-close" type="button" data-close-news-modal="true">Close</button>
        </div>

        <div class="market-news-modal-body">
          <p class="market-news-modal-summary">${sanitize(item.summary || "No report details are available yet.")}</p>

          <div class="market-news-modal-grid">
            <div class="market-news-modal-stat">
              <span>Ticker</span>
              <strong>${sanitize(ticker)}</strong>
            </div>

            <div class="market-news-modal-stat">
              <span>Published</span>
              <strong>${sanitize(formatDateTime(item.timestamp || item.date || ""))}</strong>
            </div>

            <div class="market-news-modal-stat">
              <span>Company</span>
              <strong>${sanitize(item.companyName || ticker)}</strong>
            </div>

            <div class="market-news-modal-stat">
              <span>Sector</span>
              <strong>${sanitize(item.sector || "—")}</strong>
            </div>

            <div class="market-news-modal-stat">
              <span>Price change</span>
              <strong>${sanitize(change)}</strong>
            </div>

            <div class="market-news-modal-stat">
              <span>Source</span>
              <strong>${sanitize(item.sourceSheet || "Stock news")}</strong>
            </div>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove("hidden");
  }

  function closeNewsReportModal_() {
    const modal = document.getElementById("marketNewsPopupRoot");

    if (modal) {
      modal.classList.add("hidden");
      modal.innerHTML = "";
    }
  }

  if (!window.__marketNewsPopupEventsInstalled) {
    window.__marketNewsPopupEventsInstalled = true;

    document.addEventListener("click", function (event) {
      const closeButton = event.target.closest("[data-close-news-modal='true']");
      const backdrop = event.target.classList && event.target.classList.contains("market-news-modal-backdrop");
      const card = event.target.closest(".company-news-card[data-news-index]");

      if (closeButton || backdrop) {
        closeNewsReportModal_();
        return;
      }

      if (card) {
        const index = Number(card.dataset.newsIndex);
        const item = window.__selectedStockNewsReports && window.__selectedStockNewsReports[index];

        if (item) {
          openNewsReportModal_(item);
        }
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeNewsReportModal_();
        return;
      }

      if ((event.key === "Enter" || event.key === " ") && event.target.closest(".company-news-card[data-news-index]")) {
        event.preventDefault();

        const card = event.target.closest(".company-news-card[data-news-index]");
        const index = Number(card.dataset.newsIndex);
        const item = window.__selectedStockNewsReports && window.__selectedStockNewsReports[index];

        if (item) {
          openNewsReportModal_(item);
        }
      }
    });
  }

  function renderNewsList(stock) {
    const ticker = cleanTicker(stock && stock.ticker);
    const rows = getActiveNewsRows();

    const reports = rows
      .filter((item) => cleanTicker(item.ticker) === ticker)
      .sort((a, b) => newsTimeValue(b) - newsTimeValue(a))
      .slice(0, 5);

    window.__selectedStockNewsReports = reports;

    if (!reports.length) {
      return `
        <div class="empty">
          No news reports are available for <strong>${sanitize(ticker || "this stock")}</strong> yet.
        </div>
      `;
    }

    return `
      <div class="company-news-list">
        ${reports.map((item, index) => {
          const sentiment = String(item.sentiment || "Neutral").toLowerCase();
          const sentimentClass =
            sentiment.includes("positive") || sentiment.includes("up") || sentiment.includes("beat")
              ? "news-positive"
              : sentiment.includes("negative") || sentiment.includes("down") || sentiment.includes("miss")
                ? "news-negative"
                : "news-neutral";

          const metaLine = [
            cleanTicker(item.ticker) || ticker,
            item.impact ? `${item.impact}` : "",
            item.volatilityImpact ? `Volatility ${item.volatilityImpact}` : ""
          ].filter(Boolean).join(" · ");

          return `
            <article
              class="company-news-card ${sentimentClass}"
              data-news-index="${index}"
              tabindex="0"
              role="button"
              aria-label="Open news report: ${sanitize(item.headline || "Market update")}"
            >
              <div class="news-card-topline">
                <span class="badge">${sanitize(item.sentiment || "Neutral")}</span>
                <span>${sanitize(formatDateTime(item.timestamp || item.date || ""))}</span>
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

      if ((text === "company news" || text === "market briefing") && card.id !== "marketImportedNewsCard") {
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

    const ticker = cleanTicker(stock && stock.ticker);

    card.innerHTML = `
      <h2 class="card-title">Market Briefing</h2>
      <div class="status-box">Showing latest 5 reports for ${sanitize(ticker || "the selected stock")}.</div>
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
      closeNewsReportModal_();
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
  window.openNewsReportModal_ = openNewsReportModal_;
  window.closeNewsReportModal_ = closeNewsReportModal_;

  window.setTimeout(mountImportedNewsPanel, 300);
  window.setTimeout(purgeDuplicateNewsCards, 600);
})();
