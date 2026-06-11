/* Market Data refresh loaded after app.js. */

window.normalizeMarketRow = function normalizeMarketRow(row) {
  return {
    ticker: pick(row, ["ticker", "Ticker"]),
    companyName: pick(row, ["companyName", "Company_Name", "Company Name", "Name", "name"]),
    sector: pick(row, ["sector", "Sector"]),
    currentPrice: toNumber(pick(row, ["currentPrice", "Current_Price", "Current Price", "Price", "price"])),
    changePct: pick(row, ["changePct", "Change_%", "Change %", "Change", "change"]),
    trend: pick(row, ["trend", "Trend"]),
    assetType: pick(row, ["assetType", "Asset_Type", "Asset Type", "Type", "type"]),
    previousClose: toNumber(pick(row, ["previousClose", "Previous_Close", "Previous Close", "Prev Close", "prevClose"])),
    openPrice: toNumber(pick(row, ["openPrice", "Open_Price", "Open Price", "Open", "open"])),
    dayHigh: toNumber(pick(row, ["dayHigh", "Day_High", "Day High", "High", "high"])),
    dayLow: toNumber(pick(row, ["dayLow", "Day_Low", "Day Low", "Low", "low"])),
    volume: toNumber(pick(row, ["volume", "Volume", "Trading Volume", "Trading_Volume"])),
    marketCap: toNumber(pick(row, ["marketCap", "Market_Cap", "Market Cap", "Market Value", "Market_Value"])),
    peRatio: pick(row, ["peRatio", "PE_Ratio", "P/E", "PE", "P E"]),
    dividendYield: pick(row, ["dividendYield", "Dividend_Yield", "Dividend Yield", "Yield", "yield"]),
    beta: pick(row, ["beta", "Beta"]),
    description: pick(row, ["description", "Description", "Company_Description", "Company Description", "Notes", "notes"]),
    notes: pick(row, ["notes", "Notes"]),
    history: pick(row, ["history", "History", "priceHistory", "Price_History", "Price History", "Sparkline", "sparkline"]),
    lastUpdated: pick(row, ["lastUpdated", "Last_Updated", "Last Updated", "Timestamp", "timestamp"])
  };
};

window.renderStockProfile = function renderStockProfile() {
  const rows = state.market || [];
  const defaultTicker = rows[0]?.ticker || "";
  const sectorCount = new Set(rows.map((m) => m.sector).filter(Boolean)).size;
  const avgChange = rows.length
    ? rows.reduce((total, row) => total + parseMarketPercent(row.changePct), 0) / rows.length
    : 0;
  const topMover = rows
    .slice()
    .sort((a, b) => Math.abs(parseMarketPercent(b.changePct)) - Math.abs(parseMarketPercent(a.changePct)))[0];

  document.getElementById("stockProfile").innerHTML = `
    <div class="market-page-v2">
      <div class="market-page-top">
        <div>
          <div class="eyebrow">Market data</div>
          <h2>Market Explorer</h2>
          <p>Review stock movement, compare company details, and connect price changes to your portfolio decisions.</p>
        </div>

        <label class="market-select-card">
          <span>Choose stock</span>
          <select id="stockProfileTicker" onchange="renderStockProfileDetail()">
            ${rows.map((m) => `<option value="${sanitize(m.ticker)}">${sanitize(m.ticker)} · ${sanitize(m.companyName || m.ticker)} · ${money(m.currentPrice)}</option>`).join("")}
          </select>
        </label>
      </div>

      <div class="market-snapshot-row">
        ${marketSnapshot("Listed stocks", rows.length, "Available companies")}
        ${marketSnapshot("Sectors", sectorCount, "Market categories")}
        ${marketSnapshot("Average move", formatSignedPercent(avgChange), avgChange >= 0 ? "Broad market up" : "Broad market down")}
        ${marketSnapshot("Top mover", topMover?.ticker || "—", topMover ? formatMarketPercent(topMover.changePct) : "No movement")}
      </div>

      <div id="stockProfileDetail"></div>
    </div>`;

  if (defaultTicker) {
    document.getElementById("stockProfileTicker").value = defaultTicker;
  }

  renderStockProfileDetail();
};

