(function (global) {
  const app = global.EconovariaFrontend = global.EconovariaFrontend || {};
  app.modules = app.modules || {};
  const marketProfile = app.modules.marketProfile = app.modules.marketProfile || {};

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

  function getState(options) {
    return options && options.state || global.state || {};
  }

  function getMarketRows(options) {
    return typeof marketProfile.getMarketRows === "function"
      ? marketProfile.getMarketRows(getState(options))
      : [];
  }

  function findMarketByTicker(ticker, options) {
    return typeof marketProfile.findMarketByTicker === "function"
      ? marketProfile.findMarketByTicker(ticker, getState(options))
      : null;
  }

  function parseMarketPercent(value) {
    return typeof marketProfile.parseMarketPercent === "function"
      ? marketProfile.parseMarketPercent(value)
      : 0;
  }

  function cleanTicker(value) {
    return typeof marketProfile.cleanTicker === "function"
      ? marketProfile.cleanTicker(value)
      : String(value || "").trim().toUpperCase();
  }

  // display-only
  function money(value) {
    if (typeof global.money === "function") {
      return global.money(value);
    }

    return Number(value || 0).toLocaleString(undefined, {
      style: "currency",
      currency: "USD"
    });
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
  function formatSignedPercent(value) {
    const number = Number(value || 0);
    return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
  }

  // display-only
  function formatMarketPercent(value) {
    if (typeof global.formatMarketPercent === "function") {
      return global.formatMarketPercent(value);
    }

    if (value === undefined || value === null || value === "") return "Unavailable";
    return formatSignedPercent(parseMarketPercent(value));
  }

  // display-only
  function formatCompactNumber(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number === 0) return "Unavailable";

    return number.toLocaleString(undefined, {
      notation: "compact",
      maximumFractionDigits: 1
    });
  }

  // display-only
  function formatCompactMoney(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number === 0) return "Unavailable";

    return number.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1
    });
  }

  // display-only
  function formatMarketRange(low, high) {
    const lowNumber = Number(low || 0);
    const highNumber = Number(high || 0);

    if (!lowNumber && !highNumber) return "Unavailable";
    if (!lowNumber) return `High ${money(highNumber)}`;
    if (!highNumber) return `Low ${money(lowNumber)}`;

    return `${money(lowNumber)} - ${money(highNumber)}`;
  }

  function mini(label, value) {
    return `<div class="mini-row"><span>${sanitize(label)}</span><strong>${sanitize(value)}</strong></div>`;
  }

  function renderMarketSnapshot(label, value, note) {
    return `
      <div class="market-snapshot-card">
        <span>${sanitize(label)}</span>
        <strong>${sanitize(value)}</strong>
        <small>${sanitize(note || "")}</small>
      </div>
    `;
  }

  function renderMarketStat(label, value, tone) {
    return `
      <div class="market-stat ${tone || ""}">
        <span>${sanitize(label)}</span>
        <strong>${sanitize(value ?? "Unavailable")}</strong>
      </div>
    `;
  }

  // display-only
  function renderHoldingSummary(ticker, options) {
    const state = getState(options);
    const portfolio = Array.isArray(state.portfolio) ? state.portfolio : [];
    const holding = portfolio.find(function (row) {
      return cleanTicker(row && row.ticker) === cleanTicker(ticker);
    });

    if (!holding) {
      return mini("Shares", "0") + mini("Status", "No current position");
    }

    const market = findMarketByTicker(ticker, options);
    const currentPrice = Number(market && market.currentPrice || holding.currentPrice || holding.avgBuyPrice || 0);
    const marketValue = Number(holding.sharesOwned || 0) * currentPrice;
    const gainLoss = marketValue - Number(holding.totalCost || 0);

    return [
      mini("Shares", holding.sharesOwned),
      mini("Average Buy", money(holding.avgBuyPrice)),
      mini("Current Price", money(currentPrice)),
      mini("Market Value", money(marketValue)),
      mini("Gain / Loss", money(gainLoss)),
      mini("Last Updated", formatDateTime(holding.lastUpdated))
    ].join("");
  }

  // display-only
  function renderSectorPeers(stock, options) {
    const peers = typeof marketProfile.getSectorPeers === "function"
      ? marketProfile.getSectorPeers(stock, getState(options))
      : [];

    if (!peers.length) {
      return `<div class="empty">No sector peers are available yet.</div>`;
    }

    return `
      <div class="market-peer-list-v2">
        ${peers.map(function (peer) {
          const change = parseMarketPercent(peer.changePct);
          const cls = change >= 0 ? "positive" : "negative";
          return `
            <button type="button" class="market-peer-chip" data-market-peer="${sanitize(peer.ticker)}">
              <span>
                <strong>${sanitize(peer.ticker)}</strong>
                <small>${sanitize(peer.companyName || peer.ticker)}</small>
              </span>
              <span>
                <strong>${sanitize(money(peer.currentPrice))}</strong>
                <small class="${cls}">${sanitize(formatMarketPercent(peer.changePct))}</small>
              </span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  // display-only
  function renderMarketProfilePage(options) {
    const stateOptions = options || {};
    const rows = getMarketRows(stateOptions);
    const selectedTicker = cleanTicker(stateOptions.selectedTicker) || cleanTicker(rows[0] && rows[0].ticker);
    const sectorCount = new Set(rows.map(function (row) {
      return row && row.sector;
    }).filter(Boolean)).size;
    const avgChange = rows.length
      ? rows.reduce(function (total, row) {
        return total + parseMarketPercent(row && row.changePct);
      }, 0) / rows.length
      : 0;
    const topMover = typeof marketProfile.sortByAbsoluteMove === "function"
      ? marketProfile.sortByAbsoluteMove(rows)[0]
      : null;

    return `
      <div class="market-page-v2">
        <div class="market-page-top">
          <div>
            <div class="eyebrow">Market data</div>
            <h2>Market Explorer</h2>
            <p>Review stock movement, compare company details, and connect price changes to your portfolio decisions.</p>
          </div>

          <label class="market-select-card">
            <span>Choose stock</span>
            <select id="stockProfileTicker" data-frontend-market-profile-ticker="true">
              ${rows.map(function (row) {
                const ticker = cleanTicker(row && row.ticker);
                return `<option value="${sanitize(ticker)}" ${ticker === selectedTicker ? "selected" : ""}>${sanitize(ticker)} - ${sanitize(row.companyName || ticker)} - ${sanitize(money(row.currentPrice))}</option>`;
              }).join("")}
            </select>
          </label>
        </div>

        <div class="market-snapshot-row">
          ${renderMarketSnapshot("Listed stocks", rows.length, "Available companies")}
          ${renderMarketSnapshot("Sectors", sectorCount, "Market categories")}
          ${renderMarketSnapshot("Average move", formatSignedPercent(avgChange), avgChange >= 0 ? "Broad market up" : "Broad market down")}
          ${renderMarketSnapshot("Top mover", topMover && topMover.ticker || "Unavailable", topMover ? formatMarketPercent(topMover.changePct) : "No movement")}
        </div>

        <div id="stockProfileDetail">${renderMarketProfileDetail(selectedTicker, stateOptions)}</div>
      </div>
    `;
  }

  // display-only
  function renderMarketProfileDetail(stockOrTicker, options) {
    const stateOptions = options || {};
    const stock = typeof stockOrTicker === "object"
      ? stockOrTicker
      : findMarketByTicker(stockOrTicker, stateOptions) || getMarketRows(stateOptions)[0];

    if (!stock) {
      return `<div class="empty">No market data is available right now.</div>`;
    }

    const range = stateOptions.range || "1D";
    const change = parseMarketPercent(stock.changePct);
    const trendClass = change >= 0 ? "positive" : "negative";
    const previousClose = Number(stock.previousClose || 0);
    const priceMove = previousClose ? Number(stock.currentPrice || 0) - previousClose : 0;
    const renderMarketChart = typeof marketProfile.renderMarketChart === "function"
      ? marketProfile.renderMarketChart
      : function () {
        return `<div class="market-chart-empty">No chart data is available for this stock yet.</div>`;
      };
    const marketNews = app.modules.marketNews || {};
    const newsPanel = typeof marketNews.renderMarketNewsPanel === "function"
      ? `
        <div class="card market-news-briefing">
          ${marketNews.renderMarketNewsPanel(stock, stateOptions)}
        </div>
      `
      : "";

    return `
      <div class="market-detail-v2">
        <section class="market-chart-card-v2">
          <div class="market-stock-bar">
            <div>
              <div class="market-stock-meta">${sanitize(stock.sector || "Market")} - ${sanitize(stock.assetType || "Stock")}</div>
              <h2>${sanitize(stock.companyName || stock.ticker)} <span>${sanitize(stock.ticker)}</span></h2>
            </div>

            <div class="market-price-cluster">
              <strong>${sanitize(money(stock.currentPrice))}</strong>
              <span class="market-move ${trendClass}">${sanitize(formatMarketPercent(stock.changePct))}</span>
            </div>
          </div>

          <div class="market-chart-actions" aria-label="Chart range">
            ${["1D", "1W", "1M"].map(function (label) {
              return `<button type="button" class="${range === label ? "active" : ""}" data-market-range="${label}">${label}</button>`;
            }).join("")}
          </div>

          ${renderMarketChart(stock, range)}
        </section>

        <aside class="market-info-panel-v2">
          <div class="card market-holding-card">
            <h2 class="card-title">My Position</h2>
            <div class="mini-list">${renderHoldingSummary(stock.ticker, stateOptions)}</div>
          </div>

          <div class="market-stat-stack">
            ${renderMarketStat("Previous close", previousClose ? money(previousClose) : "Unavailable")}
            ${renderMarketStat("Price move", previousClose ? money(priceMove) : "Unavailable", trendClass)}
            ${renderMarketStat("Day range", formatMarketRange(stock.dayLow, stock.dayHigh))}
            ${renderMarketStat("Volume", formatCompactNumber(stock.volume))}
            ${renderMarketStat("Market cap", formatCompactMoney(stock.marketCap))}
            ${renderMarketStat("Updated", formatDateTime(stock.lastUpdated))}
          </div>
        </aside>
      </div>

      <div class="market-lower-grid">
        <div class="card">
          <h2 class="card-title">Sector Peers</h2>
          ${renderSectorPeers(stock, stateOptions)}
        </div>

        <div class="card">
          <h2 class="card-title">Company Note</h2>
          <p class="market-company-note">${sanitize(stock.description || stock.notes || "No company description has been added yet.")}</p>
        </div>

        ${newsPanel}
      </div>
    `;
  }

  marketProfile.viewStatus = "extracted";
  marketProfile.renderMarketProfilePage = renderMarketProfilePage;
  marketProfile.renderMarketProfileDetail = renderMarketProfileDetail;
  marketProfile.renderHoldingSummary = renderHoldingSummary;
  marketProfile.renderSectorPeers = renderSectorPeers;

  app.modules.marketProfileView = {
    status: "extracted",
    renderMarketProfilePage,
    renderMarketProfileDetail,
    renderHoldingSummary,
    renderSectorPeers
  };
})(window);
