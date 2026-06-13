// Market Data layout polish.
// Copy labels are now rendered canonically by the owning market/news renderers.
// This file only moves the imported news card into the lower grid when needed.

(function () {
  function polishMarketDataLayout() {
    const detail = document.getElementById("stockProfileDetail");
    const newsCard = document.getElementById("marketImportedNewsCard");

    if (!detail || !newsCard) return;

    newsCard.classList.add("market-news-briefing");

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
      return result;
    };

    try {
      renderStockProfileDetail = window.renderStockProfileDetail;
    } catch (_) {}
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest('[data-view="stockProfile"]')) {
      window.setTimeout(polishMarketDataLayout, 80);
    }
  });

  document.addEventListener("change", function (event) {
    if (event.target && event.target.id === "stockProfileTicker") {
      window.setTimeout(polishMarketDataLayout, 40);
    }
  });

  window.polishMarketDataLayout = polishMarketDataLayout;
})();