window.renderStockProfileDetail = function renderStockProfileDetail() {
  const ticker = document.getElementById("stockProfileTicker")?.value;
  const m = findMarket(ticker) || (state.market || [])[0];

  if (!m) {
    document.getElementById("stockProfileDetail").innerHTML = `<div class="empty">No market data is available right now.</div>`;
    return;
  }

  const pane = document.getElementById("stockProfile");
  const range = pane?.dataset.marketRange || "1D";
  const change = parseMarketPercent(m.changePct);
  const trendClass = change >= 0 ? "positive" : "negative";
  const previousClose = Number(m.previousClose || 0);
  const priceMove = previousClose ? Number(m.currentPrice || 0) - previousClose : 0;

  document.getElementById("stockProfileDetail").innerHTML = `
    <div class="market-detail-v2">
      <section class="market-chart-card-v2">
        <div class="market-stock-bar">
          <div>
            <div class="market-stock-meta">${sanitize(m.sector || "Market")} · ${sanitize(m.assetType || "Stock")}</div>
            <h2>${sanitize(m.companyName || m.ticker)} <span>${sanitize(m.ticker)}</span></h2>
          </div>

          <div class="market-price-cluster">
            <strong>${money(m.currentPrice)}</strong>
            <span class="market-move ${trendClass}">${formatMarketPercent(m.changePct)}</span>
          </div>
        </div>

        <div class="market-chart-actions" aria-label="Chart range">
          ${["1D", "1W", "1M"].map((label) => `
            <button type="button" class="${range === label ? "active" : ""}" onclick="setMarketChartRange('${label}')">${label}</button>
          `).join("")}
        </div>

        ${renderMarketChart(m, range)}
      </section>

      <aside class="market-info-panel-v2">
        <div class="card market-holding-card">
          <h2 class="card-title">My Position</h2>
          <div class="mini-list">${holdingSummary(m.ticker)}</div>
        </div>

        <div class="market-stat-stack">
          ${marketStat("Previous close", previousClose ? money(previousClose) : "—")}
          ${marketStat("Price move", previousClose ? money(priceMove) : "—", trendClass)}
          ${marketStat("Day range", formatMarketRange(m.dayLow, m.dayHigh))}
          ${marketStat("Volume", formatCompactNumber(m.volume))}
          ${marketStat("Market cap", formatCompactMoney(m.marketCap))}
          ${marketStat("Updated", formatDateTime(m.lastUpdated))}
        </div>
      </aside>
    </div>

    <div class="market-lower-grid">
      <div class="card">
        <h2 class="card-title">Sector Peers</h2>
        ${renderSectorPeers(m)}
      </div>

      <div class="card">
        <h2 class="card-title">Company Note</h2>
        <p class="market-company-note">${sanitize(m.description || m.notes || "No company description has been added yet.")}</p>
      </div>
    </div>`;
};

window.setMarketChartRange = function setMarketChartRange(range) {
  const pane = document.getElementById("stockProfile");
  if (pane) pane.dataset.marketRange = range;
  renderStockProfileDetail();
};

window.holdingSummary = function holdingSummary(ticker) {
  const holding = (state.portfolio || []).find((p) => p.ticker === ticker);

  if (!holding) {
    return mini("Shares", "0") + mini("Status", "No current position");
  }

  const market = findMarket(ticker);
  const currentPrice = Number(market?.currentPrice || holding.currentPrice || holding.avgBuyPrice || 0);
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
};

function marketSnapshot(label, value, note) {
  return `
    <div class="market-snapshot-card">
      <span>${sanitize(label)}</span>
      <strong>${sanitize(value)}</strong>
      <small>${sanitize(note || "")}</small>
    </div>`;
}

function marketStat(label, value, tone = "") {
  return `
    <div class="market-stat ${tone}">
      <span>${sanitize(label)}</span>
      <strong>${sanitize(value ?? "—")}</strong>
    </div>`;
}

function renderSectorPeers(stock) {
  const peers = (state.market || [])
    .filter((row) => row.ticker !== stock.ticker && row.sector && row.sector === stock.sector)
    .slice(0, 6);

  if (!peers.length) {
    return `<div class="empty">No sector peers are available yet.</div>`;
  }

  return `
    <div class="market-peer-list-v2">
      ${peers.map((peer) => {
        const change = parseMarketPercent(peer.changePct);
        const cls = change >= 0 ? "positive" : "negative";
        return `
          <button type="button" class="market-peer-chip" onclick="selectMarketPeer('${sanitize(peer.ticker)}')">
            <span>
              <strong>${sanitize(peer.ticker)}</strong>
              <small>${sanitize(peer.companyName || peer.ticker)}</small>
            </span>
            <span>
              <strong>${money(peer.currentPrice)}</strong>
              <small class="${cls}">${formatMarketPercent(peer.changePct)}</small>
            </span>
          </button>`;
      }).join("")}
    </div>`;
}

window.selectMarketPeer = function selectMarketPeer(ticker) {
  const select = document.getElementById("stockProfileTicker");
  if (!select) return;

  select.value = ticker;
  renderStockProfileDetail();
};

