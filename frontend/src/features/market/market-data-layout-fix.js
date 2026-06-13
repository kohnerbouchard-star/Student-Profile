// Final Market Data layout polish.
// Turns the injected Company News card into a full-width market briefing.

(function () {
  function getTicker() {
    return String(document.getElementById("stockProfileTicker")?.value || "").toUpperCase();
  }

  function getNewsCount() {
    return Array.isArray(state?.news) ? state.news.length : 0;
  }

  function polishMarketDataLayout() {
    const stockProfile = document.getElementById("stockProfile");
    const detail = document.getElementById("stockProfileDetail");
    const newsCard = document.getElementById("marketImportedNewsCard");

    if (!stockProfile || !detail || !newsCard) return;

    newsCard.classList.add("market-news-briefing");

    const title = newsCard.querySelector(".card-title");
    if (title) {
      title.textContent = "Market Briefing";
    }

    const status = newsCard.querySelector(".status-box");
    if (status) {
      status.className = "market-news-summary";
      const ticker = getTicker();
      const count = getNewsCount();

      status.innerHTML = `
        <span class="market-news-pill">Imported News</span>
        <span>${ticker ? `Showing ${ticker} first, then market-wide updates.` : "Showing market-wide updates."}</span>
        <span>${count ? `${count} loaded reports` : "No reports loaded yet"}</span>
      `;
    }

    const lowerGrid = detail.querySelector(".market-lower-grid");
    if (lowerGrid && !lowerGrid.contains(newsCard)) {
      lowerGrid.appendChild(newsCard);
    }
  }

  const oldRenderDetail =
    typeof window.renderStockProfileDetail === "function"
      ? window.renderStockProfileDetail
      : typeof renderStockProfileDetail === "function"
        ? renderStockProfileDetail
        : null;

  if (oldRenderDetail && !window.__marketDataLayoutPolished) {
    window.__marketDataLayoutPolished = true;

    window.renderStockProfileDetail = function polishedRenderStockProfileDetail() {
      const result = oldRenderDetail.apply(this, arguments);
      window.setTimeout(polishMarketDataLayout, 20);
      window.setTimeout(polishMarketDataLayout, 120);
      return result;
    };

    try {
      renderStockProfileDetail = window.renderStockProfileDetail;
    } catch (_) {}
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest('[data-view="stockProfile"]')) {
      window.setTimeout(polishMarketDataLayout, 150);
    }
  });

  document.addEventListener("change", function (event) {
    if (event.target && event.target.id === "stockProfileTicker") {
      window.setTimeout(polishMarketDataLayout, 80);
    }
  });

  window.polishMarketDataLayout = polishMarketDataLayout;

  window.setTimeout(polishMarketDataLayout, 500);
})();
