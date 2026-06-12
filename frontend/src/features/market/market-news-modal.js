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

  function displayOrDash(value) {
    const text = String(value ?? "").trim();
    const lower = text.toLowerCase();

    if (!text || lower === "undefined" || lower === "null") {
      return "-";
    }

    return text;
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

  function cleanTicker(value) {
    return typeof marketNews.cleanTicker === "function"
      ? marketNews.cleanTicker(value)
      : String(value || "").trim().toUpperCase();
  }

  function ensureNewsReportModal() {
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

  // display-only
  function openNewsReportModal(item) {
    const modal = ensureNewsReportModal();
    const source = item || {};
    const ticker = cleanTicker(source.ticker) || "Market";
    const sentiment = source.sentiment || "Neutral";
    const impact = source.impact || "Low";
    const change = source.changePct !== "" && source.changePct !== undefined && source.changePct !== null
      ? formatMarketPercent(source.changePct)
      : "Unavailable";

    modal.innerHTML = `
      <div class="market-news-modal" role="dialog" aria-modal="true" aria-label="News report">
        <div class="market-news-modal-header">
          <div>
            <div class="market-news-modal-kicker">
              <span class="badge">${sanitize(ticker)}</span>
              <span class="badge">${sanitize(sentiment)}</span>
              <span class="badge">${sanitize(impact)}</span>
            </div>
            <h2 class="market-news-modal-title">${sanitize(source.headline || "Market update")}</h2>
          </div>
          <button class="market-news-modal-close" type="button" data-close-news-modal="true">Close</button>
        </div>

        <div class="market-news-modal-body">
          <p class="market-news-modal-summary">${sanitize(source.summary || "No report details are available yet.")}</p>

          <div class="market-news-modal-grid">
            <div class="market-news-modal-stat">
              <span>Ticker</span>
              <strong>${sanitize(ticker)}</strong>
            </div>

            <div class="market-news-modal-stat">
              <span>Published</span>
              <strong>${sanitize(formatDateTime(source.timestamp || source.date || ""))}</strong>
            </div>

            <div class="market-news-modal-stat">
              <span>Company</span>
              <strong>${sanitize(source.companyName || ticker)}</strong>
            </div>

            <div class="market-news-modal-stat">
              <span>Sector</span>
              <strong>${sanitize(displayOrDash(source.sector))}</strong>
            </div>

            <div class="market-news-modal-stat">
              <span>Price change</span>
              <strong>${sanitize(change)}</strong>
            </div>

            <div class="market-news-modal-stat">
              <span>Source</span>
              <strong>${sanitize(source.sourceSheet || "Stock news")}</strong>
            </div>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove("hidden");
  }

  function closeNewsReportModal() {
    const modal = document.getElementById("marketNewsPopupRoot");

    if (modal) {
      modal.classList.add("hidden");
      modal.innerHTML = "";
    }
  }

  function installNewsModalEvents() {
    if (global.__frontendMarketNewsPopupEventsInstalled) return;
    global.__frontendMarketNewsPopupEventsInstalled = true;

    document.addEventListener("click", function (event) {
      const closeButton = event.target.closest("[data-close-news-modal='true']");
      const backdrop = event.target.classList && event.target.classList.contains("market-news-modal-backdrop");
      const card = event.target.closest(".company-news-card[data-news-index]");

      if (closeButton || backdrop) {
        closeNewsReportModal();
        return;
      }

      if (card) {
        const index = Number(card.dataset.newsIndex);
        const reports = marketNews.selectedNewsReports || global.__selectedStockNewsReports || [];
        const item = reports[index];

        if (item) {
          openNewsReportModal(item);
        }
      }
    });

    document.addEventListener("keydown", function (event) {
      const card = event.target.closest && event.target.closest(".company-news-card[data-news-index]");

      if (event.key === "Escape") {
        closeNewsReportModal();
        return;
      }

      if ((event.key === "Enter" || event.key === " ") && card) {
        event.preventDefault();
        const index = Number(card.dataset.newsIndex);
        const reports = marketNews.selectedNewsReports || global.__selectedStockNewsReports || [];
        const item = reports[index];

        if (item) {
          openNewsReportModal(item);
        }
      }
    });
  }

  marketNews.modalStatus = "extracted";
  marketNews.openNewsReportModal = openNewsReportModal;
  marketNews.closeNewsReportModal = closeNewsReportModal;
  marketNews.installNewsModalEvents = installNewsModalEvents;
})(window);