function renderMarketChart(stock, range) {
  const points = buildMarketChartPoints(stock, range);
  const currentPrice = Number(stock.currentPrice || 0);
  const change = parseMarketPercent(stock.changePct);
  const trendClass = change >= 0 ? "positive" : "negative";

  if (!points.length || !currentPrice) {
    return `<div class="market-chart-empty">No chart data is available for this stock yet.</div>`;
  }

  const width = 920;
  const height = 420;
  const left = 72;
  const right = 28;
  const top = 26;
  const bottom = 58;
  const chartW = width - left - right;
  const chartH = height - top - bottom;

  const prices = points.map((p) => p.price);
  const minRaw = Math.min(...prices);
  const maxRaw = Math.max(...prices);
  const pad = Math.max((maxRaw - minRaw) * 0.16, currentPrice * 0.006, 1);
  const min = Math.max(0, minRaw - pad);
  const max = maxRaw + pad;
  const rangeValue = max - min || 1;

  const coords = points.map((point, index) => {
    const x = left + (index / Math.max(points.length - 1, 1)) * chartW;
    const y = top + ((max - point.price) / rangeValue) * chartH;
    return { ...point, x, y };
  });

  const linePath = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${height - bottom} L ${coords[0].x.toFixed(2)} ${height - bottom} Z`;

  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const value = max - (rangeValue * index / 4);
    const y = top + (chartH * index / 4);
    return { value, y };
  });

  const xTickIndexes = [0, Math.floor((coords.length - 1) / 2), coords.length - 1]
    .filter((value, index, arr) => arr.indexOf(value) === index);

  return `
    <div class="market-chart-shell">
      <div class="market-chart-heading">
        <div>
          <span>Price chart</span>
          <strong>${sanitize(stock.ticker)} · ${sanitize(range)}</strong>
        </div>
        <div>
          <span>Range</span>
          <strong>${money(minRaw)} – ${money(maxRaw)}</strong>
        </div>
      </div>

      <div class="market-chart-frame">
        <svg class="market-chart-v2" viewBox="0 0 ${width} ${height}" role="img" aria-label="${sanitize(stock.ticker)} price chart with x and y axis">
          ${yTicks.map((tick) => `
            <line x1="${left}" y1="${tick.y.toFixed(2)}" x2="${width - right}" y2="${tick.y.toFixed(2)}" class="market-grid-line"></line>
            <text x="${left - 12}" y="${(tick.y + 4).toFixed(2)}" class="market-y-label" text-anchor="end">${sanitize(shortMoney(tick.value))}</text>
          `).join("")}

          <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" class="market-axis-line"></line>
          <line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}" class="market-axis-line"></line>

          ${xTickIndexes.map((index) => `
            <text x="${coords[index].x.toFixed(2)}" y="${height - 22}" class="market-x-label" text-anchor="middle">${sanitize(coords[index].label)}</text>
          `).join("")}

          <text x="${left + chartW / 2}" y="${height - 4}" class="market-axis-title" text-anchor="middle">Time</text>
          <text x="16" y="${top + chartH / 2}" class="market-axis-title market-axis-title-y" text-anchor="middle">Price</text>

          <path d="${areaPath}" class="market-chart-area-v2 ${trendClass}"></path>
          <path d="${linePath}" class="market-chart-line-v2 ${trendClass}"></path>

          ${coords.map((point, index) => `
            <circle
              cx="${point.x.toFixed(2)}"
              cy="${point.y.toFixed(2)}"
              r="${index === coords.length - 1 ? 5 : 3.5}"
              class="market-chart-point ${trendClass}"
              data-label="${sanitize(point.label)}"
              data-price="${sanitize(money(point.price))}"
              onmousemove="showMarketChartTip(evt, this)"
              onmouseleave="hideMarketChartTip()"
            ></circle>
          `).join("")}
        </svg>

        <div id="marketChartTooltip" class="market-chart-tooltip hidden"></div>
      </div>
    </div>`;
}

window.showMarketChartTip = function showMarketChartTip(event, point) {
  const tooltip = document.getElementById("marketChartTooltip");
  if (!tooltip) return;

  tooltip.innerHTML = `<strong>${point.dataset.price}</strong><span>${point.dataset.label}</span>`;
  tooltip.classList.remove("hidden");

  const frame = point.closest(".market-chart-frame");
  const rect = frame.getBoundingClientRect();

  tooltip.style.left = `${event.clientX - rect.left + 12}px`;
  tooltip.style.top = `${event.clientY - rect.top - 44}px`;
};

window.hideMarketChartTip = function hideMarketChartTip() {
  const tooltip = document.getElementById("marketChartTooltip");
  if (tooltip) tooltip.classList.add("hidden");
};

function buildMarketChartPoints(stock, range) {
  const parsed = parseMarketHistory(stock.history);

  if (parsed.length >= 2) {
    const wanted = range === "1M" ? 24 : range === "1W" ? 12 : 8;
    const sliced = parsed.slice(-wanted);
    return sliced.map((price, index) => ({
      label: makePointLabel(index, sliced.length, range),
      price
    }));
  }

  const current = Number(stock.currentPrice || 0);
  if (!current) return [];

  const change = parseMarketPercent(stock.changePct);
  const steps = range === "1M" ? 24 : range === "1W" ? 14 : 9;
  const multiplier = range === "1M" ? 2.2 : range === "1W" ? 1.45 : 1;
  const start = change ? current / (1 + ((change * multiplier) / 100)) : current * 0.985;
  const volatility = Math.min(Math.max(Math.abs(change || 2), 1), 9) * multiplier;

  return Array.from({ length: steps }, (_, index) => {
    const progress = index / (steps - 1);
    const wave = Math.sin(index * 1.25) * current * (volatility / 100) * 0.16;
    const price = start + (current - start) * progress + (index === steps - 1 ? 0 : wave);

    return {
      label: makePointLabel(index, steps, range),
      price: Math.max(price, 0)
    };
  });
}

function makePointLabel(index, total, range) {
  if (index === total - 1) return "Now";

  if (range === "1M") {
    const daysBack = total - index - 1;
    return `${daysBack}d ago`;
  }

  if (range === "1W") {
    const daysBack = Math.ceil((total - index - 1) / 2);
    return `${daysBack}d ago`;
  }

  const hoursBack = total - index - 1;
  return `${hoursBack}h ago`;
}

function parseMarketHistory(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((entry) => typeof entry === "object" ? entry.price ?? entry.value ?? entry.close : entry)
      .map(toNumber)
      .filter((number) => number > 0);
  }

  const text = String(value).trim();

  if (text.startsWith("[")) {
    try {
      return parseMarketHistory(JSON.parse(text));
    } catch (_) {}
  }

  return text
    .split(/[,|;\s]+/)
    .map(toNumber)
    .filter((number) => number > 0);
}

function parseMarketPercent(value) {
  if (value === undefined || value === null || value === "") return 0;

  const raw = String(value).trim();
  const number = Number(raw.replace("%", ""));

  if (!Number.isFinite(number)) return 0;
  if (!raw.includes("%") && Math.abs(number) <= 1) return number * 100;

  return number;
}

function formatSignedPercent(value) {
  const number = Number(value || 0);
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function formatMarketPercent(value) {
  if (value === undefined || value === null || value === "") return "—";
  return formatSignedPercent(parseMarketPercent(value));
}

function formatPlainNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number === 0) return "—";
  return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatCompactNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number === 0) return "—";
  return number.toLocaleString(undefined, {
    notation: "compact",
    maximumFractionDigits: 1
  });
}

function formatCompactMoney(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number === 0) return "—";

  return number.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  });
}

function shortMoney(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "—";

  if (Math.abs(number) >= 1000) {
    return number.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1
    });
  }

  return number.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function formatMarketRange(low, high) {
  const lowNumber = Number(low || 0);
  const highNumber = Number(high || 0);

  if (!lowNumber && !highNumber) return "—";
  if (!lowNumber) return `High ${money(highNumber)}`;
  if (!highNumber) return `Low ${money(lowNumber)}`;

  return `${money(lowNumber)} – ${money(highNumber)}`;
}

/* Force refreshed renderer into existing app render flow. */
(function activateMarketDataRefresh() {
  try {
    renderStockProfile = window.renderStockProfile;
    renderStockProfileDetail = window.renderStockProfileDetail;
    holdingSummary = window.holdingSummary;
  } catch (_) {}

  let renderingMarketRefresh = false;

  function shouldRenderMarketRefresh() {
    const pane = document.getElementById("stockProfile");
    if (!pane || !pane.classList.contains("active")) return false;
    if (pane.querySelector(".market-page-v2")) return false;
    return typeof window.renderStockProfile === "function";
  }

  function renderMarketRefreshSoon() {
    window.setTimeout(() => {
      if (renderingMarketRefresh || !shouldRenderMarketRefresh()) return;

      renderingMarketRefresh = true;
      try {
        window.renderStockProfile();
      } finally {
        window.setTimeout(() => {
          renderingMarketRefresh = false;
        }, 80);
      }
    }, 0);
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-view="stockProfile"]')) {
      renderMarketRefreshSoon();
    }
  });

  const pane = document.getElementById("stockProfile");
  if (pane) {
    new MutationObserver(renderMarketRefreshSoon).observe(pane, {
      attributes: true,
      attributeFilter: ["class"],
      childList: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderMarketRefreshSoon, { once: true });
  } else {
    renderMarketRefreshSoon();
  }
})();
